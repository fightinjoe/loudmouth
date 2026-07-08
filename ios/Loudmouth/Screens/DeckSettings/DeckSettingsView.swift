import SwiftUI
import SwiftData

/// The **Deck settings action pane** — an *action* layer surface of the Pane
/// Protocol (see `web/docs/PANE_PROTOCOL.html`), presented as a bottom-anchored
/// modal `.sheet` from the content pane's title menu. Edits the deck's name,
/// card template, order, and reading display; also hosts deck deletion.
struct DeckSettingsView: View {
    let deck: Deck
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var allCards: [Card]

    @State private var showRename = false
    @State private var newName = ""
    @State private var showDeleteConfirm = false

    private var cardCount: Int {
        allCards.filter { $0.deckIds.contains(deck.id) }.count
    }

    var body: some View {
        NavigationStack {
            List {
                Section("General") {
                    Button {
                        newName = deck.name
                        showRename = true
                    } label: {
                        LabeledContent("Name", value: deck.name)
                    }
                    .foregroundStyle(.primary)

                    Picker("Card template", selection: Binding(
                        get: { deck.mode },
                        set: { deck.mode = $0 }
                    )) {
                        Text("Study").tag("study")
                        Text("Review").tag("review")
                        Text("Reverse").tag("reverse")
                    }

                    Picker("Card order", selection: Binding(
                        get: { deck.order },
                        set: { deck.order = $0 }
                    )) {
                        Text("Default").tag("default")
                        Text("Random").tag("random")
                        Text("Reverse").tag("reverse")
                    }

                    Picker("Reading", selection: Binding(
                        get: { deck.readingDisplay },
                        set: { deck.readingDisplay = $0 }
                    )) {
                        Text("Native").tag("reading")
                        Text("Romanized").tag("romanization")
                    }
                }

                Section("Danger Zone") {
                    Button("Delete Deck", role: .destructive) {
                        showDeleteConfirm = true
                    }
                }
            }
            .navigationTitle("Deck Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Rename Deck", isPresented: $showRename) {
                TextField("Deck name", text: $newName)
                Button("Cancel", role: .cancel) {}
                Button("Rename") {
                    let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty { deck.name = trimmed }
                }
            }
            .confirmationDialog(
                "Delete \"\(deck.name)\"?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete Deck", role: .destructive) {
                    deleteDeck()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All \(cardCount) cards in this deck will be removed from it. This cannot be undone.")
            }
        }
    }

    private func deleteDeck() {
        // Remove deckId from all cards; delete cards that belong only to this deck
        for card in allCards where card.deckIds.contains(deck.id) {
            card.deckIds.removeAll { $0 == deck.id }
            if card.deckIds.isEmpty {
                modelContext.delete(card)
            }
        }
        modelContext.delete(deck)
        dismiss()
    }
}
