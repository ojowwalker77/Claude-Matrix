# Error Handling in Effect-TS

## The Error Model

Effect distinguishes between two types of failures:

| Type | Description | Tracked | Recovery |
|------|-------------|---------|----------|
| **Expected Errors (Failures)** | Domain errors callers can handle | In type system (`E`) | `catchAll`, `catchTag` |
| **Unexpected Errors (Defects)** | Bugs, invariant violations | Not in type system | `catchAllDefect` (rare) |

## Creating Typed Errors

### Using Data.TaggedError

```typescript
import { Data, Effect } from "effect"

// Simple tagged error
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entityType: string
  readonly id: string
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {}

class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly url: string
  readonly status: number
}> {}

// Usage
const findUser = (id: string): Effect.Effect<User, NotFoundError> =>
  Effect.gen(function* () {
    const user = yield* db.find(id)
    if (!user) {
      return yield* Effect.fail(new NotFoundError({
        entityType: "User",
        id
      }))
    }
    return user
  })
```

### Using Schema.TaggedError (Serializable)

```typescript
import { Schema } from "effect"

// Errors that can be serialized (for APIs, logging)
class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Number,
  message: Schema.String,
  code: Schema.optional(Schema.String),
}) {}

// Automatically serializable
const error = new ApiError({ status: 404, message: "Not found" })
const json = JSON.stringify(error)  // Works!
```

## Failing Effects

```typescript
// With typed error
const failTyped = Effect.fail(new NotFoundError({ entityType: "User", id: "123" }))

// From sync code that may throw
const trySync = Effect.try({
  try: () => JSON.parse(invalidJson),
  catch: (e) => new ParseError({ message: String(e) })
})

// From promise that may reject
const tryPromise = Effect.tryPromise({
  try: () => fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }),
  catch: (e) => new NetworkError({ url, status: 500 })
})
```

## Creating Defects

Use defects for unrecoverable errors that indicate bugs:

```typescript
// Effect.die - create a defect
const bug = Effect.die(new Error("This should never happen"))

// Effect.dieMessage - shorthand
const bug2 = Effect.dieMessage("Invariant violated: x must be positive")

// Effect.orDie - convert errors to defects
const mustSucceed = Effect.orDie(mayFailEffect)

// Effect.orDieWith - convert with transformation
const critical = Effect.orDieWith(effect, (e) =>
  new Error(`Critical failure: ${e.message}`)
)
```

**When to use defects:**
- Division by zero (caller passed invalid input)
- Array index out of bounds (logic error)
- Assertion failures
- Unhandled enum cases

## Error Recovery

### catchAll - Handle All Errors

```typescript
const withFallback = pipe(
  fetchUser(id),
  Effect.catchAll((error) => {
    // error is NotFoundError | NetworkError
    return Effect.succeed(defaultUser)
  })
)
// Type: Effect<User, never, R>
```

### catchTag - Handle Specific Error

```typescript
const program = pipe(
  fetchUser(id),
  Effect.catchTag("NotFoundError", (e) => {
    console.log(`User ${e.id} not found, using default`)
    return Effect.succeed(defaultUser)
  })
)
// Type: Effect<User, NetworkError, R>
// NotFoundError handled, NetworkError still possible
```

### catchTags - Handle Multiple Errors

```typescript
const program = pipe(
  fetchUser(id),
  Effect.catchTags({
    NotFoundError: (e) => Effect.succeed(defaultUser),
    NetworkError: (e) => Effect.retry(fetchUser(id), Schedule.recurs(3)),
    ValidationError: (e) => Effect.fail(new HttpError(400, e.message))
  })
)
```

### catchSome - Conditional Recovery

```typescript
const program = pipe(
  effect,
  Effect.catchSome((error) => {
    if (error._tag === "NotFoundError" && error.id === "admin") {
      return Option.some(Effect.succeed(adminUser))
    }
    return Option.none()  // Don't handle, propagate error
  })
)
```

## Converting Errors

### To Either

```typescript
const asEither = Effect.either(mayFail)
// Type: Effect<Either<Error, Success>, never, R>

// Usage
const program = Effect.gen(function* () {
  const result = yield* Effect.either(riskyOperation)
  if (Either.isLeft(result)) {
    console.log("Failed:", result.left)
    return defaultValue
  }
  return result.right
})
```

### To Option

