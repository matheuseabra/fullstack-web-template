import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { ResultSet } from "@libsql/client";
import { eq } from "drizzle-orm";

import type { DatabaseClient } from "./index";
import { todo } from "./schema/todo";

export type TodoRecord = typeof todo.$inferSelect;
export type TodoCreateInput = Pick<typeof todo.$inferInsert, "text">;
export type TodoToggleInput = { readonly id: number; readonly completed: boolean };
export type TodoDeleteInput = { readonly id: number };
export type TodoMutationResult = ResultSet;

export type DatabaseOperation =
  | "todo.getAll"
  | "todo.create"
  | "todo.toggle"
  | "todo.delete";

/** A stable, expected failure for a persistence operation. */
export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly operation: DatabaseOperation;
  readonly cause: unknown;
}> {}

export interface TodoRepositoryService {
  readonly getAll: () => Effect.Effect<ReadonlyArray<TodoRecord>, DatabaseError>;
  readonly create: (
    input: TodoCreateInput,
  ) => Effect.Effect<TodoMutationResult, DatabaseError>;
  readonly toggle: (
    input: TodoToggleInput,
  ) => Effect.Effect<TodoMutationResult, DatabaseError>;
  readonly delete: (
    input: TodoDeleteInput,
  ) => Effect.Effect<TodoMutationResult, DatabaseError>;
}

export class TodoRepository extends Context.Tag(
  "@web-stack-template/db/TodoRepository",
)<TodoRepository, TodoRepositoryService>() {}

const withDatabaseError = <A>(
  operation: DatabaseOperation,
  execute: () => Promise<A>,
): Effect.Effect<A, DatabaseError> =>
  Effect.tryPromise({
    try: execute,
    catch: (cause) => new DatabaseError({ operation, cause }),
  });

/** Creates the Drizzle-backed repository service for a supplied database. */
export const makeTodoRepository = (
  database: DatabaseClient,
): TodoRepositoryService => ({
  getAll: () =>
    withDatabaseError("todo.getAll", async () => database.select().from(todo)),
  create: (input) =>
    withDatabaseError("todo.create", async () =>
      database.insert(todo).values({ text: input.text }),
    ),
  toggle: (input) =>
    withDatabaseError("todo.toggle", async () =>
      database
        .update(todo)
        .set({ completed: input.completed })
        .where(eq(todo.id, input.id)),
    ),
  delete: (input) =>
    withDatabaseError("todo.delete", async () =>
      database.delete(todo).where(eq(todo.id, input.id)),
    ),
});
