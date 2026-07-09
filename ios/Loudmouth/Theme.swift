import SwiftUI

/// Colors mirror the web app's design tokens in `web/app/src/styles/variables.css`.
///
/// The web tokens are authored as CSS `hsl()` values (hue, saturation%, *lightness*%).
/// SwiftUI's `Color(hue:saturation:brightness:)` is HSB/HSV, NOT HSL — feeding the web
/// numbers into it produces oversaturated, tinted colors (e.g. a green cast on the beige
/// background). To stay faithful, each token is converted from HSL to sRGB up front and
/// declared here with `Color(red:green:blue:)`.
enum Theme {
    // Backgrounds
    static let bgPrimary    = rgb(0.96, 0.96, 0.94)   // --beige-100
    static let bgSecondary  = rgb(0.775, 0.775, 0.725) // --beige-400
    static let bgSurface    = Color.white              // --white
    static let bgAccent     = rgb(0.72, 0.88, 0.808)   // --green-100

    // Foreground / text
    static let textBody      = rgb(0.0583, 0.0928, 0.1617) // --gray-900
    static let textSecondary = rgb(0.3948, 0.4449, 0.5452) // --gray-500
    static let textTertiary  = rgb(0.75, 0.75, 0.75)       // --gray-400
    static let fgCaption     = rgb(0.3948, 0.4449, 0.5452) // --gray-500

    // Accent / semantic
    static let accent     = rgb(0.18, 0.42, 0.312)   // --green-600
    static let accentStar = rgb(0.8379, 0.5828, 0.1421) // --amber-500
    static let danger     = rgb(1.0, 0.3107, 0.12)   // --red-500

    // Action-button fills (swipe reveal)
    static let bgBlue   = rgb(0.12, 0.604, 1.0)  // --blue-500
    static let bgYellow = rgb(1.0, 0.8973, 0.12) // --yellow-500

    static let border   = rgb(0.88, 0.88, 0.88)  // --gray-300

    static let radius: CGFloat = 20   // --radius
    static let radiusSm: CGFloat = 8  // --radius-sm

    private static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
        Color(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}
