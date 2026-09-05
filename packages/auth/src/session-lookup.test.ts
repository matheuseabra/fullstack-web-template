import { expect } from "vitest";
import { describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  makeSessionLookup,
  SessionLookup,
  SessionLookupError,
  type SessionLookupResult,
} from "./session-lookup";

const headers = new Headers({ cookie: "better-auth.session_token=test" });

describe("SessionLookup", () => {
  it.effect("returns the Better Auth session", () =>
    Effect.gen(function* () {
      const result = {
        session: {
          id: "session-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          userId: "user-1",
          expiresAt: new Date("2026-02-01T00:00:00.000Z"),
          token: "token-1",
        },
        user: {
          id: "user-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          email: "user@example.com",
          emailVerified: true,
          name: "Test User",
        },
      } satisfies SessionLookupResult;
      const service = makeSessionLookup({
        api: {
          getSession: async () => result,
        },
      });

      const actual = yield* Effect.gen(function* () {
        const lookup = yield* SessionLookup;
        return yield* lookup.getSession(headers);
      }).pipe(Effect.provide(Layer.succeed(SessionLookup, service)));
      expect(actual).toEqual(result);
    })
  );

  it.effect("maps a rejected lookup to SessionLookupError", () =>
    Effect.gen(function* () {
      const cause = new Error("auth unavailable");
      const service = makeSessionLookup({
        api: {
          getSession: async () => {
            throw cause;
          },
        },
      });
      const outcome = yield* Effect.exit(
        Effect.gen(function* () {
          const lookup = yield* SessionLookup;
          return yield* lookup.getSession(headers);
        }).pipe(Effect.provide(Layer.succeed(SessionLookup, service))),
      );

      expect(outcome._tag).toBe("Failure");
      if (outcome._tag === "Failure") {
        expect(outcome.cause._tag).toBe("Fail");
        if (outcome.cause._tag === "Fail") {
          expect(outcome.cause.error).toMatchObject({
            _tag: "SessionLookupError",
            cause,
          });
        }
      }
      expect(SessionLookupError).toBeDefined();
    }),
  );
});
