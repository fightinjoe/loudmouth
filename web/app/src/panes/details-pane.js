import {
  renderExplanations, renderReadyBody, renderSource,
} from "../components/phrase-breakdown.js";
import { cardRequest, normalizeBreakdown, readCache, writeCache } from "../js/phrase-breakdown.js";
import { getPhraseBreakdown } from "../js/phrasebook-api.js";
import { speak, ttsText } from "../js/tts.js";

const MOTION_MS = 400;

function geometryElement(opener) {
  return opener?.closest?.(".card-row") || opener;
}

function frame(rect, extras = {}) {
  return {
    left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${rect.width}px`, height: `${rect.height}px`, ...extras,
  };
}

function contentChanged(next, prev) {
  return next?.deckId !== prev?.deckId || next?.deck !== prev?.deck || next?.cards !== prev?.cards
    || next?.browse !== prev?.browse || next?.pageKey !== prev?.pageKey || next?.editMode !== prev?.editMode;
}

const detailsPane = {
  namespace: "details",
  initialState: null,
  transitions: {
    "details/open": (_slice, payload) => ({
      card: payload.card,
      opener: payload.opener,
      readingDisplay: payload.readingDisplay || "reading",
      showEnglish: payload.showEnglish !== false,
      showReadings: payload.showReadings !== false,
      status: "loading", breakdown: null, selectedIndex: 0, all: false, requestId: 0,
    }),
    "details/close": () => null,
    "details/retry": (slice) => slice?.status === "error"
      ? { ...slice, status: "loading", breakdown: null, requestId: slice.requestId + 1 } : slice,
    "details/loaded": (slice, payload) => slice && slice.requestId === payload.requestId
      ? { ...slice, status: "ready", breakdown: payload.breakdown, selectedIndex: 0, all: false } : slice,
    "details/failed": (slice, payload) => slice && slice.requestId === payload.requestId
      ? { ...slice, status: "error", breakdown: null } : slice,
    "details/select-part": (slice, payload) => {
      const index = payload?.index;
      if (!slice || slice.status !== "ready" || !Number.isInteger(index)
        || index < 0 || index >= slice.breakdown.chunks.length
        || (!slice.all && index === slice.selectedIndex)) return slice;
      return { ...slice, selectedIndex: index, all: false };
    },
    "details/toggle-all": (slice) => slice?.status === "ready" && slice.breakdown.chunks.length > 1
      ? { ...slice, all: !slice.all } : slice,
  },

  render() {
    return `<div id="details-layer" data-details-state="closed" data-details-view="loading" aria-hidden="true">
      <button type="button" class="details-scrim" data-action="details/close" tabindex="-1" aria-label="Close phrase breakdown"></button>
      <section class="details-surface" role="dialog" aria-modal="true" aria-label="Phrase breakdown">
        <div class="details-scroll">
          <div class="details-source" data-region="details-source"></div>
          <div class="details-body details-reveal" data-region="details-body"></div>
        </div>
        <button type="button" class="details-close details-reveal" data-action="details/close">Close</button>
      </section>
    </div>`;
  },

  bindEvents(rootEl, host) {
    const { ui, delegate, stageEl } = host;
    const surface = rootEl.querySelector(".details-surface");
    const sourceEl = rootEl.querySelector('[data-region="details-source"]');
    const bodyEl = rootEl.querySelector('[data-region="details-body"]');
    const closeEl = rootEl.querySelector(".details-close");
    const appShell = stageEl.querySelector("#app-shell");
    let requestController = null;
    let motion = null;
    let motionFallback = null;
    let lifecycle = 0;
    let origin = null;

    function reducedMotion() {
      return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    function cancelMotion() {
      if (motion) motion.cancel();
      clearTimeout(motionFallback);
      motion = null;
      motionFallback = null;
    }
    function settleMotion(animation, callback) {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (motion === animation) {
          animation.cancel();
          motion = null;
        }
        clearTimeout(motionFallback);
        motionFallback = null;
        callback();
      };
      animation.onfinish = finish;
      motionFallback = setTimeout(finish, MOTION_MS + 80);
    }
    function restoreOrigin() {
      if (origin?.element) delete origin.element.dataset.detailsOrigin;
    }
    function setClosed(opener) {
      restoreOrigin();
      rootEl.inert = true;
      if (appShell) appShell.inert = false;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      rootEl.dataset.detailsState = "closed";
      rootEl.setAttribute("aria-hidden", "true");
    }
    function beginOpen(slice) {
      const token = ++lifecycle;
      cancelMotion();
      restoreOrigin();
      rootEl.querySelector(".details-scroll").scrollTop = 0;
      const target = geometryElement(slice.opener);
      const rect = target?.isConnected ? target.getBoundingClientRect() : surface.getBoundingClientRect();
      const style = target?.isConnected ? getComputedStyle(target) : getComputedStyle(surface);
      origin = { rect, backgroundColor: style.backgroundColor, borderRadius: style.borderRadius, element: target };
      if (target) target.dataset.detailsOrigin = "";
      rootEl.inert = false;
      rootEl.removeAttribute("aria-hidden");
      rootEl.dataset.detailsState = "opening";
      if (appShell) appShell.inert = true;
      closeEl.focus({ preventScroll: true });
      if (reducedMotion()) {
        rootEl.dataset.detailsState = "open";
        return;
      }
      const destination = surface.getBoundingClientRect();
      motion = surface.animate([
        frame(rect, { backgroundColor: origin.backgroundColor, borderRadius: origin.borderRadius || "16px" }),
        frame(destination, { backgroundColor: getComputedStyle(surface).backgroundColor, borderRadius: "20px" }),
      ], { duration: MOTION_MS, easing: "cubic-bezier(.22,.75,.2,1)" });
      settleMotion(motion, () => {
        if (token === lifecycle && ui.get("details")) rootEl.dataset.detailsState = "open";
      });
    }
    function beginClose(slice) {
      const token = ++lifecycle;
      const from = surface.getBoundingClientRect();
      const { backgroundColor, borderRadius } = getComputedStyle(surface);
      cancelMotion();
      sourceEl.innerHTML = renderSource({ ...slice, status: "closing" }, false);
      rootEl.dataset.detailsState = "closing";
      const target = geometryElement(slice.opener);
      const to = target?.isConnected ? target.getBoundingClientRect() : origin?.rect || from;
      const targetStyle = target?.isConnected ? getComputedStyle(target) : null;
      const finish = () => {
        if (token !== lifecycle || ui.get("details")) return;
        setClosed(slice.opener);
      };
      if (reducedMotion()) {
        finish();
        return;
      }
      motion = surface.animate([
        frame(from, { backgroundColor, borderRadius }),
        frame(to, {
          backgroundColor: targetStyle?.backgroundColor || origin?.backgroundColor,
          borderRadius: targetStyle?.borderRadius || origin?.borderRadius || "16px",
        }),
      ], { duration: MOTION_MS, easing: "cubic-bezier(.22,.75,.2,1)" });
      settleMotion(motion, finish);
    }

    function closeImmediately() {
      if (ui.get("details")) ui.transition("details/close");
      ++lifecycle;
      cancelMotion();
      setClosed();
    }

    function syncReady(slice) {
      rootEl.querySelectorAll(".details-phrase-part").forEach((part) => {
        part.setAttribute("aria-pressed", String(slice.all || Number(part.dataset.index) === slice.selectedIndex));
      });
      const shown = slice.all ? slice.breakdown.chunks : [slice.breakdown.chunks[slice.selectedIndex]];
      rootEl.querySelector("#details-explanations").innerHTML = renderExplanations(slice, shown);
      const count = slice.breakdown.chunks.length;
      rootEl.querySelector('[data-region="details-count"]').textContent = slice.all
        ? `All ${count} parts` : `Part ${slice.selectedIndex + 1} of ${count}`;
      const toggle = rootEl.querySelector('[data-action="details/toggle-all"]');
      if (toggle) {
        toggle.textContent = slice.all ? "SHOW SELECTED" : "SHOW ALL";
        toggle.setAttribute("aria-pressed", String(slice.all));
      }
    }

    const unsubRender = ui.subscribe("details", (next, prev) => {
      if (!next) {
        if (prev) beginClose(prev);
        return;
      }
      const focused = rootEl.contains(document.activeElement) ? document.activeElement : null;
      rootEl.dataset.detailsView = next.status;
      const newBreakdown = next.breakdown !== prev?.breakdown;
      if (!prev || next.card !== prev.card || next.status !== prev.status || newBreakdown) {
        sourceEl.innerHTML = renderSource(next, !prev);
        if (next.status === "loading") {
          bodyEl.innerHTML = '<div class="details-notice" role="status" aria-live="polite"><span class="details-spinner" aria-hidden="true"></span><strong>Breaking down this phrase…</strong></div>';
        } else if (next.status === "error") {
          bodyEl.innerHTML = '<div class="details-notice details-error" role="alert"><strong>The phrase breakdown couldn’t be generated.</strong><button type="button" data-action="details/retry">Retry</button></div>';
        } else {
          bodyEl.innerHTML = renderReadyBody(next);
        }
      }
      if (next.status === "ready") syncReady(next);
      if (focused && !focused.isConnected) closeEl.focus({ preventScroll: true });
      if (!prev) beginOpen(next);
      else if (next.card !== prev.card) beginOpen(next);
    });

    const unsubRequest = ui.subscribe("details", (next, prev) => {
      if (!next) {
        requestController?.abort();
        requestController = null;
        return;
      }
      if (next.status !== "loading" || (prev?.status === "loading" && next.requestId === prev.requestId && next.card === prev.card)) return;
      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;
      const requestId = next.requestId;
      const request = cardRequest(next.card);
      const cached = readCache(request);
      const task = cached ? Promise.resolve(cached) : getPhraseBreakdown({ ...request, signal: controller.signal });
      task.then((raw) => {
        if (controller.signal.aborted || requestController !== controller) return;
        const breakdown = cached || normalizeBreakdown(raw, request.text, request.language);
        if (!breakdown) throw new Error("Invalid phrase breakdown response");
        if (!cached) writeCache(request, breakdown);
        requestController = null;
        ui.transition("details/loaded", { requestId, breakdown });
      }).catch((error) => {
        if (controller.signal.aborted || requestController !== controller || error?.name === "AbortError") return;
        requestController = null;
        ui.transition("details/failed", { requestId });
      });
    });

    const actions = {
      "details/close": () => ui.transition("details/close"),
      "details/retry": () => ui.transition("details/retry"),
      "details/toggle-all": () => ui.transition("details/toggle-all"),
      "details/select-part": (_event, element) => ui.transition("details/select-part", { index: Number(element.dataset.index) }),
      "details/play-audio": () => {
        const slice = ui.get("details");
        if (slice) speak(ttsText(slice.card), slice.card.lang);
      },
    };
    Object.entries(actions).forEach(([name, handler]) => delegate.register(name, handler));

    function onKeyDown(event) {
      if (rootEl.dataset.detailsState === "closed") return;
      if (event.key === "Escape") {
        event.preventDefault();
        ui.transition("details/close");
        return;
      }
      if (event.target.matches('.details-phrase-part[role="button"]') && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.target.click();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...surface.querySelectorAll('button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.closest("[hidden]") && !element.closest("[inert]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    rootEl.addEventListener("keydown", onKeyDown);

    const unsubAction = ui.subscribe("action", (next) => {
      if (next && rootEl.dataset.detailsState !== "closed") closeImmediately();
    });
    const unsubShell = ui.subscribe("shell", (next, prev) => {
      if (prev && next?.exposed !== prev.exposed && rootEl.dataset.detailsState !== "closed") closeImmediately();
    });
    const unsubContent = ui.subscribe("content", (next, prev) => {
      if (prev && contentChanged(next, prev) && rootEl.dataset.detailsState !== "closed") closeImmediately();
    });

    setClosed();
    return () => {
      ++lifecycle;
      requestController?.abort();
      cancelMotion();
      unsubRender(); unsubRequest(); unsubAction(); unsubShell(); unsubContent();
      rootEl.removeEventListener("keydown", onKeyDown);
      Object.keys(actions).forEach((name) => delegate.unregister(name));
      setClosed();
    };
  },
};

export default detailsPane;
