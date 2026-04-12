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

        // Clear WKWebView cache so we always load the latest Vercel deployment
        let dataStore = WKWebsiteDataStore.default()
        let dataTypes = Set([WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache])
        dataStore.removeData(ofTypes: dataTypes, modifiedSince: .distantPast) { }

        if let webView = webView {
            webView.translatesAutoresizingMaskIntoConstraints = false
            webView.scrollView.contentInsetAdjustmentBehavior = .never

            // Remove Capacitor's default constraints
            for constraint in view.constraints {
                if constraint.firstItem === webView || constraint.secondItem === webView {
                    view.removeConstraint(constraint)
                }
            }

            // Edge-to-edge so backgrounds (sidebar, modals) fill the whole screen
            NSLayoutConstraint.activate([
                webView.topAnchor.constraint(equalTo: view.topAnchor),
                webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
            ])

            let cream = UIColor(red: 1.0, green: 254.0/255.0, blue: 250.0/255.0, alpha: 1.0)
            view.backgroundColor = cream
            webView.isOpaque = false
            webView.backgroundColor = cream
            webView.scrollView.backgroundColor = cream

            // Inject viewport-fit=cover as a safety net if the HTML is missing it.
            // We intentionally do NOT inject body-level safe-area padding: the web
            // code already handles env(safe-area-inset-*) at the component level
            // (mobile page header, bottom nav, sidebar). Injecting body padding
            // here caused double-padding at the top and pushed content ~120px
            // below the Dynamic Island on notched iPhones.
            let script = """
            (function() {
                var meta = document.querySelector('meta[name="viewport"]');
                if (meta) {
                    var content = meta.getAttribute('content') || '';
                    if (content.indexOf('viewport-fit') === -1) {
                        meta.setAttribute('content', content + ', viewport-fit=cover');
                    }
                } else {
                    meta = document.createElement('meta');
                    meta.name = 'viewport';
                    meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
                    document.head.appendChild(meta);
                }
            })();
            """
            let userScript = WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
            webView.configuration.userContentController.addUserScript(userScript)
        }

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
