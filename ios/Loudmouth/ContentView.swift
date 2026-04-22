//
//  ContentView.swift
//  Loudmouth
//
//  Created by Aaron Wheeler on 4/22/26.
//

import SwiftUI

// Root navigation shell — screens are pushed onto NavigationStack from DeckListView.
struct ContentView: View {
    var body: some View {
        DeckListView()
    }
}

#Preview {
    ContentView()
}
