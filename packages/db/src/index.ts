import { createClient, type Client } from "@libsql/client";
import { env } from "@web-stack-template/env/server";
import { drizzle } from "drizzle-orm/libsql";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as schema from "./schema";
import { makeTodoRepository, TodoRepository } from "./todo-repository";

export type DatabaseResource = {
  readonly database: DatabaseClient;
  readonly client: Client;
};

function makeDrizzleDatabase(client: Client) {
  return drizzle({ client, schema });
}

export type DatabaseClient = ReturnType<typeof makeDrizzleDatabase>;

export function makeDatabaseResource(): DatabaseResource {
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });

  return { client, database: makeDrizzleDatabase(client) };
}

/** Compatibility factory for consumers that still need a Drizzle client. */
export function createDb(): DatabaseClient {
  return makeDatabaseResource().database;
}

const acquireDatabase = Effect.acquireRelease(
  Effect.sync(makeDatabaseResource),
  ({ client }) => Effect.sync(() => client.close()),
);

/** The production Layer; tests can replace it with an in-memory implementation. */
export const TodoRepositoryLive = Layer.scoped(
  TodoRepository,
  Effect.map(acquireDatabase, ({ database }) => makeTodoRepository(database)),
);

export * from "./todo-repository";
export * from "./schema";
