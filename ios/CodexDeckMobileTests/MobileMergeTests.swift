import XCTest

@testable import CodexDeckMobile

final class MobileMergeTests: XCTestCase {
  func testDeduplicatesMirroredThreadAndRoutesToRolloutOwner() throws {
    let windows = host("win", .win32)
    let mac = host("mac", .darwin)
    let thread = "thread:11111111-1111-4111-8111-111111111111"
    let inputs = [
      snapshot(
        host: windows, slot: slot(thread: thread, title: "Build iOS", status: "idle", owned: false),
        sessions: []),
      snapshot(
        host: mac, slot: slot(thread: thread, title: "Build iOS", status: "working", owned: true),
        sessions: [
          HostSessionPresence(
            threadId: thread, activityAt: 2_000, status: "working", completionRevision: nil)
        ]),
    ]

    let result = MobileMerge.agents(from: inputs)
    XCTAssertEqual(result.count, 1)
    XCTAssertEqual(result[0].host.hostId, mac.hostId)
    XCTAssertEqual(result[0].status, "working")
    XCTAssertEqual(result[0].sourceSlot, 0)
  }

  func testAttentionSortsAheadOfWorkingAndIdle() {
    let windows = host("win", .win32)
    let inputs = [
      snapshot(
        host: windows,
        slots: [
          slot(
            id: 0, thread: "11111111-1111-4111-8111-111111111111", title: "Idle", status: "idle"),
          slot(
            id: 1, thread: "22222222-2222-4222-8222-222222222222", title: "Work", status: "working"),
          slot(
            id: 2, thread: "33333333-3333-4333-8333-333333333333", title: "Approve",
            status: "awaiting-approval"),
        ])
    ]
    XCTAssertEqual(MobileMerge.agents(from: inputs).map(\.title), ["Approve", "Work", "Idle"])
  }

  func testNewestUsageSnapshotWinsAcrossHosts() {
    let older = snapshot(host: host("win", .win32), usageObservedAt: 1_000)
    let newer = snapshot(host: host("mac", .darwin), usageObservedAt: 2_000)
    XCTAssertEqual(MobileMerge.accountUsage(from: [older, newer])?.host.platform, .darwin)
  }

  private func host(_ id: String, _ platform: HostPlatform) -> CodexHost {
    CodexHost(hostId: id, hostName: id, platform: platform)
  }

  private func slot(id: Int = 0, thread: String, title: String, status: String, owned: Bool = true)
    -> AgentSlot
  {
    AgentSlot(
      id: id, threadKey: thread, title: title, status: status, selected: false,
      activityAt: Double(1_000 + id), ownedByHost: owned)
  }

  private func snapshot(host: CodexHost, slot: AgentSlot, sessions: [HostSessionPresence])
    -> HostSnapshot
  {
    snapshot(host: host, slots: [slot], sessions: sessions)
  }

  private func snapshot(
    host: CodexHost, slots: [AgentSlot] = [], sessions: [HostSessionPresence] = [],
    usageObservedAt: Double? = nil
  ) -> HostSnapshot {
    let empty = (0..<6).map { index in
      slots.first(where: { $0.id == index })
        ?? AgentSlot(
          id: index, threadKey: nil, title: nil, status: "off", selected: false, activityAt: nil,
          ownedByHost: nil)
    }
    let usage = usageObservedAt.map { timestamp in
      UsageSnapshot(
        windows: [], observedAt: timestamp, resetCreditsAvailable: 1, resetCreditsApplicable: 1)
    }
    return HostSnapshot(
      host: host,
      observedAt: usageObservedAt ?? 1_000,
      snapshot: MicroSnapshot(
        slots: empty,
        activeThreadKey: nil,
        layout: MicroLayout(version: 1, slots: [:]),
        agentSource: "recent",
        lightingAutoOff: "never",
        theme: "light",
        usage: usage,
        hostSessions: sessions
      )
    )
  }
}
