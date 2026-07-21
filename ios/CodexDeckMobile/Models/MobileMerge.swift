import Foundation

enum MobileMerge {
  private static let mirrorStatusFreshness: Double = 5_000
  private static let sessionCompletionFallbackLifetime: Double = 5 * 60_000

  private struct Candidate {
    let agent: RoutedAgent
    let observedAt: Double
  }

  static func agents(
    from inputs: [HostSnapshot], acknowledgedCompletions: [String: Int] = [:]
  ) -> [RoutedAgent] {
    var byThread: [String: [Candidate]] = [:]
    let owners = sessionOwners(inputs)
    let aliases = temporaryThreadAliases(inputs)

    for input in inputs {
      for slot in input.snapshot.slots where slot.threadKey != nil {
        let identity = resolvedIdentity(slot.threadKey!, host: input.host, aliases: aliases)
        let routed = RoutedAgent(
          id: 0,
          threadKey: slot.threadKey!,
          title: slot.title ?? "Untitled task",
          status: slot.status,
          selected: slot.selected,
          // Connecting a second node is not task activity. When Codex
          // exposes no timestamp, keep it neutral instead of making
          // every historical slot look newly active.
          activityAt: slot.activityAt ?? 0,
          host: input.host,
          sourceSlot: slot.id,
          originPlatform: slot.ownedByHost == false ? input.host.platform.opposite : input.host.platform,
          ownedByHost: slot.ownedByHost,
          contextUsedPercent: slot.contextUsedPercent
        )
        byThread[identity, default: []].append(
          Candidate(agent: routed, observedAt: input.observedAt))
      }
    }

    let merged = Dictionary(
      uniqueKeysWithValues: byThread.map { identity, records in
        let owner = owners[identity]
        let candidates = records.map(\.agent)
        let newestObservation = records.map(\.observedAt).max() ?? 0
        let freshCandidates = records.filter {
          newestObservation - $0.observedAt <= mirrorStatusFreshness
        }.map(\.agent)
        let freshOwner = owner.flatMap {
          newestObservation - $0.observedAt <= mirrorStatusFreshness ? $0 : nil
        }
        let routedOwner =
          owner.flatMap { record in candidates.first(where: { $0.host.id == record.host.id }) }
          ?? candidates.sorted(by: ownershipOrder).first!
        let strongest = freshCandidates.max(by: {
          statusPriority($0.status) < statusPriority($1.status)
        }
        )!
        return (
          identity,
          RoutedAgent(
            id: 0,
            threadKey: routedOwner.threadKey,
            title: routedOwner.title,
            status: resolvedStatus(
              strongest.status, owner: freshOwner, identity: identity,
              newestObservation: newestObservation,
              acknowledgedCompletions: acknowledgedCompletions),
            selected: freshCandidates.contains(where: \.selected),
            activityAt: max(
              owner?.session.activityAt ?? 0, candidates.map(\.activityAt).max() ?? 0),
            host: owner?.host ?? routedOwner.host,
            sourceSlot: routedOwner.sourceSlot,
            originPlatform: owner?.host.platform ?? routedOwner.originPlatform,
            ownedByHost: routedOwner.ownedByHost,
            contextUsedPercent: owner?.session.contextUsedPercent
              ?? routedOwner.contextUsedPercent
              ?? candidates.first(where: { $0.contextUsedPercent != nil })?.contextUsedPercent
          )
        )
      })

    guard let authority = inputs.first(where: { $0.host.platform == .win32 }) ?? inputs.first else {
      return []
    }
    let ordered: [RoutedAgent]
    if inputs.count == 1 {
      ordered = nativeOrder(authority, merged, aliases)
    } else if authority.snapshot.agentSource == "pinned" {
      ordered = positionalOrder(
        authority: authority, inputs: inputs, merged: merged, requiresMode: "pinned",
        controllerWins: false, aliases: aliases)
    } else if authority.snapshot.agentSource == "custom" {
      ordered = positionalOrder(
        authority: authority, inputs: inputs, merged: merged, requiresMode: "custom",
        controllerWins: true, aliases: aliases)
    } else {
      ordered = merged.values.sorted(
        by: authority.snapshot.agentSource == "priority" ? priorityOrder : agentOrder)
    }

    return ordered.prefix(6)
      .enumerated()
      .map { index, agent in
        RoutedAgent(
          id: index,
          threadKey: agent.threadKey,
          title: agent.title,
          status: agent.status,
          selected: agent.selected,
          activityAt: agent.activityAt,
          host: agent.host,
          sourceSlot: agent.sourceSlot,
          originPlatform: agent.originPlatform,
          ownedByHost: agent.ownedByHost,
          contextUsedPercent: agent.contextUsedPercent
        )
      }
  }

  private static func nativeOrder(
    _ input: HostSnapshot, _ merged: [String: RoutedAgent], _ aliases: [String: String]
  )
    -> [RoutedAgent]
  {
    input.snapshot.slots.compactMap { slot in
      guard let key = slot.threadKey else { return nil }
      return merged[resolvedIdentity(key, host: input.host, aliases: aliases)]
    }
  }

  private static func positionalOrder(
    authority: HostSnapshot,
    inputs: [HostSnapshot],
    merged: [String: RoutedAgent],
    requiresMode: String,
    controllerWins: Bool,
    aliases: [String: String]
  ) -> [RoutedAgent] {
    let remotes = inputs.filter {
      $0.host.id != authority.host.id && $0.snapshot.agentSource == requiresMode
    }
    var used = Set<String>()
    var result: [RoutedAgent] = []
    for position in 0..<6 {
      let sources = [authority] + remotes
      for source in sources {
        guard source.snapshot.slots.indices.contains(position),
          let key = source.snapshot.slots[position].threadKey
        else { continue }
        let identity = resolvedIdentity(key, host: source.host, aliases: aliases)
        guard !used.contains(identity), let agent = merged[identity] else { continue }
        used.insert(identity)
        result.append(agent)
        if controllerWins || result.count == 6 { break }
      }
      if result.count == 6 { break }
    }
    return result
  }

