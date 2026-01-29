# SwiftData Persistence

SwiftData is Apple's modern persistence framework, replacing Core Data for new projects.

## Basic Setup

### Define a Model

```swift
import SwiftData

@Model
class Task {
    var title: String
    var isCompleted: Bool
    var createdAt: Date
    var priority: Priority
    var notes: String?

    // Relationships
    @Relationship(deleteRule: .cascade)
    var subtasks: [Subtask] = []

    @Relationship(inverse: \Category.tasks)
    var category: Category?

    init(title: String, priority: Priority = .medium) {
        self.title = title
        self.isCompleted = false
        self.createdAt = Date()
        self.priority = priority
    }
}

enum Priority: String, Codable, CaseIterable {
    case low, medium, high
}

@Model
class Subtask {
    var title: String
    var isCompleted: Bool

    init(title: String) {
        self.title = title
        self.isCompleted = false
    }
}

@Model
class Category {
    @Attribute(.unique) var name: String
    var color: String

    @Relationship(deleteRule: .nullify)
    var tasks: [Task] = []

    init(name: String, color: String = "blue") {
        self.name = name
        self.color = color
    }
}
```

### Configure the Container

```swift
@main
struct TaskApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Task.self, Category.self])
    }
}

// With custom configuration
@main
struct TaskApp: App {
    let container: ModelContainer

    init() {
        let schema = Schema([Task.self, Category.self])
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )

        do {
            container = try ModelContainer(for: schema, configurations: config)
        } catch {
            fatalError("Failed to configure SwiftData: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(container)
    }
}
```

## Querying Data

### Basic @Query

```swift
struct TaskListView: View {
    // Fetch all tasks
    @Query var tasks: [Task]

    // With sorting
    @Query(sort: \Task.createdAt, order: .reverse)
    var recentTasks: [Task]

    // With filtering
    @Query(filter: #Predicate<Task> { !$0.isCompleted })
    var incompleteTasks: [Task]

    // Combined
    @Query(
        filter: #Predicate<Task> { $0.priority == .high && !$0.isCompleted },
        sort: \Task.createdAt,
        order: .reverse
    )
    var urgentTasks: [Task]

    var body: some View {
        List(tasks) { task in
            TaskRow(task: task)
        }
    }
}
```

### Dynamic Queries

```swift
struct FilteredTaskList: View {
    let showCompleted: Bool

    // Dynamic predicate based on view state
    init(showCompleted: Bool) {
        self.showCompleted = showCompleted
        let predicate: Predicate<Task>? = showCompleted
            ? nil
            : #Predicate { !$0.isCompleted }
        _tasks = Query(filter: predicate, sort: \Task.createdAt)
    }

    @Query private var tasks: [Task]

    var body: some View {
        List(tasks) { task in
            TaskRow(task: task)
        }
    }
}
```

### Search

```swift
struct SearchableTaskList: View {
    @State private var searchText = ""

    var body: some View {
        TaskResults(searchText: searchText)
            .searchable(text: $searchText)
    }
}

struct TaskResults: View {
    let searchText: String

    init(searchText: String) {
        self.searchText = searchText
        if searchText.isEmpty {
            _tasks = Query(sort: \Task.title)
        } else {
            _tasks = Query(
                filter: #Predicate<Task> { task in
                    task.title.localizedStandardContains(searchText)
                },
                sort: \Task.title
            )
        }
    }

    @Query private var tasks: [Task]

    var body: some View {
        List(tasks) { task in
            Text(task.title)
        }
    }
}
```

## CRUD Operations

### Create

```swift
struct AddTaskView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var priority: Priority = .medium

    var body: some View {
        Form {
            TextField("Title", text: $title)
            Picker("Priority", selection: $priority) {
                ForEach(Priority.allCases, id: \.self) { p in
                    Text(p.rawValue.capitalized).tag(p)
                }
            }
        }
        .toolbar {
            Button("Save") {
                let task = Task(title: title, priority: priority)
                context.insert(task)
                // SwiftData auto-saves, but you can force it:
                // try? context.save()
                dismiss()
            }
            .disabled(title.isEmpty)
        }
    }
}
```

### Read & Update

```swift
struct TaskDetailView: View {
    @Bindable var task: Task  // @Bindable for editing

    var body: some View {
        Form {
            TextField("Title", text: $task.title)

            Toggle("Completed", isOn: $task.isCompleted)

            Picker("Priority", selection: $task.priority) {
                ForEach(Priority.allCases, id: \.self) { p in
                    Text(p.rawValue.capitalized).tag(p)
                }
            }

            Section("Subtasks") {
                ForEach(task.subtasks) { subtask in
                    SubtaskRow(subtask: subtask)
                }
            }
        }
        // Changes auto-saved by SwiftData
    }
}
```

### Delete

```swift
struct TaskListView: View {
    @Environment(\.modelContext) private var context
    @Query var tasks: [Task]

    var body: some View {
        List {
            ForEach(tasks) { task in
                TaskRow(task: task)
            }
            .onDelete(perform: deleteTasks)
        }
    }

    private func deleteTasks(at offsets: IndexSet) {
        for index in offsets {
            context.delete(tasks[index])
        }
    }
}
```

## Relationships

### One-to-Many

