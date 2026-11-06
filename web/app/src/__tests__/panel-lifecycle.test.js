// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openBottomSheet } from "../components/bottom-sheet";
import { openJsonPanel } from "../components/json-panel";
import { openDeckSettings } from "../components/deck-settings";

let root;
let frames;
let handles;
let clipboardDescriptor;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("div");
  document.body.appendChild(root);
  frames = new Map();
  handles = [];
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id) => frames.delete(id)));
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

afterEach(() => {
  handles.forEach((handle) => handle.dispose());
  root.remove();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else delete navigator.clipboard;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function own(handle) {
  handles.push(handle);
  return handle;
}

function frame() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(0));
}

function transition(element, propertyName = "transform") {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: propertyName });
  element.dispatchEvent(event);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function clipboard(writeText) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}

function touch(element, type, x, y) {
  const event = new Event(type, { bubbles: true });
  const touches = [{ clientX: x, clientY: y }];
  touches.item = (index) => touches[index];
  Object.assign(event, { touches, changedTouches: touches });
  element.dispatchEvent(event);
}

describe("bottom sheet resource ownership", () => {
  it.each([0, 1])("cancels opening at frame %i and disposes controllers before a once-only dismissal", (openingFrames) => {
    const callbacks = [];
    const sheet = own(openBottomSheet(root, {
      kind: "review",
      bodyHTML: "<button>Reveal</button>",
      onDispose: () => {
        expect(root.children).toHaveLength(2);
        callbacks.push("dispose");
      },
      onClose: () => {
        expect(root.children).toHaveLength(0);
        callbacks.push("close");
      },
    }));
    for (let index = 0; index < openingFrames; index++) frame();
    sheet.close();
    sheet.close();
    sheet.dispose();
    frame();
    vi.runAllTimers();
    expect(frames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(sheet.panel.classList.contains("bottom-sheet--visible")).toBe(false);
    expect(root.children).toHaveLength(0);
    expect(callbacks).toEqual(["dispose", "close"]);
  });

  it("stops resources at animated close and ignores unrelated transitions", () => {
    const onDispose = vi.fn();
    const onClose = vi.fn();
    const sheet = own(openBottomSheet(root, { kind: "review", bodyHTML: "<button>Reveal</button>", onDispose, onClose }));
    frame();
    frame();
    sheet.close();
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.panel.inert).toBe(true);
    transition(sheet.panel.firstElementChild);
    transition(sheet.panel, "opacity");
    expect(root.children).toHaveLength(2);
    transition(sheet.panel);
    transition(sheet.panel);
    vi.runAllTimers();
    expect(root.children).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("immediately disposes without user dismissal (closing: %s)", (closing) => {
    const onDispose = vi.fn();
    const onClose = vi.fn();
    const sheet = own(openBottomSheet(root, { kind: "settings", bodyHTML: "", onDispose, onClose }));
    frame();
    if (closing) {
      frame();
      sheet.close();
      expect(root.children).toHaveLength(2);
    }
    sheet.dispose();
    sheet.dispose();
    sheet.close();
    expect(root.children).toHaveLength(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    transition(sheet.panel);
    sheet.scrim.click();
    vi.runAllTimers();
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("releases an active header drag and its listeners during disposal", () => {
    const sheet = own(openBottomSheet(root, { kind: "review", bodyHTML: '<header class="pane-header">Review</header>' }));
    const header = sheet.panel.querySelector("header");
    touch(header, "touchstart", 20, 20);
    touch(header, "touchmove", 20, 100);
    expect(sheet.panel.style.transform).toBe("translateY(80px)");
    sheet.dispose();
    expect(sheet.panel.style.transform).toBe("");
    expect(sheet.panel.dataset.dragging).toBeUndefined();
    touch(header, "touchstart", 20, 20);
    touch(header, "touchmove", 20, 150);
    expect(sheet.panel.style.transform).toBe("");
    expect(sheet.panel.dataset.dragging).toBeUndefined();
  });
});

describe("JSON panel resource ownership", () => {
  it.each([0, 1])("cannot reopen after closing at frame %i", (openingFrames) => {
    const onDismiss = vi.fn();
    const handle = own(openJsonPanel(root, "Export", "{}", onDismiss));
    const panel = root.querySelector(".json-panel");
    for (let index = 0; index < openingFrames; index++) frame();
    handle.close();
    frame();
    handle.close();
    expect(frames.size).toBe(0);
    expect(panel.classList.contains("pane-full--visible")).toBe(false);
    expect(root.children).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("filters child/property transitions and falls back when its transition never ends", () => {
    const onDismiss = vi.fn();
    const handle = own(openJsonPanel(root, "Export", "{}", onDismiss));
    frame();
    frame();
    const panel = root.querySelector(".json-panel");
    handle.close();
    transition(panel.querySelector("textarea"));
    transition(panel, "opacity");
    expect(root.children).toHaveLength(1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(root.children).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    transition(panel);
    handle.close();
    vi.runAllTimers();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("finishes once on its own transform transition", () => {
    const onDismiss = vi.fn();
    const handle = own(openJsonPanel(root, "Export", "{}", onDismiss));
    frame();
    frame();
    const panel = root.querySelector(".json-panel");
    handle.close();
    transition(panel);
    expect(root.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("suppresses dismissal and all scheduled work on disposal (closing: %s)", (closing) => {
    const onDismiss = vi.fn();
    const handle = own(openJsonPanel(root, "Export", "{}", onDismiss));
    const panel = root.querySelector(".json-panel");
    frame();
    if (closing) {
      frame();
      handle.close();
    }
    handle.dispose();
    handle.dispose();
    handle.close();
    transition(panel);
    expect(root.children).toHaveLength(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it.each([
    ["resolve", "close"], ["reject", "close"],
    ["resolve", "dispose"], ["reject", "dispose"],
  ])("ignores late clipboard %s after %s and owner replacement", async (outcome, method) => {
    const pending = deferred();
    clipboard(vi.fn(() => pending.promise));
    const handle = own(openJsonPanel(root, "Old export", "{\"old\":true}"));
    const oldCopy = root.querySelector("#btn-copy-json");
    oldCopy.click();
    handle[method]();
    own(openJsonPanel(root, "New export", "{\"new\":true}"));
    const newCopy = root.querySelector("#btn-copy-json");
    if (outcome === "resolve") pending.resolve();
    else pending.reject(new Error("Permission denied"));
    await Promise.resolve();
    expect(oldCopy.textContent).toBe("Copy");
    expect(newCopy.textContent).toBe("Copy");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets successful copy feedback while live and cancels its timer when closed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    const handle = own(openJsonPanel(root, "Export", "{\"value\":\"水\"}"));
    const copy = root.querySelector("#btn-copy-json");
    copy.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('{"value":"水"}');
    expect(copy.textContent).toBe("Copied!");
    vi.advanceTimersByTime(1500);
    expect(copy.textContent).toBe("Copy");
    copy.click();
    await Promise.resolve();
    handle.close();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1500);
    expect(copy.textContent).toBe("Copied!");
  });
});

const deck = {
  id: "deck-lifecycle", name: "Dinner", lang: "ja", mode: "study",
  order: "default", readingDisplay: "reading", createdAt: "2026-01-01T00:00:00.000Z",
};

const settingsCases = [
  ["#ds-name-row", "updateDeckName"],
  ["#ds-mode-row", "updateDeckMode"],
  ["#ds-order-row", "updateDeckOrder"],
  ["#ds-reading-display-row", "updateDeckReadingDisplay"],
  ["#ds-delete-row", "deleteDeck"],
];

describe.each(["close", "dispose"])("settings pending writes during %s", (method) => {
  it.each(settingsCases)("retains the %s write without updating a dead owner", async (selector, operation) => {
    const pending = deferred();
    const operations = Object.fromEntries(settingsCases.map(([, name]) => [name, vi.fn().mockResolvedValue(undefined)]));
    operations[operation] = vi.fn(() => pending.promise);
    operations.exportJson = vi.fn();
    vi.stubGlobal("prompt", vi.fn(() => "New name"));
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onChanged = vi.fn();
    const handle = own(openDeckSettings(root, deck, operations, onChanged));
    const row = handle.panel.querySelector(selector);
    const previousText = handle.panel.textContent;
    row.click();
    expect(operations[operation]).toHaveBeenCalledTimes(1);
    frame();
    frame();
    handle[method]();
    const next = own(openDeckSettings(root, { ...deck, name: "Next owner" }, operations, vi.fn()));
    pending.resolve();
    await Promise.resolve();
    expect(onChanged).not.toHaveBeenCalled();
    expect(handle.panel.textContent).toBe(previousText);
    expect(handle.panel.querySelector(selector)).toBe(row);
    expect(next.panel.querySelector("#ds-name-value").textContent).toBe("Next owner");
    row.click();
    handle.panel.querySelector("#ds-export-row").click();
    expect(operations[operation]).toHaveBeenCalledTimes(1);
    expect(operations.exportJson).not.toHaveBeenCalled();
  });
});
