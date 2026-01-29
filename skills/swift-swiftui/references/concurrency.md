# Swift Concurrency for SwiftUI

## async/await Basics

### Converting Completion Handlers

```swift
// OLD: Completion handler
func fetchUser(id: String, completion: @escaping (Result<User, Error>) -> Void) {
    URLSession.shared.dataTask(with: url) { data, _, error in
        if let error = error {
            completion(.failure(error))
            return
        }
        // ...
    }.resume()
}

// NEW: async/await
func fetchUser(id: String) async throws -> User {
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONDecoder().decode(User.self, from: data)
}
```

### Using in SwiftUI

```swift
struct UserView: View {
    @State private var user: User?
    @State private var error: Error?

    var body: some View {
        Group {
            if let user {
                UserContent(user: user)
            } else if let error {
                ErrorView(error: error)
            } else {
                ProgressView()
            }
        }
        .task {
            do {
                user = try await UserService.shared.fetchUser(id: userId)
            } catch {
                self.error = error
            }
        }
    }
}
```

## Task Management

### Task Lifecycle with .task

```swift
struct SearchView: View {
    @State private var query = ""
    @State private var results: [Item] = []

    var body: some View {
        List(results) { item in
            ItemRow(item: item)
        }
        .searchable(text: $query)
        // Task is automatically cancelled when view disappears
        // or when query changes (due to id parameter)
        .task(id: query) {
            guard !query.isEmpty else {
                results = []
                return
            }
            // Debounce
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }

            results = await SearchService.search(query)
        }
    }
}
```

### Manual Task Management

```swift
@Observable
class DownloadManager {
    private var downloadTask: Task<Void, Never>?

    func startDownload(url: URL) {
        // Cancel existing download
        downloadTask?.cancel()

        downloadTask = Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard !Task.isCancelled else { return }
                await processData(data)
            } catch {
                if !Task.isCancelled {
                    // Handle error
                }
            }
        }
    }

    func cancelDownload() {
        downloadTask?.cancel()
        downloadTask = nil
    }
}
```

### Task Priority

```swift
// High priority - user-initiated
Task(priority: .userInitiated) {
    await loadCriticalData()
}

// Low priority - background work
Task(priority: .background) {
    await syncData()
}

// Inherit current priority
Task {
    await doWork()
}
```

## MainActor

### UI Updates Must Be on MainActor

```swift
@Observable
class ViewModel {
    var items: [Item] = []  // Accessed by UI
    var isLoading = false

    // Mark entire method as MainActor
    @MainActor
    func loadItems() async {
        isLoading = true
        defer { isLoading = false }

        do {
            items = try await api.fetchItems()
        } catch {
            // handle error
        }
    }
}

// Or mark the entire class
@MainActor
@Observable
class ViewModel {
    var items: [Item] = []
    var isLoading = false

    func loadItems() async {
        // Already on MainActor
    }
}
```

### Dispatching to MainActor

```swift
// From non-MainActor context
func processInBackground() async {
    let result = await heavyComputation()

    // Update UI
    await MainActor.run {
        self.result = result
    }
}

// Or with Task
Task { @MainActor in
    self.result = result
}
```

## Actors

### Custom Actor for Thread Safety

```swift
actor ImageCache {
    private var cache: [URL: UIImage] = [:]

    func image(for url: URL) -> UIImage? {
        cache[url]
    }

    func setImage(_ image: UIImage, for url: URL) {
        cache[url] = image
    }

    func clear() {
        cache.removeAll()
    }
}

// Usage
let cache = ImageCache()
await cache.setImage(image, for: url)
let cached = await cache.image(for: url)
```

### Actor-isolated Properties

```swift
actor Counter {
    var count = 0

    func increment() {
        count += 1
    }

    // nonisolated doesn't require await
    nonisolated var description: String {
        "Counter instance"
    }
}
```

## Structured Concurrency

### TaskGroup for Parallel Work

```swift
func fetchAllData() async throws -> (users: [User], posts: [Post]) {
    async let users = api.fetchUsers()
    async let posts = api.fetchPosts()

    return try await (users, posts)  // Parallel fetch
}

// Dynamic parallel tasks
func fetchImages(urls: [URL]) async throws -> [UIImage] {
    try await withThrowingTaskGroup(of: UIImage.self) { group in
        for url in urls {
            group.addTask {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else {
                    throw ImageError.invalidData
                }
                return image
            }
        }

        var images: [UIImage] = []
        for try await image in group {
            images.append(image)
        }
        return images
    }
}
```

