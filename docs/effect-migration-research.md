# Effect migration research

Research date: 2026-09-04. Sources are limited to the official Effect website,
the official Effect repository, and the npm registry metadata for the official
package.

## Recommendation in one paragraph

Adopt Effect 3 incrementally in the server-side packages. Keep Next.js, Hono,
oRPC, Better Auth, Drizzle, the AI SDK, and Zod at their existing public
boundaries; use Effect to model application workflows, expected failures, and
dependencies behind those boundaries. Build one application `Layer`, turn it
into one long-lived `ManagedRuntime`, and call that runtime only where oRPC or
Hono requires a `Promise`. This follows Effect's documented migration pattern:
wrap existing Promise APIs with `Effect.tryPromise`, then use `runPromise` at
the outer integration edge ([Effect homepage](https://effect.website/),
[creating effects](https://effect.website/docs/v3/getting-started/creating-effects),
[running effects](https://effect.website/docs/v3/getting-started/running-effects)).

## Version baseline

Use the stable `effect` v3 line for this feature branch, not the v4 release
candidate. At research time, npm's `latest` tag resolves to `3.22.1`, while the
Effect homepage explicitly advertises Effect 4 as a release candidate. The v3
documentation is versioned and remains available. For a production-oriented
template, the lower-risk baseline is therefore `effect@^3.22.1`; evaluate v4 in
a separate migration after its stable release
([official v3.22.1 tag](https://github.com/Effect-TS/effect/releases/tag/effect%403.22.1),
[v3 installation guide](https://effect.website/docs/v3/getting-started/installation),
[Effect homepage](https://effect.website/)).

The repository already meets the documented runtime requirements: Effect v3
supports Bun and requires TypeScript 5.4 or newer; this project uses Bun 1.4 and
TypeScript 6 ([installation guide](https://effect.website/docs/v3/getting-started/installation)).

## Repository-specific seams

| Current surface | Effect role | Keep as boundary |
| --- | --- | --- |
| `packages/api/src/routers/todo.ts` directly awaits Drizzle | Move the four todo workflows into a `TodoRepository` service whose methods return `Effect<Success, DatabaseError>` | oRPC handlers and their Zod input contracts |
| `packages/api/src/context.ts` awaits Better Auth | Wrap `auth.api.getSession` with `Effect.tryPromise` and a tagged `SessionLookupError` | Hono request and oRPC context shapes |
| `packages/db/src/index.ts` exports a process-global client | Expose client construction as a service `Layer`; if client cleanup is supported, make it scoped | Drizzle schema/query API |
| `packages/auth/src/index.ts` constructs Better Auth globally | Construct the live auth service in a `Layer`, depending on config/database services | Better Auth handler and client contracts |
| `apps/server/src/index.ts` is the composition root | Compose live layers, create one `ManagedRuntime`, and add small Promise adapters for Hono/oRPC | Hono routing, oRPC/OpenAPI handlers, AI SDK streaming response |
| `packages/env` synchronously validates env with T3/Zod | Initially inject its already-validated server values through `Layer.succeed` | Next public env and tools such as Drizzle config/Vercel sync |

The service recommendation is based on Effect's `Context.Tag` model: a tag
declares the shape of a required service and becomes a typed requirement of an
effect. Live and test implementations are supplied separately. `Layer.effect`
constructs an implementation that may itself need effects; layers can be
merged and provided to assemble a complete application dependency graph
([managing services](https://effect.website/docs/v3/requirements-management/services),
[managing layers](https://effect.website/docs/v3/requirements-management/layers)).

Prefer domain-level services such as `TodoRepository` over a generic service
that merely exposes the raw Drizzle client. This keeps query details in the DB
adapter and makes API workflows testable with a small in-memory layer.

## API patterns to use

### Promise interop

Wrap every third-party Promise that may reject using the object overload of
`Effect.tryPromise` and map `unknown` to a domain-specific tagged error. The
constructor also passes an `AbortSignal` to APIs that support cancellation. The
no-`catch` overload produces `UnknownException`, so it is less useful for the
domain error contract
([official `tryPromise` guide](https://effect.website/docs/v3/getting-started/creating-effects),
[v3.22.1 API source](https://github.com/Effect-TS/effect/blob/417e0faa80e471d77fc4a67452e68b09ae0ee861/packages/effect/src/Effect.ts#L4618-L4685)).

```ts
const query = Effect.tryPromise({
  try: () => db.select().from(todo),
  catch: (cause) => new DatabaseError({ operation: "todo.getAll", cause }),
})
```

Do not call `Effect.runPromise` in repository or application-service modules.
Effects should remain values until an external Promise-based framework invokes
them. `runPromise` is explicitly documented as a compatibility adapter for
Promise-based code and requires that all environment requirements have already
been provided
([running effects](https://effect.website/docs/v3/getting-started/running-effects),
[v3.22.1 API source](https://github.com/Effect-TS/effect/blob/417e0faa80e471d77fc4a67452e68b09ae0ee861/packages/effect/src/Effect.ts#L12088-L12141)).

### Errors and transport translation

Model expected failures with `Data.TaggedError` and handle them by tag.
Effect's docs recommend tagged errors because `_tag` is a discriminator and
works with `Effect.catchTag`/`catchTags`
([expected errors](https://effect.website/docs/v3/error-management/expected-errors)).

Suggested first error set:

- `DatabaseError`: failed todo database operation.
- `SessionLookupError`: Better Auth session lookup rejected.
- `InvalidAiRequest`: `/ai` body is structurally invalid, if validation is added.

Translate those errors exactly once at the transport adapter. A subtle but
important point: `runPromise` rejects failures as a Fiber failure that contains
Effect failure details; it does not promise to reject with the original tagged
value. Therefore an oRPC adapter should first make the expected-error channel a
success value (for example with `Effect.either` or `Effect.exit`), await the
now-infallible program, then throw the appropriate `ORPCError` outside Effect.
Unexpected defects should remain 500-class failures
([`runPromise` contract](https://github.com/Effect-TS/effect/blob/417e0faa80e471d77fc4a67452e68b09ae0ee861/packages/effect/src/Effect.ts#L12088-L12141),
[error-channel operations](https://effect.website/docs/v3/error-management/error-channel-operations)).

### Runtime and lifecycle

`ManagedRuntime.make(AppLive)` is the appropriate bridge for this server.
Effect documents `ManagedRuntime` specifically for reusing a layer-built
context across API requests and integrating with frameworks where Effect is not
the primary runtime. Its `dispose()` method releases runtime resources
([runtime guide](https://effect.website/docs/v3/runtime),
[v3.22.1 `ManagedRuntime` source](https://github.com/Effect-TS/effect/blob/417e0faa80e471d77fc4a67452e68b09ae0ee861/packages/effect/src/ManagedRuntime.ts#L148-L180)).

Create the runtime once in the server composition root, not once per request.
Dispose it during server shutdown. If the libSQL client has an explicit close
operation, acquire it in a scoped layer so disposal is tied to runtime
lifecycle; Effect's resource APIs guarantee release even when use fails
([resource management](https://effect.website/docs/v3/resource-management/introduction)).

Request-local session data should stay a request value (or be provided only to
the request effect), never be captured in the shared runtime.

### Schema compatibility

Effect Schema can emit a Standard Schema v1 validator with
`Schema.standardSchemaV1`; only schemas with no service requirements can be
converted, and async schema components produce async validation
([Standard Schema guide](https://effect.website/docs/v3/schema/standard-schema)).

That provides a future route to Effect-native API schemas if the consuming
framework accepts Standard Schema. For this first refactor, keep the existing
Zod schemas and `ZodToJsonSchemaConverter`: replacing validation and the
OpenAPI converter at the same time would expand the compatibility surface
without improving the initial Effect service/runtime migration.

### Configuration and observability

Effect's `Config` is itself an effect, defaults to reading environment
variables, supports typed primitives including URLs, and offers
`Config.redacted` for secrets ([configuration guide](https://effect.website/docs/v3/configuration)).
It is suitable for a later server-config migration. The first PR should adapt
the repository's existing validated `env` object into an `AppConfig` layer so
the web build, Drizzle CLI, and Vercel scripts keep their synchronous contracts.

Replace application `console.error` calls with `Effect.logError`, attach
request/operation context with `Effect.annotateLogs`, and add named spans with
`Effect.withSpan`. Effect logging includes timestamps, level, fiber identity,
messages, and optional spans; OpenTelemetry export can be installed later as a
layer without changing workflow code
([logging](https://effect.website/docs/v3/observability/logging),
[tracing](https://effect.website/docs/v3/observability/tracing)).

## Testing implications

Service tags and layers make the core workflows testable without Hono, oRPC,
or a live database: provide `Layer.succeed(TodoRepository, fake)` and execute
the program at the test edge. Cover at least:

- successful list/create/toggle/delete delegation;
- each rejected DB call becomes `DatabaseError` with the correct operation;
- a rejected session lookup becomes `SessionLookupError`;
- the oRPC adapter maps every expected tag to the intended transport error;
- a defect is not mislabeled as an expected client error;
- the shared runtime is reused and its scoped finalizer runs on disposal.

The official repository provides `@effect/vitest` with `it.effect` and
`it.scoped` helpers, and Effect's `TestClock` can deterministically test time,
retry, and scheduling. This repository currently has no test runner, so either
add Vitest plus `@effect/vitest` or keep Bun's runner and call the runtime at the
test boundary; no TestClock dependency is needed until retry/time behavior is
introduced
([official `@effect/vitest` source](https://github.com/Effect-TS/effect/tree/417e0faa80e471d77fc4a67452e68b09ae0ee861/packages/vitest),
[TestClock guide](https://effect.website/docs/v3/testing/testclock)).

## Scope guardrails for the feature PR

- Migrate backend orchestration and failure/dependency modeling first; do not
  rewrite React Query, Better Auth clients, Drizzle schemas, or AI SDK streams.
- Preserve existing HTTP/RPC routes, response shapes, auth cookies, generated
  OpenAPI behavior, and database schema.
- Avoid `Effect.run*` below `apps/server`; one managed runtime is the ownership
  boundary.
- Ensure every `tryPromise` has a deliberate error mapping.
- Do not retry writes by default. Retry policy should only be introduced for
  operations proven idempotent.
- Validate with typecheck/build plus focused service and adapter tests; run a
  real todos/auth smoke test because transport error mapping is boundary code.
