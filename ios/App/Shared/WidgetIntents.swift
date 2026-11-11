import AppIntents
import Foundation
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Checks a task off (or back on) straight from a widget, without opening the app.
@available(iOS 17.0, *)
struct ToggleTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Check off task"
    static let isDiscoverable = false

    @Parameter(title: "Task") var taskId: String
    @Parameter(title: "Done") var done: Bool

    init() {}
    init(taskId: String, done: Bool) {
        self.taskId = taskId
        self.done = done
    }

    func perform() async throws -> some IntentResult {
        WidgetStore.setDone(taskId, done)
        return .result()
    }
}

/// The "Done" button on a Live Activity: finishes the task and ends the activity.
@available(iOS 17.0, *)
struct CompleteFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Finish task"
    static let isDiscoverable = false

    @Parameter(title: "Task") var taskId: String

    init() {}
    init(taskId: String) {
        self.taskId = taskId
    }

    func perform() async throws -> some IntentResult {
        if !taskId.isEmpty { WidgetStore.setDone(taskId, true) }
        #if canImport(ActivityKit)
        for activity in Activity<FocusAttributes>.activities {
            let state = FocusAttributes.ContentState(endsAt: .now, pausedRemaining: nil, done: true)
            await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .after(.now.addingTimeInterval(5)))
        }
        #endif
        return .result()
    }
}
