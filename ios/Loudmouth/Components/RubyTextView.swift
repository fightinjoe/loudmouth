import SwiftUI

struct RubyTextView: View {
    let tokens: [[String?]]
    let baseFont: Font
    let rubyFont: Font
    let alignment: HorizontalAlignment

    init(
        _ tokens: [[String?]],
        baseFont: Font = .system(size: 24),
        rubyFont: Font = .system(size: 14),
        alignment: HorizontalAlignment = .center
    ) {
        self.tokens = tokens
        self.baseFont = baseFont
        self.rubyFont = rubyFont
        self.alignment = alignment
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(0..<tokens.count, id: \.self) { i in
                let token = tokens[i]
                let base = token.first.flatMap { $0 } ?? ""
                let ruby = token.count > 1 ? token[1] : nil

                VStack(alignment: .center, spacing: 0) {
                    if let rubyText = ruby, !rubyText.isEmpty, rubyText != base {
                        Text(rubyText)
                            .font(rubyFont)
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                    }

                    Text(base)
                        .font(baseFont)
                        .foregroundStyle(Theme.textBody)
                }
            }
        }
    }
}

#Preview {
    VStack(spacing: 40) {
        // Japanese example
        RubyTextView(
            [["注", "ちゅう"], ["文", "もん"], ["してもいいですか", nil]]
        )

        // List view variant
        RubyTextView(
            [["済", "す"], ["み", nil]],
            baseFont: .system(size: 18, weight: .semibold),
            rubyFont: .system(size: 13)
        )

        // Review view variant
        RubyTextView(
            [["菜", "cài"], ["单", "dān"]],
            baseFont: .system(size: 40, weight: .bold),
            rubyFont: .system(size: 16)
        )
    }
    .padding()
}
