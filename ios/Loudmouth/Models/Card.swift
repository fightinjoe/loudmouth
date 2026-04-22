import Foundation
import SwiftData

@Model
final class Card {
    @Attribute(.unique) var id: String
    var createdAt: Date
    var lang: String
    var text: String
    var reading: String?
    var romanization: String?
    var translation: String
    var type: String?
    var notes: String?
    var exampleText: String?
    var exampleReading: String?
    var exampleTranslation: String?
    var starredAt: Date?
    var deckIds: [String]

    init(
        id: String,
        createdAt: Date,
        lang: String,
        text: String,
        reading: String? = nil,
        romanization: String? = nil,
        translation: String,
        type: String? = nil,
        notes: String? = nil,
        exampleText: String? = nil,
        exampleReading: String? = nil,
        exampleTranslation: String? = nil,
        starredAt: Date? = nil,
        deckIds: [String] = []
    ) {
        self.id = id
        self.createdAt = createdAt
        self.lang = lang
        self.text = text 
        self.reading = reading
        self.romanization = romanization
        self.translation = translation
        self.type = type
        self.notes = notes
        self.exampleText = exampleText
        self.exampleReading = exampleReading
        self.exampleTranslation = exampleTranslation
        self.starredAt = starredAt
        self.deckIds = deckIds
    }
}
