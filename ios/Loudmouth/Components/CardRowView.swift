import SwiftUI

struct CardRowView: View {
    let card: Card
    let readingDisplay: String
    let onPlay: () -> Void
    let onStar: () -> Void
    let onEdit: () -> Void

    private var reading: String {
        if readingDisplay == "romanization" {
            return card.romanization ?? card.reading ?? ""
        }
        return card.reading ?? ""
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if card.starredAt != nil {
                        Text("★")
                            .foregroundStyle(.yellow)
                    }
                    Text(card.text)
                        .font(.body)
                        .fontWeight(.medium)
                }
                if !reading.isEmpty {
                    Text(reading)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(card.translation)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(action: onPlay) {
                Image(systemName: "play.circle")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
        .swipeActions(edge: .leading) {
            Button(action: onStar) {
                Label(card.starredAt != nil ? "Unstar" : "Star",
                      systemImage: card.starredAt != nil ? "star.slash" : "star")
            }
            .tint(.yellow)
        }
        .swipeActions(edge: .trailing) {
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            .tint(.blue)
        }
    }
}
