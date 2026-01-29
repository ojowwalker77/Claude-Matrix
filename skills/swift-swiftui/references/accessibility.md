# SwiftUI Accessibility

## Core Principles

1. **Every interactive element** needs an accessibility label
2. **Images** need descriptions or should be decorative
3. **Dynamic Type** should be supported
4. **Color** should never be the only indicator
5. **Focus order** should be logical

## VoiceOver Support

### Accessibility Labels

```swift
// Text is automatically read
Text("Hello World")  // VoiceOver: "Hello World"

// Buttons with text
Button("Submit") { ... }  // VoiceOver: "Submit, button"

// Image-only buttons NEED labels
Button(action: share) {
    Image(systemName: "square.and.arrow.up")
}
.accessibilityLabel("Share")  // VoiceOver: "Share, button"

// Custom controls
Slider(value: $volume, in: 0...100)
    .accessibilityLabel("Volume")
    .accessibilityValue("\(Int(volume)) percent")
```

### Accessibility Hints

Describe what happens when activated:

```swift
Button("Delete") { deleteItem() }
    .accessibilityLabel("Delete")
    .accessibilityHint("Removes this item permanently")
// VoiceOver: "Delete, button. Removes this item permanently."
```

### Accessibility Traits

```swift
// Common traits
Text("Error: Invalid email")
    .accessibilityAddTraits(.isStaticText)

Button("Play") { ... }
    .accessibilityAddTraits(.startsMediaSession)

Toggle("Notifications", isOn: $enabled)
    // Toggle already has correct traits

// Headers for navigation
Text("Settings")
    .font(.headline)
    .accessibilityAddTraits(.isHeader)
// Allows VoiceOver users to navigate by headers
```

### Grouping Elements

```swift
// WRONG: Each element read separately
HStack {
    Image(systemName: "star.fill")
    Text("4.5")
    Text("(128 reviews)")
}
// VoiceOver: "star fill image", "4.5", "128 reviews" - confusing!

// RIGHT: Combine into single element
HStack {
    Image(systemName: "star.fill")
    Text("4.5")
    Text("(128 reviews)")
}
.accessibilityElement(children: .combine)
.accessibilityLabel("Rating: 4.5 stars, 128 reviews")
// VoiceOver: "Rating: 4.5 stars, 128 reviews"
```

### Ignoring Decorative Elements

```swift
// Decorative images
Image("decorative-pattern")
    .accessibilityHidden(true)

// Redundant elements
HStack {
    Image(systemName: "person.fill")
        .accessibilityHidden(true)  // Icon is redundant
    Text("Profile")
}
```

### Custom Actions

```swift
struct TodoRow: View {
    let todo: Todo
    let onDelete: () -> Void
    let onToggle: () -> Void

    var body: some View {
        HStack {
            Text(todo.title)
            Spacer()
            // These buttons might be hard to discover
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(todo.title)
        .accessibilityValue(todo.isCompleted ? "Completed" : "Not completed")
        .accessibilityActions {
            Button("Toggle completion") { onToggle() }
            Button("Delete", role: .destructive) { onDelete() }
        }
    }
}
```

## Dynamic Type

### Using System Fonts

```swift
// GOOD: Scales automatically
Text("Hello")
    .font(.body)       // Scales
    .font(.headline)   // Scales
    .font(.caption)    // Scales

// BAD: Fixed size
Text("Hello")
    .font(.system(size: 16))  // Won't scale!

// Custom font with scaling
Text("Hello")
    .font(.custom("Helvetica", size: 16, relativeTo: .body))
```

### Testing Dynamic Type

```swift
// In previews
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ContentView()
                .environment(\.sizeCategory, .extraSmall)

            ContentView()
                .environment(\.sizeCategory, .accessibilityExtraExtraExtraLarge)
        }
    }
}
```

### Handling Large Text

```swift
struct AdaptiveStack<Content: View>: View {
    @Environment(\.dynamicTypeSize) var dynamicTypeSize
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack { content }  // Stack vertically for large text
        } else {
            HStack { content }  // Normal horizontal layout
        }
    }
}

// Usage
AdaptiveStack {
    Image(systemName: "star")
    Text("Rating")
}
```

### Limiting Text Size

```swift
// When truly necessary (rare!)
Text("Logo")
    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
```

## Color and Contrast

### Don't Rely on Color Alone

```swift
// WRONG: Color is only indicator
Circle()
    .fill(status == .error ? .red : .green)

// RIGHT: Include text/icon
HStack {
    Image(systemName: status == .error ? "xmark.circle" : "checkmark.circle")
    Text(status == .error ? "Error" : "Success")
}
.foregroundStyle(status == .error ? .red : .green)
```

### Sufficient Contrast

Use semantic colors that adapt to appearance:

