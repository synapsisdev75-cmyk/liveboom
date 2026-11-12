import Foundation
import Capacitor
import FirebaseCore
import FirebaseAuth
#if RGCFA_INCLUDE_GOOGLE
import GoogleSignIn
#endif

class GoogleAuthProviderHandler: NSObject {
    var pluginImplementation: FirebaseAuthentication

    init(_ pluginImplementation: FirebaseAuthentication) {
        self.pluginImplementation = pluginImplementation
        super.init()
    }

    func signIn(call: CAPPluginCall) {
        startSignInWithGoogleFlow(call, isLink: false)
    }

    func link(call: CAPPluginCall) {
        startSignInWithGoogleFlow(call, isLink: true)
    }

    func signOut() {
        #if RGCFA_INCLUDE_GOOGLE
        GIDSignIn.sharedInstance.signOut()
        #endif
    }

    private func startSignInWithGoogleFlow(_ call: CAPPluginCall, isLink: Bool) {
        #if RGCFA_INCLUDE_GOOGLE
        guard let clientId = FirebaseApp.app()?.options.clientID else {
            let message = "Falta el client ID de Google en Firebase."
            if isLink {
                self.pluginImplementation.handleFailedLink(message: message, error: nil)
            } else {
                self.pluginImplementation.handleFailedSignIn(message: message, error: nil)
            }
            return
        }
        // skipNativeAuth + Firebase JS: el idToken debe llevar aud = Web client ID.
        // Si serverClientID = CLIENT_ID de iOS, signInWithCredential falla (error en Review).
        let serverClientId = self.googleWebClientID() ?? clientId
        let config = GIDConfiguration(clientID: clientId, serverClientID: serverClientId)
        GIDSignIn.sharedInstance.configuration = config
        let scopes = call.getArray("scopes", String.self) ?? []
        let bridgeController = self.pluginImplementation.getPlugin().bridge?.viewController

        DispatchQueue.main.async {
            // iPad + UIScene: el bridge a veces no tiene window; sin VC la hoja no abre y el JS se queda colgado.
            let controller = self.resolvePresentingController(prefer: bridgeController)
            guard let controller else {
                let message = "No hay una ventana para mostrar Google Sign-In."
                if isLink {
                    self.pluginImplementation.handleFailedLink(message: message, error: nil)
                } else {
                    self.pluginImplementation.handleFailedSignIn(message: message, error: nil)
                }
                return
            }
            GIDSignIn.sharedInstance.signIn(withPresenting: controller, hint: nil, additionalScopes: scopes) { [unowned self] result, error in
                if let error = error {
                    if isLink == true {
                        self.pluginImplementation.handleFailedLink(message: nil, error: error)
                    } else {
                        self.pluginImplementation.handleFailedSignIn(message: nil, error: error)
                    }
                    return
                }

                guard let user = result?.user,
                      let idToken = user.idToken?.tokenString
                else {
                    let message = "Google no devolvió un token."
                    if isLink {
                        self.pluginImplementation.handleFailedLink(message: message, error: nil)
                    } else {
                        self.pluginImplementation.handleFailedSignIn(message: message, error: nil)
                    }
                    return
                }
                let accessToken = user.accessToken.tokenString
                let serverAuthCode = result?.serverAuthCode
                let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
                if isLink == true {
                    self.pluginImplementation.handleSuccessfulLink(credential: credential, idToken: idToken, nonce: nil,
                                                                   accessToken: accessToken, serverAuthCode: serverAuthCode, displayName: nil, authorizationCode: nil)
                } else {
                    self.pluginImplementation.handleSuccessfulSignIn(credential: credential, idToken: idToken, nonce: nil,
                                                                     accessToken: accessToken, displayName: nil, authorizationCode: nil, serverAuthCode: serverAuthCode)
                }
            }
        }
        #else
        let message = "Google Sign-In no está incluido en esta build."
        if isLink {
            self.pluginImplementation.handleFailedLink(message: message, error: nil)
        } else {
            self.pluginImplementation.handleFailedSignIn(message: message, error: nil)
        }
        #endif
    }

    /// Web OAuth client de Firebase Auth (Google provider). Preferir GoogleService-Info WEB_CLIENT_ID.
    private func googleWebClientID() -> String? {
        if let fromPlist = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String {
            let trimmed = fromPlist.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let dict = NSDictionary(contentsOfFile: path),
           let web = dict["WEB_CLIENT_ID"] as? String {
            let trimmed = web.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        // Fallback: Web client ID del proveedor Google en Firebase Auth (liveboom-app).
        return "1092886082330-cb81jgp4gm9m3qsvdguut7gitl9s2bpi.apps.googleusercontent.com"
    }

    private func resolvePresentingController(prefer preferred: UIViewController?) -> UIViewController? {
        if let preferred, preferred.view.window != nil {
            return topMost(from: preferred) ?? preferred
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let windows = scenes.flatMap(\.windows)
        let key = windows.first(where: \.isKeyWindow) ?? windows.first
        if let root = key?.rootViewController {
            return topMost(from: root) ?? root
        }
        return preferred
    }

    private func topMost(from root: UIViewController) -> UIViewController? {
        if let presented = root.presentedViewController {
            return topMost(from: presented) ?? presented
        }
        if let nav = root as? UINavigationController {
            if let visible = nav.visibleViewController {
                return topMost(from: visible) ?? visible
            }
            return nav
        }
        if let tabs = root as? UITabBarController {
            if let selected = tabs.selectedViewController {
                return topMost(from: selected) ?? selected
            }
            return tabs
        }
        return root
    }
}
