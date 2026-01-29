# SwiftUI Performance Optimization

## Understanding the Render Cycle

SwiftUI re-renders views when:
1. `@State` or `@Binding` values change
2. `@Observable` properties accessed in `body` change
3. Parent view re-renders (even if child's data didn't change)
4. Environment values change

**Key insight:** SwiftUI calls `body` frequently. Keep it lightweight.

## Lazy Containers

### LazyVStack vs VStack

```swift
// VStack: Creates ALL children immediately
// Use for small lists (<20 items)
VStack {
    ForEach(items) { item in
        ItemRow(item: item)  // All 1000 rows created at once!
    }
}

// LazyVStack: Creates children on-demand
// Use for large lists (>20 items)
ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ItemRow(item: item)  // Only visible rows created
        }
    }
}
```

**Memory impact:** LazyVStack can reduce memory by 80-90% for large lists.

### List Performance

`List` is optimized with cell reuse (like UITableView). It outperforms `LazyVStack` for:
- Large datasets (1000+ items)
- Complex row layouts
- Memory-constrained situations

```swift
// Best for large data sets
List(items) { item in
    ItemRow(item: item)
}

// With sections
List {
    ForEach(sections) { section in
        Section(section.title) {
            ForEach(section.items) { item in
                ItemRow(item: item)
            }
        }
    }
}
```

### Critical: Don't Break Lazy Loading

```swift
// WRONG: .id() modifier breaks lazy loading
LazyVStack {
    ForEach(items) { item in
        ItemRow(item: item)
            .id(item.id)  // Forces all views to be created!
    }
}

// RIGHT: Let ForEach handle identity
LazyVStack {
    ForEach(items) { item in  // items must be Identifiable
        ItemRow(item: item)
    }
}
```

### LazyVGrid and LazyHGrid

```swift
let columns = [
    GridItem(.adaptive(minimum: 150))  // Auto-fit columns
]

ScrollView {
    LazyVGrid(columns: columns, spacing: 16) {
        ForEach(items) { item in
            ItemCard(item: item)
        }
    }
    .padding()
}
```

## Minimizing View Updates

### Break Views into Small Components

```swift
// WRONG: Entire view re-renders when any state changes
struct BadListView: View {
    @State private var items: [Item] = []
    @State private var searchText = ""
    @State private var isLoading = false
    @State private var selectedItem: Item?

    var body: some View {
        VStack {
            TextField("Search", text: $searchText)

            if isLoading {
                ProgressView()
            } else {
                List(filteredItems) { item in
                    // Complex row content inline
                    HStack {
                        AsyncImage(url: item.imageURL)
                        VStack {
                            Text(item.title)
                            Text(item.subtitle)
                        }
                    }
                }
            }
        }
    }
}

// RIGHT: Isolated components re-render independently
struct GoodListView: View {
    @State private var viewModel = ListViewModel()

    var body: some View {
        VStack {
            SearchBar(text: $viewModel.searchText)
            ItemListContent(viewModel: viewModel)
        }
    }
}

struct SearchBar: View {
    @Binding var text: String
    var body: some View {
        TextField("Search", text: $text)
    }
}

struct ItemListContent: View {
    var viewModel: ListViewModel
    var body: some View {
        if viewModel.isLoading {
            ProgressView()
        } else {
            List(viewModel.filteredItems) { item in
                ItemRow(item: item)  // Extracted component
            }
        }
    }
}

struct ItemRow: View {
    let item: Item
    var body: some View {
        HStack {
            ItemImage(url: item.imageURL)
            ItemInfo(item: item)
        }
    }
}
```

### Use Equatable for Custom Comparison

```swift
struct ExpensiveView: View, Equatable {
    let data: ComplexData

    static func == (lhs: ExpensiveView, rhs: ExpensiveView) -> Bool {
        // Only compare what matters for rendering
        lhs.data.id == rhs.data.id && lhs.data.displayName == rhs.data.displayName
    }

    var body: some View {
        // Complex view
    }
}

// Usage
ExpensiveView(data: data)
    .equatable()  // SwiftUI uses Equatable comparison
```

## Expensive Operations

### Move Computation Out of body

