# Concurrency in Effect-TS

## Fibers: Lightweight Virtual Threads

Fibers are Effect's unit of concurrency - green threads managed by the Effect runtime.

```typescript
import { Effect, Fiber } from "effect"

// Every effect runs in a fiber
// Effect.runPromise creates a "main" fiber
```

### Characteristics

- **Lightweight:** Thousands can run concurrently (no OS thread per fiber)
- **Cooperative:** Yield at await points, not preemptively interrupted
- **Interruptible:** Can be cancelled cleanly with resource cleanup
- **Supervised:** Child fibers attached to parent scope by default

## Forking Fibers

### Effect.fork (Supervised)

```typescript
const program = Effect.gen(function* () {
  // Fork runs concurrently, returns immediately
  const fiber = yield* Effect.fork(longRunningTask)

  // Do other work...
  yield* doSomethingElse()

  // Wait for result when needed
  const result = yield* Fiber.join(fiber)
  return result
})
// When program ends, fiber is automatically interrupted if still running
```

### Effect.forkDaemon (Unsupervised)

```typescript
// Daemon fiber outlives parent scope
const fiber = yield* Effect.forkDaemon(backgroundTask)
// Fiber continues even after parent completes
```

### Effect.forkScoped (Scope-Attached)

```typescript
// Attach to specific scope, not current fiber
const fiber = yield* Effect.forkScoped(task)
// Interrupted when the scope closes
```

## Fiber Operations

### Join (Wait for Result)

```typescript
const fiber = yield* Effect.fork(computation)

// Join waits and returns the result
const result = yield* Fiber.join(fiber)
// If fiber failed, join fails with same error
```

### Await (Get Exit)

```typescript
const fiber = yield* Effect.fork(computation)

// Await returns Exit (success or failure)
const exit = yield* Fiber.await(fiber)
if (Exit.isSuccess(exit)) {
  console.log("Result:", exit.value)
} else {
  console.log("Failed:", Cause.pretty(exit.cause))
}
```

### Interrupt

```typescript
const fiber = yield* Effect.fork(longTask)

// Cancel the fiber
yield* Fiber.interrupt(fiber)
// Runs cleanup/finalizers before terminating
```

### Poll (Non-Blocking Check)

```typescript
const fiber = yield* Effect.fork(task)

// Check if done without blocking
const maybeResult = yield* Fiber.poll(fiber)
// Option.some(exit) if done, Option.none if still running
```

## Parallel Execution

### Effect.all (Parallel by Default)

```typescript
// Run all in parallel, collect results
const [user, posts, settings] = yield* Effect.all([
  fetchUser(id),
  fetchPosts(id),
  fetchSettings(id)
])

// With concurrency limit
const results = yield* Effect.all(tasks, { concurrency: 5 })

// Sequential execution
const results = yield* Effect.all(tasks, { concurrency: 1 })

// Unbounded (no limit)
const results = yield* Effect.all(tasks, { concurrency: "unbounded" })
```

### Effect.all Options

```typescript
Effect.all(effects, {
  concurrency: 10,        // Max concurrent fibers
  batching: true,         // Enable request batching
  discard: true,          // Don't collect results (void)
  mode: "default" | "validate" | "either"
})

// mode: "validate" - collect ALL errors, not just first
// mode: "either" - return Either per effect
```

### Effect.forEach

```typescript
// Map + parallel execution
const results = yield* Effect.forEach(
  userIds,
  (id) => fetchUser(id),
  { concurrency: 10 }
)
```

### Effect.race (First Wins)

```typescript
// First to complete wins, others interrupted
const fastest = yield* Effect.race(
  fetchFromCacheA,
  fetchFromCacheB,
  fetchFromDatabase
)
```

### Effect.raceAll

```typescript
// Race array of effects
const winner = yield* Effect.raceAll([
  task1,
  task2,
  task3
])
```

## Synchronization Primitives

### Ref (Atomic Reference)

```typescript
import { Ref } from "effect"

const program = Effect.gen(function* () {
  // Create mutable reference
  const counter = yield* Ref.make(0)

  // Read
  const value = yield* Ref.get(counter)

  // Write
  yield* Ref.set(counter, 10)

  // Update atomically
  yield* Ref.update(counter, (n) => n + 1)

  // Update and return old value
  const old = yield* Ref.getAndUpdate(counter, (n) => n * 2)

  // Update and return new value
  const newVal = yield* Ref.updateAndGet(counter, (n) => n + 1)

  // Modify (update + return computed value)
  const result = yield* Ref.modify(counter, (n) => [n * 2, n + 1])
  // Returns n * 2, sets ref to n + 1
})
```

### SynchronizedRef (Effectful Updates)

```typescript
import { SynchronizedRef } from "effect"

// Like Ref but updates can be effectful
const cache = yield* SynchronizedRef.make<Map<string, User>>(new Map())

// Effectful update (only one runs at a time)
yield* SynchronizedRef.updateEffect(cache, (map) =>
  Effect.gen(function* () {
    const user = yield* fetchUser(id)
    return new Map(map).set(id, user)
  })
)
```

