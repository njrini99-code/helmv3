import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Load the Capacitor web view directly as the root. The first screen
        // the user sees is now the Scenic Chooser sign-in page (/golf/login),
        // rendered by the web app. The native HomeViewController is retained
        // in the bundle but no longer shown on cold start.
        let window = UIWindow(windowScene: windowScene)

        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        let rootVC: UIViewController
        if let bridgeVC = storyboard.instantiateInitialViewController() as? GolfBridgeViewController {
            bridgeVC.onNavigateAway = { [weak bridgeVC] in
                // Web app navigated outside /golf/ (e.g. the marketing site).
                // Bring them back to the Scenic sign-in instead of the removed
                // native chooser.
                if let webView = bridgeVC?.webView,
                   let url = URL(string: "https://www.helmsportslabs.com/golf/login") {
                    webView.load(URLRequest(url: url))
                }
            }
            rootVC = bridgeVC
        } else {
            rootVC = UIViewController()
        }

        window.rootViewController = rootVC
        window.makeKeyAndVisible()
        self.window = window

        // Handle any URLs passed at launch
        if let urlContext = connectionOptions.urlContexts.first {
            let _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: urlContext.url,
                options: [:]
            )
        }

        // Handle any user activities (universal links) passed at launch
        if let userActivity = connectionOptions.userActivities.first {
            let _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: userActivity,
                restorationHandler: { _ in }
            )
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        let _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: url,
            options: [:]
        )
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        let _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
    }

    func sceneWillResignActive(_ scene: UIScene) {
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
    }
}
