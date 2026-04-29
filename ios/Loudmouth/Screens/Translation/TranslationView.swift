import SwiftUI
import SwiftData

private let gatewayURL = "https://translation-api-gateway-2qqw247r.uc.gateway.dev"

// MARK: - API types

private struct TranslationResult: Identifiable {
    let id = UUID()
    let text: String
    let reading: String
    let translation: String
    let lang: String
}

private struct TranslationResponse: Decodable {
    struct Item: Decodable {
        let translation: String
        let lang: String
        let text: String
        let ruby_markup: String?
    }
    let translations: [Item]
}

private enum TranslateError: Error {
    case rateLimited, timeout, noConnection, empty, badStatus(Int)
}

private func fetchTranslations(text: String, targetLanguage: String) async throws -> [TranslationResult] {
    guard let url = URL(string: "\(gatewayURL)/translate") else { throw TranslateError.noConnection }
    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: [
        "text": text,
        "targetLanguage": targetLanguage
    ])

    let data: Data
    let response: URLResponse
    do {
        (data, response) = try await URLSession.shared.data(for: request)
    } catch {
        throw TranslateError.noConnection
    }

    if let http = response as? HTTPURLResponse {
        if http.statusCode == 429 { throw TranslateError.rateLimited }
        if http.statusCode == 504 { throw TranslateError.timeout }
        if http.statusCode != 200 { throw TranslateError.badStatus(http.statusCode) }
    }

    let decoded = try JSONDecoder().decode(TranslationResponse.self, from: data)
    if decoded.translations.isEmpty { throw TranslateError.empty }

    return decoded.translations.map { item in
        // Strip ruby markup tags to get plain reading text
        let plain = item.ruby_markup?
            .replacingOccurrences(of: "<rt>", with: " (")
            .replacingOccurrences(of: "</rt>", with: ")")
            .replacingOccurrences(of: "<ruby>", with: "")
            .replacingOccurrences(of: "</ruby>", with: "")
            .replacingOccurrences(of: "<rb>", with: "")
            .replacingOccurrences(of: "</rb>", with: "")
            .trimmingCharacters(in: .whitespaces)
        return TranslationResult(
            text: item.text,
            reading: plain?.isEmpty == false ? plain! : item.translation,
            translation: item.translation,
            lang: item.lang
        )
    }
}

// MARK: - Result card

private let addThreshold: CGFloat = 80

private struct TranslationResultCard: View {
    let result: TranslationResult
    let position: CardPosition
    let onAdd: () -> Void
    let onDismiss: () -> Void
    let onPlay: () -> Void

    enum CardPosition { case top, middle, bottom, only }

    @State private var dragX: CGFloat = 0
    @GestureState private var isDragging = false

    private var topRadius: CGFloat    { position == .top    || position == .only ? 20 : 0 }
    private var bottomRadius: CGFloat { position == .bottom || position == .only ? 20 : 0 }

    private var shape: some Shape {
        UnevenRoundedRectangle(
            topLeadingRadius: topRadius,
            bottomLeadingRadius: bottomRadius,
            bottomTrailingRadius: bottomRadius,
            topTrailingRadius: topRadius
        )
    }

    var body: some View {
        ZStack {
            // Reveal backgrounds
            HStack {
                // Left: green add indicator
                if dragX > 0 {
                    HStack {
                        Image(systemName: "checkmark")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.leading, 20)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.green.opacity(min(1.0, dragX / addThreshold)))
                    .clipShape(shape)
                }
                // Right: red dismiss indicator
                if dragX < 0 {
                    HStack {
                        Spacer()
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.trailing, 20)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.red.opacity(min(1.0, -dragX / addThreshold)))
                    .clipShape(shape)
                }
            }

            // Card content
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(result.reading)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.textSecondary)
                    Text(result.text)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(Theme.textBody)
                    Text(result.translation)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.textSecondary)
                }
                Spacer()
                Button(action: onPlay) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.textTertiary)
                        .frame(width: 36, height: 36)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Theme.bgSurface)
            .clipShape(shape)
            .offset(x: dragX)
            .animation(isDragging ? .none : .spring(response: 0.3), value: dragX)
            .gesture(
                DragGesture(minimumDistance: 10)
                    .updating($isDragging) { _, state, _ in state = true }
                    .onChanged { value in
                        // Only respond if primarily horizontal
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        dragX = value.translation.width
                    }
                    .onEnded { value in
                        let dx = value.translation.width
                        if dx >= addThreshold {
                            onAdd()
                        } else if dx <= -addThreshold {
                            onDismiss()
                        } else {
                            dragX = 0
                        }
                    }
            )
            .onTapGesture(perform: onAdd)
        }
    }
}

// MARK: - Skeleton card

