import ActivityKit
import SwiftUI
import WidgetKit

private enum LiveAgentPalette {
  static let blue = Color(red: 0.13, green: 0.53, blue: 0.98)
  static let green = Color(red: 0.18, green: 0.83, blue: 0.44)
  static let orange = Color(red: 1.0, green: 0.61, blue: 0.13)
  static let red = Color(red: 1.0, green: 0.27, blue: 0.36)

  static func status(_ value: String, stale: Bool) -> Color {
    if stale || value == "unavailable" { return .secondary }
    if ["working", "thinking"].contains(value) { return blue }
    if ["approval", "awaiting-approval", "awaiting-response"].contains(value) { return orange }
    if ["unread", "complete", "completed", "done"].contains(value) { return green }
    if value == "error" { return red }
    return .secondary
  }

  static func symbol(_ value: String) -> String {
    if ["working", "thinking"].contains(value) { return "waveform.path.ecg" }
    if ["approval", "awaiting-approval", "awaiting-response"].contains(value) {
      return "hand.raised.fill"
    }
    if ["unread", "complete", "completed", "done"].contains(value) {
      return "checkmark"
    }
    if value == "error" { return "exclamationmark" }
    if value == "unavailable" { return "wifi.slash" }
    return "circle.fill"
  }
}

struct CodexAgentLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CodexAgentActivityAttributes.self) { context in
      LockScreenAgentView(context: context)
        .activityBackgroundTint(Color.black.opacity(0.84))
        .activitySystemActionForegroundColor(.white)
        .widgetURL(link(for: context))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HostPill(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          ContextGauge(percent: context.state.contextUsedPercent, size: 34)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.title)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 8) {
            StatusLabel(state: context.state, isStale: context.isStale)
            Spacer()
            if let activityAt = context.state.activityAt {
              Text(activityAt, style: .relative)
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
          }
        }
      } compactLeading: {
        Image(systemName: LiveAgentPalette.symbol(context.state.status))
          .foregroundStyle(color(for: context))
      } compactTrailing: {
        Text(context.state.hostLabel)
          .font(.caption2.weight(.black))
          .foregroundStyle(color(for: context))
      } minimal: {
        Circle()
          .fill(color(for: context))
          .frame(width: 9, height: 9)
      }
      .widgetURL(link(for: context))
      .keylineTint(color(for: context))
    }
  }

  private func color(for context: ActivityViewContext<CodexAgentActivityAttributes>) -> Color {
    LiveAgentPalette.status(
      context.state.status,
      stale: context.isStale || !context.state.isFresh)
  }

  private func link(for context: ActivityViewContext<CodexAgentActivityAttributes>) -> URL? {
    CodexAgentActivityLink.url(
      threadIdentity: context.attributes.threadIdentity,
      fallbackTitle: context.attributes.fallbackTitle,
      fallbackPlatform: context.attributes.fallbackPlatform)
  }
}

private struct LockScreenAgentView: View {
  let context: ActivityViewContext<CodexAgentActivityAttributes>

  var body: some View {
    let stale = context.isStale || !context.state.isFresh
    let tint = LiveAgentPalette.status(context.state.status, stale: stale)
    HStack(spacing: 13) {
      ZStack {
        Circle().fill(tint.opacity(0.18))
        Image(systemName: LiveAgentPalette.symbol(context.state.status))
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(tint)
      }
      .frame(width: 42, height: 42)

      VStack(alignment: .leading, spacing: 4) {
        Text(context.state.title)
          .font(.subheadline.weight(.bold))
          .foregroundStyle(.white)
          .lineLimit(1)
        HStack(spacing: 6) {
          StatusLabel(state: context.state, isStale: stale)
          Text("•")
          Text(context.state.hostName)
            .lineLimit(1)
        }
        .font(.caption2)
        .foregroundStyle(.white.opacity(0.66))
      }

      Spacer(minLength: 4)
      ContextGauge(percent: context.state.contextUsedPercent, size: 44)
    }
    .padding(.horizontal, 15)
    .padding(.vertical, 11)
  }
}

private struct HostPill: View {
  let state: CodexAgentActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 5) {
      Image(systemName: state.hostLabel == "M" ? "laptopcomputer" : "desktopcomputer")
      Text(state.hostLabel).fontWeight(.black)
    }
    .font(.caption2)
  }
}

private struct StatusLabel: View {
  let state: CodexAgentActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    HStack(spacing: 4) {
      Circle()
        .fill(LiveAgentPalette.status(state.status, stale: isStale))
        .frame(width: 6, height: 6)
      Text(isStale ? "Last known" : state.status.replacingOccurrences(of: "-", with: " ").capitalized)
        .lineLimit(1)
    }
  }
}

private struct ContextGauge: View {
  let percent: Double?
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle().stroke(.white.opacity(0.16), lineWidth: 3)
      if let percent {
        Circle()
          .trim(from: 0, to: max(0, min(percent / 100, 1)))
          .stroke(contextColor(percent), style: StrokeStyle(lineWidth: 3, lineCap: .round))
          .rotationEffect(.degrees(-90))
        Text("\(Int(percent.rounded()))")
          .font(.system(size: size * 0.25, weight: .black, design: .rounded))
          .monospacedDigit()
      } else {
        Text("–").font(.caption.weight(.bold))
      }
    }
    .frame(width: size, height: size)
  }

  private func contextColor(_ value: Double) -> Color {
    if value >= 92 { return LiveAgentPalette.red }
    if value >= 80 { return LiveAgentPalette.orange }
    return LiveAgentPalette.blue
  }
}
