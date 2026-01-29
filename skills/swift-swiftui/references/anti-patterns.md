# SwiftUI Anti-Patterns and How to Fix Them

## State Management Anti-Patterns

### 1. Initializing @ObservedObject

**Problem:** View creates a new instance on every render, causing crashes or data loss.

```swift
// WRONG - Will crash or lose state
struct BadView: View {
    @ObservedObject var viewModel = ViewModel()  // Created every render!
}
```

**Fix:**

```swift
// Option 1: @StateObject (legacy)
struct GoodView: View {
    @StateObject private var viewModel = ViewModel()
}

// Option 2: @State with @Observable (modern, iOS 17+)
@Observable
class ViewModel { ... }

struct GoodView: View {
    @State private var viewModel = ViewModel()
}
```

### 2. @State with Reference Types

**Problem:** @State doesn't track changes to reference types.

```swift
// WRONG - Changes won't trigger UI updates
class User {
    var name: String = ""
}

struct BadView: View {
    @State var user = User()

    var body: some View {
        TextField("Name", text: $user.name)  // Won't update!
    }
}
```

**Fix:**

```swift
// Option 1: Use @Observable (iOS 17+)
@Observable
class User {
    var name: String = ""
}

struct GoodView: View {
    @State private var user = User()
    var body: some View {
        @Bindable var user = user
        TextField("Name", text: $user.name)  // Works!
    }
}

// Option 2: Use a struct
struct User {
    var name: String = ""
}

struct GoodView: View {
    @State private var user = User()
}
```

### 3. Clearing Data on Error

**Problem:** User sees empty state when network fails.

```swift
// WRONG - Data disappears on error
func refresh() async {
    items = []  // Clear existing data
    do {
        items = try await fetchItems()
    } catch {
        // items is now empty forever!
    }
}
```

**Fix:**

```swift
// RIGHT - Preserve existing data
func refresh() async {
    isLoading = true
    defer { isLoading = false }

    do {
        items = try await fetchItems()
        error = nil
    } catch {
        self.error = error  // Show error, keep old data
    }
}
```

### 4. Overusing @EnvironmentObject

**Problem:** Tight coupling, hard to trace data flow.

```swift
// WRONG - Everything global
class AppState: ObservableObject {
    @Published var user: User?
    @Published var settings: Settings
    @Published var cart: Cart
    @Published var notifications: [Notification]
    // ... 20 more properties
}

struct RandomView: View {
    @EnvironmentObject var appState: AppState  // Needs ALL of this?
}
```

**Fix:**

```swift
// RIGHT - Focused dependencies
struct CartView: View {
    @Environment(Cart.self) private var cart  // Only what's needed
}

struct ProfileView: View {
    @Environment(UserSession.self) private var session
}
```

## Performance Anti-Patterns

### 5. Heavy Computation in body

**Problem:** Expensive operations run on every render.

```swift
// WRONG - Sorts and filters on every render
var body: some View {
    let filtered = items.filter { $0.isActive }
    let sorted = filtered.sorted { $0.date > $1.date }
    let grouped = Dictionary(grouping: sorted) { $0.category }

    List {
        ForEach(grouped.keys.sorted(), id: \.self) { key in
            Section(key) {
                ForEach(grouped[key]!) { item in
                    ItemRow(item: item)
                }
            }
        }
    }
}
```

**Fix:**

```swift
// RIGHT - Compute outside body
@Observable
class ViewModel {
    var items: [Item] = []

    var groupedItems: [(String, [Item])] {
        let filtered = items.filter { $0.isActive }
        let sorted = filtered.sorted { $0.date > $1.date }
        let grouped = Dictionary(grouping: sorted) { $0.category }
        return grouped.sorted { $0.key < $1.key }
    }
}

var body: some View {
    List {
        ForEach(viewModel.groupedItems, id: \.0) { category, items in
            Section(category) {
                ForEach(items) { item in
                    ItemRow(item: item)
                }
            }
        }
    }
}
```

### 6. Breaking Lazy Loading

**Problem:** `.id()` modifier forces all views to be created.

```swift
// WRONG - All 10,000 rows created immediately
LazyVStack {
    ForEach(items) { item in
        ItemRow(item: item)
            .id(item.id)  // DESTROYS lazy loading!
    }
}
```

**Fix:**

```swift
// RIGHT - Let ForEach handle identity
LazyVStack {
    ForEach(items) { item in  // items must be Identifiable
        ItemRow(item: item)
    }
}
```

### 7. Expensive Modifiers in Lists

**Problem:** Blur, shadow, mask trigger offscreen rendering per row.

```swift
// WRONG - Expensive per-row
List(items) { item in
    ItemRow(item: item)
        .shadow(radius: 5)  // GPU hit per row!
        .blur(radius: isBlurred ? 3 : 0)
}
```

**Fix:**

```swift
// RIGHT - Apply to container
List(items) { item in
    ItemRow(item: item)  // No expensive modifiers
}
.shadow(radius: 5)  // Once for whole list

// Or pre-render to image for complex effects
```

## Navigation Anti-Patterns

### 8. Using Deprecated NavigationView

**Problem:** NavigationView is deprecated, limited functionality.

```swift
// WRONG - Deprecated
NavigationView {
    List { ... }
}
```

**Fix:**

```swift
// RIGHT - iOS 16+
NavigationStack {
    List { ... }
}

// For split views
NavigationSplitView {
    Sidebar()
} detail: {
    Detail()
}
```

