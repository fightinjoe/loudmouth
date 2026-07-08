import SwiftUI
import SwiftData

/// Root layout hosting the two persistent lower layers of the Pane Protocol
/// (see `web/docs/PANE_PROTOCOL.html`): the **navigation pane** (shell layer)
/// and the **content pane** (content layer).
///
/// The navigation pane (`navigationPane`) is fixed in place and always present;
/// it lists decks grouped by language. The content pane (`contentPane`) sits
/// over it and slides in from the right to cover it, peeking ~80px so the
/// navigation pane stays partly visible. Sliding the content pane back aside
/// reveals the navigation pane — the shell-reveal has no scrim (per the
/// protocol, full-height content simply slides aside). The details and action
/// layers are owned by the content pane's body (`CardListView`), not here.
struct DeckListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Deck.lastAccessedAt, order: .reverse) private var decks: [Deck]
    @Query private var cards: [Card]
    @StateObject private var viewModel = DeckListViewModel()

    @State private var selectedDeck: Deck?
    @State private var selectedLang: String?
    // slideX: how far the content pane has slid over the navigation pane (in
    // points). 0 = hidden (peeking), (screenW - peekWidth) = fully covering.
    @State private var slideX: CGFloat = 0
    @State private var screenW: CGFloat = 0
    // Captured at drag start so onChanged doesn't use a moving target
    @State private var dragBaseX: CGFloat = 0

    private let peekWidth: CGFloat = 80

    // Is the content pane covering the navigation pane (vs. slid aside)?
    private var isContentOpen: Bool { slideX > screenW * 0.5 }

    // Slide the content pane over the navigation pane.
    private func openContent() {
        withAnimation(.easeOut(duration: 0.25)) { slideX = max(screenW - peekWidth, 0) }
    }

    // Slide the content pane aside to reveal the navigation pane.
    private func closeContent() {
        withAnimation(.easeOut(duration: 0.25)) { slideX = 0 }
    }

    // Horizontal drag on the content pane: track the finger frame-for-frame
    // (no `withAnimation` in `onChanged`), then commit open/closed on release.
    // Axis-locked so a vertical drag falls through to the inner scroll view.
    private func contentDragGesture(screenW w: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                // Ignore vertical drags so the card list can still scroll.
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                // Snapshot the committed position on the first move of the drag.
                if abs(value.translation.width) < 20 && abs(value.translation.height) < 20 {
                    dragBaseX = slideX
                }
                let proposed = dragBaseX + (-value.translation.width)
                slideX = proposed.clamped(to: 0...(w - peekWidth))
            }
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                let dx = value.translation.width
                let threshold = w * 0.3
                let wasOpen = dragBaseX > w * 0.5
                if wasOpen {
                    if dx > threshold { closeContent() } else { openContent() }
                } else {
                    if dx < -threshold { openContent() } else { closeContent() }
                }
            }
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                // ── Navigation pane (shell layer) — never moves ──
                navigationPane
                    .frame(width: w)

                // ── Content pane slides in from the right over the nav pane ──
                if selectedDeck != nil || selectedLang != nil {
                    contentPane(screenW: w)
                        .frame(width: w)
                        .offset(x: w - slideX - peekWidth)
                        .shadow(color: .black.opacity(0.25), radius: 14, x: -4, y: 0)
                        // Horizontal drag lives on the pane itself so it tracks
                        // the finger frame-for-frame (Issue 3) and coexists with
                        // the pane's inner scrolling via `simultaneousGesture`.
                        .simultaneousGesture(contentDragGesture(screenW: w))
                }
            }
            .onAppear { screenW = w }
            .onChange(of: geo.size.width) { _, new in screenW = new }
        }
        .ignoresSafeArea()
        // Action panes (action layer) reachable from the navigation pane:
        // import cards, and the Generate cards flow (auto-opened for new decks).
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

    // MARK: - Navigation pane (shell layer)

    private var navigationPane: some View {
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

    // MARK: - Content pane (content layer)

    @ViewBuilder
    private func contentPane(screenW: CGFloat) -> some View {
        let opacity = screenW > 0 ? Double(0.5 + 0.5 * (slideX / (screenW - peekWidth))) : 1.0
        ZStack {
            Theme.bgPrimary.ignoresSafeArea()
            if let deck = selectedDeck {
                CardListView(deck: deck, onBack: closeContent)
            } else if let lang = selectedLang {
                CardListView(lang: lang, onBack: closeContent)
            }
        }
        .opacity(opacity)
        // A transparent tap-catcher sits above the pane's content. When the
        // pane is slid aside it is enabled and a tap brings the pane forward
        // (Issue 4); when the pane is open it is disabled so taps reach the
        // inner content (buttons, scrolling). It is always present — only its
        // hit-testing toggles — so it never churns view identity mid-drag.
        .overlay {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { openContent() }
                .allowsHitTesting(!isContentOpen)
        }
    }

    // MARK: - Helpers

    private func selectDeck(_ deck: Deck) {
        selectedDeck = deck
        selectedLang = nil
        dragBaseX = screenW - peekWidth
        openContent()
    }

    private func selectLang(_ lang: String) {
        selectedLang = lang
        selectedDeck = nil
        dragBaseX = screenW - peekWidth
        openContent()
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
