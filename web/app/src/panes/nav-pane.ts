import { getCards, getCardsByLang, getDecks, getLangs, updateDeckAccessTime } from '../js/db';
import { LANG_FLAGS, LANG_NAMES, isContentLanguage } from '../js/lang';
import { setAttrSafe, setListHTMLSafe } from '../js/uiState';
import { escapeHTML } from '../js/utils';
import { renderPhrasebookRow } from '../components/phrasebook-row';
import type { Lang } from '@catchphrase/card-schema';
import type { Deck } from '../js/library-types';
import type { AppHost, AppTransitions } from '../js/app-types';

type NavItem = {kind:'recent';deck:Deck;subtitle:string}
  | {kind:'lang';lang:Lang;flag:string;name:string;subtitle:string};
export interface NavSlice {items:NavItem[];reloadAt:number}

const situations = [
  'Surf vacation in Costa Rica', 'Dinner with the in-laws', 'Salsa dancing in Austin, TX',
  'Small talk with the cab driver', 'Checking into my hotel', 'My first dance class in Tokyo',
  'Ordering lunch at a neighborhood café', 'Meeting my new neighbors',
];
const cardCount = (count:number):string => `${count} saved card${count===1?'':'s'}`;

function renderCreateCell():string {
  return '<button type="button" class="nav-create-cell" data-action="nav/open-new-phrasebook"><span>Create<br>phrasebook</span></button>';
}
function renderBooks(items:NavItem[]):string {
  const books = items.filter(item=>item.kind==='recent');
  return books.map((item,index)=>{
    const {deck} = item;
    const art = deck.illustration?.state==='ready'
      ? `<img class="nav-book-art" src="${escapeHTML(deck.illustration.image.dataUrl)}" alt="" loading="lazy" decoding="async">` : '';
    return `<button type="button" class="nav-book" data-action="nav/open-deck" data-deck-id="${escapeHTML(deck.id)}">
      <span class="nav-book-meta"><strong>${escapeHTML(deck.name)}</strong><small>${escapeHTML(LANG_FLAGS[deck.lang])} ${escapeHTML(LANG_NAMES[deck.lang])}</small><small>${escapeHTML(item.subtitle)}</small></span>
      <span class="nav-book-thumbnail" aria-hidden="true">${art}</span>
    </button>${index===0?renderCreateCell():''}`;
  }).join('') || renderCreateCell();
}
function renderLanguages(items:NavItem[]):string {
  return items.filter(item=>item.kind==='lang').map(item=>`<button type="button" class="nav-language" data-action="nav/browse-lang" data-lang="${escapeHTML(item.lang)}">
    <span>${escapeHTML(item.flag)} ${escapeHTML(item.name)}</span><small>${escapeHTML(item.subtitle)}</small>
  </button>`).join('');
}
async function loadNavItems():Promise<NavItem[]> {
  const decks = (await getDecks(null)).sort((left,right)=>
    (right.lastAccessedAt??right.createdAt??'').localeCompare(left.lastAccessedAt??left.createdAt??'')
    || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const books:NavItem[] = await Promise.all(decks.map(async deck=>({
    kind:'recent' as const,deck,subtitle:cardCount(new Set((await getCards(deck.id)).map(entry=>entry.cardId)).size),
  })));
  const languages = new Set([...await getLangs(),...decks.map(deck=>deck.lang)]);
  const langs:NavItem[] = await Promise.all([...languages].sort().map(async lang=>{
    const count = decks.filter(deck=>deck.lang===lang).length;
    return {kind:'lang' as const,lang,flag:LANG_FLAGS[lang],name:LANG_NAMES[lang],
      subtitle:`${count} phrasebook${count===1?'':'s'} · ${cardCount((await getCardsByLang(lang)).length)}`};
  }));
  return [...books,...langs];
}

export async function loadLangBrowse(lang:Lang):Promise<{title:string;groupsHtml:string}> {
  const decks = (await getDecks(lang)).sort((a,b)=>a.name.localeCompare(b.name));
  const saved = await getCardsByLang(lang);
  const rows = saved.length ? [renderPhrasebookRow({
    title:'All saved cards',subtitle:cardCount(saved.length),chevron:true,
    rowAction:'content/browse-select',rowData:{deckId:`lang:${lang}`},
  })] : [];
  for (const deck of decks) {
    rows.push(renderPhrasebookRow({title:deck.name,subtitle:cardCount(new Set((await getCards(deck.id)).map(entry=>entry.cardId)).size),chevron:true,
      rowAction:'content/browse-select',rowData:{deckId:deck.id}}));
  }
  return {title:`${LANG_FLAGS[lang]} ${LANG_NAMES[lang]}`.trim(),groupsHtml:`<div class="deck-picker-lang-group">${rows.join('')}</div>`};
}

const initialState:NavSlice = {items:[],reloadAt:0};
const navPane = {
  namespace:'nav' as const,
  initialState,
  transitions:{
    'nav/reload':slice=>({...slice,reloadAt:slice.reloadAt+1}),
    'nav/refresh':(slice,{items})=>({...slice,items}),
  } satisfies AppTransitions,
  render(initial:NavSlice):string {
    return `<div id="nav-pane" class="nav-pane" data-state="${initial.items.length?'populated':'empty'}" data-error="false">
      <div class="nav-paper" aria-hidden="true"></div>
      <header class="nav-title"><div class="nav-title-copy"><h1>Catchphrase</h1><p>Collect the language you need,<br>avoid the rest!</p></div></header>
      <div class="nav-scroll" data-region="nav-list" tabindex="0" aria-label="Your phrasebook library">
        <div class="nav-error"><p role="alert" data-region="nav-error"></p><button type="button" data-action="nav/retry">Reload library</button></div>
        <section class="nav-welcome" aria-labelledby="nav-welcome-title">
          <h2 id="nav-welcome-title">Make your first phrasebook</h2>
          <p>Tell us the situation. You get the phrases you’d actually say, and none you wouldn’t.</p>
          <button type="button" class="nav-primary" data-action="nav/open-new-phrasebook">New phrasebook</button>
          <div class="nav-examples" tabindex="0" role="region" aria-label="Situation ideas; movement pauses on focus, touch, or scrolling">
            <div class="nav-example-list">${situations.map(seed=>`<button type="button" class="nav-example" data-action="nav/open-new-phrasebook" data-seed="${escapeHTML(seed)}">${escapeHTML(seed)}</button>`).join('')}</div>
          </div>
          <p class="nav-note">Prepare for a real conversation, in your own time. Pick an idea or write your own.</p>
        </section>
        <div class="nav-library">
          <section class="nav-library-section" aria-labelledby="nav-books-title"><h2 id="nav-books-title">Phrasebooks</h2>
            <p class="nav-shelf-help">Most recently opened first. Swipe or scroll sideways for every book.</p>
            <div class="nav-book-shelf" data-region="nav-books" tabindex="0" role="region" aria-label="All phrasebooks, two-row horizontal shelf">${renderBooks(initial.items)}</div>
          </section>
          <section class="nav-library-section" aria-labelledby="nav-languages-title"><h2 id="nav-languages-title">Languages</h2>
            <div class="nav-language-shelf" data-region="nav-languages" tabindex="0" role="region" aria-label="Browse saved cards by language">${renderLanguages(initial.items)}</div>
          </section>
          <div class="nav-library-actions"><button type="button" class="nav-primary" data-action="nav/open-new-phrasebook">Create another phrasebook</button></div>
        </div>
      </div>
    </div>`;
  },
  bindEvents(rootEl:HTMLElement,host:AppHost):()=>void {
    const {ui,delegate} = host;
    if (!delegate) throw new Error('Navigation requires a click delegate');
    const pane = rootEl.matches('#nav-pane') ? rootEl : rootEl.querySelector<HTMLElement>('#nav-pane');
    const books = rootEl.querySelector<HTMLElement>('[data-region="nav-books"]');
    const languages = rootEl.querySelector<HTMLElement>('[data-region="nav-languages"]');
    const errorMessage = rootEl.querySelector<HTMLElement>('[data-region="nav-error"]');
    const examples = rootEl.querySelector<HTMLElement>('.nav-examples');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let inflight = 0;
    let frame = 0;
    let lastTime = 0;
    let direction = 1;
    let remainder = 0;
    let manualPause = false;
    let hovered = false;
    let animatedTop = examples?.scrollTop??0;
    const showError = (error:unknown):void => {
      if (disposed) return;
      if (errorMessage) errorMessage.textContent = error instanceof Error ? error.message : String(error);
      pane?.setAttribute('data-error','true');
    };
    const animate = (time:number):void => {
      frame = 0;
      if (disposed || pane?.dataset.state!=='empty' || !examples) return;
      if (lastTime && !reduced.matches && !manualPause && !hovered && !document.hidden && !examples.contains(document.activeElement)) {
        remainder += Math.min(time-lastTime,50)*0.014;
        const pixels = Math.floor(remainder);
        if (pixels) {
          remainder -= pixels;
          const max = examples.scrollHeight-examples.clientHeight;
          if (examples.scrollTop>=max-1) direction=-1;
          if (examples.scrollTop<=0) direction=1;
          examples.scrollTop += pixels*direction;
          animatedTop = examples.scrollTop;
        }
      }
      lastTime = time;
      frame = requestAnimationFrame(animate);
    };
    const startMotion = ():void => {
      lastTime = 0;
      if (!frame && pane?.dataset.state==='empty') frame = requestAnimationFrame(animate);
    };
    const pause = ():void => { manualPause = true; };
    const enter = ():void => { hovered = true; };
    const leave = ():void => { hovered = false; };
    const manualScroll = ():void => {
      if (examples && Math.abs(examples.scrollTop-animatedTop)>1) manualPause = true;
    };
    examples?.addEventListener('pointerenter',enter);
    examples?.addEventListener('pointerleave',leave);
    examples?.addEventListener('scroll',manualScroll,{passive:true});
    for (const event of ['pointerdown','touchstart','wheel','keydown']) examples?.addEventListener(event,pause,{passive:true});
    const keyboardShelf = (event:KeyboardEvent):void => {
      const shelf = event.target;
      if (!(shelf instanceof HTMLElement) || !shelf.matches('.nav-book-shelf,.nav-language-shelf')) return;
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key==='Home') shelf.scrollLeft = 0;
      else if (event.key==='End') shelf.scrollLeft = shelf.scrollWidth;
      else shelf.scrollLeft += (event.key==='ArrowRight'?1:-1)*shelf.clientWidth*0.75;
    };
    const imageError = (event:Event):void => {
      const image = event.target;
      if (image instanceof HTMLImageElement && image.classList.contains('nav-book-art')) image.dataset.failed = 'true';
    };
    rootEl.addEventListener('keydown',keyboardShelf);
    rootEl.addEventListener('error',imageError,true);
    const unsubItems = ui.subscribe('nav',(next,prev)=>{
      if (next.items===prev.items) return;
      if (books) setListHTMLSafe(books,renderBooks(next.items));
      if (languages) setListHTMLSafe(languages,renderLanguages(next.items));
      if (pane) setAttrSafe(pane,'state',next.items.length?'populated':'empty');
      startMotion();
    });
    const unsubReload = ui.subscribe('nav',async (next,prev)=>{
      if (next.reloadAt===prev.reloadAt) return;
      const stamp = ++inflight;
      try {
        const items = await loadNavItems();
        if (!disposed && stamp===inflight) {
          pane?.setAttribute('data-error','false');
          ui.transition('nav/refresh',{items});
        }
      } catch(error) { if (stamp===inflight) showError(error); }
    });
    const unsubShell = ui.subscribe('shell',(next,prev)=>{
      if (next.exposed==='background' && prev.exposed!=='background') ui.transition('nav/reload');
    });
    delegate.register('nav/open-deck',async (_event,element)=>{
      const id = element.dataset.deckId;
      if (!id) return;
      try {
        await updateDeckAccessTime(id);
        if (disposed) return;
        ui.transition('content/select-deck',{id});
        ui.transition('shell/close');
      } catch(error) { showError(error); }
    });
    delegate.register('nav/browse-lang',async (_event,element)=>{
      const lang = element.dataset.lang;
      if (!isContentLanguage(lang)) return;
      try {
        const browse = await loadLangBrowse(lang);
        if (disposed) return;
        ui.transition('content/browse',browse);
        ui.transition('shell/close');
      } catch(error) { showError(error); }
    });
    delegate.register('nav/open-new-phrasebook',(_event,element)=>ui.transition('action/open',{
      kind:'creation',payload:element.dataset.seed ? {seed:element.dataset.seed} : {},
    }));
    delegate.register('nav/retry',()=>ui.transition('nav/reload'));
    ui.transition('nav/reload');
    startMotion();
    return ()=>{
      disposed = true;
      ++inflight;
      cancelAnimationFrame(frame);
      unsubItems();unsubReload();unsubShell();
      rootEl.removeEventListener('keydown',keyboardShelf);
      rootEl.removeEventListener('error',imageError,true);
      examples?.removeEventListener('pointerenter',enter);
      examples?.removeEventListener('pointerleave',leave);
      examples?.removeEventListener('scroll',manualScroll);
      for (const event of ['pointerdown','touchstart','wheel','keydown']) examples?.removeEventListener(event,pause);
      for (const action of ['nav/open-deck','nav/browse-lang','nav/open-new-phrasebook','nav/retry']) delegate.unregister(action);
    };
  },
};
export default navPane;
