---
kind: guide
status: current
summary: iOS development — build configurations, protected-request build inputs, bundle identifiers, App Attest and the Firebase SDK pin.
sources: [ios/Config/Protection.xcconfig, ios/Config/Debug.xcconfig, ios/Config/Release.xcconfig, ios/Loudmouth/Loudmouth.entitlements, ios/Loudmouth/Services/APIIdentity.swift, ios/Loudmouth.xcodeproj/project.pbxproj]
verified: 2026-11-15
---

# iOS development

How the native app in `ios/` is configured to make [protected requests](architecture.md#protected-requests). The architecture is in [iOS architecture](architecture.md). What remains before the app can generate, including device acceptance, is tracked in [API protection](../todo/antsy-aphid/api-protection.md#native-acceptance) and the [iOS port](../todo/antsy-aphid/ios-port.md).

## Build configurations and inputs

`ios/Config/Debug.xcconfig` selects the `staging` environment and `ios/Config/Release.xcconfig` selects `production` (`LOUDMOUTH_PROTECTION_ENV`); both include `ios/Config/Protection.xcconfig`, which declares the inputs empty. Supply the environment's values through command-line build settings or an operator-owned `-xcconfig`:

| Input | Value |
|---|---|
| `LOUDMOUTH_API_URL` | The protected gateway, as an HTTPS origin only |
| `LOUDMOUTH_FIREBASE_API_KEY` | Registered Firebase iOS app public API key |
| `LOUDMOUTH_FIREBASE_PROJECT_ID` | The environment's Firebase project |
| `LOUDMOUTH_FIREBASE_APP_ID` | The exact allowlisted iOS app ID |
| `LOUDMOUTH_FIREBASE_SENDER_ID` | The Firebase app's sender ID |
| `LOUDMOUTH_FIREBASE_BUNDLE_ID` | The bundle identifier registered for that app |

In xcconfig syntax write URL schemes as `https:/$()/`, because `//` starts a comment. These Firebase registration values are public and are not credentials; never put service-account keys or debug tokens in a build input, plist or source file. No project ID, app ID, staging bundle, API hostname or registration is checked in. `APIConfiguration.load` in `ios/Loudmouth/Services/APIIdentity.swift` validates the inputs at startup; when they are missing or invalid the app runs with generation unavailable.

## Bundle identifiers and signing

The checked-in target's production bundle identifier is `com.fightinjoe.Loudmouth`, with development team `YK882Y8382` (`ios/Loudmouth.xcodeproj/project.pbxproj`). These are target settings, not proof of an Apple or Firebase registration or of signing access. Staging needs a separately registered bundle and Firebase project: override `PRODUCT_BUNDLE_IDENTIFIER` and supply the matching `LOUDMOUTH_FIREBASE_BUNDLE_ID`. The app refuses the production bundle in staging and any other bundle in production.

## App Attest and the debug provider

`ios/Loudmouth/Loudmouth.entitlements` sets `com.apple.developer.devicecheck.appattest-environment` to `production`. Release and TestFlight builds use App Attest only. Only a `DEBUG` build configured for staging can opt into the App Check debug provider with `LOUDMOUTH_APP_CHECK_DEBUG=YES`; register a locally generated debug token only in the nonproduction Firebase project. Simulator and debug-provider results are not App Attest evidence.

## Firebase SDK

FirebaseCore, FirebaseAuth and FirebaseAppCheck are pinned to exactly 12.5.0 (Swift tools 6.0) at revision `793b67f4652e1a39d03fab6650033768afe6d15e`: [release](https://github.com/firebase/firebase-ios-sdk/releases/tag/12.5.0), [tag metadata](https://api.github.com/repos/firebase/firebase-ios-sdk/git/ref/tags/12.5.0), [package manifest](https://github.com/firebase/firebase-ios-sdk/blob/12.5.0/Package.swift). The 13.1.1 manifest requires Xcode 26.2 and Swift 6.2.3; the pin avoids imposing that toolchain migration. No Analytics or client Firestore product is linked.

The transitive pins are in `ios/Loudmouth.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (v2 format). Firebase's package-wide dependency graph puts Analytics- and Firestore-related pins in that lockfile; their presence does not add those products to the app.

## Known gaps

- The pins were resolved with the Swift command-line resolver, not Xcode, and the app has not been compiled with full Xcode since the SDK was added ([local verification record](../evals/results/2026-11-04-api-protection-local-verification.md)).
- There is no native test target.
