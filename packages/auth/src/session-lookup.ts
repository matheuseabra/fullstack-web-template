import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { Auth } from "better-auth";

/** The value returned by Better Auth's server-side session endpoint. */
export type SessionLookupResult = Awaited<ReturnType<Auth["api"]["getSession"]>>;

/** A stable, expected failure for a Better Auth session lookup. */
export class SessionLookupError extends Data.TaggedError("SessionLookupError")<{
  readonly cause: unknown;
}> {}

export interface SessionLookupService {
  readonly getSession: (
    headers: Headers,
  ) => Effect.Effect<SessionLookupResult, SessionLookupError>;
}

/**
 * Effect service for request-local authentication lookups.
 *
 * The auth adapter is injected so tests can replace Better Auth without
 * constructing a database-backed auth instance.
 */
export class SessionLookup extends Context.Tag(
  "@web-stack-template/auth/SessionLookup",
)<SessionLookup, SessionLookupService>() {}

export interface SessionLookupAuth {
  readonly api: {
    readonly getSession: (context: {
      headers: Headers;
    }) => Promise<SessionLookupResult>;
  };
}

export const makeSessionLookup = (
  auth: SessionLookupAuth,
): SessionLookupService => ({
  getSession: (headers) =>
    Effect.tryPromise({
      try: () => auth.api.getSession({ headers }),
      catch: (cause) => new SessionLookupError({ cause }),
    }),
});
