# Effect-TS Streams

## Overview

`Stream<A, E, R>` represents a program that emits zero or more values of type `A`.

```typescript
Stream<A, E, R>
//     ^  ^  ^
//     |  |  └── Requirements
//     |  └───── Error type
//     └──────── Element type (emitted values)
```

**Think of Stream as:**
- An `Effect` that can emit multiple values
- A replacement for AsyncIterables, Node streams, RxJS Observables

## Creating Streams

### From Values

```typescript
import { Stream } from "effect"

// Single value
const one = Stream.make(42)

// Multiple values
const numbers = Stream.make(1, 2, 3, 4, 5)

// From iterable
const fromArray = Stream.fromIterable([1, 2, 3])

// Empty stream
const empty = Stream.empty

// Never-ending (for testing)
const infinite = Stream.repeat(Effect.succeed(1))
```

### From Effects

```typescript
// Single effect
const fromEffect = Stream.fromEffect(fetchUser(id))

// Unfold (generate sequence)
const naturals = Stream.unfold(0, (n) => Option.some([n, n + 1]))
// 0, 1, 2, 3, ...

// From async iterable
const fromAsync = Stream.fromAsyncIterable(
  asyncGenerator(),
  (e) => new Error(String(e))
)

// Paginated API
const allPages = Stream.paginateEffect(1, (page) =>
  fetchPage(page).pipe(
    Effect.map((data) => [
      data.items,
      data.hasMore ? Option.some(page + 1) : Option.none()
    ])
  )
)
```

### From Callbacks

```typescript
// Callback-based source
const events = Stream.async<Event, Error>((emit) => {
  const handler = (event: Event) => {
    emit.single(event)
  }
  eventEmitter.on("event", handler)

  // Cleanup
  return Effect.sync(() => {
    eventEmitter.off("event", handler)
  })
})

// With chunks (batched)
const chunkedEvents = Stream.async<Event, Error>((emit) => {
  const handler = (events: Event[]) => {
    emit.chunk(Chunk.fromIterable(events))
  }
  batchEmitter.on("batch", handler)
})
```

## Transforming Streams

### Basic Transformations

```typescript
const stream = Stream.make(1, 2, 3, 4, 5)

// Map
const doubled = stream.pipe(Stream.map((n) => n * 2))
// 2, 4, 6, 8, 10

// Filter
const evens = stream.pipe(Stream.filter((n) => n % 2 === 0))
// 2, 4

// FlatMap (each element becomes a stream)
const expanded = stream.pipe(
  Stream.flatMap((n) => Stream.make(n, n * 10))
)
// 1, 10, 2, 20, 3, 30, 4, 40, 5, 50

// MapEffect (async transformation)
const users = userIds.pipe(
  Stream.mapEffect((id) => fetchUser(id))
)
```

### Accumulation

```typescript
// Scan (running accumulation)
const runningSum = numbers.pipe(
  Stream.scan(0, (acc, n) => acc + n)
)
// 0, 1, 3, 6, 10, 15

// Aggregate with Sink
const sum = numbers.pipe(
  Stream.run(Sink.sum)
)
// Effect<number>
```

### Chunking

```typescript
// Group into fixed-size chunks
const chunked = stream.pipe(Stream.grouped(3))
// [1,2,3], [4,5]

// Group within time window
const windowed = stream.pipe(
  Stream.groupedWithin(100, Duration.seconds(1))
)
// Chunks of up to 100 items, or after 1 second

// Flatten chunks
const flattened = chunkedStream.pipe(Stream.flattenChunks)
```

## Consuming Streams

### Run to Completion

```typescript
// Collect all elements
const collected = Stream.runCollect(stream)
// Effect<Chunk<A>>

// Collect to array
const array = stream.pipe(
  Stream.runCollect,
  Effect.map(Chunk.toArray)
)

// Run for side effects
const logged = stream.pipe(
  Stream.tap((x) => Effect.log(`Got: ${x}`)),
  Stream.runDrain
)
// Effect<void>

// First element
const first = Stream.runHead(stream)
// Effect<Option<A>>

// Last element
const last = Stream.runLast(stream)
// Effect<Option<A>>
```

### Fold/Reduce

```typescript
// Fold to single value
const sum = stream.pipe(
  Stream.runFold(0, (acc, n) => acc + n)
)

// Effectful fold
const processed = stream.pipe(
  Stream.runFoldEffect(initialState, (state, item) =>
    processItem(state, item)
  )
)
```

### With Sinks

```typescript
import { Sink } from "effect"

// Built-in sinks
const sum = Stream.run(stream, Sink.sum)
const count = Stream.run(stream, Sink.count)
const head = Stream.run(stream, Sink.head)
const last = Stream.run(stream, Sink.last)
const take5 = Stream.run(stream, Sink.take(5))
const collectAll = Stream.run(stream, Sink.collectAll())

// Custom sink
const findFirst = <A>(predicate: (a: A) => boolean): Sink.Sink<Option<A>, A> =>
  Sink.foldUntil<Option<A>, A>(
    Option.none(),
    1,
    (_, a) => predicate(a) ? Option.some(a) : Option.none()
  )
```

