# State Management in SwiftUI

## The Modern Approach (iOS 17+)

### @Observable Macro

The `@Observable` macro replaces `ObservableObject`, `@Published`, and most uses of `@StateObject`/`@ObservedObject`.

```swift
// OLD WAY (pre-iOS 17)
class UserViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var email: String = ""
    @Published var isLoading: Bool = false
}

struct UserView: View {
    @StateObject private var viewModel = UserViewModel()
    // ...
}

// NEW WAY (iOS 17+)
@Observable
class UserViewModel {
    var name: String = ""
    var email: String = ""
    var isLoading: Bool = false
}

struct UserView: View {
    @State private var viewModel = UserViewModel()
    // ...
}
```

**Key benefits:**
- No `@Published` needed - all properties automatically observed
- No `objectWillChange.send()` calls needed
- Better performance - only properties accessed in body trigger updates
- Cleaner syntax

### Migration Guide

| Old Pattern | New Pattern |
|-------------|-------------|
| `class VM: ObservableObject` | `@Observable class VM` |
| `@Published var x` | `var x` |
| `@StateObject private var vm = VM()` | `@State private var vm = VM()` |
| `@ObservedObject var vm: VM` (read-only) | `var vm: VM` (no wrapper) |
| `@ObservedObject var vm: VM` (needs binding) | `@Bindable var vm: VM` |
| `@EnvironmentObject var vm: VM` | `@Environment(VM.self) var vm` |
| `.environmentObject(vm)` | `.environment(vm)` |

## Property Wrapper Deep Dive

### @State

For **value types** owned by the view. Always declare as `private`.

```swift
struct SettingsView: View {
    @State private var notificationsEnabled = true
    @State private var username = ""
    @State private var selectedTheme: Theme = .system

    var body: some View {
        Form {
            Toggle("Notifications", isOn: $notificationsEnabled)
            TextField("Username", text: $username)
            Picker("Theme", selection: $selectedTheme) {
                ForEach(Theme.allCases, id: \.self) { theme in
                    Text(theme.rawValue).tag(theme)
                }
            }
        }
    }
}
```

**When to use:**
- Simple value types (Bool, String, Int, enums, small structs)
- State that belongs only to this view
- State that resets when view disappears
- With `@Observable` classes that the view owns

### @Binding

For **two-way data flow** to child views.

```swift
struct ParentView: View {
    @State private var isPresented = false

    var body: some View {
        Button("Show Sheet") { isPresented = true }
            .sheet(isPresented: $isPresented) {
                ChildView(isPresented: $isPresented)
            }
    }
}

struct ChildView: View {
    @Binding var isPresented: Bool

    var body: some View {
        Button("Dismiss") { isPresented = false }
    }
}
```

**Creating bindings from constants:**
```swift
// For previews or testing
TextField("Name", text: .constant("Preview"))
Toggle("Option", isOn: .constant(true))
```

### @Bindable

For creating **bindings to `@Observable` objects** not owned by the view.

```swift
@Observable
class Document {
    var title: String = ""
    var content: String = ""
}

// Parent owns the document
struct DocumentView: View {
    @State private var document = Document()

    var body: some View {
        EditorView(document: document)
    }
}

// Child needs bindings to document properties
struct EditorView: View {
    @Bindable var document: Document  // @Bindable enables $document.title

    var body: some View {
        VStack {
            TextField("Title", text: $document.title)
            TextEditor(text: $document.content)
        }
    }
}
```

**Important:** You do NOT need `@Bindable` when:
- The view owns the object via `@State` (bindings work automatically)
- You only need to read properties (just pass the object)

### @Environment

For **dependency injection** and shared state.

```swift
// Custom environment value
struct ThemeKey: EnvironmentKey {
    static let defaultValue: Theme = .system
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// Inject @Observable objects
@Observable
class AppSettings {
    var language: String = "en"
    var isDarkMode: Bool = false
}

// At app level
@main
struct MyApp: App {
    @State private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(settings)  // iOS 17+
        }
    }
}

// In any child view
struct SettingsView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        // For bindings, wrap in @Bindable
        @Bindable var settings = settings
        Toggle("Dark Mode", isOn: $settings.isDarkMode)
    }
}
```

