import SwiftUI

struct CardEditView: View {
    let card: Card
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var text: String
    @State private var translation: String
    @State private var reading: String
    @State private var romanization: String
    @State private var notes: String
    @State private var exampleText: String
    @State private var showDeleteConfirm = false
    @State private var validationError: String?

    init(card: Card) {
        self.card = card
        _text = State(initialValue: card.text)
        _translation = State(initialValue: card.translation)
        _reading = State(initialValue: flatReading(card.reading))
        _romanization = State(initialValue: card.romanization ?? "")
        _notes = State(initialValue: card.notes ?? "")
        _exampleText = State(initialValue: card.exampleText ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Text") {
                        TextField("Required", text: $text)
                            .multilineTextAlignment(.trailing)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                    LabeledContent("Translation") {
                        TextField("Required", text: $translation)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Reading") {
                        TextField("Optional", text: $reading)
                            .multilineTextAlignment(.trailing)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                    LabeledContent("Romanization") {
                        TextField("Optional", text: $romanization)
                            .multilineTextAlignment(.trailing)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                }

                Section("Notes") {
                    TextField("Optional", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                        .autocorrectionDisabled()
                }

                Section("Example") {
                    TextField("Optional", text: $exampleText, axis: .vertical)
                        .lineLimit(2...4)
                        .autocorrectionDisabled()
                }

                if let error = validationError {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                Section {
                    Button("Delete Card", role: .destructive) {
                        showDeleteConfirm = true
                    }
                }
            }
            .navigationTitle("Edit Card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                }
            }
            .confirmationDialog(
                "Delete this card?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) { deleteCard() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This cannot be undone.")
            }
        }
    }

    private func save() {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTranslation = translation.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedText.isEmpty else { validationError = "Text is required."; return }
        guard !trimmedTranslation.isEmpty else { validationError = "Translation is required."; return }

        card.text = trimmedText
        card.translation = trimmedTranslation

        let trimmedReading = reading.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedReading.isEmpty {
            // If user edited it, we store it as a single unannotated token for now,
            // matching the web app's simplified editing behavior.
            if trimmedReading != flatReading(card.reading) {
                card.reading = [[trimmedReading, nil]]
            }
        } else {
            card.reading = nil
        }

        card.romanization = romanization.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        card.notes = notes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        card.exampleText = exampleText.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty

        dismiss()
    }

    private func deleteCard() {
        modelContext.delete(card)
        dismiss()
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
