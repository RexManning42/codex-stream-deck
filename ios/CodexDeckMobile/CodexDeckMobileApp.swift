import SwiftUI

@main
struct CodexDeckMobileApp: App {
  @State private var store = DashboardStore()

  var body: some Scene {
    WindowGroup {
      DashboardView()
        .environment(store)
        .task { await store.start() }
    }
  }
}
