import { icon } from "./icon";
import { escapeHTML } from "../js/utils";

/** One situation field per creation surface; IDs connect its label and help text. */
export function renderCreationTextArea(value: string): string {
  return `<label class="creation-question-label" for="creation-situation">What are you getting ready for?</label>
    <p class="creation-supporting-copy" id="creation-situation-help">Tell us about an upcoming situation. We’ll prepare the language you’ll want to say and understand.</p>
    <div class="creation-input-wrap" data-has-value="${value.length > 0}">
      <div class="creation-input-field-row">
        <textarea
          id="creation-situation"
          class="creation-input-field"
          rows="3"
          placeholder="Dinner with my partner’s parents, a surf trip, my first dance class…"
          aria-describedby="creation-situation-help"
          autocomplete="off"
          autocapitalize="sentences"
          spellcheck="true"
        >${escapeHTML(value)}</textarea>
        <button class="icon-button creation-input-clear" data-action="creation/clear" aria-label="Clear situation">${icon("close", { size: "sm" })}</button>
      </div>
    </div>`;
}

/** Owns only field behavior. The creation controller owns requests and submission. */
export function bindCreationTextArea(
  root: HTMLElement,
  { value, onInput, onClear }: { value: string; onInput: (value: string) => void; onClear: () => void },
): () => void {
  const input = root.querySelector<HTMLTextAreaElement>(".creation-input-field")!;
  const wrap = root.querySelector<HTMLElement>(".creation-input-wrap")!;
  const clear = root.querySelector<HTMLButtonElement>('[data-action="creation/clear"]')!;
  function update(): void {
    wrap.dataset.hasValue = String(input.value.length > 0);
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }
  function inputChanged(): void {
    update();
    onInput(input.value);
  }
  function clearInput(): void {
    input.value = "";
    update();
    input.focus();
    onClear();
  }
  input.value = value;
  update();
  input.addEventListener("input", inputChanged);
  clear.addEventListener("click", clearInput);
  return () => {
    input.removeEventListener("input", inputChanged);
    clear.removeEventListener("click", clearInput);
  };
}
