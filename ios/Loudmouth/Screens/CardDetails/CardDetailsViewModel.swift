import Foundation

/// View model backing the **details pane** (`CardDetailsView`).
///
/// The details pane is the *details* layer of the Pane Protocol
/// (see `web/docs/PANE_PROTOCOL.html`): a bottom-anchored surface that shows
/// one card at a time. Horizontal swipes traverse to the previous/next sibling
/// card in the underlying content list without dismissing the pane — the pane
/// stays open, only the card changes. This model owns the current sibling
/// index and the press-and-hold reveal state; `next()` / `prev()` mirror the
/// protocol's `details/next` and `details/prev` transitions.
@MainActor
final class CardDetailsViewModel: ObservableObject {
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

    /// Traverse to the next sibling card (protocol `details/next`).
    func next() {
        guard !isLastCard else { return }
        currentIndex += 1
        isRevealed = false
    }

    /// Traverse to the previous sibling card (protocol `details/prev`).
    func prev() {
        guard !isFirstCard else { return }
        currentIndex -= 1
        isRevealed = false
    }
}
