import { SessionLookup } from "@web-stack-template/auth/session-lookup";
import * as Effect from "effect/Effect";
import type { Context as HonoContext } from "hono";

import { runForTransport, type EffectRunner } from "./effect-runner";

export type { EffectRunner } from "./effect-runner";

export type CreateContextOptions = {
  context: HonoContext;
  runEffect: EffectRunner;
};

const lookupSession = (headers: Headers) =>
  Effect.gen(function* () {
    const lookup = yield* SessionLookup;
    return yield* lookup.getSession(headers);
  });

export async function createContext({
  context,
  runEffect,
}: CreateContextOptions) {
  const session = await runForTransport(
    runEffect,
    lookupSession(context.req.raw.headers),
  );
  return {
    session,
    runEffect,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
