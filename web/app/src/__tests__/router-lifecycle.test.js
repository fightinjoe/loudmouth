// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ initApp: vi.fn(), mounts: [] }));
vi.mock("../panes/app", () => ({ initApp: mocks.initApp }));
import { initRouter } from "../js/router";

let stop;
beforeEach(() => {
  mocks.mounts.length = 0;
  mocks.initApp.mockReset();
  mocks.initApp.mockImplementation(() => {
    const previous = mocks.mounts.at(-1);
    if (previous) expect(previous.dispose).toHaveBeenCalledTimes(1);
    const mount = { ui: {}, dispose: vi.fn() };
    mocks.mounts.push(mount);
    return mount;
  });
  history.replaceState(null, "", "#deck?id=first&label=hello+world");
});
afterEach(() => {
  stop?.();
  stop = undefined;
  history.replaceState(null, "", "#");
});

it("disposes each routed mount before replacement and removes its listener on teardown", () => {
  stop = initRouter();
  expect(mocks.initApp).toHaveBeenLastCalledWith({ id: "first", label: "hello world" });
  for (const id of ["second", "third"]) {
    history.replaceState(null, "", `#deck?id=${id}`);
    window.dispatchEvent(new Event("hashchange"));
    expect(mocks.initApp).toHaveBeenLastCalledWith({ id });
  }
  stop();
  stop();
  window.dispatchEvent(new Event("hashchange"));
  expect(mocks.initApp).toHaveBeenCalledTimes(3);
  mocks.mounts.forEach(mount => expect(mount.dispose).toHaveBeenCalledTimes(1));
});
