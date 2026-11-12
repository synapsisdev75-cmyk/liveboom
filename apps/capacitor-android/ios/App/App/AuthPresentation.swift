import UIKit

/// Ventana y controlador visibles para Google / Apple en iPad (UIScene).
enum AuthPresentation {
    static func keyWindow() -> UIWindow? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let windows = scenes.flatMap(\.windows)
        if let key = windows.first(where: \.isKeyWindow) { return key }
        return windows.first
    }

    static func topViewController(from root: UIViewController?) -> UIViewController? {
        guard let root else { return nil }
        if let presented = root.presentedViewController {
            return topViewController(from: presented)
        }
        if let nav = root as? UINavigationController {
            return topViewController(from: nav.visibleViewController) ?? nav
        }
        if let tabs = root as? UITabBarController {
            return topViewController(from: tabs.selectedViewController) ?? tabs
        }
        return root
    }

    static func presentingViewController(prefer preferred: UIViewController?) -> UIViewController? {
        if let preferred, preferred.view.window != nil {
            return topViewController(from: preferred) ?? preferred
        }
        if let root = keyWindow()?.rootViewController {
            return topViewController(from: root) ?? root
        }
        if let preferred { return preferred }
        return nil
    }
}
