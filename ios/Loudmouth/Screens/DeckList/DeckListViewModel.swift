import Foundation
import SwiftData

@MainActor
final class DeckListViewModel: ObservableObject {
    @Published var showAddCards = false

    func recentDecks(_ decks: [Deck], limit: Int = 3) -> [Deck] {
        decks
            .filter { $0.lastAccessedAt != nil }
            .sorted { $0.lastAccessedAt! > $1.lastAccessedAt! }
            .prefix(limit)
            .map { $0 }
    }

    func decksByLang(_ decks: [Deck]) -> [(lang: String, decks: [Deck])] {
        var grouped: [String: [Deck]] = [:]
        for deck in decks {
            grouped[deck.lang, default: []].append(deck)
        }
        return grouped
            .map { (lang: $0.key, decks: $0.value.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }) }
            .sorted { $0.lang < $1.lang }
    }

    func cardCount(for deckId: String, in cards: [Card]) -> Int {
        cards.filter { $0.deckIds.contains(deckId) }.count
    }

    func starredCount(lang: String, in cards: [Card]) -> Int {
        cards.filter { $0.lang == lang && $0.starredAt != nil }.count
    }

    func totalCount(lang: String, in cards: [Card]) -> Int {
        cards.filter { $0.lang == lang }.count
    }
}
