import { devToolsMiddleware } from "@ai-sdk/devtools";
import { createOpenAI } from "@ai-sdk/openai";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@web-stack-template/api/context";
import type { ApplicationServices } from "@web-stack-template/api/effect-runner";
import { appRouter } from "@web-stack-template/api/routers/index";
import { SessionLookupLive } from "@web-stack-template/auth/runtime";
import { Auth } from "@web-stack-template/auth/session-lookup";
import { TodoRepositoryLive } from "@web-stack-template/db/runtime";
import { env } from "@web-stack-template/env/server";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  convertToModelMessages,
  validateUIMessages,
  wrapLanguageModel,
} from "ai";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Schema from "effect/Schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const applicationLayer = Layer.merge(TodoRepositoryLive, SessionLookupLive);

/** The one live runtime for all API and server Effect programs. */
const applicationRuntime = ManagedRuntime.make(applicationLayer);

const openai = createOpenAI();

const runEffect = <A, E>(effect: Effect.Effect<A, E, ApplicationServices>) =>
  applicationRuntime.runPromise(effect);

class AiRequestError extends Schema.TaggedError<AiRequestError>()(
  "AiRequestError",
  {
    cause: Schema.Unknown,
    operation: Schema.Literal("parse", "validate", "model"),
  },
) {}

const getRawMessages = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("messages" in body)) {
    return [];
  }
  return body.messages;
};

const prepareAiRequest = Effect.fn("Server.prepareAiRequest")((request: Request) =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.json(),
      catch: (cause) => new AiRequestError({ cause, operation: "parse" }),
    });
    const uiMessages = yield* Effect.tryPromise({
      try: () => validateUIMessages({ messages: getRawMessages(body) }),
      catch: (cause) => new AiRequestError({ cause, operation: "validate" }),
    });
    const model = yield* Effect.try({
      try: () =>
        wrapLanguageModel({
          model: openai.responses("gpt-6-astra"),
          middleware: devToolsMiddleware(),
        }),
      catch: (cause) => new AiRequestError({ cause, operation: "model" }),
    });
    const messages = yield* Effect.tryPromise({
      try: () => convertToModelMessages(uiMessages),
      catch: (cause) => new AiRequestError({ cause, operation: "validate" }),
    });

    return { messages, model };
  }),
);

const createAiResponse = Effect.fn("Server.createAiResponse")((
  input: {
    readonly messages: Awaited<ReturnType<typeof convertToModelMessages>>;
    readonly model: ReturnType<typeof wrapLanguageModel>;
  },
) =>
  Effect.try({
    try: () => {
      const result = streamText({
        model: input.model,
        messages: input.messages,
      });

      return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
      });
    },
    catch: (cause) => new AiRequestError({ cause, operation: "model" }),
  })
);

const logInterceptorError = async (error: unknown) => {
  await applicationRuntime.runPromise(
    Effect.logError(
      `oRPC request failed: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
};

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const auth = await runEffect(Auth);
  return auth.handler(c.req.raw);
});

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError(logInterceptorError),
  ],
});

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError(logInterceptorError),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c, runEffect });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.post("/ai", async (c) => {
  const outcome = await runEffect(
    Effect.either(
      prepareAiRequest(c.req.raw).pipe(Effect.flatMap(createAiResponse)),
    ),
  );
  if (outcome._tag === "Left") {
    await applicationRuntime.runPromise(
      Effect.logError(`AI request ${outcome.left.operation} failed: ${outcome.left.cause}`),
    );
    if (outcome.left.operation !== "model") {
      return c.json({ error: "Invalid AI request" }, 400);
    }
    return c.json({ error: "AI service is temporarily unavailable" }, 503);
  }

  return outcome.right;
});

app.get("/", (c) => {
  return c.text("OK");
});

export const disposeApplicationRuntime = () => applicationRuntime.dispose();

process.once("SIGINT", disposeApplicationRuntime);
process.once("SIGTERM", disposeApplicationRuntime);

export default app;
