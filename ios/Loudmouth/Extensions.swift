import CoreFoundation

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

/// Flattens a reading token array to a plain display string.
/// Each token is [base, annotation?]; the annotation is used when present, else the base.
func flatReading(_ tokens: [[String?]]?) -> String {
    guard let tokens else { return "" }
    return tokens.map { token -> String in
        if token.count > 1, let annotation = token[1] {
            return annotation
        }
        return token.first ?? ""
    }.joined()
}
