import Foundation

enum AttentionEventKind: String, Codable, CaseIterable, Sendable {
  case approval
  case response
  case completion
  case error
  case unread

  init?(status: String) {
    switch status {
    case "approval", "awaiting-approval": self = .approval
    case "awaiting-response": self = .response
    case "complete", "completed", "done": self = .completion
    case "error": self = .error
    case "unread": self = .unread
    default: return nil
    }
  }

  var title: String {
    switch self {
    case .approval: "Approval needed"
    case .response: "Response needed"
    case .completion: "Task completed"
    case .error: "Task failed"
    case .unread: "Unread update"
    }
  }

  var symbol: String {
    switch self {
    case .approval: "hand.raised.fill"
    case .response: "bubble.left.and.exclamationmark.bubble.right.fill"
    case .completion: "checkmark.circle.fill"
    case .error: "exclamationmark.triangle.fill"
    case .unread: "circle.fill"
    }
  }
}

struct AttentionEvent: Identifiable, Codable, Hashable, Sendable {
  let id: UUID
  let kind: AttentionEventKind
  let threadIdentity: String
  let title: String
  let hostID: String
  let hostName: String
  let platform: HostPlatform
  let occurredAt: Date
  var isRead: Bool

  var reference: AgentReference {
    AgentReference(
      threadIdentity: threadIdentity, fallbackTitle: title, fallbackPlatform: platform)
  }
}

struct AttentionObservation: Codable, Hashable, Sendable {
  let kind: AttentionEventKind?
  let completionRevision: Int?
  let observedAt: Date
}

enum AttentionFilter: String, CaseIterable, Identifiable, Sendable {
  case all
  case mac
  case windows
  case approval
  case response
  case completion
  case error
  case unread

  var id: String { rawValue }
  var title: String {
    switch self {
    case .all: "All"
    case .mac: "Mac"
    case .windows: "Windows"
    case .approval: "Approval"
    case .response: "Response"
    case .completion: "Done"
    case .error: "Errors"
    case .unread: "Updates"
    }
  }

  func includes(_ event: AttentionEvent) -> Bool {
    switch self {
    case .all: true
    case .mac: event.platform == .darwin
    case .windows: event.platform == .win32
    case .approval: event.kind == .approval
    case .response: event.kind == .response
    case .completion: event.kind == .completion
    case .error: event.kind == .error
    case .unread: event.kind == .unread
    }
  }
}
