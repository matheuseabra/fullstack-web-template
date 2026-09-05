import * as Effect from "effect/Effect";

import {
  TodoRepository,
  type TodoCreateInput,
  type TodoDeleteInput,
  type TodoToggleInput,
} from "@web-stack-template/db/todo-repository";

/** Lists todos using the repository supplied by the application runtime. */
const getTodosProgram = Effect.fn("Todo.getAll")(function* () {
  const repository = yield* TodoRepository;
  return yield* repository.getAll();
});
export const getTodos = getTodosProgram();

/** Creates a todo using the repository supplied by the application runtime. */
export const createTodo = Effect.fn("Todo.create")(function* (
  input: TodoCreateInput,
) {
    const repository = yield* TodoRepository;
    return yield* repository.create(input);
});

/** Changes a todo's completed state using the repository supplied by the runtime. */
export const toggleTodo = Effect.fn("Todo.toggle")(function* (
  input: TodoToggleInput,
) {
    const repository = yield* TodoRepository;
    return yield* repository.toggle(input);
});

/** Deletes a todo using the repository supplied by the application runtime. */
export const deleteTodo = Effect.fn("Todo.delete")(function* (
  input: TodoDeleteInput,
) {
    const repository = yield* TodoRepository;
    return yield* repository.delete(input);
});
