import AppIntents
import Foundation

enum CodexWidgetHostTarget: String, AppEnum, Codable, CaseIterable, Sendable {
  case selected
  case mac
  case windows

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Computer"
  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .selected: "Selected computer",
    .mac: "Mac",
    .windows: "Windows",
  ]
}

enum CodexWidgetCommand: String, AppEnum, Codable, CaseIterable, Sendable {
  case fast = "FAST"
  case approve = "APPR"
  case reject = "REJ"
  case split = "SPLIT"
  case microphone = "MIC"
  case codex = "CODEX"
  case feedback = "BUG"
  case openAIDocs = "OAI"
  case terminal = "TERM"
  case copyMarkdown = "DWN"
  case archive = "DEL"
  case newTask = "NEW"
  case browser = "NAV"
  case pin = "MAGIC"
  case review = "DIFF"
  case run = "PLAY"
  case gitCommit = "GIT"
  case branchReview = "BRCH"
  case mergeReview = "MRG"
  case pullRequest = "PR"
  case photos = "PAINT"
  case lab = "LAB"
  case sideChat = "PARTY"
  case manageTasks = "TIME"
  case reasoningUp = "MIND+"
  case reasoningDown = "MIND-"
  case settings = "SETUP"
  case folder = "FOLD"
  case files = "UPL"
  case skills = "APPS"
  case rateLimitReset = "RATE_LIMIT_RESET"

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Codex command"
  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .fast: "Fast mode",
    .approve: "Approve",
    .reject: "Reject",
    .split: "Fork chat",
    .microphone: "Dictation",
    .codex: "Codex / submit",
    .feedback: "Feedback",
    .openAIDocs: "OpenAI docs",
    .terminal: "Terminal",
    .copyMarkdown: "Copy Markdown",
    .archive: "Archive chat",
    .newTask: "New task",
    .browser: "Browser",
    .pin: "Pin chat",
    .review: "Review",
    .run: "Run action",
    .gitCommit: "Git commit",
    .branchReview: "Branch review",
    .mergeReview: "Merge review",
    .pullRequest: "Create pull request",
    .photos: "Add photos",
    .lab: "Lab / settings",
    .sideChat: "Side chat",
    .manageTasks: "Manage tasks",
    .reasoningUp: "Reasoning up",
    .reasoningDown: "Reasoning down",
    .settings: "Settings",
    .folder: "Open folder",
    .files: "Add files",
    .skills: "Skills",
    .rateLimitReset: "Reset usage limit",
  ]

  var name: String {
    String(localized: Self.caseDisplayRepresentations[self]?.title ?? "Codex command")
  }

  var symbol: String {
    switch self {
    case .fast: "bolt.fill"
    case .approve: "checkmark.circle"
    case .reject: "xmark.circle"
    case .split, .branchReview: "arrow.triangle.branch"
    case .microphone: "mic.fill"
    case .codex: "chevron.left.forwardslash.chevron.right"
    case .feedback: "ladybug.fill"
    case .openAIDocs: "book.closed.fill"
    case .terminal: "terminal"
    case .copyMarkdown: "arrow.down.doc.fill"
    case .archive: "archivebox.fill"
    case .newTask: "plus.bubble.fill"
    case .browser: "safari.fill"
    case .pin: "pin.fill"
    case .review: "doc.text.magnifyingglass"
    case .run: "play.fill"
    case .gitCommit: "point.3.connected.trianglepath.dotted"
    case .mergeReview: "arrow.triangle.merge"
    case .pullRequest: "arrow.up.right.square.fill"
    case .photos: "photo.on.rectangle.angled"
    case .lab: "flask.fill"
    case .sideChat: "bubble.left.and.bubble.right.fill"
    case .manageTasks: "clock.fill"
    case .reasoningUp: "brain.head.profile.fill"
    case .reasoningDown: "brain.head.profile"
    case .settings: "gearshape.fill"
    case .folder: "folder.fill"
    case .files: "paperclip"
    case .skills: "square.grid.2x2.fill"
    case .rateLimitReset: "arrow.counterclockwise"
    }
  }
}

struct PendingCodexWidgetCommand: Codable, Equatable, Sendable {
  let id: UUID
  let createdAt: Date
  let command: CodexWidgetCommand
  let target: CodexWidgetHostTarget
}

enum CodexWidgetCommandHandoff {
  private static let key = "pending-widget-command-v1"

  static func enqueue(command: CodexWidgetCommand, target: CodexWidgetHostTarget) {
    let request = PendingCodexWidgetCommand(
      id: UUID(), createdAt: .now, command: command, target: target)
    UserDefaults.standard.set(try? JSONEncoder().encode(request), forKey: key)
  }

  static func pending() -> PendingCodexWidgetCommand? {
    guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(PendingCodexWidgetCommand.self, from: data)
  }

  static func clear(_ id: UUID) {
    guard pending()?.id == id else { return }
    UserDefaults.standard.removeObject(forKey: key)
  }
}

struct RunCodexWidgetCommandIntent: AppIntent {
  static let title: LocalizedStringResource = "Run Codex command"
  static let description = IntentDescription("Run a native Codex Micro command on a paired computer.")
  static let openAppWhenRun = true

  @Parameter(title: "Command")
  var command: CodexWidgetCommand

  @Parameter(title: "Computer")
  var target: CodexWidgetHostTarget

  init() {
    command = .fast
    target = .selected
  }

  init(command: CodexWidgetCommand, target: CodexWidgetHostTarget) {
    self.command = command
    self.target = target
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    CodexWidgetCommandHandoff.enqueue(command: command, target: target)
    return .result(dialog: "Sending \(command.name).")
  }
}

struct SingleCommandWidgetConfiguration: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Codex command"
  static let description = IntentDescription("Choose one Codex command and its target computer.")

  @Parameter(title: "Command", default: .fast)
  var command: CodexWidgetCommand

  @Parameter(title: "Computer", default: .selected)
  var target: CodexWidgetHostTarget
}

struct CommandDeckWidgetConfiguration: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Codex control deck"
  static let description = IntentDescription("Choose four Codex commands for a compact control deck.")

  @Parameter(title: "Computer", default: .selected)
  var target: CodexWidgetHostTarget

  @Parameter(title: "Key 1", default: .fast)
  var first: CodexWidgetCommand

  @Parameter(title: "Key 2", default: .approve)
  var second: CodexWidgetCommand

  @Parameter(title: "Key 3", default: .reject)
  var third: CodexWidgetCommand

  @Parameter(title: "Key 4", default: .split)
  var fourth: CodexWidgetCommand

  var commands: [CodexWidgetCommand] { [first, second, third, fourth] }
}
