//
//  ContentView.swift
//  Loudmouth
//
//  Created by Aaron Wheeler on 4/22/26.
//

import SwiftUI

// Root of the Pane Protocol stack (see `web/docs/PANE_PROTOCOL.html`).
// There is no NavigationStack: `DeckListView` hosts the navigation pane (shell)
// and the sliding content pane; the details and action layers are opened from
// the content pane's body. Layers are composed with ZStacks, offsets, and
// `.sheet`, never pushed onto a navigation stack.
struct ContentView: View {
    var body: some View {
        DeckListView()
    }
}

#Preview {
    ContentView()
}
