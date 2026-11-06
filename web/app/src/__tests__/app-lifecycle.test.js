// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bindings: [], reactions: vi.fn(), setLastDeckId: vi.fn() }));
vi.mock("../js/db", () => ({}));
vi.mock("../js/preferences", () => ({ getLastDeckId: () => null, setLastDeckId: mocks.setLastDeckId }));
vi.mock("../panes/nav-pane", () => ({ default: {
  initialState: {}, transitions: {}, render: () => '<div id="nav-pane"><button data-action="nav/test">Test</button></div>',
  bindEvents: (element, host) => {
    host.delegate.register("nav/test", mocks.reactions);
    const cleanup = vi.fn(() => expect(element.isConnected).toBe(true));
    mocks.bindings.push(cleanup);
    return cleanup;
  },
} }));
vi.mock("../panes/content-pane", () => ({ default: {
  initialState: { deckId: null },
  transitions: { "content/select-deck": (slice, { id }) => ({ ...slice, deckId: id }) },
  render: () => '<div id="content-pane"></div>',
  bindEvents: (element) => {
    const cleanup = vi.fn(() => expect(element.isConnected).toBe(true));
    mocks.bindings.push(cleanup);
    return cleanup;
  },
} }));
vi.mock("../panes/details-pane", () => ({ default: {
  initialState: null, transitions: {}, render: () => '<div id="details-layer"></div>',
  bindEvents: (element) => {
    const cleanup = vi.fn(() => expect(element.isConnected).toBe(true));
    mocks.bindings.push(cleanup);
    return cleanup;
  },
} }));
vi.mock("../panes/action-pane", () => ({ default: {
  initialState: null, transitions: {}, render: () => '<div id="action-layer"></div>',
  bindEvents: (element) => {
    const cleanup = vi.fn(() => expect(element.isConnected).toBe(true));
    mocks.bindings.push(cleanup);
    return cleanup;
  },
} }));

import { initApp, mountApp } from "../panes/app";

let root;
let mounts;
beforeEach(() => {
  mocks.bindings.length = 0;
  mocks.reactions.mockClear();
  mocks.setLastDeckId.mockClear();
  root = document.createElement("div");
  document.body.append(root);
  mounts = [];
});
afterEach(() => {
  mounts.forEach(mount => mount.dispose());
  root.remove();
  delete window.__loudmouth;
});

describe("application mount ownership", () => {
  it("owns binders, delegates and subscriptions and leaves unrelated children intact", () => {
    const mount = mountApp(root, { id: "book" });
    mounts.push(mount);
    expect(mount.ui.get("content").deckId).toBe("book");
    expect(mocks.setLastDeckId).toHaveBeenCalledWith("book");
    expect(root.dataset.shell).toBe("foreground");
    expect(window.__loudmouth).toBeUndefined();
    const button = root.querySelector("button");
    button.click();
    expect(mocks.reactions).toHaveBeenCalledTimes(1);
    const unrelated = document.createElement("aside");
    root.append(unrelated);
    mount.dispose();
    mount.dispose();
    expect(mocks.bindings).toHaveLength(4);
    mocks.bindings.forEach(cleanup => expect(cleanup).toHaveBeenCalledTimes(1));
    button.click();
    mount.ui.transition("shell/open");
    mount.ui.transition("content/select-deck", { id: "obsolete" });
    expect(mocks.reactions).toHaveBeenCalledTimes(1);
    expect(mocks.setLastDeckId).toHaveBeenCalledTimes(1);
    expect(root.dataset.shell).toBeUndefined();
    expect([...root.children]).toEqual([unrelated]);
  });

  it("replaces one root owner without allowing stale disposal to remove the new tree", () => {
    root.id = "app";
    const first = initApp();
    mounts.push(first);
    const second = initApp();
    mounts.push(second);
    first.dispose();
    expect(window.__loudmouth.ui).toBe(second.ui);
    expect(root.querySelectorAll("#nav-pane")).toHaveLength(1);
    root.querySelector("button").click();
    expect(mocks.reactions).toHaveBeenCalledTimes(1);
    second.dispose();
    expect(window.__loudmouth).toBeUndefined();
    expect(root.children).toHaveLength(0);
  });

  it("requires the production root only for initApp", () => {
    expect(() => initApp()).toThrow("Missing application root");
  });
});
