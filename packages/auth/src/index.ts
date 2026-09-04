import { polar, checkout, portal } from "@polar-sh/better-auth";
import {
  db,
  DatabaseResourceError,
  makeDatabaseResource,
  type DatabaseClient,
} from "@web-stack-template/db";
import * as schema from "@web-stack-template/db/schema/auth";
import { env } from "@web-stack-template/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { polarClient } from "./lib/payments";
import {
  Auth,
  makeSessionLookup,
  SessionLookup,
} from "./session-lookup";

export {
  Auth,
  makeSessionLookup,
  SessionLookup,
  SessionLookupError,
} from "./session-lookup";
export type {
  AuthService,
  SessionLookupAuth,
  SessionLookupResult,
  SessionLookupService,
} from "./session-lookup";

export class AuthError extends Schema.TaggedError<AuthError>()(
  "AuthError",
  { cause: Schema.Unknown },
) {}

export function createAuth(database: DatabaseClient = db) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [
      polar({
        client: polarClient,
        createCustomerOnSignUp: true,
        use: [
          checkout({
            products: [
              {
                productId: "your-product-id",
                slug: "pro",
              },
            ],
            successUrl: env.POLAR_SUCCESS_URL,
            authenticatedUsersOnly: true,
          }),
          portal(),
        ],
      }),
    ],
  });
}

/** Compatibility export for consumers that still expect a raw Better Auth instance. */
export const auth = createAuth(db);

const acquireAuth = Effect.acquireRelease(
  Effect.try({
    try: makeDatabaseResource,
    catch: (cause) => new DatabaseResourceError({ cause }),
  }),
  ({ client }) => Effect.sync(() => client.close()),
).pipe(
  Effect.flatMap((resource) =>
    Effect.try({
      try: () => createAuth(resource.database),
      catch: (cause) => new AuthError({ cause }),
    }),
  ),
);

/** Scoped Better Auth and request-session adapter used by the server runtime. */
export const SessionLookupLive = Layer.provideMerge(
  Layer.scoped(Auth, acquireAuth),
)(
  Layer.effect(
    SessionLookup,
    Effect.gen(function* () {
      const auth = yield* Auth;
      return makeSessionLookup(auth);
    }),
  ),
);
