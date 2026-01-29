# Navigation in SwiftUI

## NavigationStack (iOS 16+)

NavigationStack replaces the deprecated NavigationView with better programmatic control.

### Basic Usage

```swift
struct ContentView: View {
    var body: some View {
        NavigationStack {
            List(items) { item in
                NavigationLink(item.name, value: item)
            }
            .navigationDestination(for: Item.self) { item in
                ItemDetailView(item: item)
            }
            .navigationTitle("Items")
        }
    }
}
```

### Programmatic Navigation with NavigationPath

```swift
struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Button("Go to Settings") {
                    path.append("settings")
                }
                Button("Go to Profile") {
                    path.append(UserID(123))
                }
            }
            .navigationDestination(for: String.self) { route in
                if route == "settings" {
                    SettingsView()
                }
            }
            .navigationDestination(for: UserID.self) { userId in
                ProfileView(userId: userId)
            }
        }
    }

    // Navigation methods
    func navigateToSettings() {
        path.append("settings")
    }

    func popToRoot() {
        path.removeLast(path.count)
    }

    func pop() {
        if !path.isEmpty {
            path.removeLast()
        }
    }
}
```

## Type-Safe Routing with Enums

Best practice for large apps: define routes as enums.

```swift
enum AppRoute: Hashable {
    case home
    case profile(userId: String)
    case settings
    case settingsDetail(SettingsSection)
    case item(Item)
    case search(query: String)
}

enum SettingsSection: String, Hashable {
    case account, notifications, privacy, about
}

struct RootView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            HomeView(navigate: navigate)
                .navigationDestination(for: AppRoute.self) { route in
                    destinationView(for: route)
                }
        }
    }

    @ViewBuilder
    private func destinationView(for route: AppRoute) -> some View {
        switch route {
        case .home:
            HomeView(navigate: navigate)

        case .profile(let userId):
            ProfileView(userId: userId, navigate: navigate)

        case .settings:
            SettingsView(navigate: navigate)

        case .settingsDetail(let section):
            SettingsDetailView(section: section)

        case .item(let item):
            ItemDetailView(item: item, navigate: navigate)

        case .search(let query):
            SearchResultsView(query: query, navigate: navigate)
        }
    }

    private func navigate(to route: AppRoute) {
        path.append(route)
    }
}
```

## Router/Coordinator Pattern

For complex navigation with shared state:

```swift
@Observable
class AppRouter {
    var path = NavigationPath()

    func navigate(to route: AppRoute) {
        path.append(route)
    }

    func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
    }

    func popToRoot() {
        path.removeLast(path.count)
    }

    func replace(with routes: [AppRoute]) {
        path.removeLast(path.count)
        for route in routes {
            path.append(route)
        }
    }
}

// Inject via environment
@main
struct MyApp: App {
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
        }
    }
}

// Use in any view
struct SomeView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        Button("Go to Profile") {
            router.navigate(to: .profile(userId: "123"))
        }
    }
}
```

## Sheet and Full-Screen Presentation

### Sheet

```swift
struct ParentView: View {
    @State private var isSheetPresented = false
    @State private var selectedItem: Item?

    var body: some View {
        VStack {
            Button("Show Sheet") { isSheetPresented = true }

            List(items) { item in
                Button(item.name) { selectedItem = item }
            }
        }
        // Boolean-based sheet
        .sheet(isPresented: $isSheetPresented) {
            SheetContentView()
        }
        // Item-based sheet (auto-presents when non-nil)
        .sheet(item: $selectedItem) { item in
            ItemDetailView(item: item)
        }
    }
}
```

### Full-Screen Cover

```swift
struct OnboardingFlow: View {
    @State private var showOnboarding = true

    var body: some View {
        MainView()
            .fullScreenCover(isPresented: $showOnboarding) {
                OnboardingView {
                    showOnboarding = false
                }
            }
    }
}
```

### Sheet with Detents (iOS 16+)

