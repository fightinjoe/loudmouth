import SwiftUI

struct LangBadge: View {
    let lang: String

    private var flag: String {
        switch lang {
        case "zh": return "🇨🇳"
        case "ja": return "🇯🇵"
        default: return "🌐"
        }
    }

    private var name: String {
        switch lang {
        case "zh": return "Chinese"
        case "ja": return "Japanese"
        default: return lang
        }
    }

    var body: some View {
        Text("\(flag) \(name)")
            .font(.caption)
            .foregroundStyle(.secondary)
    }
}
