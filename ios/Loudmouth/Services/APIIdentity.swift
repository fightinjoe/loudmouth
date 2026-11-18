import Foundation
import DeviceCheck
import FirebaseCore
import FirebaseAuth
import FirebaseAppCheck

struct APIConfiguration: Sendable {
    let baseURL: URL
    let projectID: String
    let appID: String
    let apiKey: String
    let senderID: String
    let bundleID: String
    let useDebugProvider: Bool

    static func load() throws -> APIConfiguration {
        func value(_ key: String) throws -> String {
            guard let text = Bundle.main.object(forInfoDictionaryKey: key) as? String,
                  !text.isEmpty, !text.contains("$("),
                  text == text.trimmingCharacters(in: .whitespacesAndNewlines) else {
                throw APIClientError.configuration
            }
            return text
        }
        let environment = try value("LoudmouthProtectionEnvironment")
        let bundleID = try value("LoudmouthFirebaseBundleID")
        let projectID = try value("LoudmouthFirebaseProjectID")
        let senderID = try value("LoudmouthFirebaseSenderID")
        let appID = try value("LoudmouthFirebaseAppID")
        let apiKey = try value("LoudmouthFirebaseAPIKey")
        let urlString = try value("LoudmouthAPIURL")
        let debugRequested = (Bundle.main.object(forInfoDictionaryKey: "LoudmouthAppCheckDebug") as? String) == "YES"
        guard ["staging", "production"].contains(environment),
              Bundle.main.bundleIdentifier == bundleID,
              projectID.range(of: "^[a-z][a-z0-9-]{4,28}[a-z0-9]$", options: .regularExpression) != nil,
              !projectID.hasPrefix("demo-"),
              senderID.range(of: "^[0-9]+$", options: .regularExpression) != nil,
              appID.range(of: "^1:\(senderID):ios:[a-fA-F0-9]+$", options: .regularExpression) != nil,
              apiKey.range(of: "^AIza[A-Za-z0-9_-]{35}$", options: .regularExpression) != nil,
              let components = URLComponents(string: urlString),
              components.scheme == "https", let host = components.host, !host.isEmpty,
              host != "localhost", !host.hasSuffix(".localhost"),
              !host.contains(":"), host != "127.0.0.1", host != "0.0.0.0",
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/",
              let url = components.url else { throw APIClientError.configuration }
        // Staging must use a separately registered app, never the production bundle.
        guard (environment == "production") == (bundleID == "com.fightinjoe.Loudmouth") else {
            throw APIClientError.configuration
        }
        let process = ProcessInfo.processInfo.environment
        guard process["FIREBASE_AUTH_EMULATOR_HOST"] == nil,
              process["FIRESTORE_EMULATOR_HOST"] == nil,
              environment != "production" || process["FIRAAppCheckDebugToken"] == nil else {
            throw APIClientError.configuration
        }
        #if DEBUG
        let useDebugProvider = debugRequested && environment == "staging"
        guard !debugRequested || useDebugProvider else { throw APIClientError.configuration }
        #else
        let useDebugProvider = false
        guard !debugRequested, process["FIRAAppCheckDebugToken"] == nil else {
            throw APIClientError.configuration
        }
        #endif
        return APIConfiguration(baseURL: url, projectID: projectID, appID: appID,
                                apiKey: apiKey, senderID: senderID, bundleID: bundleID,
                                useDebugProvider: useDebugProvider)
    }
}

private final class StrictAppAttestProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        guard DCAppAttestService.shared.isSupported else { return nil }
        return AppAttestProvider(app: app)
    }
}

struct APICredentials: Sendable {
    let identityToken: String
    let appCheckToken: String
}

actor APIIdentity {
    static let shared = APIIdentity()
    @MainActor private static var configuration: APIConfiguration?
    private var acquisition: (id: UUID, task: Task<APICredentials, Error>)?
    private var forceRefresh = false

    @MainActor static func configureAtStartup() {
        guard configuration == nil, FirebaseApp.app() == nil,
              let config = try? APIConfiguration.load() else { return }
        #if DEBUG
        if config.useDebugProvider {
            AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        } else {
            AppCheck.setAppCheckProviderFactory(StrictAppAttestProviderFactory())
        }
        #else
        AppCheck.setAppCheckProviderFactory(StrictAppAttestProviderFactory())
        #endif
        let options = FirebaseOptions(googleAppID: config.appID, gcmSenderID: config.senderID)
        options.apiKey = config.apiKey
        options.projectID = config.projectID
        options.bundleID = config.bundleID
        FirebaseApp.configure(options: options)
        configuration = config
    }

    func credentials() async throws -> APICredentials {
        try Task.checkCancellation()
        guard let config = await Self.configuration else { throw APIClientError.configuration }
        guard config.useDebugProvider || DCAppAttestService.shared.isSupported else {
            throw APIClientError.unsupportedDevice
        }
        let pending: (id: UUID, task: Task<APICredentials, Error>)
        if let acquisition {
            pending = acquisition
        } else {
            let id = UUID()
            let refresh = forceRefresh
            forceRefresh = false
            let task = Task<APICredentials, Error> {
                do {
                    let auth = Auth.auth()
                    // Firebase serializes persisted-user loading before this synchronous getter.
                    let user: User
                    if let current = auth.currentUser {
                        user = current
                    } else {
                        user = try await auth.signInAnonymously().user
                    }
                    let identity = try await user.getIDToken(forcingRefresh: refresh)
                    let appCheck = AppCheck.appCheck()
                    appCheck.isTokenAutoRefreshEnabled = true
                    let evidence = try await appCheck.token(forcingRefresh: refresh)
                    return APICredentials(identityToken: identity, appCheckToken: evidence.token)
                } catch {
                    throw APIClientError.verification
                }
            }
            pending = (id, task)
            acquisition = pending
            // Clear only when SDK work actually ends, not when one caller stops waiting.
            Task {
                _ = await task.result
                self.finished(id)
            }
        }
        return try await Self.waitForCredentials(pending.task)
    }

    private func finished(_ id: UUID) {
        if acquisition?.id == id { acquisition = nil }
    }

    func invalidateCredentials() {
        // Refresh on the next explicit action; never sign out or replay the paid POST.
        forceRefresh = true
    }

    private static func waitForCredentials(_ task: Task<APICredentials, Error>) async throws -> APICredentials {
        let waiter = CredentialWaiter()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                waiter.install(continuation)
                Task { waiter.finish(await task.result) }
                DispatchQueue.global().asyncAfter(deadline: .now() + 15) {
                    waiter.finish(.failure(APIClientError.verification))
                }
            }
        } onCancel: {
            waiter.finish(.failure(CancellationError()))
        }
    }
}

/// Cancellation/timeout stop a caller's wait without cancelling another caller's sign-in.
private final class CredentialWaiter: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<APICredentials, Error>?
    private var result: Result<APICredentials, Error>?

    func install(_ continuation: CheckedContinuation<APICredentials, Error>) {
        lock.lock()
        if let result {
            lock.unlock()
            continuation.resume(with: result)
        } else {
            self.continuation = continuation
            lock.unlock()
        }
    }

    func finish(_ result: Result<APICredentials, Error>) {
        lock.lock()
        guard self.result == nil else { lock.unlock(); return }
        self.result = result
        let continuation = self.continuation
        self.continuation = nil
        lock.unlock()
        continuation?.resume(with: result)
    }
}
