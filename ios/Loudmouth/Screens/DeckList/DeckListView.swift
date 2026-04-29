import SwiftUI
import SwiftData

// Root layout: deck list on the left, card pane slides in from the right.
// The card pane peeks at ~80px when a deck is selected.
struct DeckListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Deck.lastAccessedAt, order: .reverse) private var decks: [Deck]
    @Query private var cards: [Card]
    @StateObject private var viewModel = DeckListViewModel()

    @State private var selectedDeck: Deck?
    @State private var selectedLang: String?
    // slideX: how far the card pane has slid in (in points). 0 = hidden (peeking), (screenW - peekWidth) = fully open.
    @State private var slideX: CGFloat = 0
    @State private var screenW: CGFloat = 0
    // Captured at drag start so onChanged doesn't use a moving target
    @State private var dragBaseX: CGFloat = 0

    private let peekWidth: CGFloat = 80

    private var isPaneOpen: Bool { slideX > screenW * 0.5 }

    private func openPane() {
        withAnimation(.easeOut(duration: 0.25)) { slideX = max(screenW - peekWidth, 0) }
    }

    private func closePane() {
        withAnimation(.easeOut(duration: 0.25)) { slideX = 0 }
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                // ── Deck list — never moves ──
                deckListPane
                    .frame(width: w)

                // ── Card pane slides in from the right ──
                if selectedDeck != nil || selectedLang != nil {
                    cardPane(screenW: w)
                        .frame(width: w)
                        .offset(x: w - slideX - peekWidth)
                        .shadow(color: .black.opacity(0.25), radius: 14, x: -4, y: 0)
                }
            }
            .onAppear { screenW = w }
            .onChange(of: geo.size.width) { _, new in screenW = new }
            .gesture(
                DragGesture()
                    .onChanged { value in
                        // On the very first event of a drag, value.translation is near zero —
                        // use that moment to snapshot the current committed position.
                        if abs(value.translation.width) < 20 && abs(value.translation.height) < 20 {
                            dragBaseX = slideX
                        }
                        let proposed = dragBaseX + (-value.translation.width)
                        slideX = proposed.clamped(to: 0...(w - peekWidth))
                    }
                    .onEnded { value in
                        let dx = value.translation.width
                        let threshold = w * 0.3
                        let wasOpen = dragBaseX > w * 0.5
                        if wasOpen {
                            if dx > threshold { closePane() } else { openPane() }
                        } else {
                            if dx < -threshold { openPane() } else { closePane() }
                        }
                    }
            )
        }
        .ignoresSafeArea()
        .sheet(isPresented: $viewModel.showAddCards) {
            AddCardsView()
        }
        .sheet(isPresented: $viewModel.showGenerateCards) {
            GenerateCardsView { deck in
                selectDeck(deck)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.hidden)
        }
    }

    // MARK: - Deck list pane

    private var deckListPane: some View {
        ZStack(alignment: .bottomLeading) {
            Theme.bgPrimary.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Large title
                    Text("LOUDMOUTH")
                        .font(.custom("HeptaSlab-SemiBold", size: 32))
                        .foregroundStyle(Theme.textBody)
                        .padding(.top, 16)
                        .padding(.bottom, 8)

                    let recent = viewModel.recentDecks(decks)
                    if !recent.isEmpty {
                        DeckSectionHeader(title: "Recent")
                        ForEach(recent) { deck in
                            DeckRow(
                                name: deck.name,
                                lang: deck.lang,
                                cardCount: viewModel.cardCount(for: deck.id, in: cards),
                                showFlag: true
                            )
                            .onTapGesture { selectDeck(deck) }
                        }
                    }

                    ForEach(viewModel.decksByLang(decks), id: \.lang) { group in
                        DeckSectionHeader(title: "\(langFlag(group.lang)) \(langName(group.lang))")
                        let starred = viewModel.starredCount(lang: group.lang, in: cards)
                        if starred > 0 {
                            DeckRow(name: "★ Starred", lang: group.lang, cardCount: starred, showFlag: false)
                                .onTapGesture { selectLang("starred-\(group.lang)") }
                        }
                        ForEach(group.decks) { deck in
                            DeckRow(
                                name: deck.name,
                                lang: deck.lang,
                                cardCount: viewModel.cardCount(for: deck.id, in: cards),
                                showFlag: false
                            )
                            .onTapGesture { selectDeck(deck) }
                        }
                        Button("All decks >") { selectLang(group.lang) }
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textSecondary)
                            .padding(.leading, 2)
                            .padding(.top, 4)
                            .padding(.bottom, 8)
                    }

                    if decks.isEmpty {
                        Text("No decks yet.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                            .padding(.top, 40)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 100) // clear FAB
            }
            .toolbar(.hidden, for: .navigationBar)

            // ADD FAB — bottom-left
            Button { viewModel.showGenerateCards = true } label: {
                Image(systemName: "plus")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(Theme.accent)
                    .clipShape(Circle())
                    .shadow(color: .black.opacity(0.2), radius: 5, x: 0, y: 4)
            }
            .padding(.leading, 20)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Card pane

    @ViewBuilder
    private func cardPane(screenW: CGFloat) -> some View {
        let opacity = screenW > 0 ? Double(0.5 + 0.5 * (slideX / (screenW - peekWidth))) : 1.0
        ZStack {
            Theme.bgPrimary.ignoresSafeArea()
            if let deck = selectedDeck {
                CardListView(deck: deck, onBack: closePane)
            } else if let lang = selectedLang {
                CardListView(lang: lang, onBack: closePane)
            }
        }
        .opacity(opacity)
        .onTapGesture {
            if !isPaneOpen { openPane() }
        }
        .allowsHitTesting(isPaneOpen)
    }

    // MARK: - Helpers

    private func selectDeck(_ deck: Deck) {
        selectedDeck = deck
        selectedLang = nil
        dragBaseX = screenW - peekWidth
        openPane()
    }

    private func selectLang(_ lang: String) {
        selectedLang = lang
        selectedDeck = nil
        dragBaseX = screenW - peekWidth
        openPane()
    }
}

// MARK: - Subviews

private struct DeckSectionHeader: View {
    let title: String
    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.textSecondary)
            .padding(.top, 20)
            .padding(.bottom, 4)
            .padding(.leading, 2)
    }
}

private struct DeckRow: View {
    let name: String
    let lang: String
    let cardCount: Int
    let showFlag: Bool

    var body: some View {
        HStack(spacing: 12) {
            Text(name)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.textBody)
            Spacer()
            Text("\(showFlag ? langFlag(lang) + " " : "")\(cardCount) cards")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(height: 40)
        .contentShape(Rectangle())
    }
}

func langFlag(_ lang: String) -> String {
    switch lang {
    case "zh": return "🇨🇳"
    case "ja": return "🇯🇵"
    case "ko": return "🇰🇷"
    case "es": return "🇪🇸"
    case "fr": return "🇫🇷"
    case "de": return "🇩🇪"
    default: return "🌐"
    }
}

func langName(_ lang: String) -> String {
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

#Preview {
    DeckListView()
        .modelContainer(for: [Card.self, Deck.self], inMemory: true)
}