```swift
.sheet(isPresented: $isPresented) {
    SheetContent()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(20)
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
}
```

## Alerts and Confirmation Dialogs

### Alert

```swift
struct AlertExample: View {
    @State private var showAlert = false
    @State private var errorMessage: String?

    var body: some View {
        Button("Delete") { showAlert = true }
            .alert("Delete Item?", isPresented: $showAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Delete", role: .destructive) {
                    deleteItem()
                }
            } message: {
                Text("This action cannot be undone.")
            }
            // Error alert with optional binding
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                if let message = errorMessage {
                    Text(message)
                }
            }
    }
}
```

### Confirmation Dialog (Action Sheet)

```swift
struct ConfirmationExample: View {
    @State private var showConfirmation = false

    var body: some View {
        Button("Options") { showConfirmation = true }
            .confirmationDialog("Choose Action", isPresented: $showConfirmation) {
                Button("Share") { share() }
                Button("Duplicate") { duplicate() }
                Button("Delete", role: .destructive) { delete() }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("What would you like to do with this item?")
            }
    }
}
```

## Deep Linking

### Handling URLs

```swift
@main
struct MyApp: App {
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
              let host = components.host else { return }

        switch host {
        case "profile":
            if let userId = components.queryItems?.first(where: { $0.name == "id" })?.value {
                router.navigate(to: .profile(userId: userId))
            }
        case "item":
            if let itemId = components.queryItems?.first(where: { $0.name == "id" })?.value {
                // Fetch item and navigate
                Task {
                    if let item = try? await ItemService.fetch(id: itemId) {
                        await MainActor.run {
                            router.navigate(to: .item(item))
                        }
                    }
                }
            }
        case "settings":
            router.navigate(to: .settings)
        default:
            break
        }
    }
}
```

### URL Scheme Registration

In Info.plist:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>myapp</string>
        </array>
    </dict>
</array>
```

## TabView Navigation

```swift
struct MainTabView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                HomeView()
            }
            .tabItem {
                Label("Home", systemImage: "house")
            }
            .tag(0)

            NavigationStack {
                SearchView()
            }
            .tabItem {
                Label("Search", systemImage: "magnifyingglass")
            }
            .tag(1)

            NavigationStack {
                ProfileView()
            }
            .tabItem {
                Label("Profile", systemImage: "person")
            }
            .tag(2)
        }
    }

    // Programmatically switch tabs
    func switchToProfile() {
        selectedTab = 2
    }
}
```

## Best Practices

### 1. Keep Navigation State in One Place

Don't spread navigation logic across views. Use a router or keep `NavigationPath` at the root.

### 2. Make Routes Codable for State Restoration

```swift
enum AppRoute: Hashable, Codable {
    case home
    case profile(userId: String)
    // ...
}

// Save/restore navigation state
extension AppRouter {
    func save() -> Data? {
        try? JSONEncoder().encode(path.codable)
    }

    func restore(from data: Data) {
        if let codable = try? JSONDecoder().decode(NavigationPath.CodableRepresentation.self, from: data) {
            path = NavigationPath(codable)
        }
    }
}
```

### 3. Handle Back Navigation Gracefully

```swift
struct DetailView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack {
            // Content
            Button("Done") {
                dismiss()  // Works for both navigation push and sheets
            }
        }
    }
}
```

### 4. Avoid Navigation in ViewModels

ViewModels shouldn't know about navigation. Return values or callbacks, let views handle navigation:

```swift
// WRONG
@Observable class ViewModel {
    var router: AppRouter?  // ViewModel shouldn't hold router

    func submit() async {
        await save()
        router?.pop()  // Don't do this
    }
}

// RIGHT
@Observable class ViewModel {
    var didSaveSuccessfully = false

    func submit() async {
        await save()
        didSaveSuccessfully = true
    }
}

struct MyView: View {
    @State private var viewModel = ViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        // ...
        .onChange(of: viewModel.didSaveSuccessfully) { _, success in
            if success { dismiss() }
        }
    }
}
```
