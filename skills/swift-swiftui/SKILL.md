---
name: Swift & SwiftUI Expert
description: This skill should be used when the user is working with Swift or SwiftUI, asks to "write SwiftUI code", "create iOS app", "fix SwiftUI view", "help with Swift", "SwiftUI architecture", "iOS development", or needs expert-level Swift/SwiftUI guidance with modern patterns and best practices.
user-invocable: true
context: current
allowed-tools:
  # Matrix Code Index
  - mcp__plugin_matrix_matrix__matrix_find_callers
  - mcp__plugin_matrix_matrix__matrix_find_definition
  - mcp__plugin_matrix_matrix__matrix_search_symbols
  - mcp__plugin_matrix_matrix__matrix_list_exports
  - mcp__plugin_matrix_matrix__matrix_get_imports
  - mcp__plugin_matrix_matrix__matrix_index_status
  # Matrix Memory
  - mcp__plugin_matrix_matrix__matrix_recall
  - mcp__plugin_matrix_matrix__matrix_store
  - mcp__plugin_matrix_matrix__matrix_reward
  - mcp__plugin_matrix_matrix__matrix_failure
  # Context7 - Library Documentation
  - mcp__plugin_matrix_context7__resolve-library-id
  - mcp__plugin_matrix_context7__query-docs
  # Standard Tools
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash
---

# Swift & SwiftUI Expert

Expert-level guidance for Swift and SwiftUI development with modern patterns, iOS 17+/macOS 14+ best practices, and production-ready code generation.

## Core Principles

When writing Swift/SwiftUI code, ALWAYS follow these principles:

### 1. Modern State Management (iOS 17+)

**Use `@Observable` macro instead of `ObservableObject`:**

```swift
// MODERN (iOS 17+)
@Observable
class UserViewModel {
    var name: String = ""
    var isLoggedIn: Bool = false
}

// View owns the model
struct ContentView: View {
    @State private var viewModel = UserViewModel()
    var body: some View {
        Text(viewModel.name)
    }
}

// Child view (read-only) - NO wrapper needed
struct ProfileView: View {
    var viewModel: UserViewModel  // Just pass it
    var body: some View {
        Text(viewModel.name)
    }
}

// Child view (needs binding)
struct EditView: View {
    @Bindable var viewModel: UserViewModel
    var body: some View {
        TextField("Name", text: $viewModel.name)
    }
}
```

### 2. Property Wrapper Decision Tree

| Use Case | Property Wrapper |
|----------|------------------|
| Local view state (value types) | `@State` |
| Two-way binding to parent state | `@Binding` |
| Observable model (view owns) | `@State` + `@Observable` class |
| Observable model (read-only child) | No wrapper (just pass object) |
| Observable model (needs binding) | `@Bindable` |
| Shared app-wide state | `@Environment` |
| User defaults | `@AppStorage` |
| Scene storage | `@SceneStorage` |
| Focus state | `@FocusState` |

### 3. Architecture Patterns

**For most apps:** Modern MVVM with `@Observable`
**For large apps with teams:** TCA (Composable Architecture)
**For simple views:** No ViewModel needed

See `references/architecture.md` for detailed patterns.

## Anti-Patterns to AVOID

### State Management

```swift
// WRONG: @ObservedObject with initialization
@ObservedObject var viewModel = ViewModel()  // Will crash!

// RIGHT: Use @StateObject or @State
@StateObject private var viewModel = ViewModel()  // Legacy
@State private var viewModel = ViewModel()  // Modern (iOS 17+)
```

```swift
// WRONG: @State with reference types
@State var user: User  // Where User is a class

// RIGHT: @State only for value types
@State var userName: String
@State private var viewModel = ViewModel()  // Only with @Observable
```

```swift
// WRONG: Clearing data on error
func refresh() async {
    self.items = []  // Data disappears if error occurs!
    do {
        self.items = try await fetchItems()
    } catch {
        // Items now empty forever
    }
}

// RIGHT: Preserve existing data
func refresh() async {
    do {
        self.items = try await fetchItems()
    } catch {
        // Keep existing items, show error toast
    }
}
```

### Performance

