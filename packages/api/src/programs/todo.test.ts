import { expect } from "vitest";
import { describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import {
  DatabaseError,
  TodoRepository,
  type TodoCreateInput,
  type TodoDeleteInput,
  type TodoMutationResult,
  type TodoRecord,
  type TodoRepositoryService,
  type TodoToggleInput,
} from "@web-stack-template/db/todo-repository";

import { toTransportError } from "../effect-runner";
import { createTodo, deleteTodo, getTodos, toggleTodo } from "./todo";

const unused = () => Effect.die("Unexpected repository operation");

const mutationResult = {
  rowsAffected: 1,
} satisfies TodoMutationResult;

const makeInMemoryRepositoryLayer = (
  initial: ReadonlyArray<TodoRecord>,
) =>
  Layer.effect(
    TodoRepository,
    Effect.gen(function* () {
      const todos = yield* Ref.make([...initial]);

      const create = (input: TodoCreateInput) =>
        Ref.modify(todos, (current) => {
          const nextTodo = {
            id: current.length + 1,
            text: input.text,
            completed: false,
          };
          return [mutationResult, [...current, nextTodo]];
        });

      const toggle = (input: TodoToggleInput) =>
        Ref.update(todos, (current) =>
          current.map((todo) =>
            todo.id === input.id
              ? { ...todo, completed: input.completed }
              : todo,
          ),
        ).pipe(Effect.as(mutationResult));

      const remove = (input: TodoDeleteInput) =>
        Ref.update(todos, (current) =>
          current.filter((todo) => todo.id !== input.id),
        ).pipe(Effect.as(mutationResult));

      return {
        getAll: () => Ref.get(todos),
        create,
        toggle,
        delete: remove,
      } satisfies TodoRepositoryService;
    }),
  );

describe("todo application programs", () => {
  it.effect("runs a read through the injected repository", () => {
    const todos = [{ id: 1, text: "write tests", completed: false }];

    return Effect.gen(function* () {
      const actual = yield* getTodos;
      expect(actual).toEqual(todos);
    }).pipe(Effect.provide(makeInMemoryRepositoryLayer(todos)));
  });

  it.effect("passes mutation input to the repository", () => {
    return Effect.gen(function* () {
      yield* createTodo({ text: "new" });
      yield* toggleTodo({ id: 1, completed: true });
      yield* deleteTodo({ id: 1 });
      const actual = yield* getTodos;

      expect(actual).toEqual([
        { id: 2, text: "new", completed: false },
      ]);
    }).pipe(
      Effect.provide(
        makeInMemoryRepositoryLayer([
          { id: 1, text: "existing", completed: false },
        ]),
      ),
    );
  });

  it.effect("propagates tagged repository failures", () => {
    const cause = new Error("database unavailable");
    const failure = new DatabaseError({
      operation: "todo.getAll",
      cause,
    });
    const service: TodoRepositoryService = {
      getAll: () => Effect.fail(failure),
      create: unused,
      toggle: unused,
      delete: unused,
    };

    return Effect.gen(function* () {
      const outcome = yield* Effect.exit(getTodos);
      expect(outcome._tag).toBe("Failure");
      if (outcome._tag === "Failure") {
        expect(outcome.cause._tag).toBe("Fail");
        if (outcome.cause._tag === "Fail") {
          expect(outcome.cause.error).toEqual(failure);
        }
      }
    }).pipe(Effect.provide(Layer.succeed(TodoRepository, service)));
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
