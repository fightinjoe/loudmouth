import json, subprocess, time, os, re, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = "/Users/awheeler/src/2026/loudmouth_API_02_claude/prompts/phrasebook"
OUT = f"{ROOT}/comparisons/luna/responses"
GEN_V, TR_V, SOURCE = "v09", "v05", "v09"
TAGS = ["salsa", "surf", "vegan", "directions", "sick"]
LANG_NAMES = {"es": "Spanish", "ja": "Japanese", "zh": "Chinese", "cs": "Czech"}

os.makedirs(OUT, exist_ok=True)
gen_tmpl = open(f"{ROOT}/{GEN_V}/prompt.txt").read()
tr_tmpl = open(f"{ROOT}/translate/{TR_V}/prompt.txt").read()
key = os.environ["OPENAI_API_KEY"]
url = "https://api.openai.com/v1/chat/completions"

CJK = r'[々一-鿿]'
PAIR = re.compile(r'(' + CJK + r'+)\[([^\[\]]+)\]')

def call(prompt, outfile):
    payload = json.dumps({"model": "gpt-5.6-luna",
                          "messages": [{"role": "user", "content": prompt}],
                          "response_format": {"type": "json_object"}})
    for attempt in range(3):
        t0 = time.time()
        r = subprocess.run(["curl", "-sS", "-H", f"Authorization: Bearer {key}",
                            "-H", "Content-Type: application/json", "-d", payload, url],
                           capture_output=True, text=True)
        dt = time.time() - t0
        resp = json.loads(r.stdout)
        if "error" in resp:
            print(f"  !! API error ({outfile.rsplit('/',1)[-1]}): {resp['error'].get('message','')[:120]}")
            time.sleep(10); continue
        open(outfile, "w").write(r.stdout)
        u = resp["usage"]
        try:
            return json.loads(resp["choices"][0]["message"]["content"]), dt, u
        except json.JSONDecodeError as e:
            print(f"  !! malformed chunk JSON ({outfile.rsplit('/',1)[-1]}): {e} — retrying")
            continue
    raise RuntimeError(f"failed after retries: {outfile}")

def fmt_lines(lines):
    return "\n".join(f"{i+1}. {l['speaker']}{' (or)' if l.get('or') else ''}: {l['text']}"
                     for i, l in enumerate(lines))

def ruby_orphans(strings):
    n = 0
    for s in strings:
        left = PAIR.sub("", s)
        n += left.count("[") + left.count("]")
    return n

summary = []
for tag in TAGS:
    fixture = json.load(open(f"{ROOT}/inputs/input_{tag}.json"))
    lang, seed = LANG_NAMES[fixture["language"]], fixture["seed"]
    answers = "\n".join(f"- {q}: {a}" for q, a in fixture["answers"].items())
    topics = "\n".join(f"- {t}" for t in fixture["checklist"])

    # 1) generation
    gp = (gen_tmpl.replace("{{SEED}}", seed).replace("{{LANGUAGE}}", lang)
          .replace("{{ANSWERS}}", answers).replace("{{TOPICS}}", topics)
          .replace("{{ABILITY}}", "basics"))
    gdata, gdt, gu = call(gp, f"{OUT}/gen_{tag}.json")
    print(f"\n===== {tag} ({lang}) GEN — {gdt:.2f}s, in {gu['prompt_tokens']} out {gu['completion_tokens']} =====")
    for c in gdata["conversations"]:
        print(f"[{c['title']}]")
        for l in c["lines"]:
            print(f"  {l['speaker']}{' (or)' if l.get('or') else ''}: {l['text']}")
        print(f"  vocab ({len(c.get('vocab', []))}): {', '.join(c.get('vocab', []))}")

    # 2) translation of the ACCEPTED gemini v09 source (identical input both models)
    src = json.loads(json.load(open(f"{ROOT}/{SOURCE}/responses/response_{tag}.json"))
                     ["candidates"][0]["content"]["parts"][0]["text"])
    rr_path = f"{ROOT}/translate/{TR_V}/reading_rules_{fixture['language']}.txt"
    rr = open(rr_path).read() if os.path.exists(rr_path) else ""
    jobs = []
    for ci, conv in enumerate(src["conversations"]):
        p = (tr_tmpl.replace("{{READING_RULES}}", rr)
             .replace("{{SEED}}", seed).replace("{{LANGUAGE}}", lang)
             .replace("{{TITLE}}", conv["title"]).replace("{{LINES}}", fmt_lines(conv["lines"]))
             .replace("{{WORDS}}", "\n".join(f"{i+1}. {w}" for i, w in enumerate(conv.get("vocab", [])))))
        jobs.append((p, f"{OUT}/tr_{tag}_conv{ci}.json"))
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=3) as ex:
        results = list(ex.map(lambda j: call(j[0], j[1]), jobs))
    wall = time.time() - t0
    tin = sum(r[2]["prompt_tokens"] for r in results)
    tout = sum(r[2]["completion_tokens"] for r in results)
    print(f"--- TRANSLATE wall {wall:.2f}s ({', '.join(f'{r[1]:.2f}s' for r in results)}), in {tin} out {tout}")
    mism = 0
    allstr = []
    for ci, conv in enumerate(src["conversations"]):
        d = results[ci][0]
        lt, vt = d.get("lines", []), d.get("vocab", [])
        if len(lt) != len(conv["lines"]) or len(vt) != len(conv.get("vocab", [])):
            mism += 1
            print(f"  !! COUNT MISMATCH conv{ci}: lines {len(lt)}/{len(conv['lines'])} vocab {len(vt)}/{len(conv.get('vocab', []))}")
        allstr += lt + vt
        print(f"[{conv['title']}]")
        for l, t in zip(conv["lines"], lt):
            print(f"  {l['speaker']}{' (or)' if l.get('or') else ''}: {l['text']}  →  {t}")
        for w, t in zip(conv.get("vocab", []), vt):
            print(f"  vocab: {w} → {t}")
    orph = ruby_orphans(allstr) if fixture["language"] in ("ja", "zh") else "-"
    summary.append((tag, gdt, gu['prompt_tokens'], gu['completion_tokens'], wall, tin, tout, mism, orph))

print("\n\n===== LUNA SUMMARY =====")
print("tag | gen_s | gen_in | gen_out | tr_wall_s | tr_in | tr_out | mismatch_chunks | ruby_orphans")
gc = tc = 0.0
for row in summary:
    print(" | ".join(str(round(x, 2) if isinstance(x, float) else x) for x in row))
    gc += (row[2] * 0.2 + row[3] * 1.2) / 1e6
    tc += (row[5] * 0.2 + row[6] * 1.2) / 1e6
print(f"total est. cost: gen ${gc:.5f} + translate ${tc:.5f} = ${gc+tc:.5f}")
