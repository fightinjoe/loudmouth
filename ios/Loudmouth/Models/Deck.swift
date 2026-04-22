import Foundation
import SwiftData

@Model
final class Deck {
    @Attribute(.unique) var id: String
    var name: String
    var lang: String
    var mode: String
    var order: String
    var readingDisplay: String
    var createdAt: Date
    var lastAccessedAt: Date?

    init(
        id: String,
        name: String,
        lang: String,
        mode: String = "study",
        order: String = "default",
        readingDisplay: String = "reading",
        createdAt: Date = .now,
        lastAccessedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.lang = lang
        self.mode = mode
        self.order = order
        self.readingDisplay = readingDisplay
        self.createdAt = createdAt
        self.lastAccessedAt = lastAccessedAt
    }
}