```swift
// System colors adapt automatically
Text("Important")
    .foregroundStyle(.primary)    // High contrast
Text("Secondary info")
    .foregroundStyle(.secondary)  // Medium contrast

// For custom colors, provide variants
extension Color {
    static let brandPrimary = Color("BrandPrimary")  // Define in Assets
}
```

### Reduce Motion

```swift
struct AnimatedView: View {
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    var body: some View {
        Image(systemName: "star")
            .rotationEffect(.degrees(reduceMotion ? 0 : 360))
            .animation(
                reduceMotion ? nil : .linear(duration: 2).repeatForever(),
                value: reduceMotion
            )
    }
}
```

## Focus Management

### Focus Order

```swift
struct Form: View {
    enum Field: Hashable {
        case firstName, lastName, email
    }

    @FocusState private var focusedField: Field?
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""

    var body: some View {
        VStack {
            TextField("First Name", text: $firstName)
                .focused($focusedField, equals: .firstName)
                .accessibilitySortPriority(3)  // Higher = first

            TextField("Last Name", text: $lastName)
                .focused($focusedField, equals: .lastName)
                .accessibilitySortPriority(2)

            TextField("Email", text: $email)
                .focused($focusedField, equals: .email)
                .accessibilitySortPriority(1)

            Button("Submit") { submit() }
        }
        .onAppear { focusedField = .firstName }
    }
}
```

### Announcing Changes

```swift
// Announce dynamic content changes
func showError(_ message: String) {
    errorMessage = message
    UIAccessibility.post(
        notification: .announcement,
        argument: message
    )
}

// Announce screen changes
func navigateToDetail() {
    UIAccessibility.post(
        notification: .screenChanged,
        argument: "Item detail view"
    )
}
```

## Lists and Tables

### List Accessibility

```swift
List(items) { item in
    ItemRow(item: item)
        .accessibilityLabel(item.title)
        .accessibilityHint("Double tap to view details")
        .accessibilityActions {
            Button("Edit") { edit(item) }
            Button("Delete", role: .destructive) { delete(item) }
        }
}
```

### Rotor Actions

```swift
List(items) { item in
    ItemRow(item: item)
        .accessibilityCustomContent("Price", item.formattedPrice)
        .accessibilityCustomContent("Rating", "\(item.rating) stars")
}
// Users can access custom content via VoiceOver rotor
```

## Testing Accessibility

### Accessibility Inspector

1. Open Xcode → Open Developer Tool → Accessibility Inspector
2. Point at elements to see their labels, hints, traits
3. Test VoiceOver navigation order

### Automated Testing

```swift
import XCTest

func testAccessibility() {
    let app = XCUIApplication()
    app.launch()

    // Check element exists and is accessible
    let submitButton = app.buttons["Submit"]
    XCTAssertTrue(submitButton.exists)
    XCTAssertTrue(submitButton.isEnabled)

    // Check accessibility label
    XCTAssertEqual(submitButton.label, "Submit")
}
```

### Manual Testing Checklist

- [ ] Enable VoiceOver, navigate entire screen
- [ ] Verify all interactive elements have labels
- [ ] Test with largest Dynamic Type setting
- [ ] Test with Reduce Motion enabled
- [ ] Test with Increase Contrast enabled
- [ ] Verify focus order is logical
- [ ] Check color is not the only indicator

## Common Patterns

### Cards

```swift
struct ProductCard: View {
    let product: Product

    var body: some View {
        VStack(alignment: .leading) {
            AsyncImage(url: product.imageURL)
                .accessibilityHidden(true)  // Image is decorative

            Text(product.name)
                .font(.headline)

            Text(product.price)
                .font(.subheadline)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(product.name), \(product.price)")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Shows product details")
    }
}
```

### Forms

```swift
struct AccessibleForm: View {
    @State private var name = ""
    @State private var nameError: String?

    var body: some View {
        VStack(alignment: .leading) {
            Text("Name")
                .font(.caption)
                .accessibilityHidden(true)  // TextField has label

            TextField("Name", text: $name)
                .accessibilityLabel("Name, required field")

            if let error = nameError {
                Text(error)
                    .foregroundStyle(.red)
                    .accessibilityLabel("Error: \(error)")
            }
        }
    }
}
```

### Loading States

```swift
struct LoadingView: View {
    var body: some View {
        ProgressView("Loading...")
            .accessibilityLabel("Loading content, please wait")
    }
}

// After loading completes, announce it
func onLoadComplete() {
    UIAccessibility.post(notification: .announcement, argument: "Content loaded")
}
```

## Resources

- [Apple Human Interface Guidelines - Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [CVS Health iOS SwiftUI Accessibility Techniques](https://github.com/cvs-health/ios-swiftui-accessibility-techniques)
- WCAG 2.1 Guidelines
