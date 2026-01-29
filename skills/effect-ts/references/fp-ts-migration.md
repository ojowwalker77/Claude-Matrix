# Migrating from fp-ts to Effect-TS

## Background

fp-ts has officially merged with the Effect-TS ecosystem. Effect-TS is the successor to fp-ts v2, embodying what would be fp-ts v3. Giulio Canti, the author of fp-ts, joined the Effect organization.

## Should You Migrate?

**Migrate if:**
- You need better concurrency handling
- You want built-in dependency injection
- Your app has complex side effects
- You need better error composition
- You want built-in services (Clock, Random, Tracer)

**Stay with fp-ts if:**
- Small codebase with minimal side effects
- Team learning curve is a concern
- Bundle size is critical (Effect is larger due to fiber runtime)
- Pure functional transformations without I/O

## Type Correspondence

| fp-ts | Effect-TS |
|-------|-----------|
| `Option<A>` | `Option<A>` (same!) |
| `Either<E, A>` | `Either<E, A>` (same!) |
| `IO<A>` | `Effect<A, never, never>` |
| `Task<A>` | `Effect<A, never, never>` |
| `TaskEither<E, A>` | `Effect<A, E, never>` |
| `Reader<R, A>` | `Effect<A, never, R>` |
| `ReaderTaskEither<R, E, A>` | `Effect<A, E, R>` |
| `IOEither<E, A>` | `Effect<A, E, never>` |

## Basic Conversions

### Option

```typescript
// fp-ts
import * as O from "fp-ts/Option"
const maybeValue = O.some(42)
const nothing = O.none

// Effect-TS (compatible!)
import { Option } from "effect"
const maybeValue = Option.some(42)
const nothing = Option.none()

// Key differences:
// - Option.none is a function in Effect: Option.none()
// - Otherwise mostly compatible
```

### Either

```typescript
// fp-ts
import * as E from "fp-ts/Either"
const success = E.right(42)
const failure = E.left(new Error("oops"))

// Effect-TS (compatible!)
import { Either } from "effect"
const success = Either.right(42)
const failure = Either.left(new Error("oops"))
```

### TaskEither to Effect

```typescript
// fp-ts
import * as TE from "fp-ts/TaskEither"
import { pipe } from "fp-ts/function"

const fetchUser = (id: string): TE.TaskEither<Error, User> =>
  TE.tryCatch(
    () => fetch(`/users/${id}`).then((r) => r.json()),
    (e) => new Error(String(e))
  )

const program = pipe(
  fetchUser("123"),
  TE.chain((user) =>
    TE.tryCatch(
      () => fetch(`/posts?userId=${user.id}`).then((r) => r.json()),
      (e) => new Error(String(e))
    )
  ),
  TE.map((posts) => posts.length)
)

// Run
program().then((result) => {
  if (E.isRight(result)) {
    console.log(result.right)
  }
})

// Effect-TS
import { Effect, pipe } from "effect"

const fetchUser = (id: string): Effect.Effect<User, Error> =>
  Effect.tryPromise({
    try: () => fetch(`/users/${id}`).then((r) => r.json()),
    catch: (e) => new Error(String(e))
  })

const program = pipe(
  fetchUser("123"),
  Effect.flatMap((user) =>
    Effect.tryPromise({
      try: () => fetch(`/posts?userId=${user.id}`).then((r) => r.json()),
      catch: (e) => new Error(String(e))
    })
  ),
  Effect.map((posts) => posts.length)
)

// Run
Effect.runPromise(program).then(console.log)

// Or with generators (cleaner!)
const program = Effect.gen(function* () {
  const user = yield* fetchUser("123")
  const posts = yield* fetchPosts(user.id)
  return posts.length
})
```

### ReaderTaskEither to Effect with Requirements

```typescript
// fp-ts
import * as RTE from "fp-ts/ReaderTaskEither"

interface Deps {
  apiUrl: string
  logger: { log: (msg: string) => void }
}

const fetchUser = (id: string): RTE.ReaderTaskEither<Deps, Error, User> =>
  (deps) => TE.tryCatch(
    async () => {
      deps.logger.log(`Fetching user ${id}`)
      return fetch(`${deps.apiUrl}/users/${id}`).then((r) => r.json())
    },
    (e) => new Error(String(e))
  )

// Running requires providing deps
const deps: Deps = { apiUrl: "https://api.example.com", logger: console }
fetchUser("123")(deps)().then(/* ... */)

// Effect-TS
import { Effect, Context, Layer } from "effect"

// Define services
class ApiConfig extends Context.Tag("ApiConfig")<ApiConfig, { url: string }>() {}
class Logger extends Context.Tag("Logger")<Logger, { log: (msg: string) => Effect.Effect<void> }>() {}

const fetchUser = (id: string): Effect.Effect<User, Error, ApiConfig | Logger> =>
  Effect.gen(function* () {
    const config = yield* ApiConfig
    const logger = yield* Logger
    yield* logger.log(`Fetching user ${id}`)
    return yield* Effect.tryPromise({
      try: () => fetch(`${config.url}/users/${id}`).then((r) => r.json()),
      catch: (e) => new Error(String(e))
    })
  })

// Provide via layers
const program = fetchUser("123").pipe(
  Effect.provide(Layer.merge(
    Layer.succeed(ApiConfig, { url: "https://api.example.com" }),
    Layer.succeed(Logger, { log: (msg) => Effect.sync(() => console.log(msg)) })
  ))
)

Effect.runPromise(program)
```