### 9. Navigation Logic in ViewModel

**Problem:** ViewModels shouldn't know about navigation.

```swift
// WRONG - ViewModel handles navigation
class ViewModel {
    var router: Router?

    func onItemTapped(_ item: Item) {
        // Business logic...
        router?.navigate(to: .detail(item))  // Don't do this!
    }
}
```

**Fix:**

```swift
// RIGHT - View handles navigation
class ViewModel {
    var selectedItem: Item?

    func selectItem(_ item: Item) {
        // Business logic...
        selectedItem = item
    }
}

struct ItemList: View {
    @State private var viewModel = ViewModel()

    var body: some View {
        List(items) { item in
            Button(item.name) {
                viewModel.selectItem(item)
            }
        }
        .navigationDestination(item: $viewModel.selectedItem) { item in
            DetailView(item: item)
        }
    }
}
```

## Concurrency Anti-Patterns

### 10. Using .onAppear for Async Work

**Problem:** Can fire multiple times, no automatic cancellation.

```swift
// WRONG - Multiple calls, no cancellation
.onAppear {
    Task {
        data = try? await fetchData()  // Runs again if view reappears!
    }
}
```

**Fix:**

```swift
// RIGHT - Automatic lifecycle management
.task {
    data = try? await fetchData()  // Cancelled on disappear
}

// With dependency
.task(id: itemId) {
    data = try? await fetchData(itemId)  // Re-runs when id changes
}
```

### 11. Forgetting @MainActor

**Problem:** UI updates from background thread cause crashes.

```swift
// WRONG - May update UI from background
func loadData() async {
    let result = await api.fetch()
    items = result  // May not be on main thread!
}
```

**Fix:**

```swift
// RIGHT - Explicit main actor
@MainActor
func loadData() async {
    let result = await api.fetch()
    items = result  // Guaranteed main thread
}

// Or for just the assignment
func loadData() async {
    let result = await api.fetch()
    await MainActor.run {
        items = result
    }
}
```

### 12. Not Handling Cancellation

**Problem:** Wasted work and potential crashes.

```swift
// WRONG - Ignores cancellation
func search(_ query: String) async {
    let results = await api.search(query)  // Still running after user left!
    self.results = results  // May crash if view is gone
}
```

**Fix:**

```swift
// RIGHT - Check cancellation
func search(_ query: String) async {
    let results = await api.search(query)
    guard !Task.isCancelled else { return }
    self.results = results
}

// Or let it throw
func search(_ query: String) async throws {
    let results = try await api.search(query)
    try Task.checkCancellation()
    self.results = results
}
```

## Code Organization Anti-Patterns

### 13. Massive Views

**Problem:** Hard to read, test, and maintain.

```swift
// WRONG - 500 line view
struct MonsterView: View {
    var body: some View {
        VStack {
            // Header (100 lines)
            // Content (200 lines)
            // Footer (100 lines)
            // Modals (100 lines)
        }
    }
}
```

**Fix:**

```swift
// RIGHT - Decompose into components
struct MainView: View {
    var body: some View {
        VStack {
            HeaderView()
            ContentView()
            FooterView()
        }
        .sheet(isPresented: $showModal) {
            ModalView()
        }
    }
}
```

### 14. Unnecessary ViewModels

**Problem:** Over-engineering simple views.

```swift
// WRONG - ViewModel for static display
class UserAvatarViewModel: ObservableObject {
    @Published var image: UIImage?

    func loadImage(url: URL) { ... }
}

struct UserAvatarView: View {
    @StateObject var viewModel = UserAvatarViewModel()
    // ...
}
```

**Fix:**

```swift
// RIGHT - Just a view
struct UserAvatarView: View {
    let url: URL

    var body: some View {
        AsyncImage(url: url) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            ProgressView()
        }
        .frame(width: 50, height: 50)
        .clipShape(Circle())
    }
}
```

## Swift Language Anti-Patterns

### 15. Force Unwrapping

**Problem:** Crashes at runtime.

```swift
// WRONG - Will crash if nil
let user = users.first!
let name = json["name"] as! String
```

**Fix:**

```swift
// RIGHT - Handle optionals properly
guard let user = users.first else {
    showEmptyState()
    return
}

if let name = json["name"] as? String {
    // Use name
}

// Or with nil coalescing
let name = json["name"] as? String ?? "Unknown"
```

### 16. Ignoring Errors

**Problem:** Silent failures, hard to debug.

```swift
// WRONG - Swallowed errors
let data = try? api.fetchData()
```

**Fix:**

```swift
// RIGHT - Handle errors explicitly
do {
    let data = try await api.fetchData()
    self.data = data
} catch {
    self.error = error
    logger.error("Failed to fetch: \(error)")
}
```

## Quick Reference: Red Flags to Watch For

| Pattern | Problem | Fix |
|---------|---------|-----|
| `@ObservedObject var x = X()` | State loss | Use `@StateObject` or `@State` |
| `@State var x: Class` | No tracking | Use `@Observable` |
| `.id()` in lazy container | Breaks lazy | Remove `.id()` |
| `items = []` in error handler | Data loss | Keep existing data |
| `.onAppear { Task { } }` | No lifecycle | Use `.task` |
| Missing `@MainActor` | Thread crash | Add `@MainActor` |
| `NavigationView` | Deprecated | Use `NavigationStack` |
| `try?` everywhere | Silent fail | Use `do-catch` |
| Force unwrap `!` | Crash risk | Use optional binding |
