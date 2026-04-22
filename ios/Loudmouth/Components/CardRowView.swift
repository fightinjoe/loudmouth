import SwiftUI

struct CardRowView: View {
    let card: Card
    let readingDisplay: String
    let onPlay: () -> Void
    let onStar: () -> Void
    let onEdit: () -> Void

    private var reading: String {
        if readingDisplay == "romanization" { return card.romanization ?? card.reading ?? "" }
        return card.reading ?? ""
    }

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if card.starredAt != nil {
                        Text("★")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.accentStar)
                    }
                    Text(card.text)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.textBody)
                }
                Text(reading.isEmpty ? card.translation : reading)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            Button(action: onPlay) {
                Image(systemName: "play.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.textTertiary)
                    .padding(8)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .frame(height: 64)
        .contentShape(Rectangle())
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button(action: onStar) {
                Label(card.starredAt != nil ? "Unstar" : "Star",
                      systemImage: card.starredAt != nil ? "star.slash.fill" : "star.fill")
            }
            .tint(Theme.accentStar)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            .tint(Theme.accent)
        }
    }
}
