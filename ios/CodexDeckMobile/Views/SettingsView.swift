import SwiftUI

struct SettingsView: View {
  @Environment(DashboardStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var adding = false
  @State private var deletingProfile: NodeProfile?
  @State private var showingAttention = false
  @State private var showingLayoutImport = false
  @State private var importedKeyCount: Int?
  @State private var diagnosticsProfile: NodeProfile?

  var body: some View {
    NavigationStack {
      List {
        Section {
          if store.profiles.isEmpty {
            ContentUnavailableView(
              "No computers paired", systemImage: "desktopcomputer.trianglebadge.exclamationmark",
              description: Text("Add both computers for the complete dual-host view."))
          }
          ForEach(store.profiles) { profile in
            NodeRow(
              profile: profile,
              showDiagnostics: { diagnosticsProfile = profile },
              remove: { deletingProfile = profile })
              .swipeActions {
                Button("Remove", role: .destructive) { deletingProfile = profile }
              }
          }
          .onDelete { offsets in
            offsets.map { store.profiles[$0] }.forEach(store.removeProfile)
          }
          Button {
            adding = true
          } label: {
            Label("Add computer", systemImage: "plus")
          }
        } header: {
          Text("Codex nodes")
        } footer: {
          Text(
            "The app merges Mac and Windows snapshots on-device. Commands go directly to the computer that owns the task."
          )
        }

        Section("Security") {
          Label("Tokens stored in Keychain", systemImage: "key.fill")
          Label("Pinned TLS for nearby computers", systemImage: "checkmark.shield.fill")
          Label("Secure WebSocket only", systemImage: "lock.fill")
          Label("No Chrome DevTools exposure", systemImage: "network.badge.shield.half.filled")
        }

        Section {
          Picker(
            "App layout",
            selection: Binding(
              get: { store.mobileLayoutProfile },
              set: { store.selectMobileLayout($0) })
          ) {
            ForEach(MobileLayoutProfile.allCases) { profile in
              Label(profile.title, systemImage: profile.symbol).tag(profile)
            }
          }

          LabeledContent {
            Text(store.mobileLayoutProfile.detail)
              .font(.caption)
              .foregroundStyle(CodexTheme.secondary)
              .multilineTextAlignment(.trailing)
          } label: {
            Label("Current profile", systemImage: store.mobileLayoutProfile.symbol)
          }

          LabeledContent("Agent mode", value: store.codexAgentModeTitle)

          Button {
            showingLayoutImport = true
          } label: {
            Label("Import keys from selected computer", systemImage: "square.and.arrow.down")
          }
          .disabled(store.selectedHost == nil)

          if let importedKeyCount {
            Label(
              "Imported \(importedKeyCount) lower key\(importedKeyCount == 1 ? "" : "s")",
              systemImage: "checkmark.circle.fill"
            )
            .font(.caption)
            .foregroundStyle(CodexTheme.green)
          }
        } header: {
          Text("App layout")
        } footer: {
          Text(
            "The Codex Micro agent mode controls the six agent keys. These app profiles change only the lower command keys."
          )
        }

        Section {
          Toggle(
            "Context rings",
            isOn: Binding(
              get: { store.showContextRings },
              set: { store.setShowContextRings($0) })
          )
        } header: {
          Text("Display")
        } footer: {
          Text("Shows each agent's current context-window usage on the Micro device keys.")
        }

        Section {
          Picker(
            "Command feedback",
            selection: Binding(
              get: { store.commandFeedbackMode },
              set: { store.setCommandFeedbackMode($0) })
          ) {
            ForEach(CommandFeedbackMode.allCases) { mode in
              Text(mode.title).tag(mode)
            }
          }
          .pickerStyle(.segmented)

          Toggle(
            "Always show critical errors",
            isOn: Binding(
              get: { store.alwaysShowCriticalErrors },
              set: { store.setAlwaysShowCriticalErrors($0) })
          )
        } header: {
          Text("Command feedback")
        } footer: {
          Text(
            "Minimal keeps successful commands quiet. Detailed shows each delivery stage. Off hides command feedback unless critical errors remain enabled."
          )
        }

        Section {
          Toggle(
            "Attention notifications",
            isOn: Binding(
              get: { store.attentionNotificationsEnabled },
              set: { enabled in
                Task { await store.setAttentionNotificationsEnabled(enabled) }
              })
          )
          if store.attentionNotificationsEnabled {
            Toggle(
              "Show task titles",
              isOn: Binding(
                get: { store.showTaskTitlesInNotifications },
                set: { store.setShowTaskTitlesInNotifications($0) })
            )
          }
          Button {
            showingAttention = true
          } label: {
            LabeledContent {
              Text(store.unreadAttentionCount == 0 ? "No unread events" : "\(store.unreadAttentionCount) unread")
                .foregroundStyle(CodexTheme.secondary)
            } label: {
              Label("Open Attention Center", systemImage: "bell.badge")
            }
          }
        } header: {
          Text("Attention")
        } footer: {
          Text(
            "Optional notifications cover approvals, requested responses, completions, errors, and unread updates. The first snapshot after connecting establishes a baseline and stays quiet."
          )
        }

        Section("About") {
          LabeledContent("Protocol", value: "Codex Deck Relay 1")
          LabeledContent("App", value: "Codex Deck Mobile")
        }
      }
      .navigationTitle("Connections")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }
      .sheet(isPresented: $adding) { PairNodeView() }
      .sheet(isPresented: $showingAttention) { AttentionCenterView() }
      .sheet(item: $diagnosticsProfile) { HostDiagnosticsView(profile: $0) }
      .confirmationDialog(
        "Remove computer?",
        isPresented: Binding(
          get: { deletingProfile != nil },
          set: { if !$0 { deletingProfile = nil } }),
        titleVisibility: .visible,
        presenting: deletingProfile
      ) { profile in
        Button("Remove \(profile.name)", role: .destructive) {
          store.removeProfile(profile)
          deletingProfile = nil
        }
      } message: { profile in
        Text(
          "This removes only \(profile.name), its relay token, and its cached snapshot from this iPhone. Codex and your custom icons are untouched."
        )
      }
      .confirmationDialog(
        "Import lower keys?", isPresented: $showingLayoutImport, titleVisibility: .visible
      ) {
        Button("Import into \(store.mobileLayoutProfile.title)") {
          importedKeyCount = store.importSelectedComputerLayout()
        }
      } message: {
        Text(
          "This copies the selected computer's six current Micro key assignments into the \(store.mobileLayoutProfile.title) app profile. It does not change the Stream Deck or Codex."
        )
      }
    }
  }
}

