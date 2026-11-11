import Capacitor
import UIKit

/// The app's web view. Registers the plugin that feeds the widgets and Live Activities.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(UniversalWidgetsPlugin())
    }
}