### Limiting Concurrency

```swift
func processImages(_ urls: [URL], maxConcurrent: Int = 4) async throws -> [UIImage] {
    try await withThrowingTaskGroup(of: (Int, UIImage).self) { group in
        var results = [Int: UIImage]()

        // Add initial batch
        for (index, url) in urls.prefix(maxConcurrent).enumerated() {
            group.addTask {
                (index, try await downloadImage(url))
            }
        }

        var nextIndex = maxConcurrent

        // Process results and add more tasks
        for try await (index, image) in group {
            results[index] = image

            if nextIndex < urls.count {
                let url = urls[nextIndex]
                let idx = nextIndex
                group.addTask {
                    (idx, try await downloadImage(url))
                }
                nextIndex += 1
            }
        }

        return (0..<urls.count).compactMap { results[$0] }
    }
}
```

## AsyncSequence

### For await Loop

```swift
// Iterate over async values
for await notification in NotificationCenter.default.notifications(named: .userDidLogin) {
    handleLogin(notification)
}

// With timeout
for await value in stream.timeout(after: .seconds(5)) {
    process(value)
}
```

### Custom AsyncSequence

```swift
struct CountdownSequence: AsyncSequence {
    typealias Element = Int
    let start: Int

    struct AsyncIterator: AsyncIteratorProtocol {
        var current: Int

        mutating func next() async -> Int? {
            guard current > 0 else { return nil }
            try? await Task.sleep(for: .seconds(1))
            defer { current -= 1 }
            return current
        }
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(current: start)
    }
}

// Usage
for await count in CountdownSequence(start: 10) {
    print(count)  // 10, 9, 8, ...
}
```

## Sendable

### Types That Cross Concurrency Boundaries

```swift
// Value types are implicitly Sendable
struct User: Sendable {
    let id: UUID
    let name: String
}

// Reference types need explicit conformance
final class Settings: Sendable {
    let theme: Theme  // Must be immutable
    let fontSize: Int

    init(theme: Theme, fontSize: Int) {
        self.theme = theme
        self.fontSize = fontSize
    }
}

// @unchecked for types you know are safe
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Any] = [:]

    func get(_ key: String) -> Any? {
        lock.lock()
        defer { lock.unlock() }
        return storage[key]
    }
}
```

### @Sendable Closures

```swift
// Closures passed across actors must be @Sendable
func processAsync(_ work: @escaping @Sendable () async -> Void) {
    Task {
        await work()
    }
}
```

## Common Patterns

### Refreshable

```swift
List(items) { item in
    ItemRow(item: item)
}
.refreshable {
    await viewModel.refresh()
}
```

### Cancellation Handling

```swift
func fetchWithCancellation() async throws -> Data {
    let (data, _) = try await URLSession.shared.data(from: url)

    // Check cancellation before expensive operation
    try Task.checkCancellation()

    return try await processData(data)
}

// Or handle gracefully
func searchWithCancellation(query: String) async -> [Result] {
    guard !Task.isCancelled else { return [] }

    let results = await search(query)

    guard !Task.isCancelled else { return [] }

    return results
}
```

### Debouncing

```swift
actor Debouncer {
    private var task: Task<Void, Never>?

    func debounce(delay: Duration, action: @escaping @Sendable () async -> Void) {
        task?.cancel()
        task = Task {
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await action()
        }
    }
}
```

## Migration from Combine

| Combine | async/await |
|---------|-------------|
| `publisher.sink { }` | `for await value in stream { }` |
| `publisher.map { }` | `stream.map { }` |
| `publisher.filter { }` | `stream.filter { }` |
| `Just(value)` | Direct return |
| `Future { }` | `async` function |
| `PassthroughSubject` | `AsyncStream` |
| `CurrentValueSubject` | `@Observable` property |

### AsyncStream as Replacement

```swift
// Combine
let subject = PassthroughSubject<Event, Never>()
subject.send(.userLoggedIn)

// async/await
func events() -> AsyncStream<Event> {
    AsyncStream { continuation in
        // Setup observers
        let observer = NotificationCenter.default.addObserver(...) { _ in
            continuation.yield(.userLoggedIn)
        }

        continuation.onTermination = { _ in
            NotificationCenter.default.removeObserver(observer)
        }
    }
}
```
