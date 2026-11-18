import SwiftUI

/// The retired card APIs must remain inaccessible until the phrasebook migration lands.
struct OnlineGenerationUnavailableView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 20) {
            Capsule()
                .fill(Theme.border)
                .frame(width: 36, height: 4)
            Text("Online generation unavailable")
                .font(.headline)
                .foregroundStyle(Theme.textBody)
            Text("Update required for online generation. Saved content is still available.")
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.textSecondary)
            Button("Back to saved content") { dismiss() }
                .foregroundStyle(Theme.accent)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Theme.bgPrimary)
    }
}
