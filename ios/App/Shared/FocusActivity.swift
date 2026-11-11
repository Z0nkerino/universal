import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// A running task or focus session, shown as a Live Activity and in the Dynamic Island.
@available(iOS 16.1, *)
struct FocusAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// When the countdown reaches zero.
        var endsAt: Date
        /// Set while paused: seconds that were left.
        var pausedRemaining: Double?
        var done: Bool
    }

    var taskId: String
    var title: String
    var startedAt: Date
    /// "Done" in the app's language.
    var doneLabel: String
}
#endif
