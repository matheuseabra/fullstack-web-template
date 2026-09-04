import {
  db,
  type DatabaseClient,
} from "@web-stack-template/db";

import {
  createAuth as createRuntimeAuth,
} from "./runtime";

export {
  Auth,
  makeSessionLookup,
  SessionLookup,
  SessionLookupError,
} from "./session-lookup";
export type {
  AuthService,
  SessionLookupAuth,
  SessionLookupResult,
  SessionLookupService,
} from "./session-lookup";
export { AuthError, SessionLookupLive } from "./runtime";

/** Compatibility factory retaining the historical zero-argument API. */
export function createAuth(database: DatabaseClient = db) {
  return createRuntimeAuth(database);
}

/** Compatibility singleton; production server code imports the runtime subpath. */
export const auth = createAuth(db);
