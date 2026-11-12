import UIKit
import Capacitor
import GoogleSignIn

/// iOS 27 cierra la app al abrirla si no hay ciclo de vida de escenas.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        // Storyboard crea la ventana; guardamos referencia para Google/Apple en iPad.
        if let windowScene = scene as? UIWindowScene {
            window = windowScene.windows.first ?? window
            (UIApplication.shared.delegate as? AppDelegate)?.window = window
        }
        for context in connectionOptions.urlContexts {
            _ = handleOpenURL(context.url)
        }
        if let activity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: activity,
                restorationHandler: { _ in }
            )
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (UIApplication.shared.delegate as? AppDelegate)?.refreshEdgeBackGesture()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = handleOpenURL(context.url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    private func handleOpenURL(_ url: URL) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }
}
