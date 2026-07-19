import Foundation
import Observation

@Observable
@MainActor
final class DashboardStore {
  private(set) var profiles: [NodeProfile] = []
  private(set) var nodes: [UUID: NodeStatus] = [:]
  var selectedHostID: String?
  var showingSettings = false
  var toast: Toast?

  @ObservationIgnored private var connections: [UUID: RelayNodeConnection] = [:]
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private var started = false

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    if let data = defaults.data(forKey: "node-profiles"),
      let decoded = try? JSONDecoder().decode([NodeProfile].self, from: data)
    {
      profiles = decoded
    }
    selectedHostID = defaults.string(forKey: "selected-host-id")
    loadCachedSnapshots()
  }

  var snapshots: [HostSnapshot] {
    nodes.values.compactMap(\.snapshot)
  }

  var agents: [RoutedAgent] { MobileMerge.agents(from: snapshots) }
  var usageSource: HostSnapshot? { MobileMerge.accountUsage(from: snapshots) }
  var connectedCount: Int { nodes.values.filter { $0.state == .ready }.count }
  var expectedCount: Int { profiles.count }
  var hasAttention: Bool { agents.contains(where: \.isAttention) }

  var selectedHost: CodexHost? {
    let hosts = nodes.values.compactMap(\.host)
    return hosts.first(where: { $0.hostId == selectedHostID }) ?? hosts.first
  }

  func connectionState(for hostID: String) -> NodeConnectionState {
    nodes.values.first(where: { $0.host?.hostId == hostID })?.state ?? .offline
  }

  func start() async {
    guard !started else { return }
    started = true
    for profile in profiles { connect(profile) }
  }

  func saveProfile(name: String, endpoint: String, token: String, replacing id: UUID? = nil) throws
  {
    guard token.utf8.count >= 32 else { throw ProfileError.shortToken }
    guard let url = normalizedEndpoint(endpoint), url.scheme == "wss" else {
      throw ProfileError.secureEndpointRequired
    }
    let profile = NodeProfile(
      id: id ?? UUID(), name: name.trimmingCharacters(in: .whitespacesAndNewlines), url: url)
    guard !profile.name.isEmpty else { throw ProfileError.missingName }
    if let index = profiles.firstIndex(where: { $0.id == profile.id }) {
      profiles[index] = profile
    } else {
      profiles.append(profile)
    }
    try KeychainStore.set(token, for: profile.tokenKey)
    persistProfiles()
    connections[profile.id]?.stop()
    connect(profile)
  }

  func removeProfile(_ profile: NodeProfile) {
    connections.removeValue(forKey: profile.id)?.stop()
    profiles.removeAll { $0.id == profile.id }
    nodes.removeValue(forKey: profile.id)
    KeychainStore.remove(profile.tokenKey)
    defaults.removeObject(forKey: "snapshot-\(profile.id.uuidString)")
    persistProfiles()
  }

  func selectHost(_ host: CodexHost) {
    selectedHostID = host.hostId
    defaults.set(host.hostId, forKey: "selected-host-id")
  }

  func activate(_ agent: RoutedAgent) async {
    await send(
      .agent(slot: agent.sourceSlot, threadKey: agent.threadKey, act: 1), to: agent.host.hostId)
    try? await Task.sleep(for: .milliseconds(90))
    await send(
      .agent(slot: agent.sourceSlot, threadKey: agent.threadKey, act: 0), to: agent.host.hostId)
  }

  func trigger(_ command: RelayCommand) async {
    guard let host = selectedHost else {
      show("No Codex host connected", kind: .error)
      return
    }
    await send(command, to: host.hostId)
  }

  func pressAction(_ slot: String) async {
    await trigger(.action(slot: slot, act: 1))
    try? await Task.sleep(for: .milliseconds(90))
    await trigger(.action(slot: slot, act: 0))
  }

  func pressJoystick(_ direction: String) async {
    await trigger(.joystick(direction: direction, distance: 1))
    try? await Task.sleep(for: .milliseconds(90))
    await trigger(.joystick(direction: direction, distance: 0))
  }

  func resetRateLimit() async {
    guard let source = usageSource else { return }
    await send(.rateLimitReset, to: source.host.hostId)
  }

  private func send(_ command: RelayCommand, to hostID: String) async {
    guard let pair = nodes.first(where: { $0.value.host?.hostId == hostID }),
      let connection = connections[pair.key]
    else {
      show("Host is offline", kind: .error)
      return
    }
    do {
      try await connection.send(command)
      show("Sent to \(pair.value.host?.hostName ?? "Codex")", kind: .success)
    } catch {
      show(error.localizedDescription, kind: .error)
    }
  }

  private func connect(_ profile: NodeProfile) {
    guard connections[profile.id] == nil else { return }
    do {
      guard let token = try KeychainStore.value(for: profile.tokenKey) else {
        nodes[profile.id] = NodeStatus(state: .offline, detail: "Token missing")
        return
      }
      let connection = RelayNodeConnection(profile: profile, token: token) {
        [weak self] id, status in
        self?.nodes[id] = status
        if let snapshot = status.snapshot { self?.cache(snapshot, for: id) }
        if self?.selectedHostID == nil, let host = status.host { self?.selectHost(host) }
      }
      connections[profile.id] = connection
      connection.start()
    } catch {
      nodes[profile.id] = NodeStatus(state: .offline, detail: error.localizedDescription)
    }
  }

  private func normalizedEndpoint(_ input: String) -> URL? {
    var value = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if !value.contains("://") { value = "wss://\(value)" }
    return URL(string: value)
  }

  private func persistProfiles() {
    defaults.set(try? JSONEncoder().encode(profiles), forKey: "node-profiles")
  }

  private func cache(_ snapshot: HostSnapshot, for id: UUID) {
    defaults.set(try? JSONEncoder().encode(snapshot), forKey: "snapshot-\(id.uuidString)")
  }

  private func loadCachedSnapshots() {
    for profile in profiles {
      guard let data = defaults.data(forKey: "snapshot-\(profile.id.uuidString)"),
        let snapshot = try? JSONDecoder().decode(HostSnapshot.self, from: data)
      else { continue }
      nodes[profile.id] = NodeStatus(
        state: .offline, host: snapshot.host, snapshot: snapshot, detail: "Last known")
    }
  }

  private func show(_ message: String, kind: Toast.Kind) {
    toast = Toast(message: message, kind: kind)
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(2))
      if self?.toast?.message == message { self?.toast = nil }
    }
  }
}

struct Toast: Equatable {
  enum Kind { case success, error }
  let message: String
  let kind: Kind
}

enum ProfileError: LocalizedError {
  case shortToken
  case secureEndpointRequired
  case missingName

  var errorDescription: String? {
    switch self {
    case .shortToken: "Relay token must contain at least 32 bytes."
    case .secureEndpointRequired: "Use a secure wss:// Tailscale endpoint."
    case .missingName: "Give this computer a name."
    }
  }
}
