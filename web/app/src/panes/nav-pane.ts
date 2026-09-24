import { getCards, getCardsByLang, getDecks, getLangs, getRecentDecks, updateDeckAccessTime } from '../js/db';
import { LANG_FLAGS, LANG_NAMES, isContentLanguage } from '../js/lang';
import { setAttrSafe, setListHTMLSafe } from '../js/uiState';
import { renderPhrasebookRow } from '../components/phrasebook-row';
import type { Lang } from '@catchphrase/card-schema';
import type { Deck } from '../js/library-types';
import type { AppHost, AppTransitions } from '../js/app-types';

type NavItem = {kind:'recent';deck:Deck;subtitle:string;newest:boolean}
  | {kind:'lang';lang:Lang;flag:string;name:string;subtitle:string};
export interface NavSlice {items:NavItem[];reloadAt:number}

function renderHero(): string {
  return `<div class="nav-hero flex-col">
    <span class="nav-hero-logo text-h2 font-semibold fg-accent">CatchPhrase</span>
    <span class="nav-hero-tagline text-body2 fg-secondary font-light">Say what you need, avoid the rest</span>
  </div>`;
}
function renderListHTML(items: NavItem[]): string {
  const recent: string[] = [];
  const langs: string[] = [];
  for (const item of items) {
    if (item.kind === 'recent') recent.push(renderPhrasebookRow({
      title:item.deck.name,subtitle:item.subtitle,chevron:true,card:true,highlighted:item.newest,
      rowAction:'nav/open-deck',rowData:{deckId:item.deck.id},
    }));
    else langs.push(renderPhrasebookRow({
      title:item.name,subtitle:item.subtitle,leading:item.flag,chevron:true,card:true,
      rowAction:'nav/browse-lang',rowData:{lang:item.lang},
    }));
  }
  return (recent.length ? `<div class="nav-section"><span class="nav-section-label section-label">Jump back in</span><div class="nav-cards">${recent.join('')}</div></div>` : '')
    + (langs.length ? `<div class="nav-section"><span class="nav-section-label section-label">Library</span><div class="nav-cards">${langs.join('')}</div></div>` : '');
}
function renderCreateBar(hasLibrary: boolean): string {
  return hasLibrary ? '<button class="nav-create-btn tappable" data-action="nav/open-new-phrasebook">New phrasebook</button>' : `
    <div class="nav-callout flex-col">
      <span class="nav-callout-title text-h2 font-semibold fg-surface">Make your first phrasebook</span>
      <span class="nav-callout-body text-body1 fg-surface">Tell us the situation. You get the phrases you’d actually say, and none you wouldn’t.</span>
      <button class="nav-callout-btn tappable" data-action="nav/open-new-phrasebook">New phrasebook</button>
    </div>`;
}
async function loadNavItems(): Promise<NavItem[]> {
  const items: NavItem[] = [];
  const recent = await getRecentDecks(3);
  for (const [index,deck] of recent.entries()) {
    const entries = await getCards(deck.id);
    items.push({kind:'recent',deck,newest:index===0,subtitle:`${LANG_NAMES[deck.lang]} · ${entries.length} cards`});
  }
  const decks = await getDecks(null);
  const languages = new Set([...await getLangs(),...decks.map(deck=>deck.lang)]);
  for (const lang of [...languages].sort()) {
    const count = decks.filter(deck=>deck.lang===lang).length;
    const saved = await getCardsByLang(lang);
    items.push({kind:'lang',lang,flag:LANG_FLAGS[lang],name:LANG_NAMES[lang],
      subtitle:`${count} phrasebook${count===1?'':'s'} · ${saved.length} saved cards`});
  }
  return items;
}