```typescript
const asOption = Effect.option(mayFail)
// Type: Effect<Option<Success>, never, R>
// Errors become None
```

### Transform Errors

```typescript
// Map error type
const mapped = Effect.mapError(effect, (e) =>
  new HttpError(500, e.message)
)

// Map both success and error
const mapBoth = Effect.mapBoth(effect, {
  onFailure: (e) => new WrapperError(e),
  onSuccess: (a) => a.toUpperCase()
})
```

## Error Accumulation

### Validate (Collect All Errors)

```typescript
// Effect.all with mode: "validate"
const validateAll = Effect.all(
  [
    validateName(input.name),
    validateEmail(input.email),
    validateAge(input.age)
  ],
  { mode: "validate" }
)
// Collects ALL errors instead of failing on first
// Type: Effect<[Name, Email, Age], [Error, Error, Error], R>
```

### Partition Results

```typescript
const results = yield* Effect.partition(
  items.map(processItem),
  { concurrency: 10 }
)
// results.left: array of errors
// results.right: array of successes
```

## Cause: The Full Error Story

Effect preserves complete error information in `Cause`:

```typescript
import { Cause, Effect } from "effect"

// Access the full cause
const withCause = Effect.catchAllCause(effect, (cause) => {
  if (Cause.isFailure(cause)) {
    const error = cause.error  // Typed error
  }
  if (Cause.isDie(cause)) {
    const defect = cause.defect  // Unknown defect
  }
  if (Cause.isInterrupted(cause)) {
    // Fiber was interrupted
  }
  // Causes can be sequential or parallel
  return Effect.succeed(fallback)
})
```

### Cause Structure

```typescript
// Sequential composition (flatMap failures)
Cause.sequential(cause1, cause2)

// Parallel composition (Effect.all failures)
Cause.parallel(cause1, cause2)

// Pretty print for debugging
const prettyError = Cause.pretty(cause)
```

## Retry and Timeout

### Retry with Schedule

```typescript
import { Schedule } from "effect"

// Retry 3 times
const retry3 = Effect.retry(effect, Schedule.recurs(3))

// Exponential backoff
const retryExponential = Effect.retry(
  effect,
  Schedule.exponential("100 millis").pipe(
    Schedule.compose(Schedule.recurs(5))
  )
)

// Retry only specific errors
const retryOnNetwork = Effect.retry(
  effect,
  {
    schedule: Schedule.recurs(3),
    while: (e) => e._tag === "NetworkError"
  }
)
```

### Timeout

```typescript
import { Duration } from "effect"

// Add timeout
const withTimeout = Effect.timeout(effect, Duration.seconds(5))
// Type: Effect<Option<A>, E, R>  (None if timed out)

// Fail on timeout
const failOnTimeout = Effect.timeoutFail(effect, {
  duration: Duration.seconds(5),
  onTimeout: () => new TimeoutError()
})
```

## Best Practices

### 1. Use Tagged Errors

```typescript
// DO: Tagged errors with data
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string
}> {}

// DON'T: Plain strings or generic Error
Effect.fail("not found")
Effect.fail(new Error("not found"))
```

### 2. Be Specific with Error Types

```typescript
// DO: Specific error per failure mode
type UserServiceError = NotFoundError | ValidationError | DatabaseError

// DON'T: One generic error
type UserServiceError = Error
```

### 3. Defects for Bugs Only

```typescript
// DO: Defect for invariant violation
if (items.length === 0) {
  return Effect.die(new Error("processItems called with empty array"))
}

// DON'T: Defect for expected conditions
if (!user) {
  return Effect.die(new Error("User not found"))  // Should be typed error!
}
```

### 4. Handle Errors Close to Source

```typescript
// DO: Handle where you have context
const getUser = pipe(
  db.findUser(id),
  Effect.catchTag("DbError", (e) =>
    e.code === "NOT_FOUND"
      ? Effect.fail(new NotFoundError({ id }))
      : Effect.fail(new DatabaseError({ message: e.message }))
  )
)

// DON'T: Let raw errors propagate
const getUser = db.findUser(id)  // DbError leaks to callers
```

### 5. Log Before Recovery

```typescript
const withLogging = pipe(
  effect,
  Effect.tapError((e) => Effect.log(`Error: ${e._tag}`, { error: e })),
  Effect.catchTag("NotFoundError", () => Effect.succeed(default))
)
```
