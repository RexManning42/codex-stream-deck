import Foundation

@MainActor
final class RelayNodeConnection {
  typealias Update = @MainActor (UUID, NodeStatus) -> Void

  private let profile: NodeProfile
  private let token: String
  private let update: Update
  private var task: URLSessionWebSocketTask?
  private var runTask: Task<Void, Never>?
  private var pending: [String: CheckedContinuation<Void, Error>] = [:]
  private var status = NodeStatus()
  private var stopped = false

  init(profile: NodeProfile, token: String, update: @escaping Update) {
    self.profile = profile
    self.token = token
    self.update = update
  }

  func start() {
    guard runTask == nil else { return }
    stopped = false
    runTask = Task { [weak self] in await self?.connectionLoop() }
  }

  func stop() {
    stopped = true
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
    runTask?.cancel()
    runTask = nil
    failPending(URLError(.cancelled))
    publish(state: .offline, detail: "Disconnected")
  }

  func send(_ command: RelayCommand) async throws {
    guard let task, status.state == .ready || status.state == .degraded else {
      throw RelayConnectionError.notConnected
    }
    let requestID = UUID().uuidString
    let message = CommandEnvelope(
      type: "command", protocol: 1, requestId: requestID, command: command)
    let data = try JSONEncoder().encode(message)
    guard data.count <= 64 * 1024 else { throw RelayConnectionError.messageTooLarge }
    try await withCheckedThrowingContinuation { continuation in
      pending[requestID] = continuation
      Task {
        do { try await task.send(.data(data)) } catch {
          if let continuation = pending.removeValue(forKey: requestID) {
            continuation.resume(throwing: error)
          }
        }
      }
      Task { [weak self] in
        try? await Task.sleep(for: .seconds(10))
        if let continuation = self?.pending.removeValue(forKey: requestID) {
          continuation.resume(throwing: URLError(.timedOut))
        }
      }
    }
  }

  private func connectionLoop() async {
    var retry: UInt64 = 1
    while !stopped && !Task.isCancelled {
      do {
        try await connectOnce()
        retry = 1
      } catch is CancellationError {
        break
      } catch {
        failPending(error)
        publish(state: .offline, detail: error.localizedDescription)
        guard !stopped else { break }
        try? await Task.sleep(for: .seconds(retry))
        retry = min(retry * 2, 15)
      }
    }
  }

  private func connectOnce() async throws {
    publish(state: .connecting, detail: "Connecting")
    let socket = URLSession.shared.webSocketTask(with: profile.url)
    task = socket
    socket.resume()
    let auth = AuthEnvelope(type: "auth", protocol: 1, token: token)
    try await socket.send(.data(JSONEncoder().encode(auth)))

    while !stopped && !Task.isCancelled {
      let message = try await socket.receive()
      let data: Data
      switch message {
      case .data(let value): data = value
      case .string(let value): data = Data(value.utf8)
      @unknown default: continue
      }
      guard data.count <= 64 * 1024 else { throw RelayConnectionError.messageTooLarge }
      let event = try JSONDecoder().decode(RelayServerEvent.self, from: data)
      handle(event)
    }
  }

  private func handle(_ event: RelayServerEvent) {
    switch event {
    case .ready(let host):
      status.host = host
      publish(state: .ready, detail: nil)
    case .snapshot(let snapshot):
      status.host = snapshot.host
      status.snapshot = snapshot
      publish(state: .ready, detail: nil)
    case .health(let host, let reason, _):
      status.host = host
      publish(state: .degraded, detail: reason.replacingOccurrences(of: "-", with: " ").capitalized)
    case .result(let requestID, let ok, let error):
      guard let continuation = pending.removeValue(forKey: requestID) else { return }
      if ok {
        continuation.resume()
      } else {
        continuation.resume(throwing: RelayConnectionError.commandFailed(error ?? "Command failed"))
      }
    }
  }

  private func publish(state newState: NodeConnectionState, detail: String?) {
    status.state = newState
    status.detail = detail
    status.changedAt = Date()
    update(profile.id, status)
  }

  private func failPending(_ error: Error) {
    let continuations = pending.values
    pending.removeAll()
    continuations.forEach { $0.resume(throwing: error) }
  }

  private struct AuthEnvelope: Encodable {
    let type: String
    let `protocol`: Int
    let token: String
  }

  private struct CommandEnvelope: Encodable {
    let type: String
    let `protocol`: Int
    let requestId: String
    let command: RelayCommand
  }
}

enum RelayConnectionError: LocalizedError {
  case notConnected
  case messageTooLarge
  case commandFailed(String)

  var errorDescription: String? {
    switch self {
    case .notConnected: "That Codex host is not connected."
    case .messageTooLarge: "Relay message exceeded the safe size limit."
    case .commandFailed(let message): message
    }
  }
}
