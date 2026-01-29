# Dependency Injection with Layers

## Overview

Effect's Layer system provides compile-time dependency injection:

```
Layer<Out, Error, In>
        ^    ^     ^
        |    |     └── Dependencies required to build
        |    └──────── Errors during construction
        └───────────── Services provided
```

## Defining Services

### Context.Tag Pattern

```typescript
import { Context, Effect, Layer } from "effect"

// 1. Define service interface with Tag
class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    readonly findById: (id: string) => Effect.Effect<User, NotFoundError>
    readonly findByEmail: (email: string) => Effect.Effect<User, NotFoundError>
    readonly save: (user: User) => Effect.Effect<void, DatabaseError>
    readonly delete: (id: string) => Effect.Effect<void, DatabaseError>
  }
>() {}

// 2. Use in effects - service becomes requirement
const getUser = (id: string) => Effect.gen(function* () {
  const repo = yield* UserRepository  // Yields the service
  return yield* repo.findById(id)
})
// Type: Effect<User, NotFoundError, UserRepository>

// 3. Create live implementation
const UserRepositoryLive = Layer.succeed(UserRepository, {
  findById: (id) => Effect.gen(function* () {
    const result = yield* db.query(`SELECT * FROM users WHERE id = $1`, [id])
    if (!result) return yield* Effect.fail(new NotFoundError({ id }))
    return result
  }),
  findByEmail: (email) => /* ... */,
  save: (user) => /* ... */,
  delete: (id) => /* ... */,
})
```

### Effect.Service Pattern (Simplified)

```typescript
// Combines Tag + Layer declaration
class Logger extends Effect.Service<Logger>()("Logger", {
  // Static accessor methods
  accessors: true,

  // Sync implementation (no dependencies)
  sync: () => ({
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
  })
}) {}

// Direct static access (when accessors: true)
Logger.info("Hello")  // Effect<void, never, Logger>

// Or via yield*
Effect.gen(function* () {
  const logger = yield* Logger
  logger.info("Hello")
})
```

### Effect.Service with Dependencies

```typescript
class Config extends Effect.Service<Config>()("Config", {
  sync: () => ({
    logLevel: process.env.LOG_LEVEL ?? "info",
    dbUrl: process.env.DATABASE_URL!,
  })
}) {}

class Database extends Effect.Service<Database>()("Database", {
  effect: Effect.gen(function* () {
    const config = yield* Config
    const pool = yield* Effect.tryPromise(() =>
      createPool(config.dbUrl)
    )
    return {
      query: (sql: string) => Effect.tryPromise(() => pool.query(sql)),
      close: () => Effect.promise(() => pool.end())
    }
  }),
  dependencies: [Config.Default]  // Declare dependencies
}) {}

// Database.Default includes Config.Default automatically
```

### Scoped Services (with Cleanup)

```typescript
class ConnectionPool extends Effect.Service<ConnectionPool>()("ConnectionPool", {
  scoped: Effect.gen(function* () {
    const config = yield* Config

    // Acquire
    const pool = yield* Effect.tryPromise(() => createPool(config.dbUrl))
    yield* Effect.log("Connection pool created")

    // Register cleanup
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.promise(() => pool.end())
        yield* Effect.log("Connection pool closed")
      })
    )

    return { pool }
  }),
  dependencies: [Config.Default]
}) {}
```

## Layer Construction

### Layer.succeed (Sync Value)

```typescript
const ConfigLayer = Layer.succeed(Config, {
  logLevel: "info",
  dbUrl: "postgres://localhost/mydb"
})
```

### Layer.effect (From Effect)

```typescript
const DatabaseLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* Config
    return {
      query: (sql) => Effect.tryPromise(() => runQuery(config.dbUrl, sql))
    }
  })
)
// Type: Layer<Database, never, Config>
```

### Layer.scoped (With Cleanup)

```typescript
const PoolLayer = Layer.scoped(
  ConnectionPool,
  Effect.gen(function* () {
    const config = yield* Config
    const pool = yield* Effect.acquireRelease(
      Effect.tryPromise(() => createPool(config.dbUrl)),
      (pool) => Effect.promise(() => pool.end())
    )
    return { pool }
  })
)
```

### Layer.function (Factory)

```typescript
// Create layer from function
const makeUserRepo = (db: Database): UserRepository => ({
  findById: (id) => db.query(`SELECT * FROM users WHERE id = $1`, [id]),
  // ...
})

const UserRepoLayer = Layer.function(UserRepository, Database, makeUserRepo)
```

## Layer Composition

### Layer.merge (Combine Independent)

```typescript
// Two independent layers
const ConfigLayer: Layer<Config, never, never> = /* ... */
const LoggerLayer: Layer<Logger, never, never> = /* ... */

// Merge into one
const BaseLayer = Layer.merge(ConfigLayer, LoggerLayer)
// Type: Layer<Config | Logger, never, never>
```

### Layer.provide (Satisfy Dependencies)

```typescript
// DatabaseLayer needs Config
const DatabaseLayer: Layer<Database, DbError, Config> = /* ... */

// Provide Config to Database
const DatabaseWithConfig = Layer.provide(DatabaseLayer, ConfigLayer)
// Type: Layer<Database, DbError, never>
```

