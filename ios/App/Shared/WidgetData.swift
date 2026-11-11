import Foundation
import WidgetKit

/// The App Group both the app and the widget extension can read and write.
enum AppGroup {
    static let id = "group.com.eternalinc.universalplanner"
    static var defaults: UserDefaults { UserDefaults(suiteName: id) ?? .standard }
}

/// One task as the widgets see it. Times are milliseconds since 1970, as in the app.
struct WidgetTask: Codable, Hashable, Identifiable {
    var id: String
    var title: String
    /// The day it belongs to (yyyy-MM-dd, local time).
    var day: String
    var start: Double?
    var end: Double?
    var done: Bool
    var priority: Int
    var repeats: Bool?

    var startDate: Date? { start.map { Date(timeIntervalSince1970: $0 / 1000) } }
    var endDate: Date? { end.map { Date(timeIntervalSince1970: $0 / 1000) } }
}

/// Labels in the app's language, so widgets match it.
struct WidgetStrings: Codable, Hashable {
    var today: String
    var next: String
    var allDone: String
    var nothingPlanned: String
    var add: String
    var done: String
    var anytime: String
    var more: String
}

/// What the app writes for the widgets: today's and tomorrow's tasks (overdue ones count as today).
struct WidgetSnapshot: Codable, Hashable {
    var version: Int
    var generatedAt: Double
    var tasks: [WidgetTask]
    var strings: WidgetStrings
    var clock24: Bool

    /// Tasks for the day of `now`: that day's, plus anything overdue and still open.
    func today(_ now: Date = .now) -> [WidgetTask] {
        let key = WidgetSnapshot.dayKey(now)
        return tasks
            .filter { $0.day == key || ($0.day < key && !$0.done) }
            .sorted { a, b in
                switch (a.start, b.start) {
                case let (x?, y?): return x < y
                case (_?, nil): return true
                case (nil, _?): return false
                default: return a.priority > b.priority
                }
            }
    }

    func progress(_ now: Date = .now) -> (done: Int, total: Int) {
        let list = today(now)
        return (list.filter(\.done).count, list.count)
    }

    /// The next open task: the first one still to start (or under way), else the first open one.
    func next(_ now: Date = .now) -> WidgetTask? {
        let open = today(now).filter { !$0.done }
        let ms = now.timeIntervalSince1970 * 1000
        return open.first { ($0.end ?? $0.start ?? 0) >= ms && $0.start != nil } ?? open.first { $0.start == nil } ?? open.first
    }

    func time(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = clock24 ? "HH:mm" : "h:mm a"
        return f.string(from: date)
    }

    static func dayKey(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static let empty = WidgetSnapshot(
        version: 1,
        generatedAt: 0,
        tasks: [],
        strings: WidgetStrings(today: "Today", next: "Next", allDone: "All done", nothingPlanned: "Nothing planned", add: "Add", done: "Done", anytime: "Anytime", more: "more"),
        clock24: false
    )

    /// Shown in the widget gallery.
    static var preview: WidgetSnapshot {
        let today = dayKey(.now)
        let base = Calendar.current.startOfDay(for: .now).timeIntervalSince1970 * 1000
        var s = empty
        s.tasks = [
            WidgetTask(id: "1", title: "Stretch", day: today, start: base + 8 * 3_600_000, end: nil, done: true, priority: 0),
            WidgetTask(id: "2", title: "Reply to Maya", day: today, start: base + 10 * 3_600_000, end: nil, done: true, priority: 1),
            WidgetTask(id: "3", title: "Gym", day: today, start: base + 19 * 3_600_000, end: base + 20 * 3_600_000, done: false, priority: 0),
            WidgetTask(id: "4", title: "Read 20 min", day: today, start: base + 21 * 3_600_000, end: nil, done: false, priority: 3),
            WidgetTask(id: "5", title: "Call mom", day: today, start: nil, end: nil, done: false, priority: 0, repeats: true),
        ]
        return s
    }
}

/// A change made in a widget or a Live Activity, applied by the app the next time it's open.
struct PendingAction: Codable, Hashable {
    var type: String // "complete" | "uncomplete"
    var id: String
    var at: Double
}

enum WidgetStore {
    private static let snapshotKey = "snapshot"
    private static let actionsKey = "pendingActions"

    static func load() -> WidgetSnapshot {
        guard let data = AppGroup.defaults.data(forKey: snapshotKey), let s = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else { return .empty }
        return s
    }

    static func save(_ s: WidgetSnapshot) {
        if let data = try? JSONEncoder().encode(s) { AppGroup.defaults.set(data, forKey: snapshotKey) }
    }

    /// From the app: the snapshot as JSON. Actions it hasn't seen yet stay applied on top.
    static func saveJSON(_ json: String) {
        guard let data = json.data(using: .utf8), var s = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else { return }
        for a in pendingActions() {
            if let i = s.tasks.firstIndex(where: { $0.id == a.id }) { s.tasks[i].done = a.type == "complete" }
        }
        save(s)
    }

    /// From a widget: checks a task off (or on) right away and queues the change for the app.
    static func setDone(_ id: String, _ done: Bool) {
        var s = load()
        if let i = s.tasks.firstIndex(where: { $0.id == id }) { s.tasks[i].done = done }
        save(s)
        var actions = pendingActions().filter { $0.id != id }
        actions.append(PendingAction(type: done ? "complete" : "uncomplete", id: id, at: Date.now.timeIntervalSince1970 * 1000))
        if let data = try? JSONEncoder().encode(actions) { AppGroup.defaults.set(data, forKey: actionsKey) }
        reloadWidgets()
    }

    static func pendingActions() -> [PendingAction] {
        guard let data = AppGroup.defaults.data(forKey: actionsKey) else { return [] }
        return (try? JSONDecoder().decode([PendingAction].self, from: data)) ?? []
    }

    /// For the app: the queued changes, which are then cleared.
    static func takeActions() -> [PendingAction] {
        let actions = pendingActions()
        AppGroup.defaults.removeObject(forKey: actionsKey)
        return actions
    }

    static func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
