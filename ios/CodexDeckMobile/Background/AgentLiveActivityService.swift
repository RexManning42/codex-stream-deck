import ActivityKit
import Foundation

enum AgentLiveActivityError: LocalizedError {
  case unavailable

  var errorDescription: String? {
    switch self {
    case .unavailable:
      "Live Activities are disabled for Codex Deck. Enable them in iPhone Settings."
    }
  }
}

@MainActor
final class AgentLiveActivityService {
  private var lastState: CodexAgentActivityAttributes.ContentState?
  private var lastPublishedAt: Date?

  func hasActivity(for threadIdentity: String) -> Bool {
    activity(for: threadIdentity) != nil
  }

  func start(
    reference: AgentReference,
    state: CodexAgentActivityAttributes.ContentState
  ) async throws {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      throw AgentLiveActivityError.unavailable
    }

    for activity in Activity<CodexAgentActivityAttributes>.activities
    where activity.attributes.threadIdentity != reference.threadIdentity {
      await activity.end(nil, dismissalPolicy: .immediate)
    }

    if let existing = activity(for: reference.threadIdentity) {
      lastState = nil
      lastPublishedAt = nil
      await publish(state, to: existing, force: true)
      return
    }

    let attributes = CodexAgentActivityAttributes(
      threadIdentity: reference.threadIdentity,
      fallbackTitle: reference.fallbackTitle,
      fallbackPlatform: reference.fallbackPlatform.rawValue)
    let content = ActivityContent(
      state: state,
      staleDate: state.isFresh ? state.updatedAt.addingTimeInterval(20) : .now)
    _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
    lastState = state
    lastPublishedAt = .now
  }

  func update(
    reference: AgentReference,
    state: CodexAgentActivityAttributes.ContentState
  ) async {
    guard let activity = activity(for: reference.threadIdentity) else { return }
    await publish(state, to: activity, force: false)
  }

  func end(
    reference: AgentReference,
    finalState: CodexAgentActivityAttributes.ContentState?,
    immediately: Bool
  ) async {
    guard let activity = activity(for: reference.threadIdentity) else { return }
    let content = finalState.map {
      ActivityContent(state: $0, staleDate: nil)
    }
    await activity.end(content, dismissalPolicy: immediately ? .immediate : .default)
    lastState = nil
    lastPublishedAt = nil
  }

  private func activity(for threadIdentity: String) -> Activity<CodexAgentActivityAttributes>? {
    Activity<CodexAgentActivityAttributes>.activities.first {
      $0.attributes.threadIdentity == threadIdentity
    }
  }

  private func publish(
    _ state: CodexAgentActivityAttributes.ContentState,
    to activity: Activity<CodexAgentActivityAttributes>,
    force: Bool
  ) async {
    let now = Date()
    let semanticChanged = lastState.map { !Self.displayEquivalent($0, state) } ?? true
    let freshnessRefreshDue = lastPublishedAt.map { now.timeIntervalSince($0) >= 12 } ?? true
    guard force || semanticChanged || freshnessRefreshDue else { return }

    let content = ActivityContent(
      state: state,
      staleDate: state.isFresh ? now.addingTimeInterval(20) : now)
    await activity.update(content)
    lastState = state
    lastPublishedAt = now
  }

  private static func displayEquivalent(
    _ left: CodexAgentActivityAttributes.ContentState,
    _ right: CodexAgentActivityAttributes.ContentState
  ) -> Bool {
    left.title == right.title
      && left.status == right.status
      && left.hostName == right.hostName
      && left.hostLabel == right.hostLabel
      && left.activityAt == right.activityAt
      && left.contextUsedPercent == right.contextUsedPercent
      && left.isFresh == right.isFresh
  }
}
