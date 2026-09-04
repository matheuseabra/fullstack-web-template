import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@web-stack-template/api/context";
import { appRouter } from "@web-stack-template/api/routers/index";
import { auth, type SessionLookup, SessionLookupLive } from "@web-stack-template/auth";
import { type TodoRepository, TodoRepositoryLive } from "@web-stack-template/db";
import { env } from "@web-stack-template/env/server";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  convertToModelMessages,
  validateUIMessages,
  wrapLanguageModel,
} from "ai";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const applicationLayer = Layer.merge(TodoRepositoryLive, SessionLookupLive);

/** The one live runtime for all API and server Effect programs. */
const applicationRuntime = ManagedRuntime.make(applicationLayer);

type ApplicationServices = SessionLookup | TodoRepository;

const runEffect = <A, E>(effect: Effect.Effect<A, E, ApplicationServices>) =>
  applicationRuntime.runPromise(effect);

class AiRequestError extends Data.TaggedError("AiRequestError")<{
  readonly cause: unknown;
  readonly operation: "parse" | "validate" | "model";
}> {}

const getRawMessages = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("messages" in body)) {
    return [];
  }
  return body.messages;
};

const prepareAiRequest = (request: Request) =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<unknown>,
      catch: (cause) => new AiRequestError({ cause, operation: "parse" }),
    });
    const uiMessages = yield* Effect.tryPromise({
      try: () => validateUIMessages({ messages: getRawMessages(body) }),
      catch: (cause) => new AiRequestError({ cause, operation: "validate" }),
    });
    const model = yield* Effect.try({
      try: () =>
        wrapLanguageModel({
          model: google("gemini-2.5-flash"),
          middleware: devToolsMiddleware(),
        }),
      catch: (cause) => new AiRequestError({ cause, operation: "model" }),
    });
    const messages = yield* Effect.tryPromise({
      try: () => convertToModelMessages(uiMessages),
      catch: (cause) => new AiRequestError({ cause, operation: "validate" }),
    });

    return { messages, model };
  });

const logInterceptorError = (error: unknown) => {
  applicationRuntime.runFork(
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

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
  const outcome = await runEffect(Effect.either(prepareAiRequest(c.req.raw)));
  if (outcome._tag === "Left") {
    applicationRuntime.runFork(
      Effect.logError(`AI request ${outcome.left.operation} failed: ${outcome.left.cause}`),
    );
    if (outcome.left.operation !== "model") {
      return c.json({ error: "Invalid AI request" }, 400);
    }
    throw outcome.left;
  }

  const result = streamText({
    model: outcome.right.model,
    messages: outcome.right.messages,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