## Operator Mapping

| fp-ts | Effect-TS | Notes |
|-------|-----------|-------|
| `pipe(a, f, g)` | `pipe(a, f, g)` | Same! |
| `flow(f, g)` | `flow(f, g)` or `Function.compose` | Same! |
| `TE.map` | `Effect.map` | |
| `TE.chain` | `Effect.flatMap` | Renamed |
| `TE.chainFirst` | `Effect.tap` | Renamed |
| `TE.fold` | `Effect.match` | |
| `TE.mapLeft` | `Effect.mapError` | |
| `TE.orElse` | `Effect.catchAll` | |
| `TE.tryCatch` | `Effect.tryPromise` | |
| `TE.right` | `Effect.succeed` | |
| `TE.left` | `Effect.fail` | |
| `TE.fromEither` | `Effect.fromEither` | |
| `TE.fromOption` | `Effect.fromOption` | Slightly different signature |
| `O.getOrElse` | `Option.getOrElse` | |
| `O.map` | `Option.map` | |
| `O.chain` | `Option.flatMap` | Renamed |
| `E.map` | `Either.map` | |
| `E.chain` | `Either.flatMap` | Renamed |

## Key Differences

### 1. Effect Has a Runtime

```typescript
// fp-ts: TaskEither is just a function
const task: TaskEither<Error, number> = () => Promise.resolve(E.right(42))
task()  // Execute by calling

// Effect: Needs runtime to execute
const effect: Effect<number, Error> = Effect.succeed(42)
Effect.runPromise(effect)  // Execute via runtime
```

### 2. Effect Has Built-in Services

```typescript
// fp-ts: No built-in services
// You'd use Reader pattern manually

// Effect: Built-in services
import { Clock, Random } from "effect"

const program = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis
  const random = yield* Random.next
  return { now, random }
})
```

### 3. Better Concurrency

```typescript
// fp-ts: Parallel requires explicit composition
import * as TE from "fp-ts/TaskEither"
import * as A from "fp-ts/Array"

const parallel = A.sequence(TE.ApplicativePar)([task1, task2, task3])

// Effect: First-class concurrency
const parallel = Effect.all([task1, task2, task3])  // Parallel by default
const sequential = Effect.all([task1, task2], { concurrency: 1 })
const limited = Effect.all(tasks, { concurrency: 5 })
```

### 4. Dual APIs

```typescript
// Effect supports both styles:

// Data-last (like fp-ts)
pipe(effect, Effect.map(f), Effect.flatMap(g))

// Data-first
Effect.map(effect, f)
Effect.flatMap(Effect.map(effect, f), g)
```

### 5. Generator Syntax

```typescript
// fp-ts: Only pipe chains
const program = pipe(
  fetchUser(id),
  TE.chain((user) =>
    pipe(
      fetchPosts(user.id),
      TE.map((posts) => ({ user, posts }))
    )
  ),
  TE.chain(({ user, posts }) =>
    pipe(
      fetchComments(posts[0].id),
      TE.map((comments) => ({ user, posts, comments }))
    )
  )
)

// Effect: Generators for imperative style
const program = Effect.gen(function* () {
  const user = yield* fetchUser(id)
  const posts = yield* fetchPosts(user.id)
  const comments = yield* fetchComments(posts[0].id)
  return { user, posts, comments }
})
```

## Migration Strategy

### Gradual Adoption

1. **Install Effect alongside fp-ts**
2. **Write new code in Effect**
3. **Create interop layers for existing fp-ts code**
4. **Migrate module by module**

### Interop Helpers

```typescript
// TaskEither to Effect
const teToEffect = <E, A>(te: TaskEither<E, A>): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: async () => {
      const result = await te()
      if (E.isLeft(result)) {
        throw result.left
      }
      return result.right
    },
    catch: (e) => e as E
  })

// Effect to TaskEither
const effectToTe = <A, E>(effect: Effect.Effect<A, E>): TaskEither<E, A> =>
  () => Effect.runPromise(Effect.either(effect))
```

### Real-World Migration Example

From Inato's migration (500k lines of code):

1. **Set up coexistence** - Both libraries work side by side
2. **New code in Effect** - All new features use Effect
3. **Interop at boundaries** - Convert at module interfaces
4. **Gradual rewrite** - Migrate one use case at a time
5. **Timeline** - 2.5 months with ~10% dedicated time

## Resources

- [Official Migration Guide](https://effect.website/docs/additional-resources/effect-vs-fp-ts/)
- [Sandro Maglione's Migration Guide](https://www.sandromaglione.com/articles/from-fp-ts-to-effect-ts-migration-guide)
- [Inato Migration Story](https://medium.com/inato/how-we-migrated-our-codebase-from-fp-ts-to-effect-b71acd0c5640)
