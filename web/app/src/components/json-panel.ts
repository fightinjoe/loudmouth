import { SCHEMA_VERSION, cardIdentity, evidenceIdentity, validateCardBatch } from '@catchphrase/card-schema';
import type { Candidate } from '@catchphrase/card-schema';
import type { LibraryEntry } from '../js/library-types';
import { renderPaneHeader, headerIconButton, headerTitle } from './pane-header';

export function toImportJson(entries: readonly LibraryEntry[]): string {
  const unique = new Map<string, Candidate>();
  for (const entry of entries) {
    const key = cardIdentity(entry.card);
    let candidate = unique.get(key);
    if (!candidate) {
      candidate = {card:entry.card};
      unique.set(key,candidate);
    }
    if (entry.card.type === 'word' && entry.sources.length) {
      const sources = new Map((candidate.sources ?? []).map(source => [evidenceIdentity(source),source]));
      for (const source of entry.sources) sources.set(evidenceIdentity(source),source);
      candidate.sources = [...sources.values()];
    }
  }
  return JSON.stringify(validateCardBatch({schemaVersion:SCHEMA_VERSION,cards:[...unique.values()]}),null,2);
}

export function openJsonPanel(appEl: HTMLElement, title: string, jsonString: string, onDismiss?: () => void): {close: () => void} {
  const panel = document.createElement('div');
  panel.className = 'json-panel pane-full fixed-inset bg-primary flex-col transition-sheet';
  appEl.appendChild(panel);
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('pane-full--visible')));
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    panel.classList.remove('pane-full--visible');
    panel.addEventListener('transitionend', () => { panel.remove(); onDismiss?.(); }, {once:true});
  }
  panel.innerHTML = `
    ${renderPaneHeader({
      leading:headerIconButton('back',{label:'Back',className:'fg-accent json-pane-back'}),
      title:headerTitle(title,{className:'font-semibold bg-none no-tap-highlight'}),
      trailing:'<button class="icon-button fg-accent pane-action-text json-pane-copy-btn" id="btn-copy-json">Copy</button>',
    })}
    <div class="json-pane-body flex-1 flex-col">
      <textarea class="json-pane-textarea flex-1 surface-field text-area-fixed text-body2 font-mono leading-entry" readonly spellcheck="false"></textarea>
    </div>`;
  const textarea = panel.querySelector<HTMLTextAreaElement>('.json-pane-textarea');
  const back = panel.querySelector<HTMLButtonElement>('.json-pane-back');
  const copy = panel.querySelector<HTMLButtonElement>('#btn-copy-json');
  if (!textarea || !back || !copy) throw new Error('Missing JSON panel controls');
  textarea.value = jsonString;
  back.addEventListener('click',close);
  copy.addEventListener('click',async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(jsonString);
      else {
        textarea.removeAttribute('readonly');
        textarea.select();
        textarea.setSelectionRange(0,textarea.value.length);
        document.execCommand('copy');
        textarea.setSelectionRange(0,0);
        textarea.setAttribute('readonly','');
        textarea.blur();
      }
      copy.textContent = 'Copied!';
      setTimeout(() => {copy.textContent = 'Copy';},1500);
    } catch {
      copy.textContent = 'Copy failed';
    }
  });
  return {close};
}