## Combining Streams

### Merge (Interleave)

```typescript
// Merge two streams (interleaved)
const merged = Stream.merge(stream1, stream2)

// Merge many
const allMerged = Stream.mergeAll([stream1, stream2, stream3])

// With concurrency limit
const limited = Stream.mergeAll([s1, s2, s3, s4, s5], { concurrency: 3 })
```

### Concat (Sequential)

```typescript
// One after another
const sequential = Stream.concat(first, second)

// Many
const allSequential = Stream.concatAll([s1, s2, s3])
```

### Zip (Pair-wise)

```typescript
// Pair elements
const zipped = Stream.zip(stream1, stream2)
// Stream<[A, B]>

// With function
const combined = Stream.zipWith(stream1, stream2, (a, b) => a + b)

// Latest from each (for async streams)
const latest = Stream.zipLatest(stream1, stream2)
```

## Error Handling

```typescript
// Catch all errors
const recovered = stream.pipe(
  Stream.catchAll((e) => Stream.make(defaultValue))
)

// Retry on error
const retried = stream.pipe(
  Stream.retry(Schedule.recurs(3))
)

// Map errors
const mappedError = stream.pipe(
  Stream.mapError((e) => new WrappedError(e))
)

// Tap errors (log without handling)
const logged = stream.pipe(
  Stream.tapError((e) => Effect.log(`Stream error: ${e}`))
)
```

## Timing and Rate Control

### Debounce and Throttle

```typescript
// Debounce - emit after silence
const debounced = stream.pipe(
  Stream.debounce(Duration.millis(300))
)

// Throttle - limit rate
const throttled = stream.pipe(
  Stream.throttle({
    cost: () => 1,
    units: 10,
    duration: Duration.seconds(1)
  })
)
```

### Delays

```typescript
// Fixed delay between elements
const spaced = stream.pipe(
  Stream.schedule(Schedule.spaced(Duration.millis(100)))
)

// Timeout
const withTimeout = stream.pipe(
  Stream.timeout(Duration.seconds(5))
)
```

## Buffering

```typescript
// Buffer with backpressure
const buffered = stream.pipe(
  Stream.buffer({ capacity: 100 })
)

// Sliding buffer (drop oldest)
const sliding = stream.pipe(
  Stream.buffer({ capacity: 100, strategy: "sliding" })
)

// Dropping buffer (drop newest)
const dropping = stream.pipe(
  Stream.buffer({ capacity: 100, strategy: "dropping" })
)
```

## Channels (Low-Level)

Channels are the primitive underlying Streams and Sinks.

```typescript
import { Channel } from "effect"

// Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, R>

// Read from upstream
const reader = Channel.read<number>()

// Write to downstream
const writer = Channel.write(42)

// Convert between Stream/Sink and Channel
const channel = Stream.toChannel(stream)
const stream = Stream.fromChannel(channel)
```

## Patterns

### Batched Processing

```typescript
const processInBatches = <A>(items: A[], batchSize: number) =>
  Stream.fromIterable(items).pipe(
    Stream.grouped(batchSize),
    Stream.mapEffect((batch) => processBatch(batch)),
    Stream.runDrain
  )
```

### Rate-Limited API Calls

```typescript
const rateLimitedFetch = (urls: string[]) =>
  Stream.fromIterable(urls).pipe(
    Stream.mapEffect(
      (url) => fetchUrl(url),
      { concurrency: 5 }  // Max 5 concurrent
    ),
    Stream.throttle({
      cost: () => 1,
      units: 10,
      duration: Duration.seconds(1)  // Max 10/second
    }),
    Stream.runCollect
  )
```

### Event Processing with Windowing

```typescript
const processEvents = (events: Stream<Event, Error>) =>
  events.pipe(
    Stream.groupedWithin(1000, Duration.seconds(10)),
    Stream.mapEffect((batch) =>
      Effect.gen(function* () {
        const aggregated = aggregateEvents(Chunk.toArray(batch))
        yield* saveToDatabase(aggregated)
        yield* Effect.log(`Processed ${batch.length} events`)
      })
    ),
    Stream.runDrain
  )
```

### Merging with Priority

```typescript
// High-priority events processed first
const prioritized = Stream.mergeAll(
  [
    highPriority.pipe(Stream.map((e) => ({ priority: 1, event: e }))),
    lowPriority.pipe(Stream.map((e) => ({ priority: 2, event: e }))),
  ],
  { concurrency: 1 }  // Process one at a time
).pipe(
  Stream.map(({ event }) => event)
)
```
