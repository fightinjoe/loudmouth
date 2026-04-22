import Foundation

@MainActor
final class CardReviewViewModel: ObservableObject {
    let deck: Deck?
    let cards: [Card]

    @Published var currentIndex: Int
    @Published var isRevealed: Bool = false

    init(deck: Deck?, cards: [Card], startIndex: Int = 0) {
        self.deck = deck
        self.cards = cards
        self.currentIndex = startIndex
    }

    var currentCard: Card? {
        guard !cards.isEmpty, cards.indices.contains(currentIndex) else { return nil }
        return cards[currentIndex]
    }

    var isFirstCard: Bool { currentIndex <= 0 }
    var isLastCard: Bool { currentIndex >= cards.count - 1 }

    func advance() {
        guard !isLastCard else { return }
        currentIndex += 1
        isRevealed = false
    }

    func previous() {
        guard !isFirstCard else { return }
        currentIndex -= 1
        isRevealed = false
    }
}
