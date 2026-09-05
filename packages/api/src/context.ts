import { SessionLookup } from "@web-stack-template/auth/session-lookup";
import * as Effect from "effect/Effect";
import type { Context as HonoContext } from "hono";

import { runForTransport, type EffectRunner } from "./effect-runner";

export type { EffectRunner } from "./effect-runner";

export type CreateContextOptions = {
  context: HonoContext;
  runEffect: EffectRunner;
};

const lookupSession = Effect.fn("Api.lookupSession")((headers: Headers) =>
  Effect.gen(function* () {
    const lookup = yield* SessionLookup;
    return yield* lookup.getSession(headers);
  }),
);

export async function createContext({
  context,
  runEffect,
}: CreateContextOptions) {
  let session;
  try {
    session = await runForTransport(
      runEffect,
      lookupSession(context.req.raw.headers),
    );
  } catch (error) {
    await runEffect(
      Effect.logError(
        `oRPC request failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    throw error;
  }
  return {
    session,
    runEffect,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
