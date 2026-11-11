import ActivityKit
import SwiftUI
import WidgetKit

/// The running task or focus session on the Lock Screen and in the Dynamic Island.
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusAttributes.self) { context in
            FocusLockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "universalplanner://focus"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.done ? "checkmark.circle.fill" : "timer")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(Spark.linear)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state)
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .frame(maxWidth: 80)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title)
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !context.state.done {
                        DoneButton(taskId: context.attributes.taskId, label: context.attributes.doneLabel)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(Spark.linear)
            } compactTrailing: {
                Countdown(state: context.state)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: context.state.done ? "checkmark" : "timer").foregroundStyle(Spark.linear)
            }
            .widgetURL(URL(string: "universalplanner://focus"))
            .keylineTint(Spark.pink)
        }
    }
}

/// Counts down to the end, or shows what was left while paused.
struct Countdown: View {
    let state: FocusAttributes.ContentState

    var body: some View {
        if state.done {
            Image(systemName: "checkmark")
        } else if let left = state.pausedRemaining {
            Text(Duration.seconds(max(0, left)).formatted(.time(pattern: .minuteSecond)))
                .monospacedDigit()
                .opacity(0.6)
        } else {
            Text(timerInterval: Date.now...max(state.endsAt, Date.now), countsDown: true)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
        }
    }
}

struct DoneButton: View {
    let taskId: String
    let label: String

    var body: some View {
        Button(intent: CompleteFocusIntent(taskId: taskId)) {
            Label(label, systemImage: "checkmark")
                .font(.system(size: 14, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(Spark.pink)
    }
}

struct FocusLockScreenView: View {
    let context: ActivityViewContext<FocusAttributes>

    var body: some View {
        let s = context.state
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: s.done ? "checkmark.circle.fill" : "timer")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Spark.linear)
                Text(context.attributes.title)
                    .font(.system(size: 16, weight: .semibold))
                    .lineLimit(1)
                    .foregroundStyle(.white)
                Spacer()
                Countdown(state: s)
                    .font(.system(size: 26, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
            if !s.done {
                if s.pausedRemaining == nil {
                    ProgressView(timerInterval: context.attributes.startedAt...max(s.endsAt, context.attributes.startedAt.addingTimeInterval(1)), countsDown: false) {
                        EmptyView()
                    } currentValueLabel: {
                        EmptyView()
                    }
                    .tint(Spark.pink)
                }
                DoneButton(taskId: context.attributes.taskId, label: context.attributes.doneLabel)
            }
        }
        .padding(16)
    }
}
