import SwiftUI

struct CardReviewView: View {
    let deck: Deck?
    let cards: [Card]
    var startIndex: Int = 0
    var onDismiss: () -> Void

    @StateObject private var viewModel: CardReviewViewModel

    // Pane drag state
    @State private var paneOffset: CGFloat = 0
    @State private var paneDragBase: CGFloat = 0

    // Horizontal swipe state
    @State private var cardDragX: CGFloat = 0

    init(deck: Deck?, cards: [Card], startIndex: Int = 0, onDismiss: @escaping () -> Void) {
        self.deck = deck
        self.cards = cards
        self.startIndex = startIndex
        self.onDismiss = onDismiss
        _viewModel = StateObject(wrappedValue: CardReviewViewModel(deck: deck, cards: cards, startIndex: startIndex))
    }

    private var mode: String { deck?.mode ?? "study" }
    private var readingDisplay: String { deck?.readingDisplay ?? "reading" }

    private var card: Card? { viewModel.currentCard }

    var body: some View {
        GeometryReader { geo in
            let paneHeight = geo.size.height * 0.92

            ZStack(alignment: .bottom) {
                // Scrim
                Color(red: 140/255, green: 140/255, blue: 115/255)
                    .opacity(0.45)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }

                // Pane
                VStack(spacing: 0) {
                    // Drag handle area — captures downward drag to dismiss
                    handleBar
                        .gesture(verticalDragGesture)

                    if let card {
                        cardContent(card: card, geo: geo)
                    }
                }
                .frame(width: geo.size.width, height: paneHeight)
                .background(Theme.bgPrimary)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 40,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 40
                    )
                )
                .offset(y: max(0, paneOffset))
                .gesture(verticalDragGesture)
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Handle bar

    private var handleBar: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Theme.border)
                .frame(width: 36, height: 5)
                .padding(.top, 12)
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Card content

    @ViewBuilder
    private func cardContent(card: Card, geo: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button(action: dismiss) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.textBody)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Theme.bgSurface))
                }
                Spacer()
                Text("\(viewModel.currentIndex + 1) of \(cards.count)")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.textBody)
                Spacer()
                Color.clear.frame(width: 40, height: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 16)

            // Swipeable card area
            cardFace(card: card)
                .offset(x: cardDragX)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .gesture(horizontalDragGesture(geo: geo))
                .clipped()

            Spacer()
        }
    }

    // MARK: - Card face

    @ViewBuilder
    private func cardFace(card: Card) -> some View {
        VStack(spacing: 16) {
            // Front card (text + reading)
            VStack(spacing: 8) {
                if card.starredAt != nil {
                    Text("★")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.accentStar)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                
                let hasFrontRuby = mode == "study" && readingDisplay == "reading" && card.reading != nil
                if hasFrontRuby, let tokens = card.reading {
                    RubyTextView(
                        tokens,
                        baseFont: .system(size: 40, weight: .bold),
                        rubyFont: .system(size: 16)
                    )
                    .frame(maxWidth: .infinity)
                } else {
                    Text(frontText(card: card))
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(Theme.textBody)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                
                let r = frontReading(card: card)
                if !r.isEmpty && !hasFrontRuby {
                    Text(r)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(28)
            .frame(maxWidth: .infinity, minHeight: 200)
            .background(Theme.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .onTapGesture { playCard(card) }

            // Translation reveal area
            ZStack {
                // Skeleton
                VStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemFill))
                        .frame(maxWidth: .infinity)
                        .frame(height: 22)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemFill))
                        .frame(width: 140, height: 22)
                }
                .padding(.horizontal, 24)
                .opacity(viewModel.isRevealed ? 0 : 1)

                // Revealed
                VStack(spacing: 6) {
                    let hasBackRuby = mode != "study" && readingDisplay == "reading" && card.reading != nil
                    if hasBackRuby, let tokens = card.reading {
                        RubyTextView(
                            tokens,
                            baseFont: .title3,
                            rubyFont: .caption
                        )
                    } else {
                        Text(backText(card: card))
                            .font(.title3)
                            .foregroundStyle(Theme.textBody)
                            .multilineTextAlignment(.center)
                    }
                    
                    let br = backReading(card: card)
                    if !br.isEmpty && !hasBackRuby {
                        Text(br)
                            .font(.body)
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                    if let notes = card.notes, !notes.isEmpty {
                        Text(notes)
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .opacity(viewModel.isRevealed ? 1 : 0)
            }
            .padding(24)
            .frame(maxWidth: .infinity, minHeight: 90)
            .background(Theme.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .animation(.easeInOut(duration: 0.15), value: viewModel.isRevealed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in viewModel.isRevealed = true }
                    .onEnded   { _ in viewModel.isRevealed = false }
            )

            // Example sentence
            if let exText = card.exampleText, !exText.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(exText)
                        .font(.caption)
                        .foregroundStyle(Theme.textBody)
                    if let exTrans = card.exampleTranslation, !exTrans.isEmpty {
                        Text(exTrans)
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.bgPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    // MARK: - Gestures

    private var verticalDragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                if value.translation.height < 20 && value.translation.height > -20 {
                    paneDragBase = paneOffset
                }
                paneOffset = max(0, paneDragBase + value.translation.height)
            }
            .onEnded { value in
                if value.translation.height > 120 || value.predictedEndTranslation.height > 300 {
                    dismiss()
                } else {
                    withAnimation(.easeOut(duration: 0.25)) { paneOffset = 0 }
                }
            }
    }

    private func horizontalDragGesture(geo: GeometryProxy) -> some Gesture {
        DragGesture()
            .onChanged { value in
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > abs(dy) else { return }
                cardDragX = dx
            }
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > abs(dy) else {
                    withAnimation(.spring()) { cardDragX = 0 }
                    return
                }
                let w = geo.size.width
                let threshold = w * 0.3
                if dx < -threshold && !viewModel.isLastCard {
                    // Slide current card out to the left, then swap content and slide in from right
                    withAnimation(.easeOut(duration: 0.2)) { cardDragX = -w }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        viewModel.advance()
                        cardDragX = w           // new card starts offscreen right
                        withAnimation(.easeOut(duration: 0.2)) { cardDragX = 0 }
                    }
                } else if dx > threshold && !viewModel.isFirstCard {
                    // Slide current card out to the right, then swap content and slide in from left
                    withAnimation(.easeOut(duration: 0.2)) { cardDragX = w }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        viewModel.previous()
                        cardDragX = -w          // new card starts offscreen left
                        withAnimation(.easeOut(duration: 0.2)) { cardDragX = 0 }
                    }
                } else {
                    withAnimation(.spring()) { cardDragX = 0 }
                }
            }
    }

    // MARK: - Helpers

    private func dismiss() {
        withAnimation(.easeOut(duration: 0.25)) { paneOffset = 1000 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { onDismiss() }
    }

    private func frontText(card: Card) -> String {
        mode == "study" ? card.text : card.translation
    }

    private func frontReading(card: Card) -> String {
        guard mode == "study" else { return "" }
        if readingDisplay == "romanization" { return card.romanization ?? flatReading(card.reading) }
        return flatReading(card.reading)
    }

    private func backText(card: Card) -> String {
        mode == "study" ? card.translation : card.text
    }

    private func backReading(card: Card) -> String {
        guard mode != "study" else { return "" }
        if readingDisplay == "romanization" { return card.romanization ?? flatReading(card.reading) }
        return flatReading(card.reading)
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
