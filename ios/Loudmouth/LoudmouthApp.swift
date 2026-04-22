//
//  LoudmouthApp.swift
//  Loudmouth
//
//  Created by Aaron Wheeler on 4/22/26.
//

import SwiftUI
import SwiftData

@main
struct LoudmouthApp: App {
    let container: ModelContainer = {
        let schema = Schema([Card.self, Deck.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        return try! ModelContainer(for: schema, configurations: [config])
    }()

    var body: some Scene {
        WindowGroup {
            DeckListView()
        }
        .modelContainer(container)
    }
}
