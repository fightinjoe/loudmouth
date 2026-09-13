import json, subprocess, time, os, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = "/Users/awheeler/src/2026/loudmouth_API_02_claude/prompts/phrasebook"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "."
TAGS = sys.argv[2:] or ["salsa"]
SOURCE = os.environ.get("SOURCE", ".")  # nested per-conversation vocab

LANG_NAMES = {"es": "Spanish", "ja": "Japanese", "zh": "Chinese", "cs": "Czech"}
TDIR = f"{ROOT}/translate/{VERSION}"
tmpl = open(f"{TDIR}/prompt.txt").read()
key = os.environ["GEMINI_API_KEY"]
url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
os.makedirs(f"{TDIR}/responses", exist_ok=True)

def call(prompt, outfile):
    payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                          "generationConfig": {"responseMimeType": "application/json"}})
    for attempt in range(4):
        t0 = time.time()
        r = subprocess.run(["curl", "-sS", "-H", f"x-goog-api-key: {key}",
                            "-H", "Content-Type: application/json", "-d", payload, url],
                           capture_output=True, text=True)
        dt = time.time() - t0
        resp = json.loads(r.stdout)
        if "error" in resp and resp["error"].get("code") == 429:
            time.sleep(20 * (attempt + 1))
            continue
        open(outfile, "w").write(r.stdout)
        u = resp["usageMetadata"]
        try:
            return json.loads(resp["candidates"][0]["content"]["parts"][0]["text"]), dt, u
        except json.JSONDecodeError as e:
            print(f"  !! malformed chunk JSON ({outfile.rsplit('/',1)[-1]}): {e} — retrying chunk")
            continue
    raise RuntimeError(f"chunk failed after retries: {outfile}")

def fmt_lines(lines):
    return "\n".join(f"{i+1}. {l['speaker']}{' (or)' if l.get('or') else ''}: {l['text']}"
                     for i, l in enumerate(lines))

import re
CJK = r'[々一-鿿々]'
ANNOT = re.compile(CJK + r'+\[[^\[\]]+\]')
PAIR = re.compile(r'(' + CJK + r'+)\[([^\[\]]+)\]')

def parse_ruby(s):
    """Service-side conversion: inline base[reading] -> ReadingToken list."""
    tokens, pos = [], 0
    for m in PAIR.finditer(s):
        if m.start() > pos:
            tokens.append([s[pos:m.start()], None])
        tokens.append([m.group(1), m.group(2)])
        pos = m.end()
    if pos < len(s):
        tokens.append([s[pos:], None])
    return tokens

def ruby_report(strings, lang_code):
    if lang_code not in ("ja", "zh"):
        return ""
    annotated = orphans = 0
    for s in strings:
        annotated += len(PAIR.findall(s))
        leftover = PAIR.sub("", s)
        orphans += leftover.count("[") + leftover.count("]")
    return f"  [ruby: {annotated} annotated tokens, {orphans} orphan brackets]"

for tag in TAGS:
    fixture = json.load(open(f"{ROOT}/inputs/input_{tag}.json"))
    src = json.loads(json.load(open(f"{ROOT}/{SOURCE}/responses/response_{tag}.json"))
                     ["candidates"][0]["content"]["parts"][0]["text"])
    lang, seed = LANG_NAMES[fixture["language"]], fixture["seed"]

    rr_path = f"{TDIR}/reading_rules_{fixture['language']}.txt"
    reading_rules = open(rr_path).read() if os.path.exists(rr_path) else ""

    jobs = []
    for ci, conv in enumerate(src["conversations"]):
        p = (tmpl.replace("{{READING_RULES}}", reading_rules)
             .replace("{{SEED}}", seed).replace("{{LANGUAGE}}", lang)
             .replace("{{TITLE}}", conv["title"]).replace("{{LINES}}", fmt_lines(conv["lines"]))
             .replace("{{WORDS}}", "\n".join(f"{i+1}. {w}" for i, w in enumerate(conv.get("vocab", [])))))
        jobs.append((f"conv{ci}", p, f"{TDIR}/responses/response_{tag}_conv{ci}.json"))

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
        results = list(ex.map(lambda j: call(j[1], j[2]), jobs))
    wall = time.time() - t0

    print(f"\n===== {tag} ({lang}) — wall {wall:.2f}s, chunks: " +
          ", ".join(f"{j[0]} {r[1]:.2f}s in {r[2]['promptTokenCount']} out {r[2]['candidatesTokenCount']}"
                    for j, r in zip(jobs, results)) + " =====")
    pooled = {}  # service-style dedup: English word -> first translation kept
    for ci, conv in enumerate(src["conversations"]):
        data = results[ci][0]
        lt, vt = data["lines"], data["vocab"]
        print(f"\n[{conv['title']}]" +
              ("" if len(lt) == len(conv["lines"]) else f"  !! LINE COUNT MISMATCH {len(lt)}/{len(conv['lines'])}") +
              ("" if len(vt) == len(conv.get("vocab", [])) else f"  !! VOCAB COUNT MISMATCH {len(vt)}/{len(conv.get('vocab', []))}") +
              ruby_report(lt + vt, fixture["language"]))
        for l, t in zip(conv["lines"], lt):
            orq = " (or)" if l.get("or") else ""
            print(f"  {l['speaker']}{orq}: {l['text']}")
            print(f"      → {t}")
        for w, t in zip(conv.get("vocab", []), vt):
            print(f"  vocab: {w} → {t}")
            if w not in pooled:
                pooled[w] = (t, ci)
            elif pooled[w][0] != t:
                print(f"      !! DRIFT vs conv{pooled[w][1]}: kept '{pooled[w][0]}'")
    print(f"\npooled vocab after dedup ({len(pooled)}): " +
          ", ".join(f"{w}→{t}" for w, (t, _) in pooled.items()))
