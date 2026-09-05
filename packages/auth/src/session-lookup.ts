import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Auth as BetterAuth } from "better-auth";

/** The value returned by Better Auth's server-side session endpoint. */
export type SessionLookupResult = Awaited<ReturnType<BetterAuth["api"]["getSession"]>>;

/** A stable, expected failure for a Better Auth session lookup. */
export class SessionLookupError extends Schema.TaggedError<SessionLookupError>()(
  "SessionLookupError",
  { cause: Schema.Unknown },
) {}

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

/** Better Auth instance used by the framework adapter at the HTTP edge. */
export interface AuthService extends SessionLookupAuth {
  readonly handler: (request: Request) => Response | Promise<Response>;
}

export class Auth extends Context.Tag("@web-stack-template/auth/Auth")<
  Auth,
  AuthService
>() {}

export const makeSessionLookup = (
  auth: SessionLookupAuth,
): SessionLookupService => ({
  getSession: (headers) =>
    Effect.tryPromise({
      try: () => auth.api.getSession({ headers }),
      catch: (cause) => new SessionLookupError({ cause }),
    }),
});
