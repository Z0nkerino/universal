import SwiftUI
import WidgetKit

/// Lock Screen: today's progress as a ring.
struct LockProgressWidget: Widget {
    let kind = "LockProgressWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            let p = entry.snapshot.progress(entry.date)
            Gauge(value: Double(p.done), in: 0...Double(max(p.total, 1))) {
                Image(systemName: "checkmark")
            } currentValueLabel: {
                Text("\(p.done)/\(p.total)").monospacedDigit()
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetURL(URL(string: "universalplanner://today"))
            .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        }
        .configurationDisplayName("Today’s progress")
        .description("How many of today’s tasks are done.")
        .supportedFamilies([.accessoryCircular])
    }
}

/// Lock Screen: the next task, with its time.
struct LockNextWidget: Widget {
    let kind = "LockNextWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            LockNextView(entry: entry)
                .widgetURL(URL(string: "universalplanner://today"))
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Next task")
        .description("What’s next today.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}

struct LockNextView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    var body: some View {
        let s = entry.snapshot
        let p = s.progress(entry.date)
        let next = s.next(entry.date)
        if family == .accessoryInline {
            if let next {
                Text("\(p.done)/\(p.total) · \(next.title)\(next.startDate.map { " " + s.time($0) } ?? "")")
            } else {
                Text("\(p.done)/\(p.total) · \(p.total > 0 ? s.strings.allDone : s.strings.nothingPlanned)")
            }
        } else {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Image(systemName: "checklist")
                    Text("\(s.strings.next) · \(p.done)/\(p.total)")
                }
                .font(.system(size: 12, weight: .semibold))
                .widgetAccentable()
                if let next {
                    Text(next.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                    Text(next.startDate.map { s.time($0) } ?? s.strings.anytime).font(.system(size: 13)).monospacedDigit()
                } else {
                    Text(p.total > 0 ? s.strings.allDone : s.strings.nothingPlanned).font(.system(size: 15, weight: .semibold))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
