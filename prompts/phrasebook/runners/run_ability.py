import json, subprocess, time, os, sys

ROOT = "/Users/awheeler/src/2026/loudmouth_API_02_claude/prompts/phrasebook"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "v03"
TAG = sys.argv[3] if len(sys.argv) > 3 else "salsa"
ABILITIES = sys.argv[2].split(",") if len(sys.argv) > 2 else ["none", "basics", "conversational", "comfortable"]
LANG_NAMES = {"es": "Spanish", "ja": "Japanese", "zh": "Chinese", "cs": "Czech"}

tmpl = open(f"{ROOT}/{VERSION}/prompt.txt").read()
key = os.environ["GEMINI_API_KEY"]
url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
os.makedirs(f"{ROOT}/{VERSION}/responses", exist_ok=True)

fixture = json.load(open(f"{ROOT}/inputs/input_{TAG}.json"))
answers = "\n".join(f"- {q}: {a}" for q, a in fixture["answers"].items())
topics = "\n".join(f"- {t}" for t in fixture["checklist"])
lang = LANG_NAMES[fixture["language"]]

results = {}
for ability in ABILITIES:
    prompt = (tmpl.replace("{{SEED}}", fixture["seed"])
                  .replace("{{LANGUAGE}}", lang)
                  .replace("{{ANSWERS}}", answers)
                  .replace("{{TOPICS}}", topics)
                  .replace("{{ABILITY}}", ability))
    payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                          "generationConfig": {"responseMimeType": "application/json"}})
    t0 = time.time()
    r = subprocess.run(["curl", "-sS", "-H", f"x-goog-api-key: {key}",
                        "-H", "Content-Type: application/json", "-d", payload, url],
                       capture_output=True, text=True)
    dt = time.time() - t0
    open(f"{ROOT}/{VERSION}/responses/response_{TAG}_{ability}.json", "w").write(r.stdout)
    resp = json.loads(r.stdout)
    u = resp["usageMetadata"]
    data = json.loads(resp["candidates"][0]["content"]["parts"][0]["text"])
    results[ability] = data
    n = [len(c["lines"]) for c in data["conversations"]]
    print(f"## {ability}: {dt:.2f}s, in {u['promptTokenCount']} out {u['candidatesTokenCount']}, lines {n}")

# grouped by topic for cross-ability comparison
for i, topic in enumerate(fixture["checklist"]):
    print(f"\n===== TOPIC: {topic} =====")
    for ability in ABILITIES:
        conv = results[ability]["conversations"][i]
        print(f"\n--- {ability} ---")
        for l in conv["lines"]:
            orq = " (or)" if l.get("or") else ""
            print(f"  {l['speaker']}{orq}: {l['text']}")
