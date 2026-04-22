import SwiftUI

enum Theme {
    // Matches web variables.css
    static let bgPrimary    = Color(hue: 60/360, saturation: 0.20, brightness: 0.95)
    static let bgSurface    = Color.white
    static let textBody     = Color(hue: 220/360, saturation: 0.47, brightness: 0.11)
    static let textSecondary = Color(hue: 220/360, saturation: 0.16, brightness: 0.47)
    static let textTertiary = Color(hue: 0,        saturation: 0,    brightness: 0.75)
    static let accent       = Color(hue: 153/360, saturation: 0.40, brightness: 0.30)
    static let accentStar   = Color(hue: 38/360,  saturation: 0.71, brightness: 0.49)
    static let danger       = Color(hue: 4/360,   saturation: 0.86, brightness: 0.58)
    static let border       = Color(hue: 0,        saturation: 0,    brightness: 0.88)
    static let radius: CGFloat = 8
}
