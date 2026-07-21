import SwiftUI

struct AgentDetailView: View {
  @Environment(DashboardStore.self) private var store
  let reference: AgentReference

  var body: some View {
    if let agent = store.agent(for: reference) {
      AgentDetailContent(agent: agent)
    } else {
      MissingAgentDetail(reference: reference)
    }
  }
}

private struct MissingAgentDetail: View {
  @Environment(DashboardStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  let reference: AgentReference

  var body: some View {
    NavigationStack {
      ContentUnavailableView {
        Label("Task unavailable", systemImage: "rectangle.slash")
      } description: {
        Text("\(reference.fallbackTitle) is no longer present in a fresh Codex snapshot.")
      } actions: {
        if store.followedAgentReference?.threadIdentity == reference.threadIdentity {
          Button("Stop following") { Task { await store.stopFollowing() } }
        }
      }
      .navigationTitle("Agent details")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
  }
}

private struct AgentDetailContent: View {
  @Environment(DashboardStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  let agent: RoutedAgent

  var body: some View {
    NavigationStack {
      ZStack {
        CodexBackdrop(accent: statusColor).ignoresSafeArea()
        ScrollView {
          VStack(spacing: 20) {
            identity
            detailCards
            VStack(spacing: 12) {
              openButton
              followButton
            }
          }
          .padding(.horizontal, 20)
          .padding(.top, 8)
          .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
      }
      .navigationTitle("Agent details")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
  }

  private var identity: some View {
    VStack(spacing: 14) {
      ZStack {
        Circle()
          .fill(statusColor.opacity(0.14))
        Circle()
          .stroke(statusColor.opacity(0.28), lineWidth: 1)
        Image(systemName: statusSymbol)
          .font(.system(size: 27, weight: .bold))
          .foregroundStyle(statusColor)
      }
      .frame(width: 72, height: 72)
      .shadow(color: statusColor.opacity(0.2), radius: 16)

      VStack(spacing: 7) {
        Text(agent.title)
          .font(.title2.weight(.bold))
          .multilineTextAlignment(.center)
          .textSelection(.enabled)
        HStack(spacing: 7) {
          Circle().fill(statusColor).frame(width: 8, height: 8)
          Text(statusTitle)
            .font(.caption.weight(.bold))
            .tracking(0.8)
          if agent.selected {
            Text("SELECTED")
              .font(.system(size: 8, weight: .black))
              .padding(.horizontal, 7)
              .padding(.vertical, 4)
              .background(statusColor.opacity(0.12), in: Capsule())
          }
        }
        .foregroundStyle(statusColor)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 18)
  }

  @ViewBuilder
  private var detailCards: some View {
    if #available(iOS 26.0, *) {
      GlassEffectContainer(spacing: 16) { cards }
    } else {
      cards
    }
  }

  private var cards: some View {
    VStack(spacing: 12) {
      HStack(spacing: 12) {
        DetailCard(
          title: "COMPUTER", value: agent.originPlatform.displayName,
          detail: agent.host.hostName, symbol: hostSymbol, tint: CodexTheme.blue)
        DetailCard(
          title: "ACTIVITY", value: activityTitle,
          detail: agent.selected ? "Open now" : "Last structural event",
          symbol: "clock", tint: statusColor)
      }

      HStack(spacing: 12) {
        ContextDetailCard(percent: agent.contextUsedPercent)
        DetailCard(
          title: "ROUTING", value: routingTitle,
          detail: routingDetail, symbol: "arrow.triangle.branch", tint: CodexTheme.ink)
      }
    }
  }

  @ViewBuilder
  private var openButton: some View {
    if #available(iOS 26.0, *) {
      Button {
        Task { await store.activate(agent) }
      } label: {
        Label("Open on \(agent.originPlatform.displayName)", systemImage: "arrow.up.forward.app.fill")
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 9)
      }
      .buttonStyle(.glassProminent)
      .tint(statusColor)
    } else {
      Button {
        Task { await store.activate(agent) }
      } label: {
        Label("Open on \(agent.originPlatform.displayName)", systemImage: "arrow.up.forward.app.fill")
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 9)
      }
      .buttonStyle(.borderedProminent)
      .tint(statusColor)
    }
  }

  @ViewBuilder
  private var followButton: some View {
    let following = store.isFollowing(agent)
    if following {
      Button {
        Task { await store.toggleFollow(agent) }
      } label: {
        Label("Stop following", systemImage: "xmark.circle")
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 9)
      }
      .buttonStyle(.bordered)
      .tint(CodexTheme.secondary)
    } else {
      Button {
        Task { await store.toggleFollow(agent) }
      } label: {
        Label("Follow on Lock Screen", systemImage: "dot.radiowaves.left.and.right")
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 9)
      }
      .buttonStyle(.borderedProminent)
      .tint(statusColor)
    }
  }

