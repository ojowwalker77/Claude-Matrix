---
name: Effect-TS Expert
description: This skill should be used when the user is working with Effect-TS, asks to "write Effect code", "use Effect", "functional TypeScript", "handle errors with Effect", "dependency injection Effect", "Effect Layer", or needs expert-level guidance on Effect-TS patterns, error handling, concurrency, and best practices.
user-invocable: true
context: current
allowed-tools:
  # Matrix Code Index
  - mcp__plugin_matrix_matrix__matrix_find_callers
  - mcp__plugin_matrix_matrix__matrix_find_definition
  - mcp__plugin_matrix_matrix__matrix_search_symbols
  - mcp__plugin_matrix_matrix__matrix_list_exports
  - mcp__plugin_matrix_matrix__matrix_get_imports
  - mcp__plugin_matrix_matrix__matrix_index_status
  # Matrix Memory
  - mcp__plugin_matrix_matrix__matrix_recall
  - mcp__plugin_matrix_matrix__matrix_store
  - mcp__plugin_matrix_matrix__matrix_reward
  - mcp__plugin_matrix_matrix__matrix_failure
  # Context7 - Library Documentation
  - mcp__plugin_matrix_context7__resolve-library-id
  - mcp__plugin_matrix_context7__query-docs
  # Standard Tools
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash
---

# Effect-TS Expert

Expert-level guidance for Effect-TS functional programming with typed errors, dependency injection, concurrency, and production-ready patterns.

## Core Concepts

### The Effect Type

```typescript
Effect<Success, Error, Requirements>
//     ^        ^       ^
//     |        |       └── Services/dependencies needed (Context)
//     |        └────────── Typed error channel
//     └─────────────────── Success value type
```

**Key insight:** Effects are lazy descriptions of computations. They don't execute until run.

### Creating Effects

```typescript
import { Effect } from "effect"

// From pure values
const success = Effect.succeed(42)
const failure = Effect.fail(new Error("oops"))

// From sync code (may throw)
const sync = Effect.sync(() => JSON.parse(data))
const trySync = Effect.try({
  try: () => JSON.parse(data),
  catch: (e) => new ParseError(e)
})

// From async code
const promise = Effect.promise(() => fetch(url))
const tryPromise = Effect.tryPromise({
  try: () => fetch(url).then(r => r.json()),
  catch: (e) => new FetchError(e)
})

// From callbacks
const callback = Effect.async<string, Error>((resume) => {
  someCallbackApi((err, result) => {
    if (err) resume(Effect.fail(err))
    else resume(Effect.succeed(result))
  })
})
```

### Running Effects

```typescript
// Development/testing
Effect.runSync(effect)           // Sync, throws on async/error
Effect.runPromise(effect)        // Returns Promise<A>
Effect.runPromiseExit(effect)    // Returns Promise<Exit<A, E>>

// Production (with runtime)
const runtime = ManagedRuntime.make(AppLayer)
await runtime.runPromise(effect)
```

## Building Pipelines

### pipe and Effect.gen

```typescript
import { Effect, pipe } from "effect"

// Using pipe (point-free style)
const program = pipe(
  Effect.succeed(5),
  Effect.map(n => n * 2),
  Effect.flatMap(n => n > 5
    ? Effect.succeed(n)
    : Effect.fail(new Error("too small"))
  ),
  Effect.tap(n => Effect.log(`Result: ${n}`))
)

// Using Effect.gen (generator style - RECOMMENDED)
const program = Effect.gen(function* () {
  const n = yield* Effect.succeed(5)
  const doubled = n * 2
  if (doubled <= 5) {
    return yield* Effect.fail(new Error("too small"))
  }
  yield* Effect.log(`Result: ${doubled}`)
  return doubled
})
```

**Recommendation:** Prefer `Effect.gen` for readability. Use `pipe` for simple transformations.

## Error Handling

### Typed Errors vs Defects

