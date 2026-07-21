import Foundation

struct KeycapDefinition: Identifiable, Hashable, Sendable {
  let id: String
  let name: String
  let symbol: String
}

enum DeviceKeySlot: String, CaseIterable, Codable, Identifiable, Sendable {
  case action1
  case action2
  case action3
  case action4
  case wide
  case corner

  var id: String { rawValue }

  var nativeActionSlot: String {
    switch self {
    case .action1: "ACT06"
    case .action2: "ACT07"
    case .action3: "ACT08"
    case .action4: "ACT09"
    case .wide: "ACT10_ACT11"
    case .corner: "ACT12"
    }
  }

  var defaultKeycapID: String {
    switch self {
    case .action1: "FAST"
    case .action2: "APPR"
    case .action3: "REJ"
    case .action4: "SPLIT"
    case .wide: "MIC"
    case .corner: "CODEX"
    }
  }

  var displayName: String {
    switch self {
    case .action1: "Lower key 1"
    case .action2: "Lower key 2"
    case .action3: "Lower key 3"
    case .action4: "Lower key 4"
    case .wide: "Wide key"
    case .corner: "Codex key"
    }
  }
}

enum KeycapCatalog {
  static let all: [KeycapDefinition] = [
    .init(id: "FAST", name: "Fast mode", symbol: "bolt.fill"),
    .init(id: "APPR", name: "Approve", symbol: "checkmark.circle"),
    .init(id: "REJ", name: "Reject", symbol: "xmark.circle"),
    .init(id: "SPLIT", name: "Fork chat", symbol: "arrow.triangle.branch"),
    .init(id: "MIC", name: "Dictation", symbol: "mic.fill"),
    .init(id: "CODEX", name: "Codex / submit", symbol: "chevron.left.forwardslash.chevron.right"),
    .init(id: "BUG", name: "Feedback", symbol: "ladybug.fill"),
    .init(id: "OAI", name: "OpenAI docs", symbol: "book.closed.fill"),
    .init(id: "TERM", name: "Terminal", symbol: "terminal"),
    .init(id: "DWN", name: "Copy Markdown", symbol: "arrow.down.doc.fill"),
    .init(id: "DEL", name: "Archive chat", symbol: "archivebox.fill"),
    .init(id: "NEW", name: "New task", symbol: "plus.bubble.fill"),
    .init(id: "NAV", name: "Browser", symbol: "safari.fill"),
    .init(id: "MAGIC", name: "Pin chat", symbol: "pin.fill"),
    .init(id: "DIFF", name: "Review", symbol: "doc.text.magnifyingglass"),
    .init(id: "PLAY", name: "Run action", symbol: "play.fill"),
    .init(id: "GIT", name: "Git commit", symbol: "point.3.connected.trianglepath.dotted"),
    .init(id: "BRCH", name: "Branch review", symbol: "arrow.triangle.branch"),
    .init(id: "MRG", name: "Merge review", symbol: "arrow.triangle.merge"),
    .init(id: "PR", name: "Create pull request", symbol: "arrow.up.right.square.fill"),
    .init(id: "PAINT", name: "Add photos", symbol: "photo.on.rectangle.angled"),
    .init(id: "LAB", name: "Lab / settings", symbol: "flask.fill"),
    .init(id: "PARTY", name: "Side chat", symbol: "bubble.left.and.bubble.right.fill"),
    .init(id: "TIME", name: "Manage tasks", symbol: "clock.fill"),
    .init(id: "MIND+", name: "Reasoning up", symbol: "brain.head.profile.fill"),
    .init(id: "MIND-", name: "Reasoning down", symbol: "brain.head.profile"),
    .init(id: "SETUP", name: "Settings", symbol: "gearshape.fill"),
    .init(id: "FOLD", name: "Open folder", symbol: "folder.fill"),
    .init(id: "UPL", name: "Add files", symbol: "paperclip"),
    .init(id: "APPS", name: "Skills", symbol: "square.grid.2x2.fill"),
  ]

  static func definition(for id: String) -> KeycapDefinition? {
    all.first { $0.id == id }
  }
}
