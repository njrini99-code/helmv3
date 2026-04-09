import UIKit
import WebKit
import Capacitor

/// Custom CAPBridgeViewController that monitors web navigation.
/// If the user navigates away from /golf/ (e.g. back to the landing page),
/// it notifies the SceneDelegate to return to the native home screen.
class GolfBridgeViewController: CAPBridgeViewController {

    /// Called when the user navigates away from the golf section
    var onNavigateAway: (() -> Void)?

    private var urlObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()

        // Observe the web view's URL to detect navigation away from /golf/
        urlObservation = webView?.observe(\.url, options: [.new]) { [weak self] _, change in
            guard let url = change.newValue??.absoluteString else { return }

            // If the URL is NOT a /golf/ page (e.g. landing page "/", "/products", etc.)
            // then return to the native home screen
            let isGolfPage = url.contains("/golf/")
            let isAboutPage = url.contains("/about") || url.contains("/privacy") || url.contains("/terms")

            if !isGolfPage && !isAboutPage && !url.isEmpty {
                // Small delay to let the navigation settle, then go back to native
                DispatchQueue.main.async {
                    self?.onNavigateAway?()
                }
            }
        }
    }

    deinit {
        urlObservation?.invalidate()
    }
}
