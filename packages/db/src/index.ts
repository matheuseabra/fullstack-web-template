import { makeDatabaseResource } from "./runtime";
import type { DatabaseClient } from "./runtime";

export type {
  DatabaseResource,
  DatabaseResourceError,
} from "./runtime";
export { makeDatabaseResource, TodoRepositoryLive } from "./runtime";

/** Compatibility factory for consumers that still need a Drizzle client. */
export function createDb(): DatabaseClient {
  return makeDatabaseResource().database;
}

/** Compatibility singleton for consumers that still expect a raw Drizzle client. */
export const db = createDb();

export type { DatabaseClient } from "./runtime";
export * from "./todo-repository";
export * from "./schema";
