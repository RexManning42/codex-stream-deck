import Foundation

enum HostPlatform: String, Codable, Sendable {
  case win32
  case darwin

  var shortLabel: String { self == .darwin ? "M" : "W" }
  var displayName: String { self == .darwin ? "Mac" : "Windows" }
}

struct CodexHost: Codable, Hashable, Sendable, Identifiable {
  let hostId: String
  let hostName: String
  let platform: HostPlatform
  var id: String { hostId }
}

struct AgentSlot: Codable, Hashable, Sendable, Identifiable {
  let id: Int
  let threadKey: String?
  let title: String?
  let status: String
  let selected: Bool
  let activityAt: Double?
  let ownedByHost: Bool?
}

struct HostSessionPresence: Codable, Hashable, Sendable {
  let threadId: String
  let activityAt: Double
  let status: String
  let completionRevision: Int?
}

struct UsageWindow: Codable, Hashable, Sendable, Identifiable {
  let id: String
  let kind: String
  let usedPercent: Double
  let remainingPercent: Double
  let windowDurationMins: Double?
  let resetsAt: Double?
}

struct UsageSnapshot: Codable, Hashable, Sendable {
  let windows: [UsageWindow]
  let observedAt: Double
  let resetCreditsAvailable: Int?
  let resetCreditsApplicable: Int?
}

struct MicroLayout: Codable, Hashable, Sendable {
  struct Slot: Codable, Hashable, Sendable {
    let keycapId: String
    let commandId: String?
  }

  let version: Int
  let slots: [String: Slot]
}

struct MicroSnapshot: Codable, Hashable, Sendable {
  let slots: [AgentSlot]
  let activeThreadKey: String?
  let layout: MicroLayout
  let agentSource: String
  let lightingAutoOff: String
  let theme: String
  let usage: UsageSnapshot?
  let hostSessions: [HostSessionPresence]?
}

struct HostSnapshot: Codable, Hashable, Sendable {
  let host: CodexHost
  let observedAt: Double
  let snapshot: MicroSnapshot
}

struct RoutedAgent: Identifiable, Hashable, Sendable {
  let id: Int
  let threadKey: String
  let title: String
  let status: String
  let selected: Bool
  let activityAt: Double
  let host: CodexHost
  let sourceSlot: Int

  var isAttention: Bool {
    ["approval", "awaiting-approval", "awaiting-response", "error", "unread"].contains(status)
  }
}

enum RelayCommand: Encodable, Sendable {
  case agent(slot: Int, threadKey: String, act: Int)
  case action(slot: String, act: Int)
  case joystick(direction: String, distance: Int)
  case encoder(act: Int)
  case reasoning(direction: String)
  case rateLimitReset
  case keycap(id: String)

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .agent(let slot, let threadKey, let act):
      try values.encode("agent", forKey: .kind)
      try values.encode(slot, forKey: .slot)
      try values.encode(threadKey, forKey: .threadKey)
      try values.encode(act, forKey: .act)
    case .action(let slot, let act):
      try values.encode("action", forKey: .kind)
      try values.encode(slot, forKey: .slot)
      try values.encode(act, forKey: .act)
    case .joystick(let direction, let distance):
      try values.encode("joystick", forKey: .kind)
      try values.encode(direction, forKey: .direction)
      try values.encode(distance, forKey: .distance)
    case .encoder(let act):
      try values.encode("encoder", forKey: .kind)
      try values.encode(act, forKey: .act)
    case .reasoning(let direction):
      try values.encode("reasoning", forKey: .kind)
      try values.encode(direction, forKey: .direction)
    case .rateLimitReset:
      try values.encode("rate-limit-reset", forKey: .kind)
    case .keycap(let id):
      try values.encode("keycap", forKey: .kind)
      try values.encode(id, forKey: .keycapId)
    }
  }

  private enum CodingKeys: String, CodingKey {
    case kind, slot, threadKey, act, direction, distance, keycapId
  }
}

struct NodeProfile: Codable, Hashable, Identifiable, Sendable {
  let id: UUID
  var name: String
  var url: URL
  var tokenKey: String { "relay-token-\(id.uuidString)" }
}

enum NodeConnectionState: String, Sendable {
  case connecting
  case ready
  case degraded
  case offline
}

struct NodeStatus: Sendable {
  var state: NodeConnectionState = .offline
  var host: CodexHost?
  var snapshot: HostSnapshot?
  var detail: String?
  var changedAt = Date()
}

enum RelayServerEvent: Decodable, Sendable {
  case ready(CodexHost)
  case snapshot(HostSnapshot)
  case health(CodexHost, String, Double)
  case result(String, Bool, String?)

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    guard try values.decode(Int.self, forKey: .protocol) == 1 else {
      throw DecodingError.dataCorruptedError(
        forKey: .protocol, in: values, debugDescription: "Unsupported relay protocol")
    }
    switch try values.decode(String.self, forKey: .type) {
    case "ready":
      self = .ready(try values.decode(CodexHost.self, forKey: .host))
    case "snapshot":
      self = .snapshot(
        HostSnapshot(
          host: try values.decode(CodexHost.self, forKey: .host),
          observedAt: try values.decode(Double.self, forKey: .observedAt),
          snapshot: try values.decode(MicroSnapshot.self, forKey: .snapshot)
        ))
    case "health":
      self = .health(
        try values.decode(CodexHost.self, forKey: .host),
        try values.decode(String.self, forKey: .reason),
        try values.decode(Double.self, forKey: .observedAt)
      )
    case "result":
      self = .result(
        try values.decode(String.self, forKey: .requestId),
        try values.decode(Bool.self, forKey: .ok),
        try values.decodeIfPresent(String.self, forKey: .error)
      )
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .type, in: values, debugDescription: "Unknown relay message")
    }
  }

  private enum CodingKeys: String, CodingKey {
    case type, `protocol`, host, observedAt, snapshot, reason, requestId, ok, error
  }
}
