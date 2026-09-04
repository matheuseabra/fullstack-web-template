import { expect } from "vitest";
import { describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  DatabaseError,
  makeTodoRepository,
  type TodoDatabasePort,
} from "./todo-repository";

describe("TodoRepository", () => {
  it.effect("maps rejected database operations to DatabaseError", () => {
    const cause = new Error("database unavailable");
    const database: TodoDatabasePort = {
      select: () => ({ from: async () => Promise.reject(cause) }),
      insert: () => ({ values: async () => Promise.reject(cause) }),
      update: () => ({
        set: () => ({ where: async () => Promise.reject(cause) }),
      }),
      delete: () => ({ where: async () => Promise.reject(cause) }),
    };
    const repository = makeTodoRepository(database);

    return Effect.gen(function* () {
      const result = yield* Effect.exit(repository.getAll());

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(DatabaseError);
          expect(result.cause.error.operation).toBe("todo.getAll");
          expect(result.cause.error.cause).toBe(cause);
        }
      }
    });
  });
});
