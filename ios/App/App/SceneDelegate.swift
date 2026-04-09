import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Create our own window with the native home screen as root.
        // This replaces the storyboard-created window entirely so the
        // web view never shows until the user taps Sign In.
        let window = UIWindow(windowScene: windowScene)

        let homeVC = HomeViewController()
        homeVC.onGolfHelmSignIn = { [weak self] in
            self?.transitionToWebApp()
        }

        window.rootViewController = homeVC
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

    // MARK: - Transition to Capacitor Web App

    private func transitionToWebApp() {
        guard let window = self.window else { return }

        // Instantiate the Capacitor bridge from the storyboard
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        guard let bridgeVC = storyboard.instantiateInitialViewController() as? GolfBridgeViewController else { return }

        // If the user navigates away from /golf/ (e.g. hits "back" to landing page),
        // return them to the native home screen instead
        bridgeVC.onNavigateAway = { [weak self] in
            self?.transitionToHomeScreen()
        }

        UIView.transition(with: window, duration: 0.35, options: .transitionCrossDissolve, animations: {
            window.rootViewController = bridgeVC
        })
    }

    // MARK: - Return to Native Home Screen

    private func transitionToHomeScreen() {
        guard let window = self.window else { return }

        let homeVC = HomeViewController()
        homeVC.onGolfHelmSignIn = { [weak self] in
            self?.transitionToWebApp()
        }

        UIView.transition(with: window, duration: 0.35, options: .transitionCrossDissolve, animations: {
            window.rootViewController = homeVC
        })
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
