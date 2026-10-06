import Foundation
import Capacitor
import StoreKit

@objc(AppleIAPPlugin)
public class AppleIAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleIAPPlugin"
    public let jsName = "AppleIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise)
    ]

    private let queue = DispatchQueue(label: "liveboom.apple-iap")
    private var openTransactions: [String: [String: String]] = [:]
    private var liveTransactions: [String: Any] = [:]

    override public func load() {
        guard #available(iOS 15.0, *) else { return }
        listenForUnfinished()
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("Actualiza el iPhone para comprar BLAST.")
            return
        }
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("Falta el paquete de BLAST.")
            return
        }
        Task { @MainActor in
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Apple todavía no tiene este paquete. Revisa que esté guardado en App Store Connect.")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    let transaction = try Self.unwrap(verification)
                    self.keep(verification)
                    call.resolve([
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "signedTransaction": verification.jwsRepresentation
                    ])
                case .userCancelled:
                    call.reject("Compra cancelada", "cancelled")
                case .pending:
                    call.reject("La compra quedó pendiente de aprobación.", "pending")
                @unknown default:
                    call.reject("No se pudo completar la compra.")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve()
            return
        }
        let transactionId = call.getString("transactionId") ?? ""
        Task {
            await self.finishTransaction(transactionId)
            call.resolve()
        }
    }

    @objc func pending(_ call: CAPPluginCall) {
        let rows = queue.sync { Array(openTransactions.values) }
        call.resolve(["transactions": rows])
    }

    @objc func prices(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve(["products": []])
            return
        }
        let ids = call.getArray("productIds", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                let rows: [[String: String]] = products.map { product in
                    [
                        "productId": product.id,
                        "displayPrice": product.displayPrice
                    ]
                }
                call.resolve(["products": rows])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @available(iOS 15.0, *)
    private func listenForUnfinished() {
        Task {
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result else { continue }
                guard transaction.productType == .consumable else { continue }
                self.keep(result)
                let payload: [String: String] = [
                    "productId": transaction.productID,
                    "transactionId": String(transaction.id),
                    "signedTransaction": result.jwsRepresentation
                ]
                DispatchQueue.main.async {
                    self.notifyListeners("unfinished", data: payload)
                }
            }
        }
    }

    @available(iOS 15.0, *)
    private func keep(_ result: VerificationResult<Transaction>) {
        guard case .verified(let transaction) = result else { return }
        let id = String(transaction.id)
        let row: [String: String] = [
            "productId": transaction.productID,
            "transactionId": id,
            "signedTransaction": result.jwsRepresentation
        ]
        queue.sync {
            openTransactions[id] = row
            liveTransactions[id] = transaction
        }
    }

    @available(iOS 15.0, *)
    private func finishTransaction(_ transactionId: String) async {
        guard !transactionId.isEmpty else { return }
        let stored = queue.sync { liveTransactions[transactionId] }
        if let transaction = stored as? Transaction {
            await transaction.finish()
        }
        queue.sync {
            openTransactions.removeValue(forKey: transactionId)
            liveTransactions.removeValue(forKey: transactionId)
        }
    }

    @available(iOS 15.0, *)
    private static func unwrap(_ result: VerificationResult<Transaction>) throws -> Transaction {
        switch result {
        case .verified(let transaction):
            return transaction
        case .unverified(_, let error):
            throw error
        }
    }
}
