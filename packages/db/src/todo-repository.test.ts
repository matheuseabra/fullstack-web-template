import { describe, expect, it } from "bun:test";

import * as Effect from "effect/Effect";

import {
  DatabaseError,
  makeTodoRepository,
} from "./todo-repository";

describe("TodoRepository", () => {
  it("maps rejected database operations to DatabaseError", async () => {
    const cause = new Error("database unavailable");
    const database = {
      select: () => ({ from: () => Promise.reject(cause) }),
    } as never;
    const repository = makeTodoRepository(database);

    const result = await Effect.runPromiseExit(repository.getAll());

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
