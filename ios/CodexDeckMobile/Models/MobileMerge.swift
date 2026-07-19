import Foundation

enum MobileMerge {
  static func agents(from inputs: [HostSnapshot]) -> [RoutedAgent] {
    var byThread: [String: [RoutedAgent]] = [:]
    let owners = sessionOwners(inputs)

    for input in inputs {
      for slot in input.snapshot.slots where slot.threadKey != nil {
        let identity = threadIdentity(slot.threadKey!)
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
          sourceSlot: slot.id
        )
        byThread[identity, default: []].append(routed)
      }
    }

    let merged = Dictionary(
      uniqueKeysWithValues: byThread.map { identity, candidates in
        let owner = owners[identity]
        let routedOwner =
          owner.flatMap { record in candidates.first(where: { $0.host.id == record.host.id }) }
          ?? candidates.sorted(by: ownershipOrder).first!
        let strongest = candidates.max(by: { statusPriority($0.status) < statusPriority($1.status) }
        )!
        return (
          identity,
          RoutedAgent(
            id: 0,
            threadKey: routedOwner.threadKey,
            title: routedOwner.title,
            status: resolvedStatus(strongest.status, owner?.session.status),
            selected: candidates.contains(where: \.selected),
            activityAt: max(
              owner?.session.activityAt ?? 0, candidates.map(\.activityAt).max() ?? 0),
            host: owner?.host ?? routedOwner.host,
            sourceSlot: routedOwner.sourceSlot
          )
        )
      })

    guard let authority = inputs.first(where: { $0.host.platform == .win32 }) ?? inputs.first else {
      return []
    }
    let ordered: [RoutedAgent]
    if inputs.count == 1 {
      ordered = nativeOrder(authority, merged)
    } else if authority.snapshot.agentSource == "pinned" {
      ordered = positionalOrder(
        authority: authority, inputs: inputs, merged: merged, requiresMode: "pinned",
        controllerWins: false)
    } else if authority.snapshot.agentSource == "custom" {
      ordered = positionalOrder(
        authority: authority, inputs: inputs, merged: merged, requiresMode: "custom",
        controllerWins: true)
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
          sourceSlot: agent.sourceSlot
        )
      }
  }

  private static func nativeOrder(_ input: HostSnapshot, _ merged: [String: RoutedAgent])
    -> [RoutedAgent]
  {
    input.snapshot.slots.compactMap { slot in
      guard let key = slot.threadKey else { return nil }
      return merged[threadIdentity(key)]
    }
  }

  private static func positionalOrder(
    authority: HostSnapshot,
    inputs: [HostSnapshot],
    merged: [String: RoutedAgent],
    requiresMode: String,
    controllerWins: Bool
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
        let identity = threadIdentity(key)
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
  }

  private static func sessionOwners(_ inputs: [HostSnapshot]) -> [String: Owner] {
    var result: [String: Owner] = [:]
    for input in inputs {
      for session in input.snapshot.hostSessions ?? [] {
        let key = threadIdentity(session.threadId)
        if result[key] == nil || result[key]!.session.activityAt < session.activityAt {
          result[key] = Owner(host: input.host, session: session)
        }
      }
    }
    return result
  }

  private static func ownershipOrder(_ left: RoutedAgent, _ right: RoutedAgent) -> Bool {
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

  private static func resolvedStatus(_ native: String, _ session: String?) -> String {
    if session == "working"
      && !["working", "thinking", "approval", "awaiting-approval", "awaiting-response"].contains(
        native)
    {
      return "working"
    }
    if session == "complete" && ["off", "idle"].contains(native) { return "complete" }
    return native
  }

  private static func threadIdentity(_ threadKey: String) -> String {
    threadKey.split(separator: ":").last.map(String.init)?.lowercased() ?? threadKey.lowercased()
  }
}
