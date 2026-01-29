# Testing Effect-TS Applications

## Testing Strategy

| Test Type | Approach | Tools |
|-----------|----------|-------|
| Unit Tests | Test pure functions, isolated effects | Vitest + Effect |
| Service Tests | Mock dependencies via layers | Test layers, stubs |
| Integration | Real dependencies, controlled env | Test containers, MSW |

## Vitest Setup

### Installation

```bash
npm install -D vitest @vitest/coverage-v8
```

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
})
```

## Basic Effect Testing

### Running Effects in Tests

```typescript
import { describe, it, expect } from "vitest"
import { Effect } from "effect"

describe("MyService", () => {
  it("should process data", async () => {
    const program = Effect.gen(function* () {
      const result = yield* processData(input)
      return result
    })

    const result = await Effect.runPromise(program)
    expect(result).toEqual(expectedOutput)
  })

  it("should fail with InvalidInput", async () => {
    const program = processData(invalidInput)

    const exit = await Effect.runPromiseExit(program)
    expect(Exit.isFailure(exit)).toBe(true)

    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause)
      expect(Option.isSome(error)).toBe(true)
      expect(error.value._tag).toBe("InvalidInputError")
    }
  })
})
```

### Testing Error Cases

```typescript
import { Effect, Exit, Cause, Option } from "effect"

it("should handle not found error", async () => {
  const program = findUser("non-existent-id")

  const exit = await Effect.runPromiseExit(program)

  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    const error = Cause.failureOption(exit.cause)
    expect(Option.getOrNull(error)?._tag).toBe("NotFoundError")
  }
})

// Helper for cleaner error assertions
const expectFailure = async <A, E>(
  effect: Effect.Effect<A, E>,
  check: (error: E) => void
) => {
  const exit = await Effect.runPromiseExit(effect)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    const error = Cause.failureOption(exit.cause)
    expect(Option.isSome(error)).toBe(true)
    check(error.value)
  }
}

// Usage
it("should fail with NotFoundError", async () => {
  await expectFailure(findUser("bad-id"), (e) => {
    expect(e._tag).toBe("NotFoundError")
    expect(e.id).toBe("bad-id")
  })
})
```

## Mocking Services

### Test Layers

```typescript
// Production implementation
class UserRepository extends Effect.Service<UserRepository>()("UserRepository", {
  effect: Effect.gen(function* () {
    const db = yield* Database
    return {
      findById: (id: string) => db.query(`SELECT * FROM users WHERE id = $1`, [id]),
      save: (user: User) => db.query(`INSERT INTO users...`, [user]),
    }
  }),
  dependencies: [Database.Default]
}) {}

// Test implementation
const UserRepositoryTest = Layer.succeed(UserRepository, {
  findById: (id) =>
    id === "existing-user"
      ? Effect.succeed({ id, name: "Test User", email: "test@example.com" })
      : Effect.fail(new NotFoundError({ id })),
  save: () => Effect.void,
})

// Use in tests
describe("UserService", () => {
  const TestLayer = Layer.merge(UserRepositoryTest, LoggerTest)

  it("should find existing user", async () => {
    const program = pipe(
      getUserById("existing-user"),
      Effect.provide(TestLayer)
    )

    const result = await Effect.runPromise(program)
    expect(result.name).toBe("Test User")
  })
})
```

### Mock Factories

```typescript
// Create configurable mocks
const makeUserRepositoryMock = (options: {
  users?: Map<string, User>
  shouldFail?: boolean
}) => Layer.succeed(UserRepository, {
  findById: (id) => {
    if (options.shouldFail) {
      return Effect.fail(new DatabaseError({ message: "Connection failed" }))
    }
    const user = options.users?.get(id)
    return user
      ? Effect.succeed(user)
      : Effect.fail(new NotFoundError({ id }))
  },
  save: (user) => {
    if (options.shouldFail) {
      return Effect.fail(new DatabaseError({ message: "Connection failed" }))
    }
    options.users?.set(user.id, user)
    return Effect.void
  },
})

// Usage
it("should handle database failure", async () => {
  const TestLayer = makeUserRepositoryMock({ shouldFail: true })

  const program = pipe(
    getUserById("any-id"),
    Effect.provide(TestLayer)
  )

  await expectFailure(program, (e) => {
    expect(e._tag).toBe("DatabaseError")
  })
})
```

### Using DefaultWithoutDependencies

```typescript
// Service with dependencies
class Cache extends Effect.Service<Cache>()("Cache", {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem
    return {
      get: (key: string) => fs.readFileString(`cache/${key}`),
      set: (key: string, value: string) => fs.writeFileString(`cache/${key}`, value),
    }
  }),
  dependencies: [FileSystem.Default]
}) {}

// Test with mocked dependency only
const FileSystemTest = FileSystem.layerNoop({
  readFileString: () => Effect.succeed("cached-value"),
  writeFileString: () => Effect.void,
})

const program = pipe(
  cacheOperation,
  Effect.provide(Cache.DefaultWithoutDependencies),
  Effect.provide(FileSystemTest)
)
```

## Mocking Config

```typescript
import { ConfigProvider, Layer } from "effect"

// Create test config provider
const TestConfigProvider = ConfigProvider.fromMap(
  new Map([
    ["DATABASE_URL", "postgres://test:test@localhost/test"],
    ["LOG_LEVEL", "debug"],
    ["API_KEY", "test-api-key"],
  ])
)

const TestConfigLayer = Layer.setConfigProvider(TestConfigProvider)

