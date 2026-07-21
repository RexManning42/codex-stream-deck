import Foundation
import UserNotifications

extension Notification.Name {
  static let codexAttentionOpened = Notification.Name("CodexDeckAttentionOpened")
}

final class AttentionNotificationService: NSObject, UNUserNotificationCenterDelegate,
  @unchecked Sendable
{
  static let shared = AttentionNotificationService()
  private let center = UNUserNotificationCenter.current()

  private override init() {
    super.init()
    center.delegate = self
  }

  func activate() {}

  func requestAuthorization() async -> Bool {
    (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) == true
  }

  func schedule(_ event: AttentionEvent, showTaskTitle: Bool) async {
    let content = UNMutableNotificationContent()
    content.title = event.kind.title
    content.body = showTaskTitle
      ? "\(event.title) · \(event.platform.displayName)"
      : "Open Codex Deck to view this \(event.platform.displayName) task."
    content.sound = .default
    content.threadIdentifier = event.threadIdentity
    content.categoryIdentifier = "CODEX_ATTENTION"
    content.userInfo = [
      "threadIdentity": event.threadIdentity,
      "title": event.title,
      "platform": event.platform.rawValue,
    ]
    let request = UNNotificationRequest(
      identifier: event.id.uuidString, content: content, trigger: nil)
    try? await center.add(request)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    let info = response.notification.request.content.userInfo
    guard let identity = info["threadIdentity"] as? String,
      let title = info["title"] as? String,
      let rawPlatform = info["platform"] as? String,
      let platform = HostPlatform(rawValue: rawPlatform)
    else { return }
    await MainActor.run {
      NotificationCenter.default.post(
        name: .codexAttentionOpened, object: nil,
        userInfo: ["reference": AgentReference(
          threadIdentity: identity, fallbackTitle: title, fallbackPlatform: platform)])
    }
  }
}
