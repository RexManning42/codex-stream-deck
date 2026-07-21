import Foundation

enum MobileLayoutProfile: String, CaseIterable, Codable, Identifiable, Sendable {
  case automatic
  case coding
  case review
  case mobile

  var id: String { rawValue }

  var title: String {
    switch self {
    case .automatic: "Automatic"
    case .coding: "Coding"
    case .review: "Review"
    case .mobile: "Mobile"
    }
  }

  var symbol: String {
    switch self {
    case .automatic: "wand.and.stars"
    case .coding: "hammer.fill"
    case .review: "doc.text.magnifyingglass"
    case .mobile: "iphone"
    }
  }

  var detail: String {
    switch self {
    case .automatic: "Newest agents and the computer's native lower keys"
    case .coding: "Standard build controls; agent order follows Codex Micro"
    case .review: "Review and pull-request controls; agent order follows Codex Micro"
    case .mobile: "Compact commands; agent order follows Codex Micro"
    }
  }

  func defaultKeycapID(for slot: DeviceKeySlot) -> String {
    guard self != .automatic else { return slot.defaultKeycapID }
    return switch (self, slot) {
    case (.review, .action1): "DIFF"
    case (.review, .action2): "APPR"
    case (.review, .action3): "REJ"
    case (.review, .action4): "BRCH"
    case (.review, .wide): "MRG"
    case (.review, .corner): "PR"
    case (.mobile, .action1): "FAST"
    case (.mobile, .action2): "APPR"
    case (.mobile, .action3): "REJ"
    case (.mobile, .action4): "NEW"
    case (.mobile, .wide): "MIC"
    case (.mobile, .corner): "CODEX"
    default: slot.defaultKeycapID
    }
  }
}

struct MobileAgentPlacement: Identifiable, Sendable {
  let position: Int
  let reference: AgentReference?
  let agent: RoutedAgent?

  var id: Int { position }
}
