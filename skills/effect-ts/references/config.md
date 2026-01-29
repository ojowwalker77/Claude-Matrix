# Configuration in Effect-TS

## Overview

Effect provides type-safe configuration management with:
- Environment variables
- Config files (.env, JSON)
- Custom config sources
- Validation and transformation
- Secret redaction

## Basic Config

### Reading Environment Variables

```typescript
import { Config, Effect } from "effect"

// String
const apiKey = Config.string("API_KEY")

// Number
const port = Config.integer("PORT")

// Boolean
const debug = Config.boolean("DEBUG")

// Use in effects
const program = Effect.gen(function* () {
  const key = yield* apiKey
  const portNum = yield* port
  const isDebug = yield* debug
  return { key, port: portNum, debug: isDebug }
})
```

### Running with Config

```typescript
// Config is read when effect runs
Effect.runPromise(program)
// Reads from process.env by default
```

## Config Primitives

### Built-in Types

```typescript
import { Config } from "effect"

// Primitives
Config.string("VAR")         // string
Config.integer("VAR")        // number (integer)
Config.number("VAR")         // number (float)
Config.boolean("VAR")        // boolean
Config.date("VAR")           // Date (ISO format)
Config.bigint("VAR")         // bigint
Config.duration("VAR")       // Duration ("5 seconds", "100ms")
Config.url("VAR")            // URL

// Secrets (redacted in logs)
Config.redacted("SECRET_KEY")
// Type: Effect<Redacted<string>>
// Printed as "<redacted>"
```

### Optional and Defaults

```typescript
// Optional (returns Option)
const maybeKey = Config.option(Config.string("API_KEY"))
// Effect<Option<string>>

// With default
const port = Config.withDefault(Config.integer("PORT"), 3000)
// Effect<number> - returns 3000 if PORT not set

// With fallback config
const apiUrl = Config.orElse(
  Config.string("API_URL"),
  () => Config.string("FALLBACK_URL")
)
```

### Validation

```typescript
// Add constraints
const port = Config.integer("PORT").pipe(
  Config.validate({
    message: "Port must be between 1 and 65535",
    validation: (p) => p >= 1 && p <= 65535
  })
)

// Custom transformation
const logLevel = Config.string("LOG_LEVEL").pipe(
  Config.map((s) => s.toLowerCase()),
  Config.validate({
    message: "Invalid log level",
    validation: (s) => ["debug", "info", "warn", "error"].includes(s)
  })
)
```

## Structured Config

### Nested Config

```typescript
// Use nested paths
const dbConfig = Config.all({
  host: Config.string("DATABASE_HOST"),
  port: Config.integer("DATABASE_PORT"),
  user: Config.string("DATABASE_USER"),
  password: Config.redacted("DATABASE_PASSWORD"),
})

// Or with prefix
const db = Config.nested("DATABASE")(Config.all({
  host: Config.string("HOST"),     // DATABASE_HOST
  port: Config.integer("PORT"),    // DATABASE_PORT
  user: Config.string("USER"),     // DATABASE_USER
}))
```

### App Config Pattern

```typescript
// config.ts
export class AppConfig extends Effect.Service<AppConfig>()("AppConfig", {
  effect: Effect.gen(function* () {
    const server = yield* Config.all({
      host: Config.withDefault(Config.string("HOST"), "0.0.0.0"),
      port: Config.withDefault(Config.integer("PORT"), 3000),
    })

    const database = yield* Config.all({
      url: Config.string("DATABASE_URL"),
      maxConnections: Config.withDefault(Config.integer("DB_MAX_CONN"), 10),
    })

    const features = yield* Config.all({
      enableMetrics: Config.withDefault(Config.boolean("ENABLE_METRICS"), false),
      enableTracing: Config.withDefault(Config.boolean("ENABLE_TRACING"), false),
    })

    return { server, database, features }
  })
}) {}

// Use in app
const program = Effect.gen(function* () {
  const config = yield* AppConfig
  console.log(`Starting on ${config.server.host}:${config.server.port}`)
})

const runnable = Effect.provide(program, AppConfig.Default)
```

## Config Providers

### Default Provider (Environment)

```typescript
import { ConfigProvider } from "effect"

// Default reads from process.env
// With these conventions:
// - "DATABASE_HOST" for nested "DATABASE.HOST"
// - "," as separator for arrays
```

### Custom Providers

```typescript
// From a Map
const testProvider = ConfigProvider.fromMap(
  new Map([
    ["API_KEY", "test-key"],
    ["PORT", "8080"],
    ["DEBUG", "true"],
  ])
)

// Use with layer
const TestConfig = Layer.setConfigProvider(testProvider)

// From JSON object
const jsonProvider = ConfigProvider.fromJson({
  API_KEY: "test-key",
  PORT: 8080,
  DEBUG: true,
  DATABASE: {
    HOST: "localhost",
    PORT: 5432,
  }
})
```

### .env Files with @effect/platform

