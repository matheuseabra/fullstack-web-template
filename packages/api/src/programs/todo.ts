import * as Effect from "effect/Effect";

import {
  TodoRepository,
  type TodoCreateInput,
  type TodoDeleteInput,
  type TodoToggleInput,
} from "@web-stack-template/db/todo-repository";

/** Lists todos using the repository supplied by the application runtime. */
export const getTodos = Effect.gen(function* () {
  const repository = yield* TodoRepository;
  return yield* repository.getAll();
});

/** Creates a todo using the repository supplied by the application runtime. */
export const createTodo = (input: TodoCreateInput) =>
  Effect.gen(function* () {
    const repository = yield* TodoRepository;
    return yield* repository.create(input);
  });

/** Changes a todo's completed state using the repository supplied by the runtime. */
export const toggleTodo = (input: TodoToggleInput) =>
  Effect.gen(function* () {
    const repository = yield* TodoRepository;
    return yield* repository.toggle(input);
  });

/** Deletes a todo using the repository supplied by the application runtime. */
export const deleteTodo = (input: TodoDeleteInput) =>
  Effect.gen(function* () {
    const repository = yield* TodoRepository;
    return yield* repository.delete(input);
  });
