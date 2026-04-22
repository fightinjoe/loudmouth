import SwiftUI

struct CardReviewView: View {
    let deck: Deck?
    let cards: [Card]
    var startIndex: Int = 0

    @StateObject private var viewModel: CardReviewViewModel
    @Environment(\.dismiss) private var dismiss

    init(deck: Deck?, cards: [Card], startIndex: Int = 0) {
        self.deck = deck
        self.cards = cards
        self.startIndex = startIndex
        _viewModel = StateObject(wrappedValue: CardReviewViewModel(deck: deck, cards: cards, startIndex: startIndex))
    }

    private var mode: String { deck?.mode ?? "study" }
    private var readingDisplay: String { deck?.readingDisplay ?? "reading" }

    var body: some View {
        Group {
            if let card = viewModel.currentCard {
                VStack(spacing: 0) {
                    Spacer()
                    FlipCardView(
                        card: card,
                        mode: mode,
                        readingDisplay: readingDisplay,
                        isRevealed: viewModel.isRevealed,
                        onTap: { playCard(card) },
                        onRevealPress: { viewModel.isRevealed = true },
                        onRevealRelease: { viewModel.isRevealed = false }
                    )
                    .padding(.horizontal, 24)
                    Spacer()

                    HStack(spacing: 48) {
                        Button {
                            viewModel.previous()
                        } label: {
                            Image(systemName: "chevron.left.circle")
                                .font(.largeTitle)
                                .foregroundStyle(viewModel.isFirstCard ? .tertiary : .primary)
                        }
                        .disabled(viewModel.isFirstCard)

                        Button {
                            playCard(card)
                        } label: {
                            Image(systemName: "speaker.wave.2.circle")
                                .font(.largeTitle)
                        }

                        Button {
                            viewModel.advance()
                        } label: {
                            Image(systemName: "chevron.right.circle")
                                .font(.largeTitle)
                                .foregroundStyle(viewModel.isLastCard ? .tertiary : .primary)
                        }
                        .disabled(viewModel.isLastCard)
                    }
                    .padding(.bottom, 40)
                }
                .gesture(
                    DragGesture(minimumDistance: 40)
                        .onEnded { value in
                            let dx = value.translation.width
                            let dy = value.translation.height
                            guard abs(dx) > abs(dy) else { return }
                            if dx < -40 { viewModel.advance() }
                            else if dx > 40 { viewModel.previous() }
                        }
                )
                .animation(.easeInOut(duration: 0.2), value: viewModel.currentIndex)
            } else {
                ContentUnavailableView("No cards", systemImage: "rectangle.stack")
            }
        }
        .navigationTitle(deck?.name ?? "Review")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Text("\(viewModel.currentIndex + 1) / \(cards.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
}
