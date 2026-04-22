import SwiftUI

struct FlipCardView: View {
    let card: Card
    let mode: String
    let readingDisplay: String
    let isRevealed: Bool
    let onTap: () -> Void
    let onRevealPress: () -> Void
    let onRevealRelease: () -> Void

    // In study mode: front = text, back = translation
    // In review/reverse mode: front = translation, back = text
    private var frontText: String {
        mode == "study" ? card.text : card.translation
    }

    private var frontReading: String {
        guard mode == "study" else { return "" }
        if readingDisplay == "romanization" { return card.romanization ?? card.reading ?? "" }
        return card.reading ?? ""
    }

    private var backText: String {
        mode == "study" ? card.translation : card.text
    }

    private var backReading: String {
        guard mode != "study" else { return "" }
        if readingDisplay == "romanization" { return card.romanization ?? card.reading ?? "" }
        return card.reading ?? ""
    }

    var body: some View {
        VStack(spacing: 16) {
            // Front face — always visible
            Button(action: onTap) {
                VStack(spacing: 8) {
                    if card.starredAt != nil {
                        Text("★")
                            .font(.caption)
                            .foregroundStyle(.yellow)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Text(frontText)
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(Theme.textBody)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                    if !frontReading.isEmpty {
                        Text(frontReading)
                            .font(.title3)
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(32)
                .frame(maxWidth: .infinity, minHeight: 200)
                .background(Theme.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)

            // Back face — press and hold to peek
            ZStack {
                // Skeleton placeholder
                VStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemFill))
                        .frame(height: 24)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemFill))
                        .frame(width: 120, height: 24)
                }
                .padding(.horizontal, 40)
                .opacity(isRevealed ? 0 : 1)

                // Revealed content
                VStack(spacing: 8) {
                    Text(backText)
                        .font(.title2)
                        .multilineTextAlignment(.center)
                    if !backReading.isEmpty {
                        Text(backReading)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    if let notes = card.notes, !notes.isEmpty {
                        Text(notes)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .opacity(isRevealed ? 1 : 0)
            }
            .padding(24)
            .frame(maxWidth: .infinity, minHeight: 100)
            .background(Theme.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .animation(.easeInOut(duration: 0.15), value: isRevealed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in onRevealPress() }
                    .onEnded { _ in onRevealRelease() }
            )

            // Example sentence (if present)
            if let exText = card.exampleText, !exText.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(exText)
                        .font(.caption)
                    if let exTranslation = card.exampleTranslation, !exTranslation.isEmpty {
                        Text(exTranslation)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.bgPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }
}
