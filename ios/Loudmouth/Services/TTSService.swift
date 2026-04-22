import AVFoundation

final class TTSService {
    static let shared = TTSService()
    private let synthesizer = AVSpeechSynthesizer()

    private init() {}

    func speak(_ text: String, lang: String, readingDisplay: String = "reading", reading: String? = nil, romanization: String? = nil) {
        synthesizer.stopSpeaking(at: .immediate)

        let spoken: String
        if lang == "ja", readingDisplay == "romanization", let r = romanization {
            spoken = r
        } else if let r = reading, !r.isEmpty {
            spoken = r
        } else {
            spoken = text
        }

        let utterance = AVSpeechUtterance(string: spoken)
        utterance.voice = AVSpeechSynthesisVoice(language: bcp47(lang))
        synthesizer.speak(utterance)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    private func bcp47(_ lang: String) -> String {
        switch lang {
        case "zh": return "zh-CN"
        case "ja": return "ja-JP"
        default: return lang
        }
    }
}