```swift
// WRONG: Computed every render
var body: some View {
    let sorted = items.sorted { $0.date > $1.date }
    let filtered = sorted.filter { $0.isActive }
    List(filtered) { item in
        ItemRow(item: item)
    }
}

// RIGHT: Memoize or compute elsewhere
@Observable
class ViewModel {
    var items: [Item] = []
    var sortOrder: SortOrder = .date

    var displayItems: [Item] {
        items.filter { $0.isActive }.sorted(by: sortOrder.comparator)
    }
}

var body: some View {
    List(viewModel.displayItems) { item in
        ItemRow(item: item)
    }
}
```

### Use .task for Async Work

```swift
// WRONG: onAppear can fire multiple times, blocks main thread
.onAppear {
    Task { await loadData() }  // Task created every appear
}

// RIGHT: .task manages lifecycle automatically
.task {
    await loadData()  // Cancelled if view disappears
}

// With id parameter - re-runs when id changes
.task(id: selectedCategory) {
    await loadItems(for: selectedCategory)
}
```

### Image Loading

```swift
// Use AsyncImage with proper caching
struct OptimizedImageView: View {
    let url: URL

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .empty:
                ProgressView()
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            case .failure:
                Image(systemName: "photo")
            @unknown default:
                EmptyView()
            }
        }
    }
}

// For better control, use dedicated image loading library
// (Kingfisher, SDWebImage, Nuke)
```

## Expensive Modifiers

### Avoid in Scroll Views

These trigger offscreen rendering - use sparingly in lists:

```swift
// EXPENSIVE in scrolling contexts
.blur(radius: 10)
.shadow(radius: 5)
.mask { ... }
.opacity(0.5)  // Less bad, but still impacts

// BETTER: Apply to container, not individual rows
List {
    ForEach(items) { item in
        ItemRow(item: item)  // No expensive modifiers here
    }
}
.blur(radius: isBlurred ? 10 : 0)  // Applied once to whole list
```

### Pre-render Complex Shapes

```swift
// WRONG: Complex path computed every frame
var body: some View {
    Path { path in
        // Complex drawing code
    }
    .fill(gradient)
}

// RIGHT: Cache as image for repeated use
@State private var cachedImage: Image?

var body: some View {
    Group {
        if let image = cachedImage {
            image
        } else {
            complexShape
                .task { cacheShape() }
        }
    }
}
```

## Animation Performance

### Use Explicit Animations

```swift
// WRONG: Implicit animations can cascade
withAnimation {
    showDetail = true
    selectedItem = item
    // Multiple state changes = multiple animations
}

// RIGHT: Explicit, targeted animations
Button("Show") {
    withAnimation(.spring(duration: 0.3)) {
        showDetail = true
    }
}
```

### Animate Only What's Needed

```swift
// WRONG: Animates entire view hierarchy
List(items) { item in
    ItemRow(item: item)
}
.animation(.default, value: items)  // Re-animates everything

// RIGHT: Animate specific properties
ItemRow(item: item)
    .opacity(item.isNew ? 1 : 0.8)
    .animation(.easeIn(duration: 0.2), value: item.isNew)
```

### Use drawingGroup for Complex Graphics

```swift
// For complex vector graphics or many overlapping views
ZStack {
    ForEach(particles) { particle in
        Circle()
            .fill(particle.color)
            .frame(width: particle.size, height: particle.size)
            .position(particle.position)
    }
}
.drawingGroup()  // Flattens into single bitmap - GPU accelerated
```

## Profiling

### Instruments

1. **SwiftUI View Body** - Shows body calls and duration
2. **Core Animation** - Frame rate, offscreen rendering
3. **Allocations** - Memory usage patterns

### Debug Flags

```swift
// In scheme arguments
-UITraceViewBody 1  // Log body evaluations

// In code
let _ = Self._printChanges()  // Add to body to see what caused re-render
```

### Quick Performance Checklist

- [ ] Using List/LazyVStack for long lists?
- [ ] No `.id()` on lazy container children?
- [ ] Heavy computation moved out of body?
- [ ] Using `.task` instead of `.onAppear` for async?
- [ ] No blur/shadow/mask in scroll views?
- [ ] Views broken into small, focused components?
- [ ] Equatable implemented where beneficial?
- [ ] Images loading with caching?

## Benchmarks

| Scenario | VStack | LazyVStack | List |
|----------|--------|------------|------|
| 100 simple rows | 20ms | 25ms | 15ms |
| 1000 simple rows | 200ms | 30ms | 20ms |
| 1000 complex rows | 2s+ | 150ms | 50ms |
| Memory (1000 rows) | 100MB | 15MB | 10MB |

*List is generally the best choice for scrolling content.*
