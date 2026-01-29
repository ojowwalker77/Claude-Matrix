# Architecture Patterns for SwiftUI

## Choosing the Right Pattern

| App Size | Team Size | Pattern | Rationale |
|----------|-----------|---------|-----------|
| Small (1-5 screens) | 1 dev | No formal architecture | Views + inline state |
| Medium (5-20 screens) | 1-3 devs | MVVM with @Observable | Balance of structure and simplicity |
| Large (20+ screens) | 3+ devs | TCA or Clean Architecture | Strict patterns, testability |

## Pattern 1: Modern MVVM (Recommended for Most Apps)

### Structure

```
Feature/
├── Models/
│   └── User.swift
├── ViewModels/
│   └── UserListViewModel.swift
├── Views/
│   ├── UserListView.swift
│   └── UserRowView.swift
└── Services/
    └── UserService.swift
```

### Implementation

```swift
// Models/User.swift
struct User: Identifiable, Codable {
    let id: UUID
    var name: String
    var email: String
    var avatarURL: URL?
}

// Services/UserService.swift
protocol UserServiceProtocol {
    func fetchUsers() async throws -> [User]
    func createUser(_ user: User) async throws -> User
    func deleteUser(id: UUID) async throws
}

actor UserService: UserServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    func fetchUsers() async throws -> [User] {
        try await apiClient.request(.get, path: "/users")
    }

    func createUser(_ user: User) async throws -> User {
        try await apiClient.request(.post, path: "/users", body: user)
    }

    func deleteUser(id: UUID) async throws {
        try await apiClient.request(.delete, path: "/users/\(id)")
    }
}

// ViewModels/UserListViewModel.swift
@Observable
class UserListViewModel {
    private(set) var users: [User] = []
    private(set) var isLoading = false
    private(set) var error: Error?

    private let userService: UserServiceProtocol

    init(userService: UserServiceProtocol = UserService()) {
        self.userService = userService
    }

    @MainActor
    func loadUsers() async {
        isLoading = true
        error = nil

        do {
            users = try await userService.fetchUsers()
        } catch {
            self.error = error
        }

        isLoading = false
    }

    @MainActor
    func deleteUser(_ user: User) async {
        do {
            try await userService.deleteUser(id: user.id)
            users.removeAll { $0.id == user.id }
        } catch {
            self.error = error
        }
    }
}

// Views/UserListView.swift
struct UserListView: View {
    @State private var viewModel = UserListViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading...")
                } else if let error = viewModel.error {
                    ErrorView(error: error) {
                        Task { await viewModel.loadUsers() }
                    }
                } else {
                    List {
                        ForEach(viewModel.users) { user in
                            UserRowView(user: user)
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                Task { await viewModel.deleteUser(viewModel.users[index]) }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Users")
            .refreshable {
                await viewModel.loadUsers()
            }
        }
        .task {
            await viewModel.loadUsers()
        }
    }
}
```

### Testing

```swift
// Mock service for testing
class MockUserService: UserServiceProtocol {
    var usersToReturn: [User] = []
    var errorToThrow: Error?

    func fetchUsers() async throws -> [User] {
        if let error = errorToThrow { throw error }
        return usersToReturn
    }

    func createUser(_ user: User) async throws -> User { user }
    func deleteUser(id: UUID) async throws {}
}

// Unit tests
@Test func loadUsersSuccess() async {
    let mockService = MockUserService()
    mockService.usersToReturn = [User(id: UUID(), name: "Test", email: "test@test.com")]

    let viewModel = UserListViewModel(userService: mockService)
    await viewModel.loadUsers()

    #expect(viewModel.users.count == 1)
    #expect(viewModel.error == nil)
}
```

## Pattern 2: The Composable Architecture (TCA)

For large apps with complex state management needs.

### Dependencies

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.0.0")
]
```

### Structure

```
Feature/
├── UserListFeature.swift  // State, Action, Reducer, View all together
└── UserClient.swift       // Dependency
```

### Implementation

```swift
import ComposableArchitecture

// UserClient.swift - Dependency
@DependencyClient
struct UserClient {
    var fetch: @Sendable () async throws -> [User]
    var delete: @Sendable (UUID) async throws -> Void
}

extension UserClient: DependencyKey {
    static let liveValue = UserClient(
        fetch: { try await APIClient.shared.request(.get, path: "/users") },
        delete: { id in try await APIClient.shared.request(.delete, path: "/users/\(id)") }
    )

    static let testValue = UserClient(
        fetch: { [] },
        delete: { _ in }
    )
}

extension DependencyValues {
    var userClient: UserClient {
        get { self[UserClient.self] }
        set { self[UserClient.self] = newValue }
    }
}

// UserListFeature.swift
@Reducer
struct UserListFeature {
    @ObservableState
    struct State: Equatable {
        var users: [User] = []
        var isLoading = false
        @Presents var alert: AlertState<Action.Alert>?
    }

    enum Action {
        case onAppear
        case usersResponse(Result<[User], Error>)
        case deleteUser(User)
        case deleteResponse(Result<Void, Error>)
        case alert(PresentationAction<Alert>)

