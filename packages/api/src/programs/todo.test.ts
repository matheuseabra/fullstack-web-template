import { describe, expect, it } from "bun:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  DatabaseError,
  TodoRepository,
  type TodoMutationResult,
  type TodoRepositoryService,
} from "@web-stack-template/db/todo-repository";

import { type EffectRunner, runForTransport, toTransportError } from "../effect-runner";
import { createTodo, getTodos, toggleTodo } from "./todo";

const makeRunner = (service: TodoRepositoryService): EffectRunner =>
  (<A, E>(effect: Parameters<EffectRunner>[0]) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(Layer.succeed(TodoRepository, service)),
      ) as Effect.Effect<A, E, never>,
    ));

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

const mutationResult = { rowsAffected: 1 } as TodoMutationResult;

describe("todo application programs", () => {
  it("runs a read through the injected repository", async () => {
    const todos = [{ id: 1, text: "write tests", completed: false }];
    const service = makeRepository({
      getAll: () => Effect.succeed(todos),
    });

    await expect(runForTransport(makeRunner(service), getTodos)).resolves.toEqual(
      todos,
    );
  });

  it("passes mutation input to the repository", async () => {
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
    });

    await runForTransport(makeRunner(service), createTodo({ text: "new" }));
    await runForTransport(
      makeRunner(service),
      toggleTodo({ id: 1, completed: true }),
    );

    expect(calls).toEqual([
      ["create", { text: "new" }],
      ["toggle", { id: 1, completed: true }],
    ]);
  });

  it("maps tagged repository failures to a stable transport error", async () => {
    const failure = new Error("database unavailable");
    const service = makeRepository({
      getAll: () =>
        Effect.fail(
          new DatabaseError({
            operation: "todo.getAll",
            cause: failure,
          }),
        ),
    });

    try {
      await runForTransport(makeRunner(service), getTodos);
      throw new Error("expected the program to fail");
    } catch (error) {
      expect((error as { code: string }).code).toBe("INTERNAL_SERVER_ERROR");
      expect((error as { message: string }).message).toBe(
        "Todo storage is temporarily unavailable",
      );
    }
    expect(toTransportError({ _tag: "unknown" }).code).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });
});
