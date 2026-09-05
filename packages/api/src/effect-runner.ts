import { ORPCError } from "@orpc/server";
import { Auth, SessionLookup, SessionLookupError } from "@web-stack-template/auth/session-lookup";
import { DatabaseError, TodoRepository } from "@web-stack-template/db/todo-repository";
import * as Effect from "effect/Effect";

export type ApplicationServices = Auth | SessionLookup | TodoRepository;

/** The only execution capability exposed to API adapters. */
export type EffectRunner = <A, E>(effect: Effect.Effect<A, E, ApplicationServices>) => Promise<A>;

/** Convert expected infrastructure failures to stable oRPC error codes. */
export const toTransportError = (error: unknown): ORPCError<any, any> => {
  if (error instanceof DatabaseError) {
    return new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Todo storage is temporarily unavailable",
    });
  }

  if (error instanceof SessionLookupError) {
    return new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Authentication service is temporarily unavailable",
    });
  }

  return new ORPCError("INTERNAL_SERVER_ERROR");
};

/**
 * Runs an Effect at the injected application boundary and handles expected
 * failures without turning tagged errors into untyped promise rejections.
 */
export const runForTransport = async <A, E>(
  runner: EffectRunner,
  effect: Effect.Effect<A, E, ApplicationServices>,
): Promise<A> => {
  const outcome = await runner(Effect.either(effect));
  if (outcome._tag === "Left") {
    throw toTransportError(outcome.left);
  }
  return outcome.right;
};