private struct SkeletonCard: View {
    @State private var shimmer = false

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .frame(width: 80, height: 12)
                RoundedRectangle(cornerRadius: 6)
                    .frame(width: 140, height: 20)
                RoundedRectangle(cornerRadius: 4)
                    .frame(width: 110, height: 12)
            }
            .foregroundStyle(Theme.border)
            .opacity(shimmer ? 0.4 : 1.0)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: shimmer)
            .onAppear { shimmer = true }
            Spacer()
            Circle()
                .frame(width: 24, height: 24)
                .foregroundStyle(Theme.border)
                .opacity(shimmer ? 0.4 : 1.0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

// MARK: - Main view

struct TranslationView: View {
    let deck: Deck
    var onCardAdded: ((Card) -> Void)?

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var input = ""
    @State private var isLoading = false
    @State private var results: [TranslationResult] = []
    @State private var errorMessage: String?

    private var deckLangName: String { langName(for: deck.lang ?? "") }
    private var deckLangFlag: String { langFlag(for: deck.lang ?? "") }

    private var canTranslate: Bool {
        !input.trimmingCharacters(in: .whitespaces).isEmpty && !isLoading
    }

    var body: some View {
        VStack(spacing: 0) {
            // Handle
            Capsule()
                .fill(Theme.border)
                .frame(width: 36, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 4)

            // Header
            ZStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.title3)
                            .foregroundStyle(Theme.accent)
                            .frame(width: 44, height: 44)
                    }
                    Spacer()
                }
                Text("\(deckLangFlag) \(deckLangName)")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.textBody)
            }
            .padding(.horizontal, 8)

            VStack(spacing: 12) {
                // Input
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $input)
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(Theme.textBody)
                        .scrollContentBackground(.hidden)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .inset(by: 0.5)
                                .stroke(Color.clear)
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 1)
                        )
                        .frame(minHeight: 80)
                    if input.isEmpty {
                        Text("Type a word or phrase…")
                            .font(.system(size: 20, weight: .light))
                            .foregroundStyle(Theme.textTertiary)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
                }

                // Results area
                if isLoading {
                    VStack(spacing: 0) {
                        Text("Swipe or tap to add card")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textSecondary)
                            .padding(.bottom, 8)
                        SkeletonCard()
                    }
                } else if !results.isEmpty {
                    VStack(spacing: 0) {
                        Text("Swipe or tap to add card")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textSecondary)
                            .padding(.bottom, 8)
                        ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                            TranslationResultCard(
                                result: result,
                                position: cardPosition(index: index, total: results.count),
                                onAdd: { addCard(result) },
                                onDismiss: { dismissCard(result) },
                                onPlay: { playResult(result) }
                            )
                        }
                    }
                } else if let error = errorMessage {
                    HStack(spacing: 8) {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.danger)
                        if error.contains("try again") {
                            Button { Task { await runTranslate() } } label: {
                                Image(systemName: "arrow.clockwise")
                                    .foregroundStyle(Theme.accent)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 4)
                }

                // Footer
                HStack {
                    Spacer()
                    Button(action: { Task { await runTranslate() } }) {
                        Text(isLoading ? "Translating…" : "Translate")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(canTranslate ? Theme.accent : Theme.textTertiary)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 10)
                            .background(canTranslate ? Theme.accent.opacity(0.15) : Theme.border.opacity(0.5))
                            .clipShape(Capsule())
                    }
                    .disabled(!canTranslate)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .background(Theme.bgPrimary)
    }

    // MARK: - Actions

    private func cardPosition(index: Int, total: Int) -> TranslationResultCard.CardPosition {
        if total == 1 { return .only }
        if index == 0 { return .top }
        if index == total - 1 { return .bottom }
        return .middle
    }

    private func runTranslate() async {
        let text = input.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }

        isLoading = true
        results = []
        errorMessage = nil

        do {
            results = try await fetchTranslations(text: text, targetLanguage: deckLangName)
        } catch TranslateError.rateLimited {
            errorMessage = "Try again in 60 seconds."
        } catch TranslateError.timeout {
            errorMessage = "Could not generate — try again."
        } catch TranslateError.noConnection {
            errorMessage = "No connection."
        } catch TranslateError.empty {
            errorMessage = "No result — try rephrasing."
        } catch {
            errorMessage = "Could not generate — try again."
        }

        isLoading = false
    }

    private func addCard(_ result: TranslationResult) {
        let card = Card(
            id: UUID().uuidString,
            createdAt: .now,
            lang: result.lang.isEmpty ? (deck.lang ?? "") : result.lang,
            text: result.text,
            reading: nil,
            translation: result.translation,
            deckIds: [deck.id]
        )
        modelContext.insert(card)
        results.removeAll { $0.id == result.id }
        onCardAdded?(card)
        if results.isEmpty {
            input = ""
        }
    }

    private func dismissCard(_ result: TranslationResult) {
        results.removeAll { $0.id == result.id }
        if results.isEmpty { input = "" }
    }

    private func playResult(_ result: TranslationResult) {
        let lang = result.lang.isEmpty ? (deck.lang ?? "") : result.lang
        TTSService.shared.speak(result.text, lang: lang, readingDisplay: "reading", reading: nil, romanization: nil)
    }
}

// MARK: - Lang helpers

private let langTable: [(code: String, flag: String, name: String)] = [
    ("ja", "🇯🇵", "Japanese"),
    ("zh", "🇨🇳", "Chinese"),
    ("ko", "🇰🇷", "Korean"),
    ("es", "🇪🇸", "Spanish"),
    ("fr", "🇫🇷", "French"),
    ("de", "🇩🇪", "German"),
]

private func langName(for code: String) -> String {
    langTable.first { $0.code == code }?.name ?? code
}

private func langFlag(for code: String) -> String {
    langTable.first { $0.code == code }?.flag ?? "🌐"
}
