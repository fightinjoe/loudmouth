// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDelegate } from "../js/delegate.js";

describe("createDelegate", () => {
  let root;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
  });

  it("dispatches when an element with [data-action] is clicked", () => {
    const btn = document.createElement("button");
    btn.dataset.action = "thing/do";
    root.appendChild(btn);
    const delegate = createDelegate(root);
    const fn = vi.fn();
    delegate.register("thing/do", fn);
    btn.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][1]).toBe(btn);
  });

  it("dispatches when a descendant of the action element is clicked (closest)", () => {
    const btn = document.createElement("button");
    btn.dataset.action = "thing/do";
    btn.innerHTML = '<span class="icon"></span>';
    root.appendChild(btn);
    const delegate = createDelegate(root);
    const fn = vi.fn();
    delegate.register("thing/do", fn);
    btn.querySelector(".icon").click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][1]).toBe(btn);
  });

  it("ignores clicks that have no [data-action] ancestor", () => {
    const btn = document.createElement("button");
    root.appendChild(btn);
    const delegate = createDelegate(root);
    const fn = vi.fn();
    delegate.register("thing/do", fn);
    btn.click();
    expect(fn).not.toHaveBeenCalled();
  });

  it("unregister stops the handler from firing", () => {
    const btn = document.createElement("button");
    btn.dataset.action = "thing/do";
    root.appendChild(btn);
    const delegate = createDelegate(root);
    const fn = vi.fn();
    delegate.register("thing/do", fn);
    delegate.unregister("thing/do");
    btn.click();
    expect(fn).not.toHaveBeenCalled();
  });

  it("is a silent no-op when no handler is registered for the action", () => {
    const btn = document.createElement("button");
    btn.dataset.action = "unknown/whatever";
    root.appendChild(btn);
    const delegate = createDelegate(root);
    expect(() => btn.click()).not.toThrow();
  });

  it("passes additional data-* attributes via the action element to the handler", () => {
    const btn = document.createElement("button");
    btn.dataset.action = "content/select-deck";
    btn.dataset.deckId = "003";
    root.appendChild(btn);
    const delegate = createDelegate(root);
    const fn = vi.fn();
    delegate.register("content/select-deck", fn);
    btn.click();
    const [, el] = fn.mock.calls[0];
    expect(el.dataset.deckId).toBe("003");
  });

  it("scopes dispatch to the layer root — clicks outside the root are ignored", () => {
    const btn = document.createElement("button");
    btn.dataset.action = "thing/do";
    document.body.appendChild(btn); // outside `root`
    const delegate = createDelegate(root);
    const fn = vi.fn();
    delegate.register("thing/do", fn);
    btn.click();
    expect(fn).not.toHaveBeenCalled();
    btn.remove();
  });
});
