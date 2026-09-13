import json, subprocess, time, os, sys

ROOT = "/Users/awheeler/src/2026/loudmouth_API_02_claude/prompts/phrasebook"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "."
TAGS = sys.argv[2:] or ["salsa"]

LANG_NAMES = {"es": "Spanish", "ja": "Japanese", "zh": "Chinese", "cs": "Czech"}

tmpl = open(f"{ROOT}/{VERSION}/prompt.txt").read()
key = os.environ["GEMINI_API_KEY"]
url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"

os.makedirs(f"{ROOT}/{VERSION}/responses", exist_ok=True)

for tag in TAGS:
    fixture = json.load(open(f"{ROOT}/inputs/input_{tag}.json"))
    answers = "\n".join(f"- {q}: {a}" for q, a in fixture["answers"].items())
    topics = "\n".join(f"- {t}" for t in fixture["checklist"])
    prompt = (tmpl
              .replace("{{SEED}}", fixture["seed"])
              .replace("{{LANGUAGE}}", LANG_NAMES[fixture["language"]])
              .replace("{{ANSWERS}}", answers)
              .replace("{{TOPICS}}", topics)
              .replace("{{ABILITY}}", fixture.get("ability", os.environ.get("ABILITY", "basics"))))
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    })
    t0 = time.time()
    r = subprocess.run(["curl", "-sS", "-H", f"x-goog-api-key: {key}",
                        "-H", "Content-Type: application/json", "-d", payload, url],
                       capture_output=True, text=True)
    dt = time.time() - t0
    open(f"{ROOT}/{VERSION}/responses/response_{tag}.json", "w").write(r.stdout)
    resp = json.loads(r.stdout)
    text = resp["candidates"][0]["content"]["parts"][0]["text"]
    u = resp["usageMetadata"]
    print(f"=== {tag} ({LANG_NAMES[fixture['language']]}) — {dt:.2f}s, in {u['promptTokenCount']} out {u['candidatesTokenCount']} ===")
    try:
        data = json.loads(text)
        for c in data["conversations"]:
            print(f"\n[{c['title']}]")
            for l in c["lines"]:
                orq = " (or)" if l.get("or") else ""
                print(f"  {l['speaker']}{orq}: {l['text']}")
            if "vocab" in c:
                print(f"  vocab ({len(c['vocab'])}): {', '.join(c['vocab'])}")
        if "vocab" in data:
            print(f"\nvocab ({len(data['vocab'])}): {', '.join(data['vocab'])}")
        print()
    except Exception as e:
        print(f"(parse failed: {e})")
        print(text)
