import { polar, checkout, portal } from "@polar-sh/better-auth";
import { createDb } from "@web-stack-template/db";
import * as schema from "@web-stack-template/db/schema/auth";
import { env } from "@web-stack-template/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as Layer from "effect/Layer";

import { polarClient } from "./lib/payments";
import {
  makeSessionLookup,
  SessionLookup,
} from "./session-lookup";

export {
  makeSessionLookup,
  SessionLookup,
  SessionLookupError,
} from "./session-lookup";
export type {
  SessionLookupAuth,
  SessionLookupResult,
  SessionLookupService,
} from "./session-lookup";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
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

export const auth = createAuth();

/** The production session service; tests can replace this Layer. */
export const SessionLookupLive = Layer.succeed(
  SessionLookup,
  makeSessionLookup(auth),
);
