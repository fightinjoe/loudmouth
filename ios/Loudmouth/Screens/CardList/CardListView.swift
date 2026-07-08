import SwiftUI
import SwiftData

private var deviceSafeTop: CGFloat {
    UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .first?.windows.first?.safeAreaInsets.top ?? 0
}

/// The **content pane** body — the *content* layer of the Pane Protocol
/// (see `web/docs/PANE_PROTOCOL.html`).
///
/// Shows the currently selected deck's (or language's / starred) card list.
/// It is hosted inside `DeckListView`'s sliding content pane; navigating
/// between content (a deck, a language browse, the empty state) swaps what
/// this view renders — it does not add a layer.
///
/// This view is the host that opens the two higher layers:
///   • the **details pane** (`CardDetailsView`, opened by tapping a card row), and
///   • the **action panes** (Translation / Deck settings / Edit card), each a
///     bottom-anchored modal `.sheet` — the action layer, which always wins the
///     z-order (Pane Protocol Rule 8).
struct CardListView: View {
    var deck: Deck?
    var lang: String?
    var onBack: (() -> Void)? = nil

    @Environment(\.modelContext) private var modelContext
    @Query private var allCards: [Card]

    // Sibling index the details pane opens on; nil = details layer closed.
    @State private var detailsStartIndex: Int?
    @State private var editingCard: Card?
    @State private var showSettings = false
    @State private var showTranslation = false
    @State private var isEditing = false

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
                    // Header — back affordance (closes the content pane, revealing
                    // the navigation pane), deck-title menu, and the "+" add button
                    // that opens the Translation action pane.
                    HStack {
                        Button(action: { onBack?() }) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(Theme.textBody)
                                .frame(width: 44, height: 44)
                                .background(Circle().fill(Theme.bgSurface))
                        }
                        Spacer()
                        if deck != nil {
                            Menu {
                                Button { showSettings = true } label: {
                                    Label("Settings", systemImage: "gear")
                                }
                                Button { isEditing = true } label: {
                                    Label("Edit cards", systemImage: "pencil")
                                }
                            } label: {
                                Text(title)
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundStyle(Theme.textBody)
                            }
                        } else {
                            Text(title)
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(Theme.textBody)
                        }
                        Spacer()
                        if isEditing {
                            Button("Done") { isEditing = false }
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(Theme.accent)
                                .frame(width: 44, height: 44)
                        } else if deck != nil {
                            Button { showTranslation = true } label: {
                                Image(systemName: "plus")
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
                                    .onTapGesture { detailsStartIndex = index }
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 12)
                            .padding(.bottom, 40)
                        }
                    }
                }
            }
            // Action panes (action layer) — bottom-anchored modal sheets,
            // contextual to this content pane. At most one is open at a time.
            .sheet(item: $editingCard) { card in
                CardEditView(card: card)
            }
            .sheet(isPresented: $showSettings) {
                if let deck { DeckSettingsView(deck: deck) }
            }
            .sheet(isPresented: $showTranslation) {
                if let deck {
                    TranslationView(deck: deck)
                }
            }
            .tint(Theme.accent)

            // Details pane (details layer) — bottom-anchored over a scrim,
            // opened by tapping a card row. It owns its own enter/exit
            // animation (pane slides, scrim fades), so no transition is applied
            // here; `onDismiss` fires only after that exit animation completes.
            if let startIndex = detailsStartIndex {
                CardDetailsView(
                    deck: deck,
                    cards: cards,
                    startIndex: startIndex,
                    onDismiss: { detailsStartIndex = nil }
                )
                .zIndex(10)
            }
        }
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
