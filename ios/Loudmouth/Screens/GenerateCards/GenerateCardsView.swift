import SwiftUI
import SwiftData

private let gatewayURL = "https://translation-api-gateway-2qqw247r.uc.gateway.dev"

private let supportedLangs: [(code: String, flag: String, name: String)] = [
    ("ja", "🇯🇵", "Japanese"),
    ("zh", "🇨🇳", "Chinese"),
    ("ko", "🇰🇷", "Korean"),
    ("es", "🇪🇸", "Spanish"),
    ("fr", "🇫🇷", "French"),
    ("de", "🇩🇪", "German"),
]

struct GenerateCardsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    var onDeckCreated: ((Deck) -> Void)?

    @State private var topic = ""
    @State private var selectedLang = supportedLangs[0]
    @State private var isGenerating = false
    @State private var errorMessage: String?

    private var canGenerate: Bool { !topic.trimmingCharacters(in: .whitespaces).isEmpty && !isGenerating }

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
                Text("Add cards")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.textBody)
            }
            .padding(.horizontal, 8)

            VStack(spacing: 12) {
                Text("Share a situation or context")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)

                TextEditor(text: $topic)
                    .font(.system(size: 16))
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
                    .frame(height: 124)
                    .overlay(alignment: .topLeading) {
                        if topic.isEmpty {
                            Text("Greetings for morning, afternoon, evening…")
                                .font(.system(size: 16))
                                .foregroundStyle(Theme.textTertiary)
                                .padding(.top, 8)
                                .padding(.leading, 5)
                                .allowsHitTesting(false)
                        }
                    }

                HStack {
                    Menu {
                        ForEach(supportedLangs, id: \.code) { lang in
                            Button("\(lang.flag) \(lang.name)") { selectedLang = lang }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text(selectedLang.flag)
                            Text(selectedLang.name)
                                .font(.system(size: 16))
                                .foregroundStyle(Theme.textBody)
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.textTertiary)
                        }
                    }

                    Spacer()

                    Button(action: generate) {
                        Text(isGenerating ? "Generating…" : "Generate")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(canGenerate ? Theme.accent : Theme.textTertiary)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(canGenerate ? Theme.accent.opacity(0.15) : Theme.border.opacity(0.5))
                            .clipShape(Capsule())
                    }
                    .disabled(!canGenerate)
                }

                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .background(Theme.bgPrimary)
    }

    private func generate() {
        let trimmed = topic.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }

        isGenerating = true
        errorMessage = nil

        Task {
            do {
                let cards = try await fetchCards(lang: selectedLang.code, topic: trimmed)
                let deckName = trimmed.count > 30 ? String(trimmed.prefix(30)).trimmingCharacters(in: .whitespaces) + "…" : trimmed
                let deck = Deck(id: UUID().uuidString, name: deckName, lang: selectedLang.code)
                modelContext.insert(deck)
                for input in cards {
                    let card = Card(
                        id: UUID().uuidString,
                        createdAt: .now,
                        lang: input.lang,
                        text: input.text,
                        reading: input.reading,
                        romanization: input.romanization,
                        translation: input.translation,
                        type: input.type,
                        notes: input.notes,
                        exampleText: input.example?.text,
                        exampleReading: input.example?.reading,
                        exampleTranslation: input.example?.translation,
                        deckIds: [deck.id]
                    )
                    modelContext.insert(card)
                }
                dismiss()
                onDeckCreated?(deck)
            } catch GenerateError.rateLimited {
                errorMessage = "Try again in 60 seconds."
            } catch GenerateError.timeout {
                errorMessage = "Could not generate — try again."
            } catch GenerateError.noConnection {
                errorMessage = "No connection."
            } catch GenerateError.empty {
                errorMessage = "No cards returned — try rephrasing."
            } catch {
                errorMessage = "Error — try again."
            }
            isGenerating = false
        }
    }
}

// MARK: - API

private enum GenerateError: Error {
    case rateLimited, timeout, noConnection, empty, badStatus(Int)
}

private func fetchCards(lang: String, topic: String) async throws -> [CardInput] {
    guard let url = URL(string: "\(gatewayURL)/generate-cards") else { throw GenerateError.noConnection }
    var request = URLRequest(url: url, timeoutInterval: 30)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["lang": lang, "topic": topic])

    let data: Data
    let response: URLResponse
    do {
        (data, response) = try await URLSession.shared.data(for: request)
    } catch {
        throw GenerateError.noConnection
    }

    if let http = response as? HTTPURLResponse {
        if http.statusCode == 429 { throw GenerateError.rateLimited }
        if http.statusCode == 504 { throw GenerateError.timeout }
        if http.statusCode != 200 { throw GenerateError.badStatus(http.statusCode) }
    }

    let batch = try JSONDecoder().decode(CardBatch.self, from: data)
    if batch.cards.isEmpty { throw GenerateError.empty }
    return batch.cards
}
