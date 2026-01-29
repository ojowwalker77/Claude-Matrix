# Effect-TS Anti-Patterns and How to Fix Them

## Error Handling Anti-Patterns

### 1. Using Defects for Expected Errors

**Problem:** Domain errors treated as bugs.

```typescript
// WRONG: User not found is expected, not a bug
const findUser = (id: string) =>
  Effect.gen(function* () {
    const user = yield* db.find(id)
    if (!user) {
      return yield* Effect.die(new Error("User not found"))  // BAD!
    }
    return user
  })
```

**Fix:** Use typed errors for expected failures.

```typescript
// RIGHT: Typed error the caller can handle
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string
}> {}

const findUser = (id: string): Effect.Effect<User, NotFoundError> =>
  Effect.gen(function* () {
    const user = yield* db.find(id)
    if (!user) {
      return yield* Effect.fail(new NotFoundError({ id }))
    }
    return user
  })
```

### 2. Swallowing Errors

**Problem:** Errors silently converted to defaults.

```typescript
// WRONG: Error information lost
const getConfig = () =>
  Effect.catchAll(loadConfig, () => Effect.succeed(defaultConfig))
```

**Fix:** Log errors before recovery, or propagate.

```typescript
// RIGHT: Log before fallback
const getConfig = () => pipe(
  loadConfig,
  Effect.tapError((e) => Effect.log(`Config load failed: ${e}`, { level: "warn" })),
  Effect.catchAll(() => Effect.succeed(defaultConfig))
)
```

### 3. Generic Error Types

**Problem:** Losing type information with broad error types.

```typescript
// WRONG: All errors become "Error"
const process = (data: Data): Effect.Effect<Result, Error> =>
  Effect.gen(function* () {
    // Multiple failure modes collapsed into Error
  })
```

**Fix:** Use discriminated unions of tagged errors.

```typescript
// RIGHT: Specific error types
type ProcessError = ValidationError | TransformError | SaveError

const process = (data: Data): Effect.Effect<Result, ProcessError> =>
  Effect.gen(function* () {
    const validated = yield* validate(data)  // ValidationError
    const transformed = yield* transform(validated)  // TransformError
    return yield* save(transformed)  // SaveError
  })
```

## Layer and Dependency Anti-Patterns

### 4. Providing Layers Inside Business Logic

**Problem:** Layer composition scattered across code.

```typescript
// WRONG: Layer provided deep in call stack
const processOrder = (order: Order) =>
  Effect.gen(function* () {
    const validated = yield* validateOrder(order)
    // Layer provided mid-workflow - breaks composability
    const saved = yield* pipe(
      saveOrder(validated),
      Effect.provide(DatabaseLayer)  // BAD!
    )
    return saved
  })
```

**Fix:** Compose layers at the composition root.

```typescript
// RIGHT: Effects declare requirements, layers provided at top
const processOrder = (order: Order) =>
  Effect.gen(function* () {
    const repo = yield* OrderRepository  // Requirement
    const validated = yield* validateOrder(order)
    return yield* repo.save(validated)
  })
// Type: Effect<Order, ValidationError | SaveError, OrderRepository>

// main.ts - composition root
const program = processOrder(order)
const runnable = Effect.provide(program, AppLayer)
```

### 5. Not Using accessors: true

**Problem:** Verbose service access.

```typescript
// Without accessors
const program = Effect.gen(function* () {
  const logger = yield* Logger
  yield* logger.info("Starting")
  // ...
  yield* logger.info("Done")
})
```

**Fix:** Enable accessors for frequently used services.

```typescript
class Logger extends Effect.Service<Logger>()("Logger", {
  accessors: true,  // Enable static methods
  sync: () => ({ /* ... */ })
}) {}

// Clean usage
const program = Effect.gen(function* () {
  yield* Logger.info("Starting")
  // ...
  yield* Logger.info("Done")
})
```

### 6. Circular Layer Dependencies

**Problem:** Services depend on each other.

```typescript
// WRONG: A needs B, B needs A
const ALayer = Layer.effect(A, Effect.gen(function* () {
  const b = yield* B  // A depends on B
  return { /* ... */ }
}))

const BLayer = Layer.effect(B, Effect.gen(function* () {
  const a = yield* A  // B depends on A - CIRCULAR!
  return { /* ... */ }
}))
```

**Fix:** Extract common dependency or restructure.

```typescript
// RIGHT: Extract shared concern
const SharedLayer = Layer.succeed(Shared, { /* common */ })

const ALayer = Layer.effect(A, Effect.gen(function* () {
  const shared = yield* Shared
  return { /* ... */ }
}))

const BLayer = Layer.effect(B, Effect.gen(function* () {
  const shared = yield* Shared
  return { /* ... */ }
}))
```

## Concurrency Anti-Patterns

### 7. Uncontrolled Parallelism

**Problem:** Spawning unlimited concurrent operations.

```typescript
// WRONG: May overwhelm resources
const processAll = (items: Item[]) =>
  Effect.all(
    items.map(processItem),
    { concurrency: "unbounded" }  // 10,000 items = 10,000 concurrent ops
  )
```