private struct NodeRow: View {
  @Environment(DashboardStore.self) private var store
  let profile: NodeProfile
  let showDiagnostics: () -> Void
  let remove: () -> Void

  var body: some View {
    let status = store.nodes[profile.id] ?? NodeStatus()
    HStack(spacing: 8) {
      Button(action: showDiagnostics) {
        HStack(spacing: 12) {
          Image(systemName: status.host?.platform == .darwin ? "laptopcomputer" : "desktopcomputer")
            .font(.title3)
            .frame(width: 34)
          VStack(alignment: .leading, spacing: 3) {
            Text(profile.name).font(.headline)
            HStack(spacing: 5) {
              Text(profile.connectionMode == .nearby ? "Nearby" : "Remote")
                .font(.caption2.weight(.bold))
                .foregroundStyle(profile.connectionMode == .nearby ? CodexTheme.blue : CodexTheme.green)
              Text("·")
              Text(
                status.detail ?? status.host?.hostName ?? profile.url.host()
                  ?? profile.url.absoluteString
              )
              .lineLimit(1)
            }
            .font(.caption).foregroundStyle(.secondary)
          }
          Spacer()
          Circle()
            .fill(nodeStateColor(status.state))
            .frame(width: 10, height: 10)
          Image(systemName: "chevron.right")
            .font(.caption.weight(.bold))
            .foregroundStyle(CodexTheme.secondary)
        }
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Diagnostics for \(profile.name)")
      Button(role: .destructive, action: remove) {
        Image(systemName: "trash")
          .font(.body.weight(.semibold))
          .frame(width: 34, height: 34)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Remove \(profile.name)")
    }
  }
}

private struct HostDiagnosticsView: View {
  @Environment(DashboardStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  let profile: NodeProfile
  @State private var testing = false
  @State private var testMessage: String?
  @State private var testFailed = false

  var body: some View {
    let status = store.nodes[profile.id] ?? NodeStatus()
    NavigationStack {
      List {
        Section {
          HStack(spacing: 12) {
            ZStack {
              Circle().fill(nodeStateColor(status.state).opacity(0.15))
              Image(systemName: status.host?.platform == .darwin ? "laptopcomputer" : "desktopcomputer")
                .foregroundStyle(nodeStateColor(status.state))
            }
            .frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 3) {
              Text(status.host?.hostName ?? profile.name).font(.headline)
              Text(status.state.rawValue.capitalized)
                .font(.caption.weight(.bold))
                .foregroundStyle(nodeStateColor(status.state))
            }
          }
          if status.requiresRepair {
            Label(status.detail ?? "Re-pair required", systemImage: "exclamationmark.shield.fill")
              .foregroundStyle(CodexTheme.red)
          } else if let detail = status.detail {
            Label(detail, systemImage: "info.circle")
              .foregroundStyle(CodexTheme.secondary)
          }
        }

        Section("Connection") {
          LabeledContent("Route", value: profile.connectionMode == .nearby ? "Nearby" : "Tailscale / remote")
          LabeledContent("Endpoint", value: profile.url.host() ?? "Unknown")
          LabeledContent("Relay protocol", value: "\(status.relayProtocol)")
          LabeledContent("Round trip", value: status.lastRoundTripMilliseconds.map { "\($0) ms" } ?? "Not tested")
          LabeledContent("Last snapshot") {
            if let date = status.lastSnapshotReceivedAt {
              Text(date, style: .relative)
            } else {
              Text("Never")
            }
          }
        }

        Section("Codex Micro") {
          LabeledContent("Platform", value: status.host?.platform.displayName ?? "Unknown")
          LabeledContent("Codex version", value: status.host?.codexVersion ?? "Not advertised")
          LabeledContent("Native bridge", value: status.bridgeKind == "native-codex-micro" ? "Available" : "Not advertised")
          if status.capabilities.isEmpty {
            Text("This relay does not advertise capabilities yet.")
              .foregroundStyle(CodexTheme.secondary)
          } else {
            Text(status.capabilities.sorted().joined(separator: " · "))
              .font(.caption)
              .foregroundStyle(CodexTheme.secondary)
          }
        }

        Section("Security") {
          Label("Relay token stored in Keychain", systemImage: "key.fill")
          Label(
            profile.connectionMode == .nearby ? "Certificate fingerprint pinned" : "Secure remote transport",
            systemImage: "checkmark.shield.fill")
          Label("Chrome DevTools remains loopback-only", systemImage: "network.badge.shield.half.filled")
        }

        Section {
          Button {
            testing = true
            testMessage = nil
            Task {
              do {
                let result = try await store.testConnection(profile)
                testMessage = "Connected in \(result.elapsedMilliseconds) ms"
                testFailed = false
              } catch {
                testMessage = error.localizedDescription
                testFailed = true
              }
              testing = false
            }
          } label: {
            Label(testing ? "Testing…" : "Test connection", systemImage: "wave.3.right.circle")
          }
          .disabled(testing)

          Button { store.reconnect(profile) } label: {
            Label("Reconnect relay", systemImage: "arrow.clockwise")
          }

          Button {
            store.beginComputerReplacement(profile)
            dismiss()
          } label: {
            Label("Replace or re-pair computer", systemImage: "arrow.triangle.2.circlepath")
          }

          ShareLink(item: store.sanitizedDiagnostics(for: profile)) {
            Label("Share sanitized diagnostics", systemImage: "square.and.arrow.up")
          }

          if let testMessage {
            Label(testMessage, systemImage: testFailed ? "xmark.circle.fill" : "checkmark.circle.fill")
              .foregroundStyle(testFailed ? CodexTheme.red : CodexTheme.green)
          }
        } footer: {
          Text(
            "Connection testing sends only a WebSocket ping. Replace mode changes nothing until you open a new valid Nearby pairing code for this exact profile."
          )
        }
      }
      .navigationTitle("Computer diagnostics")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }
    }
  }
}

private func nodeStateColor(_ state: NodeConnectionState) -> Color {
  switch state {
  case .ready: CodexTheme.green
  case .connecting: CodexTheme.orange
  case .degraded: CodexTheme.orange
  case .offline: CodexTheme.red
  }
}

private struct PairNodeView: View {
  @Environment(DashboardStore.self) private var store
  @Environment(LocalNodeDiscovery.self) private var discovery
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var endpoint = ""
  @State private var token = ""
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          if discovery.nodes.isEmpty {
            HStack(spacing: 12) {
              ProgressView()
              VStack(alignment: .leading, spacing: 2) {
                Text("No prepared computer found").font(.subheadline.weight(.semibold))
                Text(discovery.detail).font(.caption).foregroundStyle(.secondary)
              }
            }
          } else {
            ForEach(discovery.nodes) { node in
              NearbyNodeRow(
                node: node,
                paired: store.profiles.contains {
                  $0.pairedHostId?.caseInsensitiveCompare(node.hostId) == .orderedSame
                })
            }
          }
        } header: {
          Text("Nearby")
        } footer: {
          Text(
            "Enable Nearby pairing on the Mac or Windows PC, then scan its QR code with the iPhone Camera. The code opens Codex Deck and completes pairing automatically."
          )
        }

