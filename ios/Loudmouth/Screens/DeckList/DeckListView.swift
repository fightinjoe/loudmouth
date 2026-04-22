import SwiftUI
import SwiftData

struct DeckListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Deck.lastAccessedAt, order: .reverse) private var decks: [Deck]
    @Query private var cards: [Card]
    @StateObject private var viewModel = DeckListViewModel()

    @State private var selectedDeck: Deck?
    @State private var selectedLang: String?

    var body: some View {
        NavigationStack {
            List {
                let recent = viewModel.recentDecks(decks)
                if !recent.isEmpty {
                    Section("Most Recent") {
                        ForEach(recent) { deck in
                            DeckRowView(
                                deck: deck,
                                cardCount: viewModel.cardCount(for: deck.id, in: cards)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture { selectedDeck = deck }
                        }
                    }
                }

                ForEach(viewModel.decksByLang(decks), id: \.lang) { group in
                    Section {
                        let starred = viewModel.starredCount(lang: group.lang, in: cards)
                        if starred > 0 {
                            DeckRowView(
                                name: "★ Starred",
                                lang: group.lang,
                                cardCount: starred,
                                lastAccessedAt: nil
                            )
                            .contentShape(Rectangle())
                            .onTapGesture { selectedLang = "starred-\(group.lang)" }
                        }

                        ForEach(group.decks) { deck in
                            DeckRowView(
                                deck: deck,
                                cardCount: viewModel.cardCount(for: deck.id, in: cards)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture { selectedDeck = deck }
                        }
                    } header: {
                        HStack {
                            Text("\(langFlag(group.lang)) \(langName(group.lang))")
                            Spacer()
                            Text("All \(viewModel.totalCount(lang: group.lang, in: cards)) cards")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .onTapGesture { selectedLang = group.lang }
                        }
                    }
                }

                if decks.isEmpty {
                    ContentUnavailableView(
                        "No decks yet",
                        systemImage: "rectangle.stack",
                        description: Text("Tap + to import cards")
                    )
                }
            }
            .navigationTitle("Loudmouth")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showAddCards = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .navigationDestination(item: $selectedDeck) { deck in
                CardListView(deck: deck)
            }
            .navigationDestination(item: $selectedLang) { langId in
                CardListView(lang: langId)
            }
            .sheet(isPresented: $viewModel.showAddCards) {
                AddCardsView()
            }
        }
    }
}

private struct DeckRowView: View {
    var name: String
    var lang: String
    var cardCount: Int
    var lastAccessedAt: Date?

    init(deck: Deck, cardCount: Int) {
        self.name = deck.name
        self.lang = deck.lang
        self.cardCount = cardCount
        self.lastAccessedAt = deck.lastAccessedAt
    }

    init(name: String, lang: String, cardCount: Int, lastAccessedAt: Date?) {
        self.name = name
        self.lang = lang
        self.cardCount = cardCount
        self.lastAccessedAt = lastAccessedAt
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(name)
                .font(.body)
            HStack(spacing: 4) {
                if let date = lastAccessedAt {
                    Text(date.formatted(.relative(presentation: .named)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("·")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(langFlag(lang))
                    .font(.caption)
                Text("·")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(cardCount) cards")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

private func langFlag(_ lang: String) -> String {
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

#Preview {
    DeckListView()
        .modelContainer(for: [Card.self, Deck.self], inMemory: true)
}
