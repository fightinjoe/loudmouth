import Foundation

struct CardBatch: Decodable {
    let cards: [CardInput]
}

struct CardInputExample: Decodable {
    let text: String
    let reading: String?
    let translation: String?
}

struct CardInput: Decodable {
    let lang: String
    let text: String
    let reading: String?
    let romanization: String?
    let translation: String
    let type: String?
    let notes: String?
    let example: CardInputExample?
}

enum ImportError: LocalizedError {
    case invalidJSON
    case emptyBatch
    case missingRequiredFields(index: Int)

    var errorDescription: String? {
        switch self {
        case .invalidJSON: return "Invalid JSON — could not parse card batch."
        case .emptyBatch: return "No cards found in batch."
        case .missingRequiredFields(let i): return "Card \(i + 1) is missing required fields (lang, text, translation)."
        }
    }
}

enum ImportService {
    static func parse(_ json: String) throws -> [CardInput] {
        guard let data = json.data(using: .utf8) else { throw ImportError.invalidJSON }

        let batch: CardBatch
        do {
            batch = try JSONDecoder().decode(CardBatch.self, from: data)
        } catch {
            throw ImportError.invalidJSON
        }

        if batch.cards.isEmpty { throw ImportError.emptyBatch }

        for (i, card) in batch.cards.enumerated() {
            if card.lang.isEmpty || card.text.isEmpty || card.translation.isEmpty {
                throw ImportError.missingRequiredFields(index: i)
            }
        }

        return batch.cards
    }

    static func makeCards(from inputs: [CardInput], deckId: String) -> [Card] {
        inputs.map { input in
            Card(
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
                deckIds: [deckId]
            )
        }
    }
}
