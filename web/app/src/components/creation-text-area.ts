import { icon } from "./icon";
import { escapeHTML } from "../js/utils";

export const SITUATION_PROMPT = "What are you preparing for?";

/** The situation field and its submit control; the clear control lives in the pane header. */
export function renderCreationTextArea(value: string): string {
  return `<textarea
      id="creation-situation"
      class="creation-input-field"
      rows="1"
      placeholder="${SITUATION_PROMPT}"
      aria-label="${SITUATION_PROMPT}"
      enterkeyhint="go"
      autocomplete="off"
      autocapitalize="sentences"
      spellcheck="true"
    >${escapeHTML(value)}</textarea>
    <button class="creation-submit tappable" data-action="creation/submit-topic" aria-label="Prepare my phrasebook" ${value.length > 0 ? "" : "disabled"}>${icon("next", { size: "sm" })}</button>`;
}

/**
 * Owns only field behavior: auto-height, the `data-has-value` state on `root`,
 * the clear and submit controls, and Enter to submit. The creation controller
 * owns requests and submission.
 */
export function bindCreationTextArea(
  root: HTMLElement,
  { value, onInput, onClear, onSubmit }: {
    value: string;
    onInput: (value: string) => void;
    onClear: () => void;
    onSubmit: (value: string) => void;
  },
): () => void {
  const input = root.querySelector<HTMLTextAreaElement>(".creation-input-field")!;
  const submit = root.querySelector<HTMLButtonElement>('[data-action="creation/submit-topic"]')!;
  const clear = root.querySelector<HTMLButtonElement>('[data-action="creation/clear"]');
  function update(): void {
    const hasValue = input.value.length > 0;
    root.dataset.hasValue = String(hasValue);
    submit.disabled = !hasValue;
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
  function submitInput(): void {
    onSubmit(input.value);
  }
  function keydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submitInput();
  }
  input.value = value;
  update();
  input.addEventListener("input", inputChanged);
  input.addEventListener("keydown", keydown);
  submit.addEventListener("click", submitInput);
  clear?.addEventListener("click", clearInput);
  return () => {
    input.removeEventListener("input", inputChanged);
    input.removeEventListener("keydown", keydown);
    submit.removeEventListener("click", submitInput);
    clear?.removeEventListener("click", clearInput);
  };
}
