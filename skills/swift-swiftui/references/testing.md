# Testing SwiftUI Applications

## Testing Strategy Overview

| Test Type | Purpose | Speed | Reliability |
|-----------|---------|-------|-------------|
| Unit Tests | Logic, ViewModels, Services | Fast | High |
| Integration Tests | Feature workflows | Medium | Medium |
| UI Tests (XCUITest) | End-to-end user flows | Slow | Lower |
| Snapshot Tests | Visual regression | Fast | Medium |

**Recommended ratio:** 70% unit, 20% integration, 10% UI tests

## Unit Testing with Swift Testing (Xcode 16+)

### Basic Structure

```swift
import Testing
@testable import MyApp

@Suite("UserViewModel Tests")
struct UserViewModelTests {

    @Test("loads users successfully")
    func loadUsersSuccess() async throws {
        // Arrange
        let mockService = MockUserService()
        mockService.usersToReturn = [User(id: "1", name: "Test")]
        let viewModel = UserViewModel(userService: mockService)

        // Act
        await viewModel.loadUsers()

        // Assert
        #expect(viewModel.users.count == 1)
        #expect(viewModel.users.first?.name == "Test")
        #expect(viewModel.error == nil)
    }

    @Test("handles error gracefully")
    func loadUsersError() async {
        let mockService = MockUserService()
        mockService.errorToThrow = NetworkError.offline
        let viewModel = UserViewModel(userService: mockService)

        await viewModel.loadUsers()

        #expect(viewModel.users.isEmpty)
        #expect(viewModel.error != nil)
    }

    @Test("filters users by search query", arguments: [
        ("test", 1),
        ("", 3),
        ("xyz", 0)
    ])
    func filterUsers(query: String, expectedCount: Int) async {
        let viewModel = UserViewModel()
        viewModel.users = [
            User(id: "1", name: "Test User"),
            User(id: "2", name: "Another"),
            User(id: "3", name: "Someone")
        ]

        viewModel.searchQuery = query

        #expect(viewModel.filteredUsers.count == expectedCount)
    }
}
```

### Creating Test Doubles

```swift
// Protocol for dependency
protocol UserServiceProtocol: Sendable {
    func fetchUsers() async throws -> [User]
    func createUser(_ user: User) async throws -> User
}

// Mock implementation
final class MockUserService: UserServiceProtocol, @unchecked Sendable {
    var usersToReturn: [User] = []
    var errorToThrow: Error?
    var createUserCallCount = 0
    var lastCreatedUser: User?

    func fetchUsers() async throws -> [User] {
        if let error = errorToThrow { throw error }
        return usersToReturn
    }

    func createUser(_ user: User) async throws -> User {
        createUserCallCount += 1
        lastCreatedUser = user
        if let error = errorToThrow { throw error }
        return user
    }
}

// Stub for simple cases
struct StubUserService: UserServiceProtocol {
    let users: [User]

    func fetchUsers() async throws -> [User] { users }
    func createUser(_ user: User) async throws -> User { user }
}
```

### Testing @Observable ViewModels

```swift
@Observable
class CartViewModel {
    private(set) var items: [CartItem] = []
    private(set) var isLoading = false

    var total: Decimal {
        items.reduce(0) { $0 + $1.price * Decimal($1.quantity) }
    }

    func addItem(_ item: CartItem) {
        if let index = items.firstIndex(where: { $0.productId == item.productId }) {
            items[index].quantity += item.quantity
        } else {
            items.append(item)
        }
    }

    func removeItem(productId: String) {
        items.removeAll { $0.productId == productId }
    }
}

@Suite("CartViewModel Tests")
struct CartViewModelTests {

    @Test func addNewItem() {
        let viewModel = CartViewModel()
        let item = CartItem(productId: "1", name: "Test", price: 10, quantity: 1)

        viewModel.addItem(item)

        #expect(viewModel.items.count == 1)
        #expect(viewModel.total == 10)
    }

    @Test func addExistingItemIncreasesQuantity() {
        let viewModel = CartViewModel()
        let item = CartItem(productId: "1", name: "Test", price: 10, quantity: 1)

        viewModel.addItem(item)
        viewModel.addItem(item)

        #expect(viewModel.items.count == 1)
        #expect(viewModel.items[0].quantity == 2)
        #expect(viewModel.total == 20)
    }

    @Test func calculatesTotalCorrectly() {
        let viewModel = CartViewModel()
        viewModel.addItem(CartItem(productId: "1", name: "A", price: 10, quantity: 2))
        viewModel.addItem(CartItem(productId: "2", name: "B", price: 5, quantity: 3))

        #expect(viewModel.total == 35)  // (10*2) + (5*3)
    }
}
```

## Testing with XCTest (Legacy)

```swift
import XCTest
@testable import MyApp

final class UserViewModelXCTests: XCTestCase {

    var viewModel: UserViewModel!
    var mockService: MockUserService!

    override func setUp() {
        super.setUp()
        mockService = MockUserService()
        viewModel = UserViewModel(userService: mockService)
    }

    override func tearDown() {
        viewModel = nil
        mockService = nil
        super.tearDown()
    }

    func testLoadUsersSuccess() async {
        mockService.usersToReturn = [User(id: "1", name: "Test")]

        await viewModel.loadUsers()

        XCTAssertEqual(viewModel.users.count, 1)
        XCTAssertNil(viewModel.error)
    }

    func testLoadUsersFailure() async {
        mockService.errorToThrow = NSError(domain: "test", code: 1)

        await viewModel.loadUsers()

        XCTAssertTrue(viewModel.users.isEmpty)
        XCTAssertNotNil(viewModel.error)
    }
}
```

## UI Testing with XCUITest

### Setup Accessibility Identifiers