  private var statusColor: Color { CodexTheme.statusColor(agent.status) }
  private var statusTitle: String {
    agent.status.replacingOccurrences(of: "-", with: " ").uppercased()
  }
  private var statusSymbol: String {
    if ["working", "thinking"].contains(agent.status) { return "waveform.path.ecg" }
    if ["approval", "awaiting-approval", "awaiting-response"].contains(agent.status) {
      return "hand.raised.fill"
    }
    if ["unread", "complete", "completed", "done"].contains(agent.status) {
      return "checkmark"
    }
    if agent.status == "error" { return "exclamationmark" }
    return "circle.fill"
  }
  private var hostSymbol: String {
    agent.originPlatform == .darwin ? "laptopcomputer" : "desktopcomputer"
  }
  private var activityTitle: String {
    guard agent.activityAt > 0 else { return "Not reported" }
    return Date(timeIntervalSince1970: agent.activityAt / 1_000)
      .formatted(.relative(presentation: .numeric))
  }
  private var routingTitle: String {
    agent.originPlatform == agent.host.platform ? "Direct" : "Mirrored"
  }
  private var routingDetail: String {
    agent.originPlatform == agent.host.platform
      ? "Commands return to the owner"
      : "Shown here, routed to \(agent.originPlatform.displayName)"
  }
}

private struct DetailCard: View {
  let title: String
  let value: String
  let detail: String
  let symbol: String
  let tint: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        Text(title)
          .font(.system(size: 9, weight: .black, design: .rounded))
          .tracking(1.2)
          .foregroundStyle(CodexTheme.secondary)
        Spacer(minLength: 4)
        Image(systemName: symbol)
          .font(.caption.weight(.semibold))
          .foregroundStyle(tint)
      }
      Text(value)
        .font(.subheadline.weight(.bold))
        .lineLimit(2)
        .minimumScaleFactor(0.8)
      Text(detail)
        .font(.caption2)
        .foregroundStyle(CodexTheme.secondary)
        .lineLimit(2)
    }
    .padding(15)
    .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
    .codexGlassSurface(cornerRadius: 22, tint: tint.opacity(0.07))
  }
}

private struct ContextDetailCard: View {
  let percent: Double?

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Text("CONTEXT")
        .font(.system(size: 9, weight: .black, design: .rounded))
        .tracking(1.2)
        .foregroundStyle(CodexTheme.secondary)
      HStack(spacing: 10) {
        ZStack {
          Circle().stroke(CodexTheme.panel, lineWidth: 5)
          if let percent {
            Circle()
              .trim(from: 0, to: max(0, min(percent / 100, 1)))
              .stroke(contextColor, style: StrokeStyle(lineWidth: 5, lineCap: .round))
              .rotationEffect(.degrees(-90))
          }
          Text(percent.map { "\(Int($0.rounded()))" } ?? "–")
            .font(.caption.weight(.black))
            .monospacedDigit()
        }
        .frame(width: 48, height: 48)
        VStack(alignment: .leading, spacing: 3) {
          Text(percent == nil ? "Unavailable" : "\(Int((100 - (percent ?? 0)).rounded()))% free")
            .font(.subheadline.weight(.bold))
          Text("Current window")
            .font(.caption2)
            .foregroundStyle(CodexTheme.secondary)
        }
      }
    }
    .padding(15)
    .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
    .codexGlassSurface(cornerRadius: 22, tint: contextColor.opacity(0.07))
  }

  private var contextColor: Color {
    guard let percent else { return CodexTheme.secondary }
    if percent >= 92 { return CodexTheme.red }
    if percent >= 80 { return CodexTheme.orange }
    return CodexTheme.blue
  }
}
