import SwiftUI

struct DashboardView: View {
  @Environment(DashboardStore.self) private var store
  @State private var resetConfirmation = false

  var body: some View {
    @Bindable var store = store
    ZStack(alignment: .bottom) {
      CodexTheme.canvas.ignoresSafeArea()
      ScrollView {
        LazyVStack(spacing: 22) {
          HeaderView()
          if store.profiles.isEmpty {
            PairingWelcome()
          } else {
            UsageHero(resetConfirmation: $resetConfirmation)
            AgentGrid()
            MicroConsole()
          }
          Color.clear.frame(height: 16)
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
      }
      .scrollIndicators(.hidden)

      if let toast = store.toast {
        Text(toast.message)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .padding(.horizontal, 16)
          .padding(.vertical, 11)
          .background(toast.kind == .success ? CodexTheme.ink : CodexTheme.red, in: Capsule())
          .shadow(radius: 12, y: 6)
          .padding(.bottom, 12)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .tint(CodexTheme.ink)
    .sheet(isPresented: $store.showingSettings) { SettingsView() }
    .confirmationDialog(
      "Use one rate-limit reset?", isPresented: $resetConfirmation, titleVisibility: .visible
    ) {
      Button("Use reset", role: .destructive) { Task { await store.resetRateLimit() } }
    } message: {
      Text("This sends the same authenticated reset command as the Stream Deck button.")
    }
    .animation(.snappy, value: store.toast)
  }
}

private struct HeaderView: View {
  @Environment(DashboardStore.self) private var store

  var body: some View {
    HStack(spacing: 12) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text("CODEX")
          .font(.system(size: 28, weight: .black, design: .rounded))
          .tracking(1.5)
        Text("MICRO")
          .font(.caption.weight(.bold))
          .tracking(3)
          .foregroundStyle(CodexTheme.secondary)
      }
      Spacer()
      ConnectionPill()
      Button {
        store.showingSettings = true
      } label: {
        Image(systemName: "gearshape.fill")
          .font(.system(size: 18, weight: .semibold))
          .frame(width: 42, height: 42)
          .background(.white.opacity(0.72), in: Circle())
      }
      .accessibilityLabel("Connection settings")
    }
    .foregroundStyle(CodexTheme.ink)
  }
}

private struct ConnectionPill: View {
  @Environment(DashboardStore.self) private var store

  var body: some View {
    let ready = store.connectedCount
    HStack(spacing: 6) {
      Circle()
        .fill(
          ready == store.expectedCount && ready > 0
            ? CodexTheme.green : ready > 0 ? CodexTheme.orange : CodexTheme.red
        )
        .frame(width: 8, height: 8)
      Text(store.expectedCount == 0 ? "SET UP" : "\(ready)/\(store.expectedCount)")
        .font(.caption2.weight(.bold))
        .monospacedDigit()
    }
    .padding(.horizontal, 10)
    .frame(height: 32)
    .background(.white.opacity(0.72), in: Capsule())
  }
}

private struct PairingWelcome: View {
  @Environment(DashboardStore.self) private var store

  var body: some View {
    VStack(spacing: 18) {
      Image(systemName: "iphone.and.arrow.forward")
        .font(.system(size: 44, weight: .light))
      Text("Bring Codex Micro with you")
        .font(.title2.bold())
      Text(
        "Pair your Mac and Windows nodes over Tailscale. Status stays fast, commands stay authenticated, and Chrome DevTools never leaves either computer."
      )
      .font(.subheadline)
      .foregroundStyle(CodexTheme.secondary)
      .multilineTextAlignment(.center)
      .lineSpacing(3)
      Button("Pair first computer") { store.showingSettings = true }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }
    .padding(28)
    .frame(maxWidth: .infinity)
    .background(.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
  }
}

private struct UsageHero: View {
  @Environment(DashboardStore.self) private var store
  @Binding var resetConfirmation: Bool

  var body: some View {
    let usage = store.usageSource?.snapshot.usage
    let fiveHour = usage?.windows.first(where: { $0.kind == "five-hour" })
    let weekly = usage?.windows.first(where: { $0.kind == "weekly" })
    VStack(spacing: 16) {
      SectionLabel("Account capacity", detail: freshness(usage?.observedAt))
      HStack(spacing: 20) {
        UsageRing(value: weekly?.remainingPercent, title: "WEEKLY")
        VStack(spacing: 13) {
          UsageBar(title: "5 HOUR", value: fiveHour?.remainingPercent, tint: CodexTheme.blue)
          UsageBar(
            title: "WEEKLY", value: weekly?.remainingPercent,
            tint: capacityColor(weekly?.remainingPercent))
          HStack {
            Label(
              "\(usage?.resetCreditsAvailable ?? 0) resets", systemImage: "arrow.counterclockwise"
            )
            .font(.caption.weight(.semibold))
            .monospacedDigit()
            Spacer()
            Button("Use") { resetConfirmation = true }
              .font(.caption.bold())
              .disabled(
                (usage?.resetCreditsAvailable ?? 0) <= 0 || usage?.resetCreditsApplicable == 0)
          }
        }
      }
    }
    .padding(20)
    .background(.white.opacity(0.76), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
  }

  private func freshness(_ timestamp: Double?) -> String? {
    guard let timestamp else { return "Waiting for usage" }
    return Date(timeIntervalSince1970: timestamp / 1000).formatted(
      .relative(presentation: .numeric))
  }

  private func capacityColor(_ value: Double?) -> Color {
    guard let value else { return CodexTheme.secondary }
    return value < 20 ? CodexTheme.red : value < 40 ? CodexTheme.orange : CodexTheme.green
  }
}

private struct UsageRing: View {
  let value: Double?
  let title: String

