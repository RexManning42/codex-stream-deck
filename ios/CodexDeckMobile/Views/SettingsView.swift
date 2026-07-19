import SwiftUI

struct SettingsView: View {
  @Environment(DashboardStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var adding = false

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
            NodeRow(profile: profile)
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
          Label("Secure WebSocket only", systemImage: "lock.fill")
          Label("No Chrome DevTools exposure", systemImage: "network.badge.shield.half.filled")
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
    }
  }
}

private struct NodeRow: View {
  @Environment(DashboardStore.self) private var store
  let profile: NodeProfile

  var body: some View {
    let status = store.nodes[profile.id] ?? NodeStatus()
    HStack(spacing: 12) {
      Image(systemName: status.host?.platform == .darwin ? "laptopcomputer" : "desktopcomputer")
        .font(.title3)
        .frame(width: 34)
      VStack(alignment: .leading, spacing: 3) {
        Text(profile.name).font(.headline)
        Text(
          status.detail ?? status.host?.hostName ?? profile.url.host() ?? profile.url.absoluteString
        )
        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
      }
      Spacer()
      Circle()
        .fill(
          status.state == .ready
            ? CodexTheme.green : status.state == .connecting ? CodexTheme.orange : CodexTheme.red
        )
        .frame(width: 10, height: 10)
    }
  }
}

private struct PairNodeView: View {
  @Environment(DashboardStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var endpoint = ""
  @State private var token = ""
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Form {
        Section("Computer") {
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
            "Use Tailscale Serve to provide a trusted wss:// endpoint while the Codex Deck node remains bound to 127.0.0.1.",
            systemImage: "shield.lefthalf.filled"
          )
          .font(.footnote)
        }
        if let error {
          Section { Text(error).foregroundStyle(CodexTheme.red) }
        }
      }
      .navigationTitle("Pair computer")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Add") {
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
