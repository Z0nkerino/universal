import SwiftUI
import WidgetKit

/// The app's look in widgets: black and white with the blue → pink → yellow spark for progress.
enum Spark {
    static let blue = Color(red: 0.184, green: 0.420, blue: 1.0)
    static let pink = Color(red: 1.0, green: 0.310, blue: 0.639)
    static let sun = Color(red: 1.0, green: 0.690, blue: 0.125)

    static let linear = LinearGradient(colors: [blue, pink, sun], startPoint: .leading, endPoint: .trailing)
    static let ring = AngularGradient(colors: [blue, pink, sun, blue], center: .center, startAngle: .degrees(0), endAngle: .degrees(360))
}

/// Liquid-glass background: a calm surface with soft blue and pink light behind it.
struct GlassBackground: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            (scheme == .dark ? Color(white: 0.07) : Color.white)
            Circle()
                .fill(Spark.blue.opacity(scheme == .dark ? 0.28 : 0.18))
                .frame(width: 180, height: 180)
                .blur(radius: 60)
                .offset(x: -70, y: -60)
            Circle()
                .fill(Spark.pink.opacity(scheme == .dark ? 0.22 : 0.14))
                .frame(width: 160, height: 160)
                .blur(radius: 60)
                .offset(x: 80, y: 70)
            LinearGradient(colors: [.white.opacity(scheme == .dark ? 0.06 : 0.5), .clear], startPoint: .top, endPoint: .center)
        }
    }
}

/// Today's progress as a ring in the spark gradient.
struct ProgressRing: View {
    var done: Int
    var total: Int
    var lineWidth: CGFloat = 8
    var showLabel = true

    private var progress: Double { total == 0 ? 0 : Double(done) / Double(total) }

    var body: some View {
        ZStack {
            Circle().stroke(Color.primary.opacity(0.1), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(progress, 0.0001))
                .stroke(Spark.ring, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if showLabel {
                Text("\(done)/\(total)")
                    .font(.system(size: lineWidth * 1.9, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
            }
        }
    }
}

/// A round checkbox that checks the task off in place (iOS 17 interactive widgets).
struct CheckButton: View {
    var task: WidgetTask
    var size: CGFloat = 20

    var body: some View {
        Button(intent: ToggleTaskIntent(taskId: task.id, done: !task.done)) {
            ZStack {
                if task.done {
                    Circle().fill(Spark.linear)
                    Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .bold)).foregroundStyle(.white)
                } else {
                    Circle().strokeBorder(Color.primary.opacity(0.35), lineWidth: 1.5)
                }
            }
            .frame(width: size, height: size)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(task.done ? "\(task.title), done" : task.title)
    }
}

/// One task row: checkbox, title, and its time.
struct TaskLine: View {
    var task: WidgetTask
    var snapshot: WidgetSnapshot
    var showTime = true

    var body: some View {
        HStack(spacing: 8) {
            CheckButton(task: task)
            Text(task.title)
                .font(.system(size: 14, weight: .medium))
                .strikethrough(task.done)
                .foregroundStyle(task.done ? .secondary : .primary)
                .lineLimit(1)
            if task.priority == 3 && !task.done {
                Image(systemName: "flag.fill").font(.system(size: 9)).foregroundStyle(Spark.pink)
            }
            Spacer(minLength: 4)
            if showTime {
                Text(task.startDate.map { snapshot.time($0) } ?? snapshot.strings.anytime)
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// Opens quick add in the app.
struct AddLink: View {
    var label: String

    var body: some View {
        Link(destination: URL(string: "universalplanner://quickadd")!) {
            Label(label, systemImage: "plus")
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.primary.opacity(0.08)))
        }
    }
}
