import { expect } from "vitest";
import { describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  DatabaseError,
  TodoRepository,
  type TodoRepositoryService,
} from "@web-stack-template/db/todo-repository";

import { toTransportError } from "../effect-runner";
import { createTodo, deleteTodo, getTodos, toggleTodo } from "./todo";

const unused = () => Effect.die("Unexpected repository operation");

const makeRepository = (
  overrides: Partial<TodoRepositoryService>,
): TodoRepositoryService => ({
  getAll: unused,
  create: unused,
  toggle: unused,
  delete: unused,
  ...overrides,
});

const mutationResult = {
  columns: [],
  columnTypes: [],
  rows: [],
  rowsAffected: 1,
  lastInsertRowid: undefined,
  toJSON: () => ({}),
};

describe("todo application programs", () => {
  it.effect("runs a read through the injected repository", () => {
    const todos = [{ id: 1, text: "write tests", completed: false }];
    const service = makeRepository({
      getAll: () => Effect.succeed(todos),
    });

    return Effect.gen(function* () {
      const actual = yield* getTodos.pipe(
        Effect.provideService(TodoRepository, service),
      );
      expect(actual).toEqual(todos);
    });
  });

  it.effect("passes mutation input to the repository", () => {
    const calls: Array<unknown> = [];
    const service = makeRepository({
      create: (input) => {
        calls.push(["create", input]);
        return Effect.succeed(mutationResult);
      },
      toggle: (input) => {
        calls.push(["toggle", input]);
        return Effect.succeed(mutationResult);
      },
      delete: (input) => {
        calls.push(["delete", input]);
        return Effect.succeed(mutationResult);
      },
    });

    return Effect.gen(function* () {
      yield* createTodo({ text: "new" }).pipe(
        Effect.provideService(TodoRepository, service),
      );
      yield* toggleTodo({ id: 1, completed: true }).pipe(
        Effect.provideService(TodoRepository, service),
      );
      yield* deleteTodo({ id: 1 }).pipe(
        Effect.provideService(TodoRepository, service),
      );

      expect(calls).toEqual([
        ["create", { text: "new" }],
        ["toggle", { id: 1, completed: true }],
        ["delete", { id: 1 }],
      ]);
    });
  });

  it.effect("propagates tagged repository failures", () => {
    const cause = new Error("database unavailable");
    const failure = new DatabaseError({
      operation: "todo.getAll",
      cause,
    });
    const service = makeRepository({
      getAll: () => Effect.fail(failure),
    });

    return Effect.gen(function* () {
      const outcome = yield* Effect.exit(
        getTodos.pipe(Effect.provideService(TodoRepository, service)),
      );
      expect(outcome._tag).toBe("Failure");
      if (outcome._tag === "Failure") {
        expect(outcome.cause._tag).toBe("Fail");
        if (outcome.cause._tag === "Fail") {
          expect(outcome.cause.error).toEqual(failure);
        }
      }
    });
  });

  it("maps tagged repository failures to a stable transport error", () => {
    const error = toTransportError(
      new DatabaseError({
        operation: "todo.getAll",
        cause: new Error("database unavailable"),
      }),
    );

    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.message).toBe("Todo storage is temporarily unavailable");
    expect(toTransportError({ _tag: "unknown" }).code).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });
});