```typescript
import { PlatformConfigProvider } from "@effect/platform"

// Load .env file
const DotEnvLayer = Layer.unwrapEffect(
  PlatformConfigProvider.fromDotEnv(".env").pipe(
    Effect.map(Layer.setConfigProvider)
  )
)

// Add to existing provider (fallback chain)
const WithDotEnv = Layer.unwrapEffect(
  PlatformConfigProvider.fromDotEnv(".env").pipe(
    Effect.map((dotEnvProvider) =>
      Layer.setConfigProvider(
        ConfigProvider.orElse(dotEnvProvider, () => ConfigProvider.fromEnv())
      )
    ),
    Effect.orElse(() => Effect.succeed(Layer.empty))  // Ignore if file not found
  )
)
```

### File Tree Provider

```typescript
// Read config from directory structure
// config/
//   DATABASE_HOST  (file containing "localhost")
//   DATABASE_PORT  (file containing "5432")
const fileTreeProvider = PlatformConfigProvider.fromFileTree("./config")
```

## Combining Providers

```typescript
// Fallback chain
const combinedProvider = ConfigProvider.orElse(
  secretsProvider,      // First try secrets service
  () => ConfigProvider.orElse(
    dotEnvProvider,     // Then .env file
    () => ConfigProvider.fromEnv()  // Finally environment
  )
)

const CombinedConfig = Layer.setConfigProvider(combinedProvider)
```

## Schema Integration

```typescript
import { Config, Schema } from "effect"

// Define config schema
const AppConfigSchema = Schema.Struct({
  port: Schema.Number.pipe(Schema.between(1, 65535)),
  host: Schema.String,
  debug: Schema.Boolean,
  logLevel: Schema.Literal("debug", "info", "warn", "error"),
})

// Read and validate
const config = Config.all({
  port: Config.integer("PORT"),
  host: Config.string("HOST"),
  debug: Config.boolean("DEBUG"),
  logLevel: Config.string("LOG_LEVEL"),
}).pipe(
  Config.map((c) => Schema.decodeSync(AppConfigSchema)(c))
)
```

## Testing with Config

### Mock Config in Tests

```typescript
import { describe, it, expect } from "vitest"
import { ConfigProvider, Layer, Effect } from "effect"

describe("MyService", () => {
  const testConfig = ConfigProvider.fromMap(
    new Map([
      ["API_URL", "http://test.local"],
      ["TIMEOUT", "5000"],
    ])
  )

  const TestConfigLayer = Layer.setConfigProvider(testConfig)

  it("should use config values", async () => {
    const program = Effect.gen(function* () {
      const url = yield* Config.string("API_URL")
      const timeout = yield* Config.integer("TIMEOUT")
      return { url, timeout }
    }).pipe(Effect.provide(TestConfigLayer))

    const result = await Effect.runPromise(program)
    expect(result.url).toBe("http://test.local")
    expect(result.timeout).toBe(5000)
  })
})
```

### Per-Test Override

```typescript
const makeTestLayer = (overrides: Record<string, string>) =>
  Layer.setConfigProvider(
    ConfigProvider.fromMap(new Map(Object.entries(overrides)))
  )

it("should handle missing API key", async () => {
  const layer = makeTestLayer({ PORT: "3000" })  // No API_KEY

  const program = Config.string("API_KEY").pipe(
    Effect.provide(layer)
  )

  await expect(Effect.runPromise(program)).rejects.toThrow()
})
```

## Best Practices

### 1. Centralize Config Definition

```typescript
// config/index.ts
export const ServerConfig = Config.all({
  host: Config.withDefault(Config.string("HOST"), "0.0.0.0"),
  port: Config.withDefault(Config.integer("PORT"), 3000),
})

export const DatabaseConfig = Config.all({
  url: Config.string("DATABASE_URL"),
  ssl: Config.withDefault(Config.boolean("DB_SSL"), true),
})

// Single source of truth
```

### 2. Use Defaults for Optional Values

```typescript
// DO: Provide sensible defaults
const timeout = Config.withDefault(Config.integer("TIMEOUT"), 30000)

// DON'T: Make everything required
const timeout = Config.integer("TIMEOUT")  // Fails if not set
```

### 3. Validate Early

```typescript
// DO: Validate config at startup
const config = Config.integer("PORT").pipe(
  Config.validate({
    message: "PORT must be valid port number",
    validation: (p) => p >= 1 && p <= 65535
  })
)

// DON'T: Trust config values blindly
const port = yield* Config.integer("PORT")
server.listen(port)  // Might fail at runtime
```

### 4. Use Redacted for Secrets

```typescript
// DO: Secrets are redacted in logs
const apiKey = Config.redacted("API_KEY")

// DON'T: Secrets exposed in logs
const apiKey = Config.string("API_KEY")  // "sk-1234..." in error messages
```

### 5. Layer for Config Service

```typescript
// DO: Config as a service for easy mocking
class Config extends Effect.Service<Config>()("Config", {
  effect: loadAllConfig
}) {}

// DON'T: Read config everywhere
const handler = Effect.gen(function* () {
  const timeout = yield* Config.integer("TIMEOUT")  // Hard to test
})
```
