import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import GoogleSignIn
import ObjectiveC
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        IPadPickerCrashFix.install()
        FirebaseApp.configure()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        refreshEdgeBackGesture()
        DispatchQueue.main.async { [weak self] in
            self?.refreshEdgeBackGesture()
        }
    }

    /// El atrás con el dedo lo hace la web (una sola página). El gesto nativo del WebView
    /// mostraría una página en blanco y se desactiva.
    func refreshEdgeBackGesture() {
        let sceneWindows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        var windows = sceneWindows
        if let window, !windows.contains(where: { $0 === window }) {
            windows.append(window)
        }
        for window in windows {
            setEdgeBackGesture(in: window)
        }
    }

    private func setEdgeBackGesture(in view: UIView) {
        if let webView = view as? WKWebView {
            webView.allowsBackForwardNavigationGestures = false
        }
        for subview in view.subviews {
            setEdgeBackGesture(in: subview)
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

/// En iPad, «Take Photo or Video» abre la cámara como popover. Si no tiene
/// un origen, UIKit cierra la app. Este ajuste pone un origen antes de mostrarla.
enum IPadPickerCrashFix {
    private static var installed = false

    static func install() {
        guard !installed else { return }
        installed = true
        let cls: AnyClass = UIViewController.self
        let original = #selector(UIViewController.present(_:animated:completion:))
        let swizzled = #selector(UIViewController.lb_presentForIPadPicker(_:animated:completion:))
        guard let first = class_getInstanceMethod(cls, original),
              let second = class_getInstanceMethod(cls, swizzled) else { return }
        method_exchangeImplementations(first, second)
    }
}

extension UIViewController {
    @objc func lb_presentForIPadPicker(
        _ viewControllerToPresent: UIViewController,
        animated flag: Bool,
        completion: (() -> Void)? = nil
    ) {
        if UIDevice.current.userInterfaceIdiom == .pad,
           let pop = viewControllerToPresent.popoverPresentationController,
           pop.sourceView == nil,
           pop.barButtonItem == nil,
           let host = view {
            pop.sourceView = host
            pop.sourceRect = CGRect(x: host.bounds.midX, y: host.bounds.midY, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        lb_presentForIPadPicker(viewControllerToPresent, animated: flag, completion: completion)
    }
}