  var body: some View {
    let fraction = min(max((value ?? 0) / 100, 0), 1)
    ZStack {
      Circle().stroke(CodexTheme.panel, lineWidth: 11)
      Circle()
        .trim(from: 0, to: fraction)
        .stroke(
          value.map { $0 < 20 ? CodexTheme.red : CodexTheme.green } ?? CodexTheme.secondary,
          style: StrokeStyle(lineWidth: 11, lineCap: .round)
        )
        .rotationEffect(.degrees(-90))
      VStack(spacing: 1) {
        Text(value.map { "\(Int($0.rounded()))" } ?? "–")
          .font(.system(size: 34, weight: .bold, design: .rounded))
          .monospacedDigit()
        Text(title).font(.system(size: 8, weight: .bold)).tracking(1)
      }
    }
    .frame(width: 112, height: 112)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(title) remaining")
    .accessibilityValue(value.map { "\(Int($0.rounded())) percent" } ?? "Unavailable")
  }
}

private struct UsageBar: View {
  let title: String
  let value: Double?
  let tint: Color

  var body: some View {
    VStack(spacing: 5) {
      HStack {
        Text(title).font(.system(size: 9, weight: .bold)).tracking(1)
        Spacer()
        Text(value.map { "\(Int($0.rounded()))%" } ?? "—")
          .font(.caption.weight(.bold)).monospacedDigit()
      }
      GeometryReader { proxy in
        Capsule().fill(CodexTheme.panel)
          .overlay(alignment: .leading) {
            Capsule().fill(tint).frame(width: proxy.size.width * min(max((value ?? 0) / 100, 0), 1))
          }
      }
      .frame(height: 8)
    }
  }
}

private struct AgentGrid: View {
  @Environment(DashboardStore.self) private var store
  private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

  var body: some View {
    VStack(spacing: 12) {
      SectionLabel("Live agents", detail: "Newest across Mac + Windows")
      LazyVGrid(columns: columns, spacing: 12) {
        ForEach(0..<6, id: \.self) { index in
          if let agent = store.agents.first(where: { $0.id == index }) {
            AgentCard(agent: agent)
          } else {
            EmptyAgentCard(index: index)
          }
        }
      }
    }
  }
}

private struct AgentCard: View {
  @Environment(DashboardStore.self) private var store
  let agent: RoutedAgent

  var body: some View {
    let hostState = store.connectionState(for: agent.host.hostId)
    Button {
      Task { await store.activate(agent) }
    } label: {
      VStack(alignment: .leading, spacing: 13) {
        HStack {
          ZStack {
            Circle().fill(CodexTheme.statusColor(agent.status).opacity(0.15)).frame(
              width: 34, height: 34)
            Image(systemName: statusSymbol).font(.system(size: 15, weight: .bold))
          }
          Spacer()
          Text(agent.host.platform.shortLabel)
            .font(.caption2.weight(.black))
            .frame(width: 23, height: 23)
            .background(hostState == .ready ? CodexTheme.ink : CodexTheme.red, in: Circle())
            .foregroundStyle(.white)
        }
        Text(agent.title)
          .font(.subheadline.weight(.semibold))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity, alignment: .leading)
        HStack(spacing: 6) {
          Circle().fill(CodexTheme.statusColor(agent.status)).frame(width: 7, height: 7)
          Text(hostState == .offline ? "OFFLINE" : statusTitle)
            .font(.caption2.weight(.bold)).foregroundStyle(
              hostState == .offline ? CodexTheme.red : CodexTheme.secondary
            )
          Spacer()
          if agent.selected { Image(systemName: "viewfinder").font(.caption2) }
        }
      }
      .padding(15)
      .frame(minHeight: 150)
      .background(.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay(alignment: .leading) {
        if agent.isAttention {
          Capsule().fill(CodexTheme.statusColor(agent.status)).frame(width: 4).padding(
            .vertical, 18)
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityHint("Opens this task on \(agent.host.hostName)")
  }

  private var statusSymbol: String {
    if ["working", "thinking"].contains(agent.status) { return "sparkles" }
    if ["approval", "awaiting-approval", "awaiting-response"].contains(agent.status) {
      return "hand.raised.fill"
    }
    if agent.status == "error" { return "exclamationmark" }
    if ["unread", "complete", "completed", "done"].contains(agent.status) { return "checkmark" }
    return "circle.fill"
  }

  private var statusTitle: String {
    agent.status.replacingOccurrences(of: "-", with: " ").uppercased()
  }
}

private struct EmptyAgentCard: View {
  let index: Int
  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: "plus").font(.title3.weight(.semibold))
      Text("SLOT \(index + 1)").font(.caption2.bold()).tracking(1)
    }
    .foregroundStyle(CodexTheme.secondary.opacity(0.6))
    .frame(maxWidth: .infinity, minHeight: 150)
    .background(.white.opacity(0.42), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
  }
}

private struct MicroConsole: View {
  @Environment(DashboardStore.self) private var store

