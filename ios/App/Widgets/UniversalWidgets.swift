import SwiftUI
import WidgetKit

@main
struct UniversalWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        LockProgressWidget()
        LockNextWidget()
        FocusLiveActivity()
    }
}
