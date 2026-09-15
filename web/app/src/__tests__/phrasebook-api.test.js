import { afterEach, describe, expect, it, vi } from "vitest";
import { getContext, generatePhrasebook } from "../js/phrasebook-api.js";

afterEach(() => vi.unstubAllGlobals());

describe("ability request serialization", () => {
  it.each(["none", "basics", "conversational"])("sends %s to both endpoints", async (ability) => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const params = { seed: "dinner", language: "ja", ability, signal };
    await getContext(params);
    await generatePhrasebook({ ...params, answers: {}, checklist: ["Order"] });
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(["/context", "/phrasebook"]);
    for (const [, request] of fetch.mock.calls) {
      expect(JSON.parse(request.body)).toMatchObject({ seed: "dinner", language: "ja", ability });
      expect(request.signal).toBe(signal);
    }
  });

  it("omits unknown ability from context", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetch);
    await getContext({ seed: "dinner", language: "ja" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ seed: "dinner", language: "ja" });
  });
});