**Fix:** Use bounded concurrency.

```typescript
// RIGHT: Controlled concurrency
const processAll = (items: Item[]) =>
  Effect.all(
    items.map(processItem),
    { concurrency: 10 }  // Max 10 concurrent
  )
```

### 8. Forgetting to Join Forked Fibers

**Problem:** Fire-and-forget fibers that might fail silently.

```typescript
// WRONG: Fiber errors are lost
const program = Effect.gen(function* () {
  yield* Effect.fork(backgroundTask)  // Started but not joined
  return "done"
})
```

**Fix:** Join or explicitly handle fiber outcome.

```typescript
// RIGHT: Wait for fiber or handle explicitly
const program = Effect.gen(function* () {
  const fiber = yield* Effect.fork(backgroundTask)
  // Later...
  yield* Fiber.join(fiber)  // Propagates errors
})

// Or for true fire-and-forget, handle errors explicitly
const program = Effect.gen(function* () {
  yield* Effect.fork(
    backgroundTask.pipe(
      Effect.catchAll((e) => Effect.log(`Background task failed: ${e}`))
    )
  )
})
```

### 9. Not Using Ref for Shared Mutable State

**Problem:** Closure variables modified concurrently.

```typescript
// WRONG: Race condition!
let counter = 0
const increment = Effect.sync(() => {
  counter++  // Not atomic!
})

yield* Effect.all(Array(100).fill(increment))
// counter might not be 100
```

**Fix:** Use Ref for atomic updates.

```typescript
// RIGHT: Atomic updates
const program = Effect.gen(function* () {
  const counter = yield* Ref.make(0)

  yield* Effect.all(
    Array(100).fill(Ref.update(counter, (n) => n + 1)),
    { concurrency: "unbounded" }
  )

  const final = yield* Ref.get(counter)
  // final is guaranteed to be 100
})
```

## Effect Construction Anti-Patterns

### 10. Using Effect.promise for Rejecting Promises

**Problem:** Promise rejections become defects.

```typescript
// WRONG: Rejection becomes defect (untyped)
const fetchData = Effect.promise(() =>
  fetch(url).then((r) => r.json())
)
// If fetch throws, it's a defect, not typed error
```

**Fix:** Use Effect.tryPromise with error mapping.

```typescript
// RIGHT: Map rejection to typed error
const fetchData = Effect.tryPromise({
  try: () => fetch(url).then((r) => r.json()),
  catch: (e) => new FetchError({ message: String(e) })
})
// Type: Effect<Data, FetchError>
```

### 11. Heavy Computation in Effect.sync

**Problem:** Blocking the fiber runtime.

```typescript
// WRONG: Blocks the runtime
const heavyComputation = Effect.sync(() => {
  // 10 seconds of CPU work
  return computeExpensiveResult()
})
```

**Fix:** Use Effect.async or break into chunks.

```typescript
// RIGHT: Allow other fibers to run
const heavyComputation = Effect.async<Result>((resume) => {
  setImmediate(() => {
    const result = computeExpensiveResult()
    resume(Effect.succeed(result))
  })
})

// Or chunk the work
const processChunks = (items: Item[]) =>
  Effect.forEach(
    chunk(items, 100),
    (chunk) => processChunk(chunk).pipe(Effect.tap(() => Effect.yieldNow())),
    { concurrency: 1 }
  )
```

## Testing Anti-Patterns

### 12. Testing with Real Dependencies

**Problem:** Tests depend on external systems.

```typescript
// WRONG: Test hits real database
it("should save user", async () => {
  const program = saveUser(testUser).pipe(
    Effect.provide(RealDatabaseLayer)  // Slow, flaky, side effects
  )
  await Effect.runPromise(program)
})
```

**Fix:** Use test layers with mocks.

```typescript
// RIGHT: Isolated test
it("should save user", async () => {
  const users = new Map<string, User>()
  const TestDb = Layer.succeed(Database, {
    save: (u) => Effect.sync(() => { users.set(u.id, u) }),
    find: (id) => Effect.succeed(users.get(id)),
  })

  const program = saveUser(testUser).pipe(Effect.provide(TestDb))
  await Effect.runPromise(program)

  expect(users.has(testUser.id)).toBe(true)
})
```

## Common Mistakes Quick Reference

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `Effect.die` for expected errors | Untyped, can't recover | Use `Effect.fail` with tagged error |
| `Effect.promise` with rejections | Rejections are defects | Use `Effect.tryPromise` |
| Providing layers in business logic | Hard to compose/test | Provide at composition root |
| `concurrency: "unbounded"` | Resource exhaustion | Use bounded concurrency |
| Closure mutations | Race conditions | Use `Ref` |
| Fire-and-forget `fork` | Silent failures | Join or handle errors |
| Generic `Error` type | Lost type information | Use tagged error union |
| Real deps in tests | Slow, flaky | Use test layers |
| `Effect.sync` for heavy work | Blocks runtime | Use `Effect.async` |
| Swallowing errors silently | Hard to debug | Log before recovery |
