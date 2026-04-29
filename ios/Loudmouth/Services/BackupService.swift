import Foundation
import SwiftData

struct BackupData: Codable {
    let cards: [CardBackup]
    let decks: [DeckBackup]
}

struct CardBackup: Codable {
    let id: String
    let createdAt: Date
    let lang: String
    let text: String
    let reading: [[String?]]?
    let romanization: String?
    let translation: String
    let type: String?
    let notes: String?
    let exampleText: String?
    let exampleReading: [[String?]]?
    let exampleTranslation: String?
    let starredAt: Date?
    let deckIds: [String]
}

struct DeckBackup: Codable {
    let id: String
    let name: String
    let lang: String
    let mode: String?
    let order: String?
    let readingDisplay: String?
    let createdAt: Date
    let lastAccessedAt: Date?
}

enum BackupService {
    static func export(cards: [Card], decks: [Deck]) throws -> Data {
        let backup = BackupData(
            cards: cards.map {
                CardBackup(
                    id: $0.id,
                    createdAt: $0.createdAt,
                    lang: $0.lang,
                    text: $0.text,
                    reading: $0.reading,
                    romanization: $0.romanization,
                    translation: $0.translation,
                    type: $0.type,
                    notes: $0.notes,
                    exampleText: $0.exampleText,
                    exampleReading: $0.exampleReading,
                    exampleTranslation: $0.exampleTranslation,
                    starredAt: $0.starredAt,
                    deckIds: $0.deckIds
                )
            },
            decks: decks.map {
                DeckBackup(
                    id: $0.id,
                    name: $0.name,
                    lang: $0.lang,
                    mode: $0.mode,
                    order: $0.order,
                    readingDisplay: $0.readingDisplay,
                    createdAt: $0.createdAt,
                    lastAccessedAt: $0.lastAccessedAt
                )
            }
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(backup)
    }

    static func restore(from data: Data, context: ModelContext) throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let str = try decoder.singleValueContainer().decode(String.self)
            let formatters: [ISO8601DateFormatter] = [
                { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }(),
                { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }(),
            ]
            for formatter in formatters {
                if let date = formatter.date(from: str) { return date }
            }
            throw DecodingError.dataCorruptedError(in: try decoder.singleValueContainer(), debugDescription: "Cannot parse date: \(str)")
        }
        do {
            let backup = try decoder.decode(BackupData.self, from: data)
            return try restoreBackup(backup, context: context)
        } catch let error as DecodingError {
            switch error {
            case .keyNotFound(let key, let ctx):
                throw NSError(domain: "BackupService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing key '\(key.stringValue)' at \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"])
            case .typeMismatch(let type, let ctx):
                throw NSError(domain: "BackupService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Type mismatch: expected \(type) at \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"])
            case .valueNotFound(let type, let ctx):
                throw NSError(domain: "BackupService", code: 3, userInfo: [NSLocalizedDescriptionKey: "Value not found: expected \(type) at \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"])
            case .dataCorrupted(let ctx):
                throw NSError(domain: "BackupService", code: 4, userInfo: [NSLocalizedDescriptionKey: "Data corrupted at \(ctx.codingPath.map(\.stringValue).joined(separator: ".")): \(ctx.debugDescription)"])
            @unknown default:
                throw error
            }
        }
    }

    private static func restoreBackup(_ backup: BackupData, context: ModelContext) throws {
        // Clear existing data
        try context.delete(model: Card.self)
        try context.delete(model: Deck.self)

        for d in backup.decks {
            context.insert(Deck(
                id: d.id,
                name: d.name,
                lang: d.lang,
                mode: d.mode ?? "study",
                order: d.order ?? "default",
                readingDisplay: d.readingDisplay ?? "reading",
                createdAt: d.createdAt,
                lastAccessedAt: d.lastAccessedAt
            ))
        }

        for c in backup.cards {
            context.insert(Card(
                id: c.id,
                createdAt: c.createdAt,
                lang: c.lang,
                text: c.text,
                reading: c.reading,
                romanization: c.romanization,
                translation: c.translation,
                type: c.type,
                notes: c.notes,
                exampleText: c.exampleText,
                exampleReading: c.exampleReading,
                exampleTranslation: c.exampleTranslation,
                starredAt: c.starredAt,
                deckIds: c.deckIds
            ))
        }
    }
}
