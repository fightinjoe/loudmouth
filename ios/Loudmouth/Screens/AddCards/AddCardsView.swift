import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct AddCardsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var allDecks: [Deck]
    @Query private var allCards: [Card]

    @State private var jsonText = ""
    @State private var parsedCards: [CardInput] = []
    @State private var parseError: String?
    @State private var step: Step = .paste
    @State private var showExportShare = false
    @State private var exportURL: URL?
    @State private var showRestorePicker = false
    @State private var backupError: String?
    @State private var showRestoreConfirm = false
    @State private var pendingRestoreData: Data?

    enum Step { case paste, confirm }

    private var detectedLang: String {
        let counts = Dictionary(grouping: parsedCards, by: \.lang).mapValues(\.count)
        return counts.max(by: { $0.value < $1.value })?.key ?? "zh"
    }

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .paste: pasteStep
                case .confirm: confirmStep
                }
            }
            .navigationTitle(step == .paste ? "Import Cards" : "Confirm Import")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if step == .confirm {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Back") { step = .paste }
                    }
                }
            }
        }
    }

    // MARK: Step 1 — paste JSON

    private var pasteStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            TextEditor(text: $jsonText)
                .font(.system(.caption, design: .monospaced))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(8)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .overlay(
                    Group {
                        if jsonText.isEmpty {
                            Text(#"{"cards": [...]}"#)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.tertiary)
                                .padding(14)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                .allowsHitTesting(false)
                        }
                    }
                )

            if let error = parseError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Button("Parse Cards") {
                doParse()
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity)
            .disabled(jsonText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            Divider()

            // Backup section
            VStack(alignment: .leading, spacing: 8) {
                Text("Backup")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(spacing: 12) {
                    Button("Export Backup") { doExport() }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)

                    Button("Restore Backup") { showRestorePicker = true }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                }

                if let error = backupError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .padding()
        .fileImporter(
            isPresented: $showRestorePicker,
            allowedContentTypes: [.json]
        ) { result in
            handleRestoreFile(result)
        }
        .confirmationDialog(
            "Restore Backup?",
            isPresented: $showRestoreConfirm,
            titleVisibility: .visible
        ) {
            Button("Restore", role: .destructive) {
                if let data = pendingRestoreData { doRestore(data) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will replace all current cards and decks.")
        }
        .sheet(isPresented: $showExportShare) {
            if let url = exportURL {
                ShareSheet(url: url)
            }
        }
    }

    private func doParse() {
        parseError = nil
        do {
            parsedCards = try ImportService.parse(jsonText)
            step = .confirm
        } catch {
            parseError = error.localizedDescription
        }
    }

    // MARK: Step 2 — pick deck and import

    private var confirmStep: some View {
        ConfirmImportView(
            parsedCards: parsedCards,
            lang: detectedLang,
            decksForLang: allDecks.filter { $0.lang == detectedLang },
            onImport: { deckId in
                doImport(deckId: deckId)
            }
        )
    }

    private func doExport() {
        backupError = nil
        do {
            let data = try BackupService.export(cards: allCards, decks: allDecks)
            let filename = "loudmouth-backup-\(ISO8601DateFormatter().string(from: .now).prefix(10)).json"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
            try data.write(to: url)
            exportURL = url
            showExportShare = true
        } catch {
            backupError = "Export failed: \(error.localizedDescription)"
        }
    }

    private func handleRestoreFile(_ result: Result<URL, Error>) {
        backupError = nil
        switch result {
        case .failure(let error):
            backupError = "Could not open file: \(error.localizedDescription)"
        case .success(let url):
            guard url.startAccessingSecurityScopedResource() else {
                backupError = "Permission denied."
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }
            do {
                pendingRestoreData = try Data(contentsOf: url)
                showRestoreConfirm = true
            } catch {
                backupError = "Could not read file: \(error.localizedDescription)"
            }
        }
    }

    private func doRestore(_ data: Data) {
        do {
            try BackupService.restore(from: data, context: modelContext)
            dismiss()
        } catch {
            backupError = "Restore failed: \(error.localizedDescription) | \((error as NSError).domain) \((error as NSError).code)"
        }
    }

    private func doImport(deckId: String) {
        let cards = ImportService.makeCards(from: parsedCards, deckId: deckId)
        for card in cards {
            modelContext.insert(card)
        }
        // Update deck lastAccessedAt
        if let deck = allDecks.first(where: { $0.id == deckId }) {
            deck.lastAccessedAt = .now
        }
        dismiss()
    }
}

// MARK: - Share sheet

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Confirm step subview

private struct ConfirmImportView: View {
    let parsedCards: [CardInput]
    let lang: String
    let decksForLang: [Deck]
    let onImport: (String) -> Void

    @Environment(\.modelContext) private var modelContext

    @State private var selectedDeckId: String = "__new__"
    @State private var newDeckName = ""
    @State private var deckError: String?
    @State private var isImporting = false

    var body: some View {
        VStack(spacing: 24) {
            VStack(spacing: 4) {
                Text("\(parsedCards.count)")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                Text("card\(parsedCards.count == 1 ? "" : "s") ready to import")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)

            VStack(alignment: .leading, spacing: 8) {
                Text("Add to deck")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Picker("Deck", selection: $selectedDeckId) {
                    ForEach(decksForLang) { deck in
                        Text(deck.name).tag(deck.id)
                    }
                    Text("New deck…").tag("__new__")
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)

                if selectedDeckId == "__new__" {
                    TextField("Deck name", text: $newDeckName)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                }

                if let error = deckError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding(.horizontal)

            Button(isImporting ? "Importing…" : "Import") {
                doImport()
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity)
            .padding(.horizontal)
            .disabled(isImporting)

            Spacer()
        }
        .onAppear {
            if decksForLang.isEmpty {
                selectedDeckId = "__new__"
            } else {
                selectedDeckId = decksForLang[0].id
            }
        }
    }

    private func doImport() {
        deckError = nil
        var deckId = selectedDeckId

        if deckId == "__new__" {
            let name = newDeckName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else {
                deckError = "Enter a deck name."
                return
            }
            let deck = Deck(
                id: makeSlug(name),
                name: name,
                lang: lang,
                lastAccessedAt: .now
            )
            modelContext.insert(deck)
            deckId = deck.id
        }

        isImporting = true
        onImport(deckId)
    }

    private func makeSlug(_ name: String) -> String {
        let slug = name.lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" }
        let counter = String(format: "%03d", Int.random(in: 1...999))
        return "\(counter)-\(slug)"
    }
}