### Queue

```typescript
import { Queue } from "effect"

const program = Effect.gen(function* () {
  // Bounded queue (blocks offer when full)
  const queue = yield* Queue.bounded<number>(100)

  // Unbounded queue (never blocks offer)
  const unbounded = yield* Queue.unbounded<number>()

  // Dropping queue (drops oldest when full)
  const dropping = yield* Queue.dropping<number>(100)

  // Sliding queue (drops newest when full)
  const sliding = yield* Queue.sliding<number>(100)

  // Offer (add to queue)
  yield* Queue.offer(queue, 42)

  // Offer all
  yield* Queue.offerAll(queue, [1, 2, 3])

  // Take (blocks if empty)
  const item = yield* Queue.take(queue)

  // Take all available
  const items = yield* Queue.takeAll(queue)

  // Poll (non-blocking)
  const maybe = yield* Queue.poll(queue)  // Option<number>

  // Size
  const size = yield* Queue.size(queue)

  // Shutdown
  yield* Queue.shutdown(queue)
})
```

### Deferred (One-Shot Signal)

```typescript
import { Deferred } from "effect"

const program = Effect.gen(function* () {
  // Create unfulfilled deferred
  const deferred = yield* Deferred.make<string, Error>()

  // Fork waiter
  const fiber = yield* Effect.fork(
    Effect.gen(function* () {
      const value = yield* Deferred.await(deferred)
      console.log("Got:", value)
    })
  )

  // Do some work...
  yield* Effect.sleep("1 second")

  // Complete the deferred (success)
  yield* Deferred.succeed(deferred, "Hello!")

  // Or fail it
  // yield* Deferred.fail(deferred, new Error("oops"))

  yield* Fiber.join(fiber)
})
```

### Semaphore

```typescript
import { Effect } from "effect"

const program = Effect.gen(function* () {
  // Create semaphore with 3 permits
  const sem = yield* Effect.makeSemaphore(3)

  // Acquire permit, run effect, release
  yield* sem.withPermits(1)(expensiveOperation)

  // Acquire multiple permits
  yield* sem.withPermits(2)(veryExpensiveOperation)

  // Manual acquire/release
  yield* sem.take(1)
  try {
    yield* doWork()
  } finally {
    yield* sem.release(1)
  }
})
```

## Interruption

### Interruptible vs Uninterruptible

```typescript
// Make region uninterruptible
const critical = Effect.uninterruptible(
  Effect.gen(function* () {
    yield* step1()
    yield* step2()  // Won't be interrupted mid-execution
    yield* step3()
  })
)

// Make region interruptible (inside uninterruptible)
const program = Effect.uninterruptible(
  Effect.gen(function* () {
    yield* criticalSetup()
    yield* Effect.interruptible(interruptibleWork)
    yield* criticalCleanup()
  })
)
```

### Handling Interruption

```typescript
const program = Effect.gen(function* () {
  yield* Effect.addFinalizer((exit) => {
    if (Exit.isInterrupted(exit)) {
      return Effect.log("Was interrupted!")
    }
    return Effect.void
  })

  yield* longRunningWork()
})
```

### Disconnect (Fire and Forget)

```typescript
// Disconnect fiber from parent's interruption
const fiber = yield* Effect.fork(
  Effect.disconnect(backgroundTask)
)
// backgroundTask won't be interrupted when parent is
```

## Patterns

### Worker Pool

```typescript
const workerPool = (tasks: Effect<void>[], poolSize: number) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<Effect<void>>()
    yield* Queue.offerAll(queue, tasks)

    // Create workers
    const workers = Array.from({ length: poolSize }, () =>
      Effect.gen(function* () {
        while (true) {
          const task = yield* Queue.take(queue)
          yield* task
        }
      })
    )

    yield* Effect.all(workers, { concurrency: "unbounded" })
  })
```

### Rate Limiting

```typescript
const rateLimited = <A, E, R>(
  effect: Effect<A, E, R>,
  requestsPerSecond: number
) => Effect.gen(function* () {
  const sem = yield* Effect.makeSemaphore(requestsPerSecond)
  return yield* sem.withPermits(1)(
    effect.pipe(
      Effect.tap(() => Effect.sleep("1 second"))
    )
  )
})
```

### Timeout with Fallback

```typescript
const withFallback = <A, E, R>(
  primary: Effect<A, E, R>,
  fallback: Effect<A, E, R>,
  timeout: Duration
) => Effect.gen(function* () {
  const fiber = yield* Effect.fork(primary)
  const result = yield* Fiber.await(fiber).pipe(
    Effect.timeout(timeout)
  )

  if (Option.isNone(result)) {
    yield* Fiber.interrupt(fiber)
    return yield* fallback
  }

  return Exit.isSuccess(result.value)
    ? result.value.value
    : yield* Effect.failCause(result.value.cause)
})
```
