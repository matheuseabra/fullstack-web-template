import { createClient } from "@libsql/client";
import { env } from "@web-stack-template/env/server";
import { drizzle } from "drizzle-orm/libsql";
import * as Layer from "effect/Layer";

import * as schema from "./schema";
import { makeTodoRepository, TodoRepository } from "./todo-repository";

export function createDb() {
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });

  return drizzle({ client, schema });
}

/** Compatibility export for consumers that still need the raw Drizzle client. */
export const db = createDb();

export type DatabaseClient = ReturnType<typeof createDb>;

/** The production Layer; tests can replace it with an in-memory implementation. */
export const TodoRepositoryLive = Layer.succeed(TodoRepository, makeTodoRepository(db));

export * from "./todo-repository";
export * from "./schema";