| Type | Use Case | Recovery |
|------|----------|----------|
| **Typed Error** | Domain failures (validation, not found, permissions) | Yes - caller can handle |
| **Defect** | Bugs, invariant violations, unrecoverable | No - terminates fiber |

```typescript
// Typed errors - tracked in type system
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
}> {}

const findUser = (id: string): Effect.Effect<User, NotFoundError> =>
  pipe(
    db.query(id),
    Effect.flatMap(user =>
      user ? Effect.succeed(user) : Effect.fail(new NotFoundError({ id }))
    )
  )

// Defects - for bugs, not domain errors
const divide = (a: number, b: number): Effect.Effect<number> =>
  b === 0
    ? Effect.die(new Error("Division by zero - this is a bug!"))
    : Effect.succeed(a / b)
```

### Error Recovery

```typescript
// Catch all errors
Effect.catchAll(effect, (error) => Effect.succeed(fallback))

// Catch specific tagged errors
Effect.catchTag(effect, "NotFoundError", (e) =>
  Effect.succeed(defaultUser)
)

// Catch multiple tags
Effect.catchTags(effect, {
  NotFoundError: (e) => Effect.succeed(defaultUser),
  ValidationError: (e) => Effect.fail(new HttpError(400, e.message))
})

// Convert to Either (errors become Left)
Effect.either(effect)  // Effect<Either<E, A>, never, R>

// Retry on failure
Effect.retry(effect, Schedule.recurs(3))
```

### Best Practice: Error Design

```typescript
// DO: Use tagged errors with Schema
import { Schema } from "effect"

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

// DON'T: Use plain Error or strings
Effect.fail(new Error("something went wrong"))  // Loses type info
Effect.fail("error")  // Not an Error type
```

## Dependency Injection

### Services with Context.Tag

```typescript
import { Context, Effect, Layer } from "effect"

// 1. Define service interface
class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    readonly findById: (id: string) => Effect.Effect<User, NotFoundError>
    readonly save: (user: User) => Effect.Effect<void>
  }
>() {}

// 2. Use in effects
const getUser = (id: string) => Effect.gen(function* () {
  const repo = yield* UserRepository
  return yield* repo.findById(id)
})
// Type: Effect<User, NotFoundError, UserRepository>

// 3. Create layer implementation
const UserRepositoryLive = Layer.succeed(UserRepository, {
  findById: (id) => Effect.tryPromise(() => db.users.find(id)),
  save: (user) => Effect.tryPromise(() => db.users.save(user))
})

// 4. Provide to run
const program = getUser("123")
const runnable = Effect.provide(program, UserRepositoryLive)
```

### Effect.Service (Simplified Pattern)

```typescript
// Combines Tag + Layer in one declaration
class Logger extends Effect.Service<Logger>()("Logger", {
  // Option 1: Sync implementation
  sync: () => ({
    log: (msg: string) => console.log(msg)
  }),

  // Option 2: Effect-based with dependencies
  effect: Effect.gen(function* () {
    const config = yield* Config
    return {
      log: (msg: string) => Effect.sync(() =>
        console.log(`[${config.level}] ${msg}`)
      )
    }
  }),
  dependencies: [ConfigLive]
}) {}

// Use directly
const program = Logger.log("Hello")

// Access via Layer
Effect.provide(program, Logger.Default)
```

### Layer Composition

```typescript
// Merge independent layers
const BaseLayer = Layer.merge(ConfigLive, LoggerLive)

// Provide dependencies
const DbLayer = Layer.provide(DatabaseLive, ConfigLive)

// Full composition
const AppLayer = pipe(
  Layer.merge(ConfigLive, LoggerLive),
  Layer.provideMerge(DatabaseLive),
  Layer.provideMerge(UserRepositoryLive)
)
```

See `references/layers.md` for advanced patterns.

## Concurrency

### Fibers