        enum Alert: Equatable {
            case confirmDelete(User)
        }
    }

    @Dependency(\.userClient) var userClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                state.isLoading = true
                return .run { send in
                    await send(.usersResponse(Result { try await userClient.fetch() }))
                }

            case let .usersResponse(.success(users)):
                state.isLoading = false
                state.users = users
                return .none

            case let .usersResponse(.failure(error)):
                state.isLoading = false
                state.alert = AlertState {
                    TextState("Error")
                } actions: {
                    ButtonState(role: .cancel) { TextState("OK") }
                } message: {
                    TextState(error.localizedDescription)
                }
                return .none

            case let .deleteUser(user):
                return .run { send in
                    await send(.deleteResponse(Result { try await userClient.delete(user.id) }))
                }

            case .deleteResponse(.success):
                // User removed via optimistic update or refetch
                return .none

            case let .deleteResponse(.failure(error)):
                state.alert = AlertState { TextState("Delete Failed") }
                return .none

            case .alert:
                return .none
            }
        }
        .ifLet(\.$alert, action: \.alert)
    }
}

// View
struct UserListView: View {
    @Bindable var store: StoreOf<UserListFeature>

    var body: some View {
        NavigationStack {
            Group {
                if store.isLoading {
                    ProgressView()
                } else {
                    List {
                        ForEach(store.users) { user in
                            Text(user.name)
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                store.send(.deleteUser(store.users[index]))
                            }
                        }
                    }
                }
            }
            .navigationTitle("Users")
        }
        .onAppear { store.send(.onAppear) }
        .alert($store.scope(state: \.alert, action: \.alert))
    }
}
```

### TCA Testing

```swift
@Test func loadUsersOnAppear() async {
    let store = TestStore(initialState: UserListFeature.State()) {
        UserListFeature()
    } withDependencies: {
        $0.userClient.fetch = { [User(id: UUID(), name: "Test", email: "test@test.com")] }
    }

    await store.send(.onAppear) {
        $0.isLoading = true
    }

    await store.receive(\.usersResponse.success) {
        $0.isLoading = false
        $0.users = [User(id: UUID(), name: "Test", email: "test@test.com")]
    }
}
```

## Pattern 3: Clean Architecture

For apps requiring strict separation and domain isolation.

### Layer Structure

```
Domain/           # Pure Swift, no frameworks
├── Entities/
│   └── User.swift
├── UseCases/
│   └── GetUsersUseCase.swift
└── Repositories/
    └── UserRepositoryProtocol.swift

Data/             # Implementation details
├── Repositories/
│   └── UserRepository.swift
├── DataSources/
│   ├── Remote/
│   │   └── UserRemoteDataSource.swift
│   └── Local/
│       └── UserLocalDataSource.swift
└── Mappers/
    └── UserMapper.swift

Presentation/     # SwiftUI Views + ViewModels
├── Users/
│   ├── UserListViewModel.swift
│   └── UserListView.swift
└── DI/
    └── Container.swift
```

### Key Principle

Dependencies point inward. Domain knows nothing about Data or Presentation.

```swift
// Domain Layer - Pure protocols
protocol UserRepository {
    func getUsers() async throws -> [User]
}

struct GetUsersUseCase {
    private let repository: UserRepository

    init(repository: UserRepository) {
        self.repository = repository
    }

    func execute() async throws -> [User] {
        try await repository.getUsers()
    }
}

// Data Layer - Implements domain protocols
final class UserRepositoryImpl: UserRepository {
    private let remoteDataSource: UserRemoteDataSource
    private let localDataSource: UserLocalDataSource

    func getUsers() async throws -> [User] {
        // Try cache first, then remote
        if let cached = try? await localDataSource.getUsers(), !cached.isEmpty {
            return cached
        }
        let users = try await remoteDataSource.getUsers()
        try? await localDataSource.save(users)
        return users
    }
}

// Presentation Layer - Uses domain use cases
@Observable
class UserListViewModel {
    private let getUsersUseCase: GetUsersUseCase
    // ...
}
```

## Best Practices Across All Patterns

### 1. Keep Views Dumb

Views should only:
- Render UI
- Forward user actions to ViewModel/Store
- Not contain business logic

### 2. Single Source of Truth

One owner for each piece of state. Others get read-only access or bindings.

### 3. Unidirectional Data Flow

```
User Action → ViewModel/Reducer → State Update → View Re-render
```

### 4. Testable by Design

- Inject dependencies (protocols/DI containers)
- Keep side effects isolated
- Make state observable

### 5. Not Everything Needs a ViewModel

Simple views (pure UI components) don't need ViewModels:

```swift
// This is fine - no ViewModel needed
struct UserAvatarView: View {
    let user: User

    var body: some View {
        AsyncImage(url: user.avatarURL) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Image(systemName: "person.circle.fill")
        }
        .frame(width: 50, height: 50)
        .clipShape(Circle())
    }
}
```
