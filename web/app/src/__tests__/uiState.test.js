// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createUIState,
  createHost,
  setAttrSafe,
  setListHTMLSafe,
} from "../js/uiState.js";

describe("createUIState", () => {
  it("get(ns) returns the namespace slice; get() returns full state", () => {
    const ui = createUIState({ shell: { exposed: "foreground" }, action: null });
    expect(ui.get("shell")).toEqual({ exposed: "foreground" });
    expect(ui.get("action")).toBe(null);
    expect(ui.get()).toEqual({ shell: { exposed: "foreground" }, action: null });
  });

  it("subscribe fires with (next, prev) when the slice changes", () => {
    const ui = createUIState({ shell: { exposed: "foreground" } });
    const fn = vi.fn();
    ui.subscribe("shell", fn);
    const next = { exposed: "background" };
    ui.setNs("shell", next);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(next, { exposed: "foreground" });
  });

  it("setNs is a no-op when the next slice is reference-equal to the prev slice", () => {
    const slice = { exposed: "foreground" };
    const ui = createUIState({ shell: slice });
    const fn = vi.fn();
    ui.subscribe("shell", fn);
    ui.setNs("shell", slice);
    expect(fn).not.toHaveBeenCalled();
  });

  it("setNs notifies on structurally-identical but reference-different slices", () => {
    const ui = createUIState({ shell: { exposed: "foreground" } });
    const fn = vi.fn();
    ui.subscribe("shell", fn);
    ui.setNs("shell", { exposed: "foreground" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops further notifications", () => {
    const ui = createUIState({ shell: { exposed: "foreground" } });
    const fn = vi.fn();
    const off = ui.subscribe("shell", fn);
    off();
    ui.setNs("shell", { exposed: "background" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("subscribers only fire for their namespace", () => {
    const ui = createUIState({ shell: { exposed: "foreground" }, action: null });
    const shellFn = vi.fn();
    const actionFn = vi.fn();
    ui.subscribe("shell", shellFn);
    ui.subscribe("action", actionFn);
    ui.setNs("action", { kind: "translate" });
    expect(shellFn).not.toHaveBeenCalled();
    expect(actionFn).toHaveBeenCalledTimes(1);
  });

  it("registerTransitions throws on duplicate names", () => {
    const ui = createUIState({ shell: { exposed: "foreground" } });
    ui.registerTransitions({
      "shell/toggle": (s) => ({ exposed: s.exposed === "foreground" ? "background" : "foreground" }),
    });
    expect(() =>
      ui.registerTransitions({ "shell/toggle": () => null }),
    ).toThrow(/duplicate transition/);
  });

  it("transition applies the registered function and updates the slice", () => {
    const ui = createUIState({ shell: { exposed: "foreground" } });
    ui.registerTransitions({
      "shell/toggle": (s) => ({
        exposed: s.exposed === "foreground" ? "background" : "foreground",
      }),
    });
    ui.transition("shell/toggle");
    expect(ui.get("shell")).toEqual({ exposed: "background" });
  });

  it("transition that returns undefined clears the slice (sets to null)", () => {
    const ui = createUIState({ action: { kind: "translate" } });
    ui.registerTransitions({
      "action/close": () => undefined,
    });
    ui.transition("action/close");
    expect(ui.get("action")).toBe(null);
  });

  it("unknown transition throws in dev (import.meta.env.DEV=true)", () => {
    const ui = createUIState({ shell: {} });
    // In test (vitest) env, import.meta.env.DEV is true by default
    expect(() => ui.transition("shell/nope")).toThrow(/unknown transition/);
  });

  it("transition without a slash warns instead of dispatching", () => {
    const ui = createUIState({ shell: {} });
    // Register a no-slash name to bypass the unknown-transition check
    // — uiState should still refuse to dispatch because verb shape is wrong.
    ui.registerTransitions({ noslash: () => null });
    expect(() => ui.transition("noslash")).toThrow(/namespace\/verb/);
  });

  it("subscriber receives the new state via get() during its callback", () => {
    const ui = createUIState({ shell: { exposed: "foreground" } });
    let seen = null;
    ui.subscribe("shell", () => {
      seen = ui.get("shell");
    });
    ui.setNs("shell", { exposed: "background" });
    expect(seen).toEqual({ exposed: "background" });
  });
});

describe("createHost", () => {
  it("returns the canonical { ui, delegate, stageEl, parent } shape", () => {
    const ui = { fake: true };
    const delegate = { fake: true };
    const host = createHost({ ui, delegate });
    expect(host.ui).toBe(ui);
    expect(host.delegate).toBe(delegate);
    expect(host.stageEl).toBe(null);
    expect(host.parent).toBe(null);
  });

  it("passes through stageEl and parent when supplied", () => {
    const stageEl = document.createElement("div");
    const parent = { fake: "parent" };
    const host = createHost({ ui: {}, delegate: {}, stageEl, parent });
    expect(host.stageEl).toBe(stageEl);
    expect(host.parent).toBe(parent);
  });
});

describe("setAttrSafe", () => {
  let root;
  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
  });

  it("writes the dataset key when no ancestor is dragging", () => {
    setAttrSafe(root, "shell", "background");
    expect(root.dataset.shell).toBe("background");
  });

  it("clears the dataset key when value is null", () => {
    root.dataset.shell = "background";
    setAttrSafe(root, "shell", null);
    expect(root.dataset.shell).toBeUndefined();
  });

  it("no-ops when the element itself carries [data-dragging]", () => {
    root.dataset.dragging = "";
    setAttrSafe(root, "shell", "background");
    expect(root.dataset.shell).toBeUndefined();
  });

  it("no-ops when an ancestor carries [data-dragging]", () => {
    root.dataset.dragging = "";
    const child = document.createElement("div");
    root.appendChild(child);
    setAttrSafe(child, "shell", "background");
    expect(child.dataset.shell).toBeUndefined();
  });
});

describe("setListHTMLSafe", () => {
  let el;
  beforeEach(() => {
    el = document.createElement("div");
  });

  it("rebuilds innerHTML when no [data-dragging] on the region", () => {
    expect(setListHTMLSafe(el, "<span>x</span>")).toBe(true);
    expect(el.innerHTML).toBe("<span>x</span>");
  });

  it("no-ops the rebuild when [data-dragging] is set on the region", () => {
    el.dataset.dragging = "";
    el.innerHTML = "<span>before</span>";
    expect(setListHTMLSafe(el, "<span>after</span>")).toBe(false);
    expect(el.innerHTML).toBe("<span>before</span>");
  });
});