```swift
// WRONG: Heavy computation in body
var body: some View {
    let sorted = items.sorted { ... }.filter { ... }  // Runs every render!
    List(sorted) { ... }
}

// RIGHT: Memoize or compute elsewhere
var sortedItems: [Item] {
    items.sorted { ... }.filter { ... }
}  // Or use @State for expensive computations
```

```swift
// WRONG: Using id modifier on lazy content
LazyVStack {
    ForEach(items) { item in
        ItemView(item: item)
            .id(item.id)  // Breaks lazy loading!
    }
}

// RIGHT: Let ForEach handle identity
LazyVStack {
    ForEach(items) { item in
        ItemView(item: item)  // ForEach uses Identifiable
    }
}
```

### Navigation

```swift
// WRONG: Using deprecated NavigationView
NavigationView {
    List { ... }
}

// RIGHT: Use NavigationStack (iOS 16+)
NavigationStack {
    List { ... }
}
```

## Code Generation Guidelines

When generating Swift/SwiftUI code:

1. **Target iOS 17+/macOS 14+** unless user specifies otherwise
2. **Use `@Observable`** instead of `ObservableObject`/`@Published`
3. **Use NavigationStack** instead of NavigationView
4. **Use `.task`** instead of `.onAppear` for async work
5. **Use Swift concurrency** (async/await) instead of Combine for new code
6. **Make @State private** always
7. **Prefer value types** (structs, enums) over classes
8. **Use optionals correctly** - never force unwrap without safety
9. **Handle errors explicitly** - use do-catch, not try?
10. **Add accessibility** - labels, hints, traits

## Reference Documents

For detailed guidance, consult:

- **`references/state-management.md`** - Property wrappers, @Observable, data flow
- **`references/architecture.md`** - MVVM, TCA, Clean Architecture patterns
- **`references/navigation.md`** - NavigationStack, programmatic navigation, deep links
- **`references/performance.md`** - Lazy views, List optimization, render cycles
- **`references/concurrency.md`** - async/await, actors, MainActor, Task
- **`references/testing.md`** - Unit tests, ViewInspector, UI tests
- **`references/accessibility.md`** - VoiceOver, Dynamic Type, accessibility modifiers
- **`references/swiftdata.md`** - @Model, @Query, persistence patterns
- **`references/anti-patterns.md`** - Common mistakes and how to fix them

## Examples

### Basic View with State

```swift
struct CounterView: View {
    @State private var count = 0

    var body: some View {
        VStack(spacing: 20) {
            Text("Count: \(count)")
                .font(.largeTitle)

            Button("Increment") {
                count += 1
            }
            .buttonStyle(.borderedProminent)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Counter at \(count)")
        .accessibilityHint("Double tap the button to increment")
    }
}
```

### ViewModel with @Observable

```swift
@Observable
class TaskListViewModel {
    var tasks: [Task] = []
    var isLoading = false
    var errorMessage: String?

    @MainActor
    func loadTasks() async {
        isLoading = true
        defer { isLoading = false }

        do {
            tasks = try await TaskService.shared.fetchTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct TaskListView: View {
    @State private var viewModel = TaskListViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView()
                } else {
                    List(viewModel.tasks) { task in
                        TaskRow(task: task)
                    }
                }
            }
            .navigationTitle("Tasks")
        }
        .task {
            await viewModel.loadTasks()
        }
    }
}
```

### Navigation with Type-Safe Routes

```swift
enum Route: Hashable {
    case detail(Item)
    case settings
    case profile(userId: String)
}

struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List(items) { item in
                Button(item.name) {
                    path.append(Route.detail(item))
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .detail(let item):
                    DetailView(item: item)
                case .settings:
                    SettingsView()
                case .profile(let userId):
                    ProfileView(userId: userId)
                }
            }
        }
    }

    // Programmatic navigation
    func navigateToSettings() {
        path.append(Route.settings)
    }

    func popToRoot() {
        path.removeLast(path.count)
    }
}
```

## Usage

This skill activates automatically when working with Swift/SwiftUI files or when the user mentions iOS/macOS/SwiftUI development.

**Explicit invocation:**
```
/swift-swiftui help me refactor this view to use @Observable
/swift-swiftui create a settings screen with navigation
/swift-swiftui fix state management in this component
```
