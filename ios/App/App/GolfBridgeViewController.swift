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

    /// Edge swipe-back (MOT-13, RE-D1) is off while a round is being tracked
    /// (a stray edge swipe must not leave the scorecard mid-hole) and while
    /// the page reports an open sheet or dialog (the swipe would navigate the
    /// page underneath it). The page reports overlays through the `helmNav`
    /// message handler (src/components/golf/NativeSwipeBackBridge.tsx).
    private var onTrackingRoute = false
    private var overlayOpen = false
    private static let navMessageName = "helmNav"

    /// UserDefaults key holding the CFBundleVersion that last cleared the web cache.
    private static let cacheClearedBuildKey = "HelmWebCacheClearedForBuild"

    /// The page canvas, `--fw-color-canvas` in src/styles/design-tokens.css
    /// (light #F2E6D2, dark #0D0F0D). It is read from the FwColorCanvas colour
    /// asset, which LaunchScreen.storyboard also uses, so the launch screen,
    /// native view and webview are one colour in both appearances. The asset
    /// is named after the token; src/test/static/canvas-color-sync.test.ts
    /// fails if its values drift from the token. The inline dynamic colour is
    /// only a fallback in case the asset is missing.
    static let canvasColor: UIColor = UIColor(named: "FwColorCanvas") ?? UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 16.0/255.0, green: 17.0/255.0, blue: 16.0/255.0, alpha: 1.0)
            : UIColor(red: 247.0/255.0, green: 239.0/255.0, blue: 223.0/255.0, alpha: 1.0)
    }

    /// App-local Capacitor plugins register here (the documented hook for
    /// plugins that live in the app target rather than a package — CapApp-SPM's
    /// manifest is CLI-managed, so it cannot host first-party targets).
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HelmHapticsPlugin())
        bridge?.registerPluginInstance(HelmAppearancePlugin())

        // Native edge-swipe back/forward through the web history, like any
        // iOS navigation stack (Capacitor leaves this WKWebView default off).
        webView?.configuration.userContentController.add(
            HelmNavMessageHandler(owner: self), name: Self.navMessageName)
        applySwipeBack()
    }

    fileprivate func setOverlayOpen(_ open: Bool) {
        overlayOpen = open
        applySwipeBack()
    }

    private func applySwipeBack() {
        webView?.allowsBackForwardNavigationGestures = !(onTrackingRoute || overlayOpen)
    }

    /// Round entry: new round and continue round (FairwayDashboardShell
    /// renders both without chrome for the same reason).
    private static func isTrackingRoute(_ url: String) -> Bool {
        url.contains("/golf/dashboard/rounds/new") || url.contains("/golf/dashboard/rounds/continue")
    }

    /// Clears the WKWebView HTTP cache once per installed build instead of on
    /// every launch. Next.js `/_next/static` assets are content-hashed and the
    /// HTML is served no-cache, so a warm cache never serves a stale deploy;
    /// wiping it every launch only forced a full JS/CSS re-download on each
    /// cold start. A new CFBundleVersion still starts from a clean cache.
    private func clearWebCacheIfBuildChanged() {
        let defaults = UserDefaults.standard
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        guard defaults.string(forKey: Self.cacheClearedBuildKey) != build else { return }

        let dataTypes: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
        WKWebsiteDataStore.default().removeData(ofTypes: dataTypes, modifiedSince: .distantPast) {
            // Recorded only after the clear finishes, so a launch killed
            // mid-clear retries on the next launch.
            defaults.set(build, forKey: Self.cacheClearedBuildKey)
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        clearWebCacheIfBuildChanged()

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

            // Same canvas as the launch screen and the page, light and dark,
            // so a cold start has no colour step (and no flash in dark mode).
            let canvas = Self.canvasColor
            view.backgroundColor = canvas
            webView.isOpaque = false
            webView.backgroundColor = canvas
            webView.scrollView.backgroundColor = canvas

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

            // pushState navigations update `url` too, so this follows the SPA.
            let tracking = Self.isTrackingRoute(url)
            if tracking != self?.onTrackingRoute {
                self?.onTrackingRoute = tracking
                self?.applySwipeBack()
            }

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
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.navMessageName)
    }
}

/// Receives `{ overlayOpen: Bool }` from the page. Holds the controller weakly:
/// WKUserContentController retains its handlers, so a strong reference would
/// keep the controller alive forever.
private final class HelmNavMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var owner: GolfBridgeViewController?

    init(owner: GolfBridgeViewController) {
        self.owner = owner
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let open = body["overlayOpen"] as? Bool else { return }
        owner?.setOverlayOpen(open)
    }
}

/// MOT-14: the web layer's theme choice, applied to the window so the dynamic
/// `canvasColor` (web view, scroll view and root view backgrounds, which the
/// rubber-band bounce exposes) and the status bar resolve against the APP's
/// light/dark choice rather than only the system's. "system" clears the
/// override. Lives in this file, not its own, so the Xcode target needs no new
/// file reference. Web bridge: src/lib/native/helm-appearance.ts.
@objc(HelmAppearancePlugin)
public class HelmAppearancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HelmAppearancePlugin"
    public let jsName = "HelmAppearance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise),
    ]

    @objc func setStyle(_ call: CAPPluginCall) {
        let style: UIUserInterfaceStyle
        switch call.getString("style") {
        case "dark": style = .dark
        case "light": style = .light
        default: style = .unspecified
        }
        DispatchQueue.main.async { [weak self] in
            guard let window = self?.bridge?.viewController?.view.window else {
                call.resolve()
                return
            }
            window.overrideUserInterfaceStyle = style
            call.resolve()
        }
    }
}
