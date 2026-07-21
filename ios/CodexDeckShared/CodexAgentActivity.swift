import ActivityKit
import Foundation

struct CodexAgentActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    let title: String
    let status: String
    let hostName: String
    let hostLabel: String
    let activityAt: Date?
    let contextUsedPercent: Double?
    let updatedAt: Date
    let isFresh: Bool
  }

  let threadIdentity: String
  let fallbackTitle: String
  let fallbackPlatform: String
}

enum CodexAgentActivityLink {
  static func url(
    threadIdentity: String,
    fallbackTitle: String,
    fallbackPlatform: String
  ) -> URL? {
    var components = URLComponents()
    components.scheme = "codexdeck"
    components.host = "agent"
    components.path = "/\(threadIdentity)"
    components.queryItems = [
      URLQueryItem(name: "title", value: fallbackTitle),
      URLQueryItem(name: "platform", value: fallbackPlatform),
    ]
    return components.url
  }
}