  var body: some View {
    VStack(spacing: 16) {
      HStack {
        SectionLabel("Micro console")
        Spacer()
        HostPicker()
      }
      VStack(spacing: 13) {
        HStack(spacing: 12) {
          ConsoleButton(title: "Fast", symbol: "bolt.fill") { await store.pressAction("ACT06") }
          ConsoleButton(title: "Approve", symbol: "checkmark.circle") {
            await store.pressAction("ACT07")
          }
          ConsoleButton(title: "Decline", symbol: "xmark.circle") {
            await store.pressAction("ACT08")
          }
          ConsoleButton(title: "Fork", symbol: "arrow.triangle.branch") {
            await store.pressAction("ACT09")
          }
        }
        HStack(spacing: 12) {
          ConsoleButton(title: "Back", symbol: "chevron.left") { await store.pressJoystick("left") }
          ConsoleButton(title: "Plan", symbol: "list.bullet.clipboard") {
            await store.pressJoystick("up")
          }
          ConsoleButton(title: "New", symbol: "plus.bubble") {
            await store.trigger(.keycap(id: "NEW"))
          }
          ConsoleButton(title: "Send", symbol: "arrow.up.circle.fill") {
            await store.pressAction("ACT12")
          }
        }
        HStack(spacing: 12) {
          Button {
            Task { await store.trigger(.reasoning(direction: "decrease")) }
          } label: {
            Image(systemName: "minus").font(.title3.bold())
          }.buttonStyle(HardwareKeyStyle())
          VStack(spacing: 3) {
            Image(systemName: "brain.head.profile").font(.title2)
            Text("REASONING").font(.system(size: 8, weight: .bold)).tracking(1)
          }
          .frame(maxWidth: .infinity, minHeight: 62)
          Button {
            Task { await store.trigger(.reasoning(direction: "increase")) }
          } label: {
            Image(systemName: "plus").font(.title3.bold())
          }.buttonStyle(HardwareKeyStyle())
        }
      }
      .padding(16)
      .background(CodexTheme.panel, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(
          .white.opacity(0.8), lineWidth: 2))
      Text("LET’S BUILD")
        .font(.system(size: 8, weight: .bold)).tracking(2)
        .foregroundStyle(CodexTheme.secondary)
    }
  }
}

private struct ConsoleButton: View {
  let title: String
  let symbol: String
  let action: () async -> Void

  var body: some View {
    Button {
      Task { await action() }
    } label: {
      VStack(spacing: 5) {
        Image(systemName: symbol).font(.system(size: 19, weight: .semibold))
        Text(title.uppercased()).font(.system(size: 7, weight: .bold)).lineLimit(1)
      }
    }
    .buttonStyle(HardwareKeyStyle())
  }
}

private struct HostPicker: View {
  @Environment(DashboardStore.self) private var store
  var body: some View {
    HStack(spacing: 4) {
      ForEach(store.nodes.values.compactMap(\.host).uniqued(), id: \.hostId) { host in
        Button(host.platform.shortLabel) { store.selectHost(host) }
          .font(.caption2.weight(.black))
          .frame(width: 28, height: 28)
          .background(
            store.selectedHost?.hostId == host.hostId ? CodexTheme.ink : .white.opacity(0.7),
            in: Circle()
          )
          .foregroundStyle(store.selectedHost?.hostId == host.hostId ? .white : CodexTheme.ink)
          .accessibilityLabel("Control \(host.platform.displayName)")
      }
    }
  }
}

extension Array where Element == CodexHost {
  fileprivate func uniqued() -> [CodexHost] {
    var seen = Set<String>()
    return filter { seen.insert($0.hostId).inserted }
  }
}

#Preview("Dual host dashboard") {
  DashboardView()
    .environment(DashboardStore(defaults: UserDefaults(suiteName: "preview-dashboard")!))
}