```typescript
// Fork to run concurrently
const fiber = yield* Effect.fork(longRunningTask)

// Wait for result
const result = yield* Fiber.join(fiber)

// Interrupt
yield* Fiber.interrupt(fiber)

// Race - first to complete wins
const fastest = yield* Effect.race(task1, task2)

// All - run all, collect results
const results = yield* Effect.all([task1, task2, task3])

// All with concurrency limit
const results = yield* Effect.all(tasks, { concurrency: 5 })
```

### Synchronization Primitives

```typescript
// Ref - mutable reference
const counter = yield* Ref.make(0)
yield* Ref.update(counter, n => n + 1)
const value = yield* Ref.get(counter)

// Queue - bounded producer/consumer
const queue = yield* Queue.bounded<number>(100)
yield* Queue.offer(queue, 42)
const item = yield* Queue.take(queue)

// Semaphore - limit concurrent access
const sem = yield* Effect.makeSemaphore(3)
yield* sem.withPermits(1)(expensiveOperation)

// Deferred - one-shot signal
const deferred = yield* Deferred.make<string, Error>()
yield* Deferred.succeed(deferred, "done")
const value = yield* Deferred.await(deferred)
```

## Resource Management

### Scoped Resources

```typescript
// Acquire/release pattern
const file = Effect.acquireRelease(
  Effect.sync(() => fs.openSync(path, "r")),  // acquire
  (fd) => Effect.sync(() => fs.closeSync(fd))  // release
)

// Use with scoped
const program = Effect.scoped(
  Effect.gen(function* () {
    const fd = yield* file
    return yield* readFile(fd)
  })
)
// File automatically closed after scope
```

### Finalizers

```typescript
const program = Effect.gen(function* () {
  yield* Effect.addFinalizer((exit) =>
    Effect.log(`Cleanup: ${exit._tag}`)
  )
  // ... do work
})

const runnable = Effect.scoped(program)
```

## Quick Reference

### Common Operators

| Operator | Purpose |
|----------|---------|
| `Effect.map` | Transform success value |
| `Effect.flatMap` | Chain effects (monadic bind) |
| `Effect.tap` | Side effect, keep original value |
| `Effect.andThen` | Sequence, can be value or effect |
| `Effect.catchAll` | Handle all errors |
| `Effect.catchTag` | Handle specific tagged error |
| `Effect.provide` | Inject dependencies |
| `Effect.retry` | Retry with schedule |
| `Effect.timeout` | Add timeout |
| `Effect.fork` | Run concurrently |
| `Effect.all` | Parallel execution |

### When to Use What

| Scenario | Use |
|----------|-----|
| Transform value | `Effect.map` |
| Chain effects | `Effect.flatMap` or `Effect.gen` |
| Error recovery | `Effect.catchTag` / `Effect.catchAll` |
| Add logging | `Effect.tap` + `Effect.log` |
| Run in parallel | `Effect.all` with `concurrency` |
| Limit concurrency | `Semaphore` |
| Share mutable state | `Ref` |
| Producer/consumer | `Queue` |
| One-time signal | `Deferred` |
| Cleanup resources | `Effect.acquireRelease` |

## Reference Documents

- **`references/error-handling.md`** - Typed errors, defects, recovery patterns
- **`references/layers.md`** - Dependency injection, service composition
- **`references/concurrency.md`** - Fibers, synchronization, parallelism
- **`references/streams.md`** - Stream, Sink, Channel patterns
- **`references/schema.md`** - Validation, encoding/decoding
- **`references/testing.md`** - Test layers, mocking, vitest integration
- **`references/config.md`** - Configuration management
- **`references/anti-patterns.md`** - Common mistakes and fixes
- **`references/fp-ts-migration.md`** - Migration from fp-ts

## Usage

This skill activates automatically when working with Effect-TS files or when the user mentions Effect, functional TypeScript, or typed errors.

**Explicit invocation:**
```
/effect-ts help me refactor this to use Effect
/effect-ts create a service with dependency injection
/effect-ts fix error handling in this code
```