export async function loadLangBrowse(lang: Lang): Promise<{title:string;groupsHtml:string}> {
  const decks = (await getDecks(lang)).sort((a,b)=>a.name.localeCompare(b.name));
  const saved = await getCardsByLang(lang);
  const rows = saved.length ? [renderPhrasebookRow({
    title:'All saved cards',subtitle:`${saved.length} cards`,chevron:true,
    rowAction:'content/browse-select',rowData:{deckId:`lang:${lang}`},
  })] : [];
  for (const deck of decks) {
    const entries = await getCards(deck.id);
    rows.push(renderPhrasebookRow({title:deck.name,subtitle:`${entries.length} cards`,chevron:true,
      rowAction:'content/browse-select',rowData:{deckId:deck.id}}));
  }
  return {title:`${LANG_FLAGS[lang]} ${LANG_NAMES[lang]}`.trim(),groupsHtml:`<div class="deck-picker-lang-group">${rows.join('')}</div>`};
}

const initialState: NavSlice = {items:[],reloadAt:0};
const navPane = {
  namespace:'nav' as const,
  initialState,
  transitions:{
    'nav/reload':slice=>({...slice,reloadAt:slice.reloadAt+1}),
    'nav/refresh':(slice,{items})=>({...slice,items}),
  } satisfies AppTransitions,
  render(initial:NavSlice):string {
    const populated = initial.items.length>0;
    return `<div id="nav-pane" class="nav-pane flex-col bg-surface" data-state="${populated?'populated':'empty'}">
      <div class="nav-scroll flex-1 overflow-y-auto" data-region="nav-list">
        ${renderHero()}<div data-region="nav-sections">${renderListHTML(initial.items)}</div>
      </div>
      <div class="nav-bar" data-region="nav-bar">${renderCreateBar(populated)}</div>
    </div>`;
  },
  bindEvents(rootEl:HTMLElement,host:AppHost):()=>void {
    const {ui,delegate} = host;
    if (!delegate) throw new Error('Navigation requires a click delegate');
    const pane = rootEl.matches('#nav-pane') ? rootEl : rootEl.querySelector<HTMLElement>('#nav-pane');
    const sections = rootEl.querySelector<HTMLElement>('[data-region="nav-sections"]');
    const bar = rootEl.querySelector<HTMLElement>('[data-region="nav-bar"]');
    const showError = (error:unknown):void => {
      const message = document.createElement('p');
      message.setAttribute('role','alert');
      message.textContent = error instanceof Error ? error.message : String(error);
      sections?.appendChild(message);
    };
    const unsubItems = ui.subscribe('nav',(next,prev)=>{
      if (next.items===prev.items) return;
      const populated = next.items.length>0;
      if (sections) setListHTMLSafe(sections,renderListHTML(next.items));
      if (bar) bar.innerHTML = renderCreateBar(populated);
      if (pane) setAttrSafe(pane,'state',populated?'populated':'empty');
    });
    let inflight = 0;
    const unsubReload = ui.subscribe('nav',async (next,prev)=>{
      if (next.reloadAt===prev.reloadAt) return;
      const stamp = ++inflight;
      try {
        const items = await loadNavItems();
        if (stamp===inflight) ui.transition('nav/refresh',{items});
      } catch(error) { if (stamp===inflight) showError(error); }
    });
    ui.transition('nav/reload');
    delegate.register('nav/open-deck',async (_event,element)=>{
      const id = element.dataset.deckId;
      if (!id) return;
      try {
        await updateDeckAccessTime(id);
        ui.transition('content/select-deck',{id});
        ui.transition('shell/close');
      } catch(error) { showError(error); }
    });
    delegate.register('nav/browse-lang',async (_event,element)=>{
      const lang = element.dataset.lang;
      if (!isContentLanguage(lang)) return;
      try {
        ui.transition('content/browse',await loadLangBrowse(lang));
        ui.transition('shell/close');
      } catch(error) { showError(error); }
    });
    delegate.register('nav/open-new-phrasebook',()=>ui.transition('action/open',{kind:'new-phrasebook',payload:{}}));
    return ()=>{
      ++inflight;
      unsubItems();unsubReload();
      delegate.unregister('nav/open-deck');delegate.unregister('nav/browse-lang');delegate.unregister('nav/open-new-phrasebook');
    };
  },
};
export default navPane;
