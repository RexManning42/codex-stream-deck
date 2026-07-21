import BackgroundTasks
import Foundation

enum WidgetBackgroundRefresh {
  static let taskIdentifier = Bundle.main.object(
    forInfoDictionaryKey: "CodexDeckWidgetRefreshIdentifier") as? String
    ?? "com.example.CodexDeckMobile.widget-refresh"

  static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
      guard let refreshTask = task as? BGAppRefreshTask else {
        task.setTaskCompleted(success: false)
        return
      }

      let work = Task { @MainActor in
        let store = DashboardStore()
        return await store.refreshWidgetSnapshots()
      }
      refreshTask.expirationHandler = { work.cancel() }

      Task {
        let refreshed = await work.value
        refreshTask.setTaskCompleted(success: refreshed)
        schedule()
      }
    }
  }

  static func schedule() {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
    let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }
}
