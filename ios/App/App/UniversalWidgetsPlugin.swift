import Capacitor
import Foundation
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Bridge between the web app and the native widgets (see src/lib/widgets.ts).
@objc(UniversalWidgetsPlugin)
public class UniversalWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UniversalWidgetsPlugin"
    public let jsName = "UniversalWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endActivity", returnType: CAPPluginReturnPromise),
    ]

    /// Today's tasks as JSON; widgets redraw right away.
    @objc func setSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { return call.reject("Missing json") }
        WidgetStore.saveJSON(json)
        WidgetStore.reloadWidgets()
        call.resolve()
    }

    /// Tasks checked off (or on) in widgets and Live Activities since the app last looked.
    @objc func takePendingActions(_ call: CAPPluginCall) {
        let actions = WidgetStore.takeActions().map { ["type": $0.type, "id": $0.id, "at": $0.at] as [String: Any] }
        call.resolve(["actions": actions])
    }

    @objc func startActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return call.resolve(["started": false]) }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return call.resolve(["started": false]) }
        let attributes = FocusAttributes(
            taskId: call.getString("id") ?? "",
            title: call.getString("title") ?? "",
            startedAt: Self.date(call.getDouble("startedAt")) ?? .now,
            doneLabel: call.getString("doneLabel") ?? "Done"
        )
        let state = FocusAttributes.ContentState(endsAt: Self.date(call.getDouble("endsAt")) ?? .now.addingTimeInterval(1500), pausedRemaining: nil, done: false)
        Task {
            // One session at a time.
            for a in Activity<FocusAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            do {
                _ = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: state.endsAt.addingTimeInterval(3600)), pushType: nil)
                call.resolve(["started": true])
            } catch {
                call.resolve(["started": false, "error": error.localizedDescription])
            }
        }
        #else
        call.resolve(["started": false])
        #endif
    }

    /// Pause (`paused` + `remainingMs`) or resume (`endsAt`).
    @objc func updateActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return call.resolve() }
        let paused = call.getBool("paused") ?? false
        let remaining = (call.getDouble("remainingMs") ?? 0) / 1000
        let endsAt = Self.date(call.getDouble("endsAt"))
        Task {
            for a in Activity<FocusAttributes>.activities {
                var s = a.content.state
                s.pausedRemaining = paused ? remaining : nil
                s.endsAt = paused ? .now.addingTimeInterval(remaining) : (endsAt ?? s.endsAt)
                await a.update(ActivityContent(state: s, staleDate: nil))
            }
            call.resolve()
        }
        #else
        call.resolve()
        #endif
    }

    @objc func endActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return call.resolve() }
        let done = call.getBool("done") ?? false
        Task {
            for a in Activity<FocusAttributes>.activities {
                var s = a.content.state
                s.done = done
                await a.end(ActivityContent(state: s, staleDate: nil), dismissalPolicy: done ? .after(.now.addingTimeInterval(5)) : .immediate)
            }
            call.resolve()
        }
        #else
        call.resolve()
        #endif
    }

    private static func date(_ ms: Double?) -> Date? {
        ms.map { Date(timeIntervalSince1970: $0 / 1000) }
    }
}
