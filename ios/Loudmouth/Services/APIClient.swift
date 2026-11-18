import Foundation

struct APIClientError: LocalizedError, Sendable {
    let status: Int?
    let code: String?
    let retryAfterSeconds: Int?
    let message: String
    var errorDescription: String? { message }

    init(status: Int? = nil, code: String? = nil, retryAfterSeconds: Int? = nil, message: String) {
        self.status = status
        self.code = code
        self.retryAfterSeconds = retryAfterSeconds
        self.message = message
    }

    static let configuration = APIClientError(message: "Online generation is not configured for this build. Saved content is still available.")
    static let unsupportedDevice = APIClientError(message: "This device cannot verify online generation with App Attest. Saved content is still available.")
    static let verification = APIClientError(message: "Could not verify this app or session. Check your connection and try again when ready. Saved content is still available.")
    static let ambiguousNetwork = APIClientError(message: "The generation result could not be confirmed. It may already have consumed allowance. Check your connection before choosing to try again.")

    static func response(status: Int, code: String?, retryAfterSeconds: Int?) -> APIClientError {
        let retry = retryAfterSeconds.map { " Try again in \($0) seconds." } ?? " Try again later."
        let message: String
        switch status {
        case 401:
            message = "Your session could not be verified. Try again when ready to refresh verification."
        case 403:
            message = "This app could not be verified. Use a supported, up-to-date app and device. Saved content is still available."
        case 429:
            message = "Generation allowance or concurrent-request limit reached." + retry
        case 503:
            message = code == "GENERATION_PAUSED"
                ? "Online generation is paused." + retry
                : "Online generation is temporarily unavailable." + retry
        case 400, 413, 415:
            message = "This generation request is not supported. Review the input or update the app."
        default:
            message = "Generation failed. It may already have consumed allowance. Try again only when ready."
        }
        return APIClientError(status: status, code: code, retryAfterSeconds: retryAfterSeconds, message: message)
    }
}

/// Only the migrated phrasebook flow may use this transport. Retired routes have no adapter.
final class APIClient: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    static let shared = APIClient()
    private static let allowedPaths: Set<String> = [
        "/context", "/phrasebook-title", "/phrasebook", "/phrase-breakdown", "/phrasebook-image",
    ]
    private let session: URLSession
    private let redirects: RejectAPIRedirects

    private override init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 270
        configuration.timeoutIntervalForResource = 270
        configuration.waitsForConnectivity = false
        configuration.httpShouldSetCookies = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let redirects = RejectAPIRedirects()
        self.redirects = redirects
        session = URLSession(configuration: configuration, delegate: redirects, delegateQueue: nil)
        super.init()
    }

    func post(path: String, body: Data) async throws -> Data {
        try Task.checkCancellation()
        guard Self.allowedPaths.contains(path) else {
            throw APIClientError(message: "Update required for online generation. Saved content is still available.")
        }
        let configuration = try APIConfiguration.load()
        let credentials = try await APIIdentity.shared.credentials()
        try Task.checkCancellation()
        var request = URLRequest(url: configuration.baseURL.appendingPathComponent(String(path.dropFirst())), timeoutInterval: 270)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credentials.identityToken)", forHTTPHeaderField: "Authorization")
        request.setValue(credentials.appCheckToken, forHTTPHeaderField: "X-Firebase-AppCheck")
        request.httpBody = body
        let data: Data
        let response: URLResponse
        do {
            // One application-level attempt. Neither verification failures nor network errors replay it.
            (data, response) = try await session.data(for: request)
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIClientError.ambiguousNetwork
        }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse else { throw APIClientError.ambiguousNetwork }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 || http.statusCode == 403 {
                await APIIdentity.shared.invalidateCredentials()
            }
            // Gateway failures may be HTML/plain text; never surface their raw bodies.
            let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
            let seconds = envelope?.retryAfterSeconds ?? http.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init)
            let boundedSeconds = seconds.flatMap { $0 >= 0 ? $0 : nil }
            throw APIClientError.response(status: http.statusCode, code: envelope?.code, retryAfterSeconds: boundedSeconds)
        }
        return data
    }

    private struct ErrorEnvelope: Decodable {
        let code: String?
        let retryAfterSeconds: Int?
    }
}

/// Do not forward identity or app evidence to another hostname, or replay a POST via 307/308.
private final class RejectAPIRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