        Section("Remote via Tailscale") {
          TextField("MacBook or Windows PC", text: $name)
          TextField("wss://computer.tailnet.ts.net", text: $endpoint)
            .textInputAutocapitalization(.never)
            .keyboardType(.URL)
            .autocorrectionDisabled()
          SecureField("Relay token", text: $token)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        Section {
          Label(
            "Tailscale keeps remote access private while the Codex debugging endpoint remains bound to 127.0.0.1.",
            systemImage: "shield.lefthalf.filled"
          )
          .font(.footnote)
        }
        if let error {
          Section { Text(error).foregroundStyle(CodexTheme.red) }
        }
      }
      .navigationTitle("Add computer")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Add remote") {
            do {
              try store.saveProfile(name: name, endpoint: endpoint, token: token)
              dismiss()
            } catch { self.error = error.localizedDescription }
          }
          .disabled(
            name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || endpoint.isEmpty
              || token.isEmpty)
        }
      }
    }
  }
}

private struct NearbyNodeRow: View {
  let node: NearbyNode
  let paired: Bool

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: node.platform == .darwin ? "laptopcomputer" : "desktopcomputer")
        .font(.title3)
        .foregroundStyle(CodexTheme.blue)
        .frame(width: 32)
      VStack(alignment: .leading, spacing: 3) {
        Text(node.hostName).font(.headline)
        Text("Secure local node · \(node.endpoint.host() ?? "private network")")
          .font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      if paired {
        Image(systemName: "checkmark.circle.fill").foregroundStyle(CodexTheme.green)
          .accessibilityLabel("Already paired")
      } else {
        Image(systemName: "qrcode.viewfinder").foregroundStyle(CodexTheme.secondary)
          .accessibilityLabel("Scan this computer's pairing QR code")
      }
    }
  }
}
