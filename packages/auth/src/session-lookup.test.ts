import { describe, expect, it } from "bun:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  makeSessionLookup,
  SessionLookup,
  SessionLookupError,
  type SessionLookupResult,
} from "./session-lookup";

const headers = new Headers({ cookie: "better-auth.session_token=test" });

const runLookup = (service: ReturnType<typeof makeSessionLookup>) =>
  Effect.runPromise(
    Effect.either(
      Effect.gen(function* () {
        const lookup = yield* SessionLookup;
        return yield* lookup.getSession(headers);
      }),
    ).pipe(Effect.provide(Layer.succeed(SessionLookup, service))),
  );

describe("SessionLookup", () => {
  it("returns the Better Auth session", async () => {
    const result = {
      session: { id: "session-1" },
      user: { id: "user-1" },
    } as SessionLookupResult;
    const service = makeSessionLookup({
      api: {
        getSession: async () => result,
      },
    });

    const outcome = await runLookup(service);
    expect(outcome._tag).toBe("Right");
    if (outcome._tag === "Right") {
      expect(outcome.right).toEqual(result);
    }
  });

  it("maps a rejected lookup to SessionLookupError", async () => {
    const cause = new Error("auth unavailable");
    const service = makeSessionLookup({
      api: {
        getSession: async () => {
          throw cause;
        },
      },
    });

    const outcome = await runLookup(service);
    expect(outcome._tag).toBe("Left");
    if (outcome._tag === "Left") {
      expect(outcome.left).toMatchObject({
        _tag: "SessionLookupError",
        cause,
      });
    }
    expect(SessionLookupError).toBeDefined();
  });
});