```swift
struct LoginView: View {
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack {
            TextField("Email", text: $email)
                .accessibilityIdentifier("email_field")

            SecureField("Password", text: $password)
                .accessibilityIdentifier("password_field")

            Button("Login") { login() }
                .accessibilityIdentifier("login_button")
        }
    }
}
```

### Writing UI Tests

```swift
import XCTest

final class LoginUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"]  // Enable test mode
        app.launch()
    }

    func testSuccessfulLogin() {
        let emailField = app.textFields["email_field"]
        let passwordField = app.secureTextFields["password_field"]
        let loginButton = app.buttons["login_button"]

        emailField.tap()
        emailField.typeText("test@example.com")

        passwordField.tap()
        passwordField.typeText("password123")

        loginButton.tap()

        // Wait for navigation
        let homeScreen = app.staticTexts["Welcome"]
        XCTAssertTrue(homeScreen.waitForExistence(timeout: 5))
    }

    func testLoginValidationError() {
        let loginButton = app.buttons["login_button"]
        loginButton.tap()

        let errorAlert = app.alerts["Error"]
        XCTAssertTrue(errorAlert.waitForExistence(timeout: 2))
    }
}
```

### Launch Arguments for Testing

```swift
// In app code
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.arguments.contains("--uitesting") {
                ContentView()
                    .environment(MockDataService())  // Use mocks
            } else {
                ContentView()
            }
        }
    }
}
```

## ViewInspector for SwiftUI Unit Tests

Third-party library for inspecting SwiftUI view hierarchies.

### Setup

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/nalexn/ViewInspector", from: "0.9.0")
]
```

### Basic Usage

```swift
import Testing
import ViewInspector
@testable import MyApp

extension ContentView: Inspectable {}

@Suite("ContentView Tests")
struct ContentViewTests {

    @Test func displaysTitle() throws {
        let view = ContentView()
        let text = try view.inspect().find(text: "Welcome")
        #expect(try text.string() == "Welcome")
    }

    @Test func buttonTriggersAction() throws {
        var actionCalled = false
        let view = ActionView(onTap: { actionCalled = true })

        let button = try view.inspect().find(button: "Submit")
        try button.tap()

        #expect(actionCalled)
    }

    @Test func listShowsItems() throws {
        let items = ["A", "B", "C"]
        let view = ItemListView(items: items)

        let list = try view.inspect().find(ViewType.List.self)
        #expect(try list.count == 3)
    }
}
```

### Limitations

ViewInspector can't:
- Inspect NavigationStack state
- Test animations
- Access all modifier states
- Work with all custom views

**Recommendation:** Use ViewInspector for component tests, XCUITest for flow tests.

## Snapshot Testing

Using Point-Free's SnapshotTesting library.

### Setup

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", from: "1.15.0")
]
```

### Usage

```swift
import SnapshotTesting
import SwiftUI
import XCTest
@testable import MyApp

final class ComponentSnapshotTests: XCTestCase {

    func testUserCard() {
        let view = UserCard(user: .preview)
            .frame(width: 300)

        assertSnapshot(of: view, as: .image)
    }

    func testUserCardDarkMode() {
        let view = UserCard(user: .preview)
            .frame(width: 300)
            .environment(\.colorScheme, .dark)

        assertSnapshot(of: view, as: .image, named: "dark")
    }

    func testMultipleDevices() {
        let view = HomeView()

        assertSnapshot(of: view, as: .image(layout: .device(config: .iPhone13)))
        assertSnapshot(of: view, as: .image(layout: .device(config: .iPadPro12_9)))
    }
}
```

## Testing Best Practices

### 1. Test Behavior, Not Implementation

```swift
// WRONG: Testing internal state
@Test func internals() {
    let vm = ViewModel()
    #expect(vm.internalCache.count == 0)  // Testing implementation
}

// RIGHT: Testing observable behavior
@Test func behavior() async {
    let vm = ViewModel()
    await vm.loadData()
    #expect(vm.items.count == 5)  // Testing public interface
}
```

### 2. Use Dependency Injection

```swift
// Make dependencies injectable
@Observable
class OrderViewModel {
    private let orderService: OrderServiceProtocol
    private let paymentService: PaymentServiceProtocol

    init(
        orderService: OrderServiceProtocol = OrderService(),
        paymentService: PaymentServiceProtocol = PaymentService()
    ) {
        self.orderService = orderService
        self.paymentService = paymentService
    }
}
```

### 3. Test Edge Cases

```swift
@Suite("Pagination Tests")
struct PaginationTests {
    @Test func emptyResults() async { ... }
    @Test func singlePage() async { ... }
    @Test func multiplePages() async { ... }
    @Test func lastPage() async { ... }
    @Test func networkError() async { ... }
    @Test func cancelledRequest() async { ... }
}
```

### 4. Keep Tests Fast

```swift
// WRONG: Real network call
@Test func fetchUsers() async {
    let service = UserService()  // Real service
    let users = try await service.fetch()
    // ...
}

// RIGHT: Mocked service
@Test func fetchUsers() async {
    let service = MockUserService()
    service.usersToReturn = [.preview]
    let users = try await service.fetch()
    // ...
}
```

### 5. Use Test Fixtures

```swift
extension User {
    static let preview = User(
        id: "preview-1",
        name: "Preview User",
        email: "preview@test.com"
    )

    static func fixture(
        id: String = UUID().uuidString,
        name: String = "Test",
        email: String = "test@test.com"
    ) -> User {
        User(id: id, name: name, email: email)
    }
}
```

## Code Coverage

Enable in Xcode: Edit Scheme → Test → Options → Code Coverage

**Target:** 80%+ for critical business logic, ViewModels, services.

**Don't chase 100%:** Some code (pure UI, edge cases) isn't worth testing.