```swift
@Model
class Author {
    var name: String

    @Relationship(deleteRule: .cascade)  // Delete books when author deleted
    var books: [Book] = []

    init(name: String) {
        self.name = name
    }
}

@Model
class Book {
    var title: String

    @Relationship(inverse: \Author.books)
    var author: Author?

    init(title: String) {
        self.title = title
    }
}

// Usage
let author = Author(name: "J.K. Rowling")
let book = Book(title: "Harry Potter")
book.author = author  // Automatically adds to author.books
context.insert(author)
```

### Many-to-Many

```swift
@Model
class Tag {
    var name: String

    @Relationship(inverse: \Article.tags)
    var articles: [Article] = []

    init(name: String) {
        self.name = name
    }
}

@Model
class Article {
    var title: String
    var tags: [Tag] = []

    init(title: String) {
        self.title = title
    }
}

// Usage
let article = Article(title: "SwiftUI Tips")
let swiftTag = Tag(name: "Swift")
let uiTag = Tag(name: "UI")
article.tags.append(contentsOf: [swiftTag, uiTag])
```

### Delete Rules

| Rule | Behavior |
|------|----------|
| `.cascade` | Delete related objects |
| `.nullify` | Set relationship to nil |
| `.deny` | Prevent deletion if related objects exist |
| `.noAction` | Do nothing (can cause orphans) |

## Attributes

### Common Attributes

```swift
@Model
class User {
    // Unique constraint
    @Attribute(.unique)
    var email: String

    // External storage for large data
    @Attribute(.externalStorage)
    var profileImage: Data?

    // Spotlight indexing
    @Attribute(.spotlight)
    var name: String

    // Transient (not persisted)
    @Transient
    var isSelected: Bool = false

    // Encrypted
    @Attribute(.allowsCloudEncryption)
    var sensitiveData: String?

    init(email: String, name: String) {
        self.email = email
        self.name = name
    }
}
```

## Migration

### Automatic Migration

SwiftData handles simple migrations automatically:
- Adding new properties with defaults
- Removing properties
- Renaming (with hints)

### Versioned Schema

```swift
enum SchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version = .init(1, 0, 0)
    static var models: [any PersistentModel.Type] { [Task.self] }

    @Model
    class Task {
        var title: String
        var isCompleted: Bool
    }
}

enum SchemaV2: VersionedSchema {
    static var versionIdentifier: Schema.Version = .init(2, 0, 0)
    static var models: [any PersistentModel.Type] { [Task.self] }

    @Model
    class Task {
        var title: String
        var isCompleted: Bool
        var priority: String  // NEW
    }
}

enum TaskMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [SchemaV1.self, SchemaV2.self]
    }

    static var stages: [MigrationStage] {
        [migrateV1toV2]
    }

    static let migrateV1toV2 = MigrationStage.custom(
        fromVersion: SchemaV1.self,
        toVersion: SchemaV2.self
    ) { context in
        let tasks = try context.fetch(FetchDescriptor<SchemaV2.Task>())
        for task in tasks {
            task.priority = "medium"  // Default value
        }
        try context.save()
    }
}

// Use in app
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(
            for: SchemaV2.Task.self,
            migrationPlan: TaskMigrationPlan.self
        )
    }
}
```

## Background Operations

### Performing Work in Background

```swift
actor DataManager {
    private let container: ModelContainer

    init(container: ModelContainer) {
        self.container = container
    }

    func importData(_ items: [ImportItem]) async throws {
        let context = ModelContext(container)
        context.autosaveEnabled = false

        for item in items {
            let task = Task(title: item.title)
            context.insert(task)
        }

        try context.save()
    }

    func fetchTasks(matching predicate: Predicate<Task>) async throws -> [Task] {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<Task>(predicate: predicate)
        return try context.fetch(descriptor)
    }
}
```

## Best Practices

### 1. Keep Models Simple

```swift
// GOOD: Clean model
@Model
class Item {
    var name: String
    var price: Decimal
    var quantity: Int
}

// AVOID: Business logic in model
@Model
class Item {
    var name: String
    var price: Decimal
    var quantity: Int

    func calculateTotal() -> Decimal { ... }  // Move to ViewModel
    func validate() -> Bool { ... }  // Move to ViewModel
}
```

### 2. Use Computed Properties for Derived Data

```swift
@Model
class Order {
    var items: [OrderItem] = []

    var total: Decimal {
        items.reduce(0) { $0 + $1.subtotal }
    }

    var itemCount: Int {
        items.reduce(0) { $0 + $1.quantity }
    }
}
```

### 3. Handle Optionals Properly

```swift
@Model
class Profile {
    var name: String
    var bio: String?  // Optional for nullable fields
    var avatar: Data?

    // Provide defaults where sensible
    var displayName: String {
        name.isEmpty ? "Anonymous" : name
    }
}
```

### 4. Test with In-Memory Store

```swift
@Test func createTask() throws {
    let config = ModelConfiguration(isStoredInMemoryOnly: true)
    let container = try ModelContainer(for: Task.self, configurations: config)
    let context = container.mainContext

    let task = Task(title: "Test")
    context.insert(task)

    let tasks = try context.fetch(FetchDescriptor<Task>())
    #expect(tasks.count == 1)
}
```
