import SwiftUI
import SwiftData

struct CardListView: View {
    var deck: Deck?
    var lang: String?

    @Environment(\.modelContext) private var modelContext
    @Query private var allCards: [Card]

    @State private var reviewStartIndex: Int?
    @State private var editingCard: Card?
    @State private var showSettings = false

    private var title: String {
        if let deck { return deck.name }
        if let lang {
            if lang.hasPrefix("starred-") { return "★ Starred" }
            return langName(lang)
        }
        return "Cards"
    }

    private var readingDisplay: String {
        deck?.readingDisplay ?? "reading"
    }

    private var cards: [Card] {
        let base: [Card]
        if let deck {
            base = allCards.filter { $0.deckIds.contains(deck.id) }
        } else if let lang {
            if lang.hasPrefix("starred-") {
                let l = String(lang.dropFirst("starred-".count))
                base = allCards.filter { $0.lang == l && $0.starredAt != nil }
            } else {
                base = allCards.filter { $0.lang == lang }
            }
        } else {
            base = []
        }
        return applyOrder(base)
    }

    private func applyOrder(_ cards: [Card]) -> [Card] {
        switch deck?.order ?? "default" {
        case "random": return cards.shuffled()
        case "reverse": return cards.reversed()
        default: return cards.sorted { $0.createdAt < $1.createdAt }
        }
    }

    private var isSystemView: Bool {
        deck == nil || lang != nil
    }

    var body: some View {
        Group {
            if cards.isEmpty {
                ContentUnavailableView(
                    "No cards",
                    systemImage: "rectangle.stack",
                    description: Text(deck != nil ? "Import cards to get started" : "No cards here yet")
                )
            } else {
                List {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                        CardRowView(
                            card: card,
                            readingDisplay: readingDisplay,
                            onPlay: { playCard(card) },
                            onStar: { toggleStar(card) },
                            onEdit: { editingCard = card }
                        )
                        .contentShape(Rectangle())
                        .onTapGesture { reviewStartIndex = index }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let deck, !isSystemView {
                ToolbarItem(placement: .primaryAction) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
        }
        .navigationDestination(item: $reviewStartIndex) { startIndex in
            CardReviewView(deck: deck, cards: cards, startIndex: startIndex)
        }
        .sheet(item: $editingCard) { card in
            CardEditView(card: card)
        }
        .sheet(isPresented: $showSettings) {
            if let deck {
                DeckSettingsView(deck: deck)
            }
        }
    }

    private func playCard(_ card: Card) {
        TTSService.shared.speak(
            card.text,
            lang: card.lang,
            readingDisplay: readingDisplay,
            reading: card.reading,
            romanization: card.romanization
        )
    }

    private func toggleStar(_ card: Card) {
        card.starredAt = card.starredAt == nil ? .now : nil
    }
}

extension Int: @retroactive Identifiable {
    public var id: Int { self }
}

private func langName(_ lang: String) -> String {
    switch lang {
    case "zh": return "Chinese"
    case "ja": return "Japanese"
    case "ko": return "Korean"
    case "es": return "Spanish"
    case "fr": return "French"
    case "de": return "German"
    default: return lang.uppercased()
    }
}
