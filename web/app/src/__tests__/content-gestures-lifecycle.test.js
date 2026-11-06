// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { wireContentGestures } from "../panes/content-pane-gestures";

let rootEl;
let handleEl;
let reorderHandleEl;
let gestures;
let ui;
beforeEach(() => {
  rootEl = document.createElement("div");
  rootEl.innerHTML = '<div class="textbook-shelf" data-reorder-region="thingsToSay"><div class="card-row-wrapper" data-entry-key="one">One</div><div class="card-row-wrapper" data-entry-key="two">Two</div></div>';
  handleEl = document.createElement("div");
  reorderHandleEl = document.createElement("div");
  document.body.append(rootEl, handleEl, reorderHandleEl);
  ui = { get: () => ({ exposed: "foreground" }), transition: vi.fn() };
});
afterEach(() => {
  gestures?.dispose();
  rootEl.remove();
  handleEl.remove();
  reorderHandleEl.remove();
});

function touch(element, type, x, y) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: { item: () => ({ clientX: x, clientY: y }) } });
  element.dispatchEvent(event);
}

it("cancels a live reorder, restoring its placeholder without persisting", () => {
  gestures = wireContentGestures({ rootEl, handleEl, reorderHandleEl, ui, isEdit: () => true });
  const rows = [...rootEl.querySelectorAll(".card-row-wrapper")];
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => ({ top: index * 40, bottom: index * 40 + 40, height: 40, left: 0, width: 200 });
  });
  touch(reorderHandleEl, "touchstart", 5, 10);
  touch(reorderHandleEl, "touchmove", 5, 100);
  expect(document.querySelector(".card-row-reorder-ghost")).not.toBeNull();
  expect(rows[0].classList.contains("card-row-reorder-placeholder")).toBe(true);
  gestures.dispose();
  expect(document.querySelector(".card-row-reorder-ghost")).toBeNull();
  expect(rootEl.querySelector(".card-row-reorder-placeholder")).toBeNull();
  expect(rootEl.querySelector(".textbook-list--reordering")).toBeNull();
  expect(rootEl.querySelector("[data-dragging]")).toBeNull();
  expect([...rootEl.querySelectorAll(".card-row-wrapper")]).toEqual(rows);
  expect(ui.transition).not.toHaveBeenCalled();
});

it("releases shelf pointer capture and clears transient drag state", () => {
  gestures = wireContentGestures({ rootEl, handleEl, reorderHandleEl, ui, isEdit: () => false });
  rootEl.setPointerCapture = vi.fn();
  rootEl.hasPointerCapture = vi.fn(() => true);
  rootEl.releasePointerCapture = vi.fn();
  const shelf = rootEl.querySelector(".textbook-shelf");
  shelf.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, pointerType: "mouse", button: 0, clientX: 50, clientY: 0 }));
  shelf.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, pointerType: "mouse", clientX: 10, clientY: 0 }));
  expect(rootEl.setPointerCapture).toHaveBeenCalledWith(7);
  touch(handleEl, "touchstart", 0, 0);
  touch(handleEl, "touchmove", 50, 0);
  expect(rootEl.hasAttribute("data-dragging")).toBe(true);
  gestures.dispose();
  expect(rootEl.releasePointerCapture).toHaveBeenCalledWith(7);
  expect(shelf.hasAttribute("data-dragging")).toBe(false);
  expect(rootEl.hasAttribute("data-dragging")).toBe(false);
  expect(rootEl.style.transform).toBe("");
  expect(ui.transition).not.toHaveBeenCalled();
});