// Use in tests
it("should use test config", async () => {
  const program = pipe(
    getConfig,
    Effect.provide(TestConfigLayer)
  )

  const config = await Effect.runPromise(program)
  expect(config.logLevel).toBe("debug")
})
```

## Testing with MSW (HTTP Mocking)

```typescript
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const handlers = [
  http.get("/api/users/:id", ({ params }) => {
    if (params.id === "123") {
      return HttpResponse.json({ id: "123", name: "Test User" })
    }
    return new HttpResponse(null, { status: 404 })
  }),
]

const server = setupServer(...handlers)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("API Client", () => {
  it("should fetch user", async () => {
    const program = fetchUser("123")

    const user = await Effect.runPromise(program)
    expect(user.name).toBe("Test User")
  })

  it("should handle 404", async () => {
    const program = fetchUser("non-existent")

    await expectFailure(program, (e) => {
      expect(e._tag).toBe("NotFoundError")
    })
  })

  // Override handler for specific test
  it("should handle server error", async () => {
    server.use(
      http.get("/api/users/:id", () => {
        return new HttpResponse(null, { status: 500 })
      })
    )

    const program = fetchUser("123")

    await expectFailure(program, (e) => {
      expect(e._tag).toBe("ServerError")
    })
  })
})
```

## Testing Concurrent Code

```typescript
import { TestClock, Fiber } from "effect"

describe("Concurrent operations", () => {
  it("should timeout after 5 seconds", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        slowOperation.pipe(Effect.timeout("5 seconds"))
      )

      // Advance time
      yield* TestClock.adjust("6 seconds")

      const result = yield* Fiber.join(fiber)
      return result
    }).pipe(Effect.provide(TestContext.layer))

    const result = await Effect.runPromise(program)
    expect(Option.isNone(result)).toBe(true)
  })

  it("should retry 3 times", async () => {
    let attempts = 0
    const flaky = Effect.gen(function* () {
      attempts++
      if (attempts < 3) {
        return yield* Effect.fail(new Error("flaky"))
      }
      return "success"
    })

    const program = Effect.retry(flaky, Schedule.recurs(3))

    const result = await Effect.runPromise(program)
    expect(result).toBe("success")
    expect(attempts).toBe(3)
  })
})
```

## Testing Streams

```typescript
import { Stream, Chunk } from "effect"

describe("Stream processing", () => {
  it("should transform stream", async () => {
    const input = Stream.fromIterable([1, 2, 3, 4, 5])

    const program = input.pipe(
      Stream.map((n) => n * 2),
      Stream.filter((n) => n > 4),
      Stream.runCollect
    )

    const result = await Effect.runPromise(program)
    expect(Chunk.toArray(result)).toEqual([6, 8, 10])
  })

  it("should handle stream errors", async () => {
    const input = Stream.fromIterable([1, 2, 3]).pipe(
      Stream.mapEffect((n) =>
        n === 2
          ? Effect.fail(new Error("boom"))
          : Effect.succeed(n)
      )
    )

    const exit = await Effect.runPromiseExit(Stream.runCollect(input))
    expect(Exit.isFailure(exit)).toBe(true)
  })
})
```

## Test Helpers

```typescript
// test/helpers.ts
import { Effect, Exit, Cause, Option, Layer } from "effect"

export const runTest = <A, E>(
  effect: Effect.Effect<A, E>,
  layer?: Layer.Layer<any, any, any>
) => {
  const program = layer ? Effect.provide(effect, layer) : effect
  return Effect.runPromise(program)
}

export const runTestExit = <A, E>(
  effect: Effect.Effect<A, E>,
  layer?: Layer.Layer<any, any, any>
) => {
  const program = layer ? Effect.provide(effect, layer) : effect
  return Effect.runPromiseExit(program)
}

export const expectSuccess = async <A, E>(
  effect: Effect.Effect<A, E>,
  check?: (value: A) => void
) => {
  const exit = await Effect.runPromiseExit(effect)
  expect(Exit.isSuccess(exit)).toBe(true)
  if (Exit.isSuccess(exit) && check) {
    check(exit.value)
  }
}

export const expectFailure = async <A, E>(
  effect: Effect.Effect<A, E>,
  check?: (error: E) => void
) => {
  const exit = await Effect.runPromiseExit(effect)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit) && check) {
    const error = Cause.failureOption(exit.cause)
    expect(Option.isSome(error)).toBe(true)
    if (Option.isSome(error)) {
      check(error.value)
    }
  }
}
```

## Best Practices

### 1. Test Effects, Not Implementations

```typescript
// DO: Test behavior through effects
it("should save user", async () => {
  const program = createUser({ name: "John" }).pipe(
    Effect.provide(TestLayer)
  )
  const user = await runTest(program)
  expect(user.id).toBeDefined()
})

// DON'T: Test internal implementation
it("should call repository.save", async () => {
  // Testing implementation details makes tests brittle
})
```

### 2. Use Layers for Isolation

```typescript
// DO: Each test gets isolated dependencies
const makeTestLayer = () => Layer.merge(
  makeUserRepoMock({ users: new Map() }),
  makeLoggerMock()
)

it("test 1", () => {
  const layer = makeTestLayer()
  // ...
})

it("test 2", () => {
  const layer = makeTestLayer()  // Fresh state
  // ...
})
```

### 3. Test Error Paths

```typescript
// Test happy path
it("should create user", /* ... */)

// Test error paths
it("should fail with ValidationError for invalid email", /* ... */)
it("should fail with DuplicateError for existing email", /* ... */)
it("should fail with DatabaseError on connection failure", /* ... */)
```

### 4. Keep Test Setup Minimal

```typescript
// DO: Minimal mock for specific test
const TestLayer = Layer.succeed(UserRepository, {
  findById: () => Effect.succeed(testUser),
  save: () => Effect.void,  // Unused in this test
})

// DON'T: Full mock when only one method matters
```