  static func accountUsage(from inputs: [HostSnapshot]) -> HostSnapshot? {
    inputs
      .filter { $0.snapshot.usage != nil }
      .max { ($0.snapshot.usage?.observedAt ?? 0) < ($1.snapshot.usage?.observedAt ?? 0) }
  }

  private struct Owner {
    let host: CodexHost
    let session: HostSessionPresence
    let observedAt: Double
  }

  private static func sessionOwners(_ inputs: [HostSnapshot]) -> [String: Owner] {
    var result: [String: Owner] = [:]
    for input in inputs {
      for session in input.snapshot.hostSessions ?? [] {
        let key = ThreadIdentity.canonical(session.threadId)
        if result[key] == nil || result[key]!.session.activityAt < session.activityAt {
          result[key] = Owner(host: input.host, session: session, observedAt: input.observedAt)
        }
      }
    }
    return result
  }

  private static func temporaryThreadAliases(_ inputs: [HostSnapshot]) -> [String: String] {
    var aliases: [String: String] = [:]
    for input in inputs {
      let ownedSessions = Set(
        (input.snapshot.hostSessions ?? []).map { ThreadIdentity.canonical($0.threadId) })
      guard !ownedSessions.isEmpty else { continue }

      for slot in input.snapshot.slots {
        guard let threadKey = slot.threadKey,
          threadKey.lowercased().contains(":client-new-thread:"),
          let title = normalizedTitle(slot.title)
        else { continue }

        let matches = Set(inputs.lazy.filter { $0.host.id != input.host.id }.flatMap { remote in
          remote.snapshot.slots.compactMap { candidate -> String? in
            guard let candidateKey = candidate.threadKey,
              normalizedTitle(candidate.title) == title
            else { return nil }
            let identity = ThreadIdentity.canonical(candidateKey)
            return ownedSessions.contains(identity) ? identity : nil
          }
        })
        guard matches.count == 1, let identity = matches.first else { continue }
        aliases[aliasKey(host: input.host, identity: ThreadIdentity.canonical(threadKey))] = identity
      }
    }
    return aliases
  }

  private static func resolvedIdentity(
    _ threadKey: String, host: CodexHost, aliases: [String: String]
  ) -> String {
    let identity = ThreadIdentity.canonical(threadKey)
    return aliases[aliasKey(host: host, identity: identity)] ?? identity
  }

  private static func aliasKey(host: CodexHost, identity: String) -> String {
    "\(host.id):\(identity)"
  }

  private static func normalizedTitle(_ title: String?) -> String? {
    guard let value = title?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty
    else { return nil }
    return value.lowercased()
  }

  private static func ownershipOrder(_ left: RoutedAgent, _ right: RoutedAgent) -> Bool {
    if left.ownedByHost != right.ownedByHost { return left.ownedByHost == true }
    if left.selected != right.selected { return left.selected }
    if statusPriority(left.status) != statusPriority(right.status) {
      return statusPriority(left.status) > statusPriority(right.status)
    }
    return left.activityAt > right.activityAt
  }

  private static func agentOrder(_ left: RoutedAgent, _ right: RoutedAgent) -> Bool {
    if left.selected != right.selected { return left.selected }
    if statusPriority(left.status) != statusPriority(right.status) {
      return statusPriority(left.status) > statusPriority(right.status)
    }
    return left.activityAt > right.activityAt
  }

  private static func priorityOrder(_ left: RoutedAgent, _ right: RoutedAgent) -> Bool {
    let leftPriority = priorityModeStatus(left.status)
    let rightPriority = priorityModeStatus(right.status)
    if leftPriority != rightPriority { return leftPriority > rightPriority }
    if left.selected != right.selected { return left.selected }
    return left.activityAt > right.activityAt
  }

  private static func priorityModeStatus(_ status: String) -> Int {
    if ["approval", "awaiting-approval", "awaiting-response"].contains(status) { return 4 }
    if ["unread", "error", "complete", "completed", "done"].contains(status) { return 3 }
    if ["working", "thinking"].contains(status) { return 2 }
    if status == "idle" { return 1 }
    return 0
  }

  private static func statusPriority(_ status: String) -> Int {
    if ["approval", "awaiting-approval", "awaiting-response"].contains(status) { return 5 }
    if ["error", "unread", "complete", "completed", "done"].contains(status) { return 4 }
    if ["working", "thinking"].contains(status) { return 3 }
    if status == "idle" { return 2 }
    return 1
  }

  static func completionKey(hostID: String, identity: String) -> String {
    "\(hostID.lowercased()):\(ThreadIdentity.canonical(identity))"
  }

  private static func resolvedStatus(
    _ native: String, owner: Owner?, identity: String, newestObservation: Double,
    acknowledgedCompletions: [String: Int]
  ) -> String {
    let session = owner?.session
    if session?.status == "working"
      && !["working", "thinking", "approval", "awaiting-approval", "awaiting-response"].contains(
        native)
    {
      return "working"
    }
    if let owner, session?.status == "complete", ["off", "idle"].contains(native) {
      let acknowledged = session?.completionRevision.map {
        acknowledgedCompletions[completionKey(hostID: owner.host.hostId, identity: identity)] == $0
      } ?? false
      let recent = newestObservation - (session?.activityAt ?? 0)
        <= sessionCompletionFallbackLifetime
      if !acknowledged && recent { return "complete" }
      return native == "off" ? "idle" : native
    }
    return native
  }

}
