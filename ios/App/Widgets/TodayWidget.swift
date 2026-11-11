import SwiftUI
import WidgetKit

struct TodayEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

/// Redraws at each task's start (so "next" moves on by itself) and at midnight.
struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let s = WidgetStore.load()
        completion(TodayEntry(date: .now, snapshot: context.isPreview && s.tasks.isEmpty ? .preview : s))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let s = WidgetStore.load()
        let now = Date.now
        let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400))
        var dates: [Date] = [now]
        for task in s.tasks {
            for d in [task.startDate, task.endDate].compactMap({ $0 }) where d > now && d < midnight { dates.append(d) }
        }
        dates.append(midnight)
        let entries = Array(Set(dates)).sorted().prefix(40).map { TodayEntry(date: $0, snapshot: s) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    private var s: WidgetSnapshot { entry.snapshot }

    var body: some View {
        switch family {
        case .systemSmall: small
        case .systemMedium: medium
        default: large
        }
    }

    // Small: today's ring and the next task.
    private var small: some View {
        let p = s.progress(entry.date)
        let next = s.next(entry.date)
        return VStack(alignment: .leading, spacing: 8) {
            ProgressRing(done: p.done, total: p.total, lineWidth: 7)
                .frame(width: 52, height: 52)
            Spacer(minLength: 0)
            Text(s.strings.next.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            if let next {
                Text(next.title)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(2)
                if let d = next.startDate {
                    Text(s.time(d)).font(.system(size: 12, weight: .medium)).monospacedDigit().foregroundStyle(Spark.linear)
                }
            } else {
                Text(p.total > 0 ? s.strings.allDone : s.strings.nothingPlanned)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Spark.linear)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "universalplanner://today"))
    }

    // Medium: the next three tasks with checkboxes, plus the ring.
    private var medium: some View {
        let p = s.progress(entry.date)
        let open = s.today(entry.date).filter { !$0.done }
        return HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                ProgressRing(done: p.done, total: p.total, lineWidth: 7)
                    .frame(width: 56, height: 56)
                Spacer(minLength: 0)
                AddLink(label: s.strings.add)
            }
            VStack(alignment: .leading, spacing: 9) {
                Text(s.strings.today.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                if open.isEmpty {
                    Spacer(minLength: 0)
                    Text(p.total > 0 ? s.strings.allDone : s.strings.nothingPlanned)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Spark.linear)
                    Spacer(minLength: 0)
                } else {
                    ForEach(open.prefix(3)) { TaskLine(task: $0, snapshot: s) }
                    Spacer(minLength: 0)
                }
            }
        }
        .widgetURL(URL(string: "universalplanner://today"))
    }

    // Large: today's full list with times.
    private var large: some View {
        let p = s.progress(entry.date)
        let list = s.today(entry.date)
        let shown = Array(list.prefix(9))
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                ProgressRing(done: p.done, total: p.total, lineWidth: 6)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.strings.today).font(.system(size: 17, weight: .bold))
                    Text(entry.date, format: .dateTime.weekday(.wide).day().month(.wide))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                AddLink(label: s.strings.add)
            }
            Rectangle().fill(Spark.linear).frame(height: 2).opacity(0.6).clipShape(Capsule())
            if list.isEmpty {
                Spacer()
                Text(s.strings.nothingPlanned).font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(shown) { TaskLine(task: $0, snapshot: s) }
                if list.count > shown.count {
                    Text("+\(list.count - shown.count) \(s.strings.more)").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(URL(string: "universalplanner://today"))
    }
}

struct TodayWidget: Widget {
    let kind = "TodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(for: .widget) { GlassBackground() }
        }
        .configurationDisplayName("Today")
        .description("Your next task, today’s progress, and tasks you can check off right here.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

#Preview(as: .systemMedium) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, snapshot: .preview)
}