### Layer.provideMerge (Provide + Keep)

```typescript
// Provide dependency AND keep it in output
const AppLayer = Layer.provideMerge(DatabaseLayer, ConfigLayer)
// Type: Layer<Database | Config, DbError, never>
```

### Full Application Layer

```typescript
// Build complete application layer
const AppLayer = pipe(
  // Start with base layers
  Layer.merge(ConfigLive, LoggerLive),
  // Add database (needs Config)
  Layer.provideMerge(DatabaseLive),
  // Add repositories (need Database)
  Layer.provideMerge(
    Layer.merge(UserRepositoryLive, PostRepositoryLive)
  ),
  // Add services (need repositories)
  Layer.provideMerge(
    Layer.merge(UserServiceLive, PostServiceLive)
  )
)

// Or using Layer.mergeAll for cleaner composition
const AppLayer = Layer.mergeAll(
  ConfigLive,
  LoggerLive,
  DatabaseLive,
  UserRepositoryLive,
  UserServiceLive
).pipe(
  Layer.provide(/* ... dependencies ... */)
)
```

## Providing Layers

### Effect.provide

```typescript
// Provide single layer
const runnable = Effect.provide(program, UserRepositoryLive)

// Provide multiple layers
const runnable = Effect.provide(program, Layer.merge(ConfigLive, LoggerLive))

// Provide full app layer
const runnable = Effect.provide(program, AppLayer)
```

### Effect.provideService (Single Service)

```typescript
// Quick way to provide one service
const runnable = Effect.provideService(program, Config, {
  logLevel: "debug",
  dbUrl: "postgres://localhost/test"
})
```

### ManagedRuntime (Production)

```typescript
import { ManagedRuntime } from "effect"

// Create runtime from layer
const runtime = ManagedRuntime.make(AppLayer)

// Run effects
await runtime.runPromise(program)

// Cleanup when done
await runtime.dispose()
```

## Layer Memoization

Layers are automatically memoized by reference:

```typescript
// Same layer instance = constructed once
const ConfigLayer = Layer.succeed(Config, { /* ... */ })

const DbLayer = Layer.provide(DatabaseLive, ConfigLayer)
const CacheLayer = Layer.provide(CacheLive, ConfigLayer)

// ConfigLayer only constructed once even though used twice
const AppLayer = Layer.merge(DbLayer, CacheLayer)
```

### Fresh Layers (Disable Memoization)

```typescript
// Force fresh construction each time
const FreshDbLayer = Layer.fresh(DatabaseLive)
```

## Testing with Layers

### Test Implementations

```typescript
// Live implementation
const UserRepositoryLive = Layer.succeed(UserRepository, {
  findById: (id) => db.query(id),
  // ...
})

// Test implementation
const UserRepositoryTest = Layer.succeed(UserRepository, {
  findById: (id) =>
    id === "test-id"
      ? Effect.succeed(testUser)
      : Effect.fail(new NotFoundError({ id })),
  // ...
})

// Use in tests
const testProgram = Effect.provide(program, UserRepositoryTest)
```

### Mock Layers

```typescript
// Create mock from production service
const MockUserRepo = Layer.succeed(UserRepository, {
  findById: () => Effect.succeed(mockUser),
  findByEmail: () => Effect.succeed(mockUser),
  save: () => Effect.void,
  delete: () => Effect.void,
})
```

### ConfigProvider for Tests

```typescript
import { ConfigProvider } from "effect"

// Mock config provider
const TestConfig = Layer.setConfigProvider(
  ConfigProvider.fromMap(
    new Map([
      ["LOG_LEVEL", "debug"],
      ["DATABASE_URL", "postgres://test"],
    ])
  )
)

const testRunnable = Effect.provide(program, TestConfig)
```

## Best Practices

### 1. One Service Per Concern

```typescript
// DO: Focused services
class UserRepository { /* only user data access */ }
class EmailService { /* only email sending */ }
class UserService { /* orchestrates user operations */ }

// DON'T: God service
class AppService { /* everything */ }
```

### 2. Interface Segregation

```typescript
// DO: Small, focused interfaces
class UserReader { readonly find: (id) => Effect<User> }
class UserWriter { readonly save: (user) => Effect<void> }

// DON'T: Huge interfaces
class UserRepository {
  readonly find: ...
  readonly save: ...
  readonly delete: ...
  readonly search: ...
  readonly count: ...
  readonly paginate: ...
  // 20 more methods
}
```

### 3. Layer at Composition Root

```typescript
// DO: Compose layers at entry point
// main.ts
const AppLayer = Layer.mergeAll(/* all layers */)
const runtime = ManagedRuntime.make(AppLayer)

// DON'T: Scattered layer provision
// some-module.ts
Effect.provide(effect, RandomLayer)  // Loses composability
```

### 4. Use accessors: true for Common Services

```typescript
class Logger extends Effect.Service<Logger>()("Logger", {
  accessors: true,  // Enables Logger.info(), Logger.error()
  // ...
}) {}

// Clean call sites
yield* Logger.info("Starting")  // Instead of (yield* Logger).info("Starting")
```
