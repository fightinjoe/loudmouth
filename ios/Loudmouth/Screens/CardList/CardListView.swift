import SwiftUI
import SwiftData

private var deviceSafeTop: CGFloat {
    UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .first?.windows.first?.safeAreaInsets.top ?? 0
}

struct CardListView: View {
    var deck: Deck?
    var lang: String?
    var onBack: (() -> Void)? = nil

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

    private var readingDisplay: String { deck?.readingDisplay ?? "reading" }

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

    var body: some View {
        ZStack {
            // Main content
            ZStack(alignment: .top) {
                Theme.bgPrimary.ignoresSafeArea()
                VStack(spacing: 0) {
                    // Header
                    HStack {
                        Button(action: { onBack?() }) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(Theme.textBody)
                                .frame(width: 44, height: 44)
                                .background(Circle().fill(Theme.bgSurface))
                        }
                        Spacer()
                        Text(title)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.textBody)
                        Spacer()
                        if deck != nil {
                            Button { showSettings = true } label: {
                                Image(systemName: "gearshape")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(Theme.textBody)
                                    .frame(width: 44, height: 44)
                                    .background(Circle().fill(Theme.bgSurface))
                            }
                        } else {
                            Color.clear.frame(width: 44, height: 44)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, deviceSafeTop + 8)

                    if cards.isEmpty {
                        Spacer()
                        Text("No cards here yet.")
                            .foregroundStyle(Theme.textSecondary)
                        Spacer()
                    } else {
                        ScrollView {
                            VStack(spacing: 6) {
                                ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                                    CardRowView(
                                        card: card,
                                        readingDisplay: readingDisplay,
                                        onPlay: { playCard(card) },
                                        onStar: { toggleStar(card) },
                                        onEdit: { editingCard = card }
                                    )
                                    .background(Theme.bgSurface)
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                                    .onTapGesture { reviewStartIndex = index }
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 12)
                            .padding(.bottom, 40)
                        }
                    }
                }
            }
            .sheet(item: $editingCard) { card in
                CardEditView(card: card)
            }
            .sheet(isPresented: $showSettings) {
                if let deck { DeckSettingsView(deck: deck) }
            }
            .tint(Theme.accent)

            // Card review pane overlay
            if let startIndex = reviewStartIndex {
                CardReviewView(
                    deck: deck,
                    cards: cards,
                    startIndex: startIndex,
                    onDismiss: { reviewStartIndex = nil }
                )
                .transition(.move(edge: .bottom))
                .zIndex(10)
            }
        }
        .animation(.easeOut(duration: 0.3), value: reviewStartIndex != nil)
    }

    private func playCard(_ card: Card) {
        TTSService.shared.speak(
            card.text, lang: card.lang,
            readingDisplay: readingDisplay,
            reading: card.reading,
            romanization: card.romanization
        )
    }

    private func toggleStar(_ card: Card) {
        card.starredAt = card.starredAt == nil ? .now : nil
    }
}
