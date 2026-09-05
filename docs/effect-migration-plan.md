# Effect migration plan

## Goal

Adopt Effect as the backend application's execution model without replacing the
framework adapters that already fit the template. Hono remains the HTTP adapter,
oRPC remains the typed transport interface, Drizzle remains the persistence
adapter, and Better Auth remains the authentication adapter. Effect owns
dependency composition, typed operational failures, program execution, and
observability between those seams.

## Design

The migration introduces three deep modules:

1. **Todo repository** — a small Effect interface for listing, creating,
   updating, and deleting todos. The Drizzle implementation is the live adapter;
   tests provide an in-memory adapter through a Layer.
2. **Session lookup** — an Effect interface around Better Auth session loading.
   Better Auth remains responsible for authentication details while callers see
   one typed operation and one tagged failure.
3. **Application runtime** — one ManagedRuntime built from the live Layers. It is
   the only place transport handlers cross from `Effect` programs to Promises.

Expected database and authentication failures use tagged error types. At the
oRPC seam they are logged through Effect and translated to stable transport
errors; implementation details are not leaked to clients.

## Execution phases

### 1. Dependencies and quality gates

- Add `effect` to the workspace catalog and the backend packages that import it.
- Add package/root test scripts and focused Bun tests.
- Add Oxlint with cyclomatic complexity capped at 12 and a repository quality
  budget configuration using the standard 300 non-empty lines and 25 KB limits.

### 2. Effect modules and adapters

- Add the todo repository interface, tagged persistence error, and Drizzle live
  Layer under `packages/db`.
- Add the session lookup interface, tagged authentication error, and Better Auth
  live Layer under `packages/auth`.
- Preserve raw database/auth exports needed by Drizzle Kit and Better Auth while
  removing direct use of those globals from application programs.

### 3. Application programs and runtime

- Express todo use cases as Effect programs that require the repository tag.
- Compose live Layers once in a ManagedRuntime.
- Adapt oRPC handlers and request-context creation through the runtime.
- Use Effect logging and tagged failures at the HTTP/AI adapter where async setup
  can fail.

### 4. Tests and documentation

- Test todo programs using an in-memory Layer, including mutation and failure
  propagation.
- Test transport error translation without a live database.
- Update the README with the Effect architecture, extension pattern, and commands.
- Record the primary-source Effect research used by this plan.

### 5. Verification and delivery

- Run focused tests, full tests, Oxlint, quality budgets, type checks, and builds.
- Review the complete branch diff and shape topical commits.
- Push the feature branch and open a PR with the migration summary and exact test
  evidence.

## Acceptance criteria

- Backend business operations are `Effect` values with visible requirements and
  typed expected errors.
- Live dependencies are composed with Layers and executed by one ManagedRuntime.
- Hono/oRPC contain only adapter logic; todo handlers do not import the Drizzle
  client directly.
- Tests replace live dependencies at the same interfaces used by production.
- Existing web, authentication, todo, AI, Docker, and deployment interfaces remain
  compatible.
- All automated verification gates pass on the feature branch.
