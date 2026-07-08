import SwiftUI

/// The **details pane** — the *details* layer of the Pane Protocol
/// (see `web/docs/PANE_PROTOCOL.html`).
///
/// A bottom-anchored surface that slides up over a scrim and shows one card's
/// full detail view. It is not full-height, so the content pane it dims shows
/// behind the scrim. A horizontal swipe traverses to the previous or next
/// sibling card without dismissing (`viewModel.next()` / `viewModel.prev()`,
/// mirroring the protocol's `details/next` / `details/prev`). The pane is
/// dismissed by the back chevron, a tap on the scrim, or a downward swipe —
/// returning to the content pane in the same scroll position and selection.
///
/// Presented by its host (`CardListView`) as a `.transition(.move(edge: .bottom))`
/// overlay; the action layer (`.sheet`) always wins the z-order above it,
/// per Pane Protocol Rule 8.
struct CardDetailsView: View {
    let deck: Deck?
    let cards: [Card]
    var startIndex: Int = 0
    var onDismiss: () -> Void

    @StateObject private var viewModel: CardDetailsViewModel

    // Presentation driver. false = pane parked off the bottom + scrim clear;
    // true = pane docked + scrim dimmed. Animating this both slides the pane
    // and fades the scrim, so the two move together (Issue 2).
    @State private var appeared = false

    // Details-pane vertical drag state (swipe-down-to-dismiss). This is an
    // *additional* finger-tracking offset layered on top of the docked
    // position; it is reset to 0 whenever the finger lifts.
    @State private var detailsOffset: CGFloat = 0
    @State private var detailsDragBase: CGFloat = 0

    // Horizontal sibling-traversal swipe state
    @State private var cardDragX: CGFloat = 0

    private let presentDuration: Double = 0.28
    private let scrimOpacity: Double = 0.45

    init(deck: Deck?, cards: [Card], startIndex: Int = 0, onDismiss: @escaping () -> Void) {
        self.deck = deck
        self.cards = cards
        self.startIndex = startIndex
        self.onDismiss = onDismiss
        _viewModel = StateObject(wrappedValue: CardDetailsViewModel(deck: deck, cards: cards, startIndex: startIndex))
    }

    private var mode: String { deck?.mode ?? "study" }
    private var readingDisplay: String { deck?.readingDisplay ?? "reading" }

    private var card: Card? { viewModel.currentCard }

    var body: some View {
        GeometryReader { geo in
            let paneHeight = geo.size.height * 0.92
            // Parked position: the whole pane sits just off the bottom edge.
            let parkedOffset = geo.size.height
            // Docked position + the live finger-drag offset on top of it.
            let paneY = (appeared ? 0 : parkedOffset) + max(0, detailsOffset)

            ZStack(alignment: .bottom) {
                // Scrim — dims the content pane behind the (non-full-height)
                // details pane; a tap on it closes the details layer. It fades
                // via opacity (Issue 2) and covers the full stage so a tap
                // anywhere outside the pane dismisses (Issue 1).
                Color(red: 140/255, green: 140/255, blue: 115/255)
                    .opacity(appeared ? scrimOpacity : 0)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { dismiss() }

                // Details pane
                VStack(spacing: 0) {
                    // Static drag handle — captures the downward swipe-to-dismiss.
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
                .offset(y: paneY)
                .gesture(verticalDragGesture)
            }
            .onAppear {
                // Animate in: pane slides up while the scrim fades in together.
                withAnimation(.easeOut(duration: presentDuration)) { appeared = true }
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
            // Header — back affordance (closes the details pane) + sibling position
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

            // Sibling-traversal card area — horizontal swipe goes to prev/next card
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

    /// Vertical swipe-down on the details pane: track the finger, then commit
    /// (dismiss) or snap back on release. Mirrors the protocol's swipe-down
    /// dismissal of a bottom-anchored pane.
    private var verticalDragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                if value.translation.height < 20 && value.translation.height > -20 {
                    detailsDragBase = detailsOffset
                }
                detailsOffset = max(0, detailsDragBase + value.translation.height)
            }
            .onEnded { value in
                if value.translation.height > 120 || value.predictedEndTranslation.height > 300 {
                    dismiss()
                } else {
                    withAnimation(.easeOut(duration: 0.25)) { detailsOffset = 0 }
                }
            }
    }

    /// Horizontal swipe: traverse to the previous/next sibling card without
    /// dismissing (protocol `details/prev` / `details/next`). Axis-locked so a
    /// vertical drag falls through to the dismiss gesture.
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
                    // Swipe left → next sibling: slide current card out left,
                    // swap content, then slide the next card in from the right.
                    withAnimation(.easeOut(duration: 0.2)) { cardDragX = -w }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        viewModel.next()
                        cardDragX = w           // new card starts offscreen right
                        withAnimation(.easeOut(duration: 0.2)) { cardDragX = 0 }
                    }
                } else if dx > threshold && !viewModel.isFirstCard {
                    // Swipe right → previous sibling: slide current card out right,
                    // swap content, then slide the previous card in from the left.
                    withAnimation(.easeOut(duration: 0.2)) { cardDragX = w }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        viewModel.prev()
                        cardDragX = -w          // new card starts offscreen left
                        withAnimation(.easeOut(duration: 0.2)) { cardDragX = 0 }
                    }
                } else {
                    withAnimation(.spring()) { cardDragX = 0 }
                }
            }
    }

    // MARK: - Helpers

    /// Close the details layer: slide the pane off the bottom while the scrim
    /// fades out together (Issue 2), then hand control back to the content pane
    /// via `onDismiss` once the animation completes.
    private func dismiss() {
        // Animate the docked→parked slide and the drag-offset reset together,
        // so a swipe-down dismissal flows continuously from the finger's last
        // position to fully off-screen without a jump.
        detailsDragBase = 0
        withAnimation(.easeIn(duration: presentDuration)) {
            appeared = false
            detailsOffset = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + presentDuration) { onDismiss() }
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