### @AppStorage

For **UserDefaults persistence**.

```swift
struct PreferencesView: View {
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @AppStorage("selectedTab") private var selectedTab = 0
    @AppStorage("username") private var username = ""

    var body: some View {
        VStack {
            Toggle("Completed Onboarding", isOn: $hasCompletedOnboarding)
            TextField("Username", text: $username)
        }
    }
}
```

**Supported types:** Bool, Int, Double, String, URL, Data, and RawRepresentable enums.

### @SceneStorage

For **state restoration** per scene (survives app termination).

```swift
struct DocumentView: View {
    @SceneStorage("selectedDocument") private var selectedDocumentID: String?
    @SceneStorage("scrollPosition") private var scrollPosition: Double = 0

    var body: some View {
        // State persists across app launches for each window/scene
    }
}
```

### @FocusState

For **managing keyboard focus**.

```swift
struct LoginForm: View {
    enum Field: Hashable {
        case email, password
    }

    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    var body: some View {
        Form {
            TextField("Email", text: $email)
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }

            SecureField("Password", text: $password)
                .focused($focusedField, equals: .password)
                .submitLabel(.done)
                .onSubmit { login() }
        }
        .onAppear { focusedField = .email }
    }
}
```

## Data Flow Patterns

### Parent-Child Communication

```swift
// Parent → Child (one-way): Just pass the value
struct ParentView: View {
    @State private var items: [Item] = []

    var body: some View {
        ItemList(items: items)  // Child receives copy
    }
}

struct ItemList: View {
    let items: [Item]  // Read-only
    var body: some View {
        ForEach(items) { item in Text(item.name) }
    }
}

// Parent ↔ Child (two-way): Use @Binding
struct ParentView: View {
    @State private var selectedItem: Item?

    var body: some View {
        ItemPicker(selection: $selectedItem)
    }
}

struct ItemPicker: View {
    @Binding var selection: Item?
    var body: some View {
        // Can modify selection, changes propagate to parent
    }
}
```

### Shared State Across View Hierarchy

```swift
@Observable
class ShoppingCart {
    var items: [CartItem] = []
    var total: Decimal { items.reduce(0) { $0 + $1.price } }

    func add(_ item: CartItem) { items.append(item) }
    func remove(_ item: CartItem) { items.removeAll { $0.id == item.id } }
}

@main
struct ShopApp: App {
    @State private var cart = ShoppingCart()

    var body: some Scene {
        WindowGroup {
            TabView {
                ProductsView()
                CartView()
            }
            .environment(cart)
        }
    }
}

// Any view can access
struct ProductsView: View {
    @Environment(ShoppingCart.self) private var cart

    var body: some View {
        // Access cart.items, call cart.add()
    }
}
```

## Common Pitfalls

### 1. Don't initialize @ObservedObject

```swift
// CRASH RISK!
@ObservedObject var viewModel = ViewModel()

// Instead use @StateObject (legacy) or @State (modern)
@StateObject private var viewModel = ViewModel()  // Legacy
@State private var viewModel = ViewModel()  // Modern with @Observable
```

### 2. Don't use @State with reference types

```swift
// WRONG - @State doesn't track reference type changes
@State var user: User  // Where User is a class

// RIGHT - Use @Observable
@Observable class User { ... }
@State private var user = User()
```

### 3. Don't overuse @EnvironmentObject/@Environment

Only use for truly global state. For feature-specific state, pass via initializers.

### 4. Keep @State minimal

Store only what you need. Derive computed values.

```swift
// WRONG
@State private var items: [Item] = []
@State private var filteredItems: [Item] = []  // Duplicate!
@State private var sortedItems: [Item] = []  // More duplicate!

// RIGHT
@State private var items: [Item] = []
@State private var searchText = ""
@State private var sortOrder: SortOrder = .name

var displayedItems: [Item] {
    items
        .filter { searchText.isEmpty || $0.name.contains(searchText) }
        .sorted(by: sortOrder.comparator)
}
```
