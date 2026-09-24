import { validateReadingTokens } from "@catchphrase/card-schema";
import type { Form, ReadingToken } from "@catchphrase/card-schema";
import type { LibraryEntry } from "../js/library-types";
import { escapeHTML } from "../js/utils";
import { openJsonPanel, toImportJson } from "./json-panel";
import { headerIconButton, headerTitle, renderPaneHeader } from "./pane-header";

interface CardEditOperations {
  updateCard(
    cardId: string,
    fields: Record<string, unknown>,
    options?: { occurrenceId?: string },
  ): Promise<void>;
  deleteCard(cardId: string): Promise<void>;
}

export interface CardEditPanelHandle {
  close(): void;
}

type Example = Form & { translation?: string };

function input(panel: HTMLElement, selector: string): HTMLInputElement {
  const element = panel.querySelector<HTMLInputElement>(selector);
  if (!element) throw new Error(`Missing card editor input ${selector}`);
  return element;
}

function textarea(panel: HTMLElement, selector: string): HTMLTextAreaElement {
  const element = panel.querySelector<HTMLTextAreaElement>(selector);
  if (!element) throw new Error(`Missing card editor textarea ${selector}`);
  return element;
}

function button(panel: HTMLElement, selector: string): HTMLButtonElement {
  const element = panel.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Missing card editor button ${selector}`);
  return element;
}


function parseReading(value: string, text: string): ReadingToken[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Reading must be valid JSON.");
  }
  return validateReadingTokens(parsed, text, "Reading");
}

function updatedExample(existing: Example | undefined, text: string): Example | undefined {
  if (text.trim() === "") return undefined;
  const example: Example = { ...(existing ?? {}), text };
  if (example.reading) {
    try {
      validateReadingTokens(example.reading, text, "Example reading");
    } catch {
      delete example.reading;
    }
  }
  return example;
}

/** Opens the full-screen editor for one joined library entry. */
export function openCardEditPanel(
  appElement: HTMLElement,
  entry: LibraryEntry,
  operations: CardEditOperations,
  onSave: () => void,
  onDelete: () => void,
  onDismiss?: () => void,
): CardEditPanelHandle {
  const { card } = entry;
  const chunk = card.type === "chunk";
  const immutableAttribute = chunk ? " readonly aria-readonly=\"true\"" : "";
  const panel = document.createElement("div");
  panel.className = "card-edit-panel pane-full fixed-inset bg-primary flex-col transition-sheet overflow-y-auto";
  appElement.appendChild(panel);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add("pane-full--visible"));
  });

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    panel.classList.remove("pane-full--visible");
    panel.addEventListener("transitionend", () => {
      panel.remove();
      onDismiss?.();
    }, { once: true });
  }

  panel.innerHTML = `
    ${renderPaneHeader({
      leading: headerIconButton("back", { label: "Cancel", className: "fg-accent" }),
      title: headerTitle("Edit Card", { className: "font-semibold bg-none no-tap-highlight" }),
      trailing: '<button class="icon-button fg-accent pane-action-text card-edit-save-btn" id="btn-save-card">Save</button>',
    })}
    <div class="card-edit-body flex-col">
      <p class="card-edit-error fg-danger" id="edit-card-error" role="alert" hidden></p>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-text">Text</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-text" type="text"
          value="${escapeHTML(card.text)}" autocorrect="off" autocapitalize="none" spellcheck="false"${immutableAttribute} />
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-translation">Translation</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-translation" type="text"
          value="${escapeHTML(card.translation)}" />
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-reading">Reading (JSON)</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-reading" type="text"
          value="${escapeHTML(card.reading ? JSON.stringify(card.reading) : "")}" aria-describedby="edit-reading-error" autocorrect="off" autocapitalize="none" spellcheck="false"${immutableAttribute} />
        <p class="card-edit-field-error fg-danger" id="edit-reading-error" role="alert" hidden></p>
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-romanization">Romanization</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-romanization" type="text"
          value="${escapeHTML(card.romanization)}" autocorrect="off" autocapitalize="none" spellcheck="false"${immutableAttribute} />
      </div>
      ${chunk ? `
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-role">Role</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-role" type="text" value="${escapeHTML(card.role)}" />
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-explanation">Explanation</label>
        <textarea class="card-edit-input card-edit-textarea surface-field text-area text-body1 font-inherit" id="edit-explanation" autocorrect="off">${escapeHTML(card.explanation)}</textarea>
      </div>` : ""}
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-notes">Notes</label>
        <textarea class="card-edit-input card-edit-textarea surface-field text-area text-body1 font-inherit" id="edit-notes"
          autocorrect="off">${escapeHTML(card.notes)}</textarea>
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-example">Example</label>
        <textarea class="card-edit-input card-edit-textarea surface-field text-area text-body1 font-inherit" id="edit-example"
          autocorrect="off">${escapeHTML(card.example?.text)}</textarea>
      </div>
      <div class="card-edit-export">
        <button class="btn btn-secondary" id="btn-view-json">View JSON</button>
      </div>
      <div class="card-edit-danger flex-col">
        <p class="section-label card-edit-danger-label">Danger zone</p>
        <button class="btn card-edit-delete-btn fg-danger bg-transparent" id="btn-delete-card">Delete Card</button>
      </div>
    </div>
  `;

  const backButton = button(panel, ".icon-button");
  const exportButton = button(panel, "#btn-view-json");
  const saveButton = button(panel, "#btn-save-card");
  const deleteButton = button(panel, "#btn-delete-card");
  const textInput = input(panel, "#edit-text");
  const translationInput = input(panel, "#edit-translation");
  const readingInput = input(panel, "#edit-reading");
  const romanizationInput = input(panel, "#edit-romanization");
  const notesInput = textarea(panel, "#edit-notes");
  const exampleInput = textarea(panel, "#edit-example");
  const readingError = panel.querySelector<HTMLElement>("#edit-reading-error");
  const panelError = panel.querySelector<HTMLElement>("#edit-card-error");
  if (!readingError || !panelError) throw new Error("Missing card editor error regions");
  const clearErrors = (): void => {
    readingError.hidden = true;
    readingError.textContent = "";
    readingInput.removeAttribute("aria-invalid");
    panelError.hidden = true;
    panelError.textContent = "";
  };



  backButton.addEventListener("click", close);
  exportButton.addEventListener("click", () => {
    openJsonPanel(appElement, "Card JSON", toImportJson([entry]));
  });

  saveButton.addEventListener("click", async () => {
    clearErrors();
    const text = textInput.value;
    const translation = translationInput.value;
    if (text.trim() === "") {
      textInput.focus();
      return;
    }
    if (translation.trim() === "") {
      translationInput.focus();
      return;
    }

    let reading: ReadingToken[] | undefined;
    if (!chunk) {
      try {
        reading = parseReading(readingInput.value, text);
      } catch (error) {
        readingError.textContent = error instanceof Error ? error.message : "Invalid reading.";
        readingError.hidden = false;
        readingInput.setAttribute("aria-invalid", "true");
        readingInput.focus();
        return;
      }
    }

    const notes = notesInput.value;
    const romanization = romanizationInput.value;
    const fields: Record<string, unknown> = {
      translation,
      notes: notes.trim() === "" ? undefined : notes,
      example: updatedExample(card.example, exampleInput.value),
    };
    if (chunk) {
      fields.role = input(panel, "#edit-role").value;
      fields.explanation = textarea(panel, "#edit-explanation").value;
    } else {
      fields.text = text;
      fields.reading = reading;
      fields.romanization = romanization.trim() === "" ? undefined : romanization;
    }

    saveButton.disabled = true;
    deleteButton.disabled = true;
    try {
      await operations.updateCard(entry.cardId, fields, {
        occurrenceId: entry.occurrence?.id,
      });
      onSave();
      close();
    } catch (error) {
      panelError.textContent = error instanceof Error ? error.message : "Unable to update the library.";
      panelError.hidden = false;
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  });

  deleteButton.addEventListener("click", async () => {
    clearErrors();
    if (!confirm("Delete this card? This cannot be undone.")) return;
    saveButton.disabled = true;
    deleteButton.disabled = true;
    try {
      await operations.deleteCard(entry.cardId);
      onDelete();
      close();
    } catch (error) {
      panelError.textContent = error instanceof Error ? error.message : "Unable to update the library.";
      panelError.hidden = false;
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  });

  return { close };
}
