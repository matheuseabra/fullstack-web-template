import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ResultSet } from "@libsql/client";
import { eq, type SQL } from "drizzle-orm";

import { todo } from "./schema/todo";

export type TodoRecord = typeof todo.$inferSelect;
export type TodoCreateInput = Pick<typeof todo.$inferInsert, "text">;
export type TodoToggleInput = { readonly id: number; readonly completed: boolean };
export type TodoDeleteInput = { readonly id: number };
export type TodoMutationResult = {
  readonly rowsAffected: number;
};

/** Minimal Drizzle surface needed by this repository adapter. */
export interface TodoDatabasePort {
  readonly select: () => {
    readonly from: (table: typeof todo) => Promise<ReadonlyArray<TodoRecord>>;
  };
  readonly insert: (table: typeof todo) => {
    readonly values: (input: TodoCreateInput) => Promise<ResultSet>;
  };
  readonly update: (table: typeof todo) => {
    readonly set: (input: Pick<typeof todo.$inferInsert, "completed">) => {
      readonly where: (condition: SQL<unknown>) => Promise<ResultSet>;
    };
  };
  readonly delete: (table: typeof todo) => {
    readonly where: (condition: SQL<unknown>) => Promise<ResultSet>;
  };
}

export type DatabaseOperation =
  | "todo.getAll"
  | "todo.create"
  | "todo.toggle"
  | "todo.delete";

/** A stable, expected failure for a persistence operation. */
export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    operation: Schema.Literal(
      "todo.getAll",
      "todo.create",
      "todo.toggle",
      "todo.delete",
    ),
    cause: Schema.Unknown,
  },
) {}

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

const toMutationResult = (result: ResultSet): TodoMutationResult => ({
  rowsAffected: result.rowsAffected,
});

/** Creates the Drizzle-backed repository service for a supplied database. */
export const makeTodoRepository = (
  database: TodoDatabasePort,
): TodoRepositoryService => ({
  getAll: () =>
    withDatabaseError("todo.getAll", async () => database.select().from(todo)),
  create: (input) =>
    withDatabaseError("todo.create", async () => {
      const result = await database.insert(todo).values({ text: input.text });
      return toMutationResult(result);
    }),
  toggle: (input) =>
    withDatabaseError("todo.toggle", async () => {
      const result = await database
        .update(todo)
        .set({ completed: input.completed })
        .where(eq(todo.id, input.id));
      return toMutationResult(result);
    }),
  delete: (input) =>
    withDatabaseError("todo.delete", async () => {
      const result = await database.delete(todo).where(eq(todo.id, input.id));
      return toMutationResult(result);
    }),
});
