import Foundation
import Network
import Observation

struct NearbyNode: Identifiable, Hashable, Sendable {
  let hostId: String
  let hostName: String
  let platform: HostPlatform
  let endpoint: URL
  let fingerprintSHA256: String
  var id: String { hostId }

  init?(txt: [String: String]) {
    guard txt["protocol"] == "1", txt["secure"] == "1",
      let hostId = txt["hostId"], Self.isUUID(hostId),
      let hostName = txt["hostName"]?.trimmingCharacters(in: .whitespacesAndNewlines),
      !hostName.isEmpty, hostName.count <= 128,
      let platformValue = txt["platform"], let platform = HostPlatform(rawValue: platformValue),
      let address = txt["address"], Self.isPrivateIPv4(address),
      let portValue = txt["port"], let port = Int(portValue), (1_024...65_535).contains(port),
      let endpoint = URL(string: "wss://\(address):\(port)"),
      let fingerprint = txt["fingerprint"].map(Self.normalizeFingerprint),
      fingerprint.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil
    else { return nil }
    self.hostId = hostId.lowercased()
    self.hostName = hostName
    self.platform = platform
    self.endpoint = endpoint
    self.fingerprintSHA256 = fingerprint
  }

  static func isPrivateIPv4(_ value: String) -> Bool {
    let fields = value.split(separator: ".", omittingEmptySubsequences: false)
    guard fields.count == 4 else { return false }
    let parts = fields.compactMap { field -> Int? in
      guard !field.isEmpty, field.allSatisfy(\.isNumber) else { return nil }
      return Int(field)
    }
    guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }) else { return false }
    return parts[0] == 10 || (parts[0] == 172 && (16...31).contains(parts[1]))
      || (parts[0] == 192 && parts[1] == 168)
  }

  static func normalizeFingerprint(_ value: String) -> String {
    value.replacingOccurrences(of: ":", with: "").lowercased()
  }

  private static func isUUID(_ value: String) -> Bool { UUID(uuidString: value) != nil }
}

struct NearbyPairingPayload: Sendable {
  let hostId: String
  let name: String
  let platform: HostPlatform
  let endpoint: URL
  let token: String
  let fingerprintSHA256: String

  init(url: URL) throws {
    guard url.scheme?.lowercased() == "codexdeck", url.host?.lowercased() == "pair",
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { throw NearbyPairingError.invalidLink }
    var values: [String: String] = [:]
    for item in components.queryItems ?? [] {
      guard let value = item.value, values.updateValue(value, forKey: item.name) == nil else {
        throw NearbyPairingError.invalidLink
      }
    }
    guard values["version"] == "1", values["mode"] == "nearby",
      let hostId = values["hostId"], UUID(uuidString: hostId) != nil,
      let name = values["name"]?.trimmingCharacters(in: .whitespacesAndNewlines),
      !name.isEmpty, name.count <= 128,
      let platformValue = values["platform"], let platform = HostPlatform(rawValue: platformValue),
      let endpointValue = values["endpoint"], let endpoint = URL(string: endpointValue),
      endpoint.scheme == "wss", let endpointHost = endpoint.host(),
      NearbyNode.isPrivateIPv4(endpointHost), let endpointPort = endpoint.port,
      (1_024...65_535).contains(endpointPort), endpoint.user == nil, endpoint.password == nil,
      endpoint.query == nil, endpoint.fragment == nil,
      let token = values["token"], (32...512).contains(token.utf8.count),
      let fingerprintValue = values["fingerprint"]
    else { throw NearbyPairingError.invalidLink }
    let fingerprint = NearbyNode.normalizeFingerprint(fingerprintValue)
    guard fingerprint.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
      throw NearbyPairingError.invalidLink
    }
    self.hostId = hostId.lowercased()
    self.name = name
    self.platform = platform
    self.endpoint = endpoint
    self.token = token
    self.fingerprintSHA256 = fingerprint
  }
}

enum NearbyPairingError: LocalizedError {
  case invalidLink
  var errorDescription: String? {
    "That Codex Deck pairing code is invalid or does not target a private local network."
  }
}

@Observable
@MainActor
final class LocalNodeDiscovery {
  private(set) var nodes: [NearbyNode] = []
  private(set) var detail = "Looking for nearby computers…"
  @ObservationIgnored private var browser: NWBrowser?

  func start() {
    guard browser == nil else { return }
    let browser = NWBrowser(
      for: .bonjourWithTXTRecord(type: "_codexdeck._tcp", domain: nil), using: .tcp)
    self.browser = browser
    browser.stateUpdateHandler = { [weak self] state in
      Task { @MainActor in
        switch state {
        case .ready: self?.detail = "Nearby discovery is active"
        case .waiting(let error): self?.detail = "Waiting for local network access: \(error.localizedDescription)"
        case .failed(let error): self?.detail = "Nearby discovery failed: \(error.localizedDescription)"
        case .cancelled: self?.detail = "Nearby discovery stopped"
        default: break
        }
      }
    }
    browser.browseResultsChangedHandler = { [weak self] results, _ in
      let found = results.compactMap { result -> NearbyNode? in
        guard case .bonjour(let record) = result.metadata else { return nil }
        return NearbyNode(txt: record.dictionary)
      }
      .reduce(into: [String: NearbyNode]()) { output, node in output[node.hostId] = node }
      .values.sorted { $0.hostName.localizedCaseInsensitiveCompare($1.hostName) == .orderedAscending }
      Task { @MainActor in self?.nodes = found }
    }
    browser.start(queue: DispatchQueue(label: "com.simeo.codexdeck.nearby"))
  }

  func stop() {
    browser?.cancel()
    browser = nil
    nodes = []
  }
}
