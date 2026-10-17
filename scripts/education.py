"""Colleges and degrees for each member.

1. The official Biographical Directory of Congress (bioguide.congress.gov) lists degrees in a
   fixed style: "B.A., University of Florida, Gainesville, 1979; J.D., ...". We parse that.
2. Wikidata ("educated at", with "academic degree" qualifiers) fills in anyone the directory
   text doesn't cover. High schools are dropped.
Writes data/sources/education.json. Members already filled are kept if a source is down.
"""
from __future__ import annotations

import re
import time

from common import SOURCES, get, load_json, log, now_iso, save_json
from legislators import load_members

WIKIDATA = "https://query.wikidata.org/sparql"
BIOGUIDE = "https://bioguide.congress.gov/search/bio/{id}.json"

DEGREES = [  # (pattern, short label, rank)
    (r"Ph\.\s?D\.|Doctor of Philosophy", "PhD", 5), (r"M\.\s?D\.|Doctor of Medicine", "MD", 5), (r"J\.\s?D\.|Juris Doctor|LL\.\s?B\.", "JD", 5),
    (r"D\.\s?D\.\s?S\.|D\.\s?M\.\s?D\.", "DDS", 5), (r"D\.\s?O\.\b|Doctor of Osteopathic", "DO", 5), (r"Ed\.\s?D\.|Doctor of Education", "EdD", 5),
    (r"D\.\s?V\.\s?M\.|Doctor of Veterinary", "DVM", 5), (r"Pharm\.\s?D\.|Doctor of Pharmacy", "PharmD", 5), (r"D\.\s?N\.\s?P\.", "DNP", 5),
    (r"LL\.\s?M\.|Master of Laws", "LLM", 4), (r"M\.\s?B\.\s?A\.|Master of Business Administration", "MBA", 4),
    (r"M\.\s?P\.\s?A\.|Master of Public Administration", "MPA", 4), (r"M\.\s?P\.\s?P\.|Master of Public Policy", "MPP", 4),
    (r"M\.\s?P\.\s?H\.|Master of Public Health", "MPH", 4), (r"M\.\s?Ed\.|Master of Education", "MEd", 4),
    (r"M\.\s?Div\.|Master of Divinity", "MDiv", 4), (r"M\.\s?S\.\s?W\.|Master of Social Work", "MSW", 4),
    (r"M\.\s?A\.|Master of Arts", "MA", 4), (r"M\.\s?S\.|Master of Science", "MS", 4), (r"M\.\s?F\.\s?A\.", "MFA", 4),
    (r"B\.\s?B\.\s?A\.|Bachelor of Business", "BBA", 3), (r"B\.\s?S\.\s?N\.|Bachelor of Science in Nursing", "BSN", 3),
    (r"B\.\s?A\.|A\.\s?B\.|Bachelor of Arts", "BA", 3), (r"B\.\s?S\.|Bachelor of Science", "BS", 3), (r"B\.\s?F\.\s?A\.", "BFA", 3),
    (r"A\.\s?A\.|A\.\s?S\.|Associate", "AA", 2),
]
DEG_RE = re.compile(r"(?<![A-Za-z])(" + "|".join(p for p, _, _ in DEGREES) + r")\s*,?\s+(?:in [A-Za-z ,]+?,\s*)?([^,;]+)")
SECONDARY = re.compile(r"high school|preparatory|prep school|secondary|grammar school|military academy(?! at west point)", re.I)


def degree_label(text: str) -> tuple[str, int] | None:
    for pat, short, rank in DEGREES:
        if re.fullmatch(pat, text.strip(), re.I) or re.search(pat, text, re.I):
            return short, rank
    return None


def find_text(obj) -> str:
    """The directory JSON layout isn't documented; take the longest string that reads like a biography."""
    best = ""
    stack = [obj]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)
        elif isinstance(o, str) and len(o) > len(best) and ("Congress" in o or "elected" in o):
            best = o
    return best


def parse_bioguide(text: str) -> list[dict]:
    text = re.sub(r"<[^>]+>", " ", text)
    out, seen = [], set()
    for m in DEG_RE.finditer(text):
        lab = degree_label(m.group(1))
        school = m.group(2).strip().strip(".")
        if not lab or len(school) < 4 or SECONDARY.search(school) or not re.search(r"[A-Z]", school):
            continue
        key = (lab[0], school)
        if key in seen:
            continue
        seen.add(key)
        tail = text[m.end(): m.end() + 60]
        yr = re.search(r"\b(19|20)\d{2}\b", tail)
        out.append({"degree": lab[0], "rank": lab[1], "school": school, "year": int(yr.group(0)) if yr else None})
    return out


def bioguide(ids: list[str], have: dict) -> dict:
    out = {}
    fails = 0
    for i, bid in enumerate(ids, 1):
        try:
            data = get(BIOGUIDE.format(id=bid), tries=2, timeout=30).json()
            degs = parse_bioguide(find_text(data))
            if degs:
                out[bid] = degs
        except Exception as e:
            fails += 1
            if fails > 25 and not out:
                log.info("Bioguide unreachable (%s); skipping", e)
                break
        if i % 100 == 0:
            log.info("  bioguide %d/%d", i, len(ids))
        time.sleep(0.3)
    log.info("Bioguide: degrees for %d members", len(out))
    return out


Q_SCHOOLS = """SELECT ?person ?school ?schoolLabel ?degreeLabel ?end WHERE {
  VALUES ?person { %s }
  ?person p:P69 ?st . ?st ps:P69 ?school .
  OPTIONAL { ?st pq:P512 ?degree . } OPTIONAL { ?st pq:P582 ?end . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }"""
Q_HIGHER = """SELECT DISTINCT ?s WHERE { VALUES ?s { %s } ?s wdt:P31/wdt:P279* wd:Q38723 . }"""


def sparql(q: str) -> list[dict]:
    r = get(WIKIDATA, params={"query": q, "format": "json"}, headers={"Accept": "application/sparql-results+json"}, timeout=120)
    return r.json()["results"]["bindings"]


def wikidata(members: list[dict]) -> dict:
    qmap = {m["wikidata"]: m["id"] for m in members if m.get("wikidata")}
    qids = list(qmap)
    rows = []
    for i in range(0, len(qids), 60):
        rows += sparql(Q_SCHOOLS % " ".join(f"wd:{q}" for q in qids[i:i + 60]))
        time.sleep(1.5)
    schools = sorted({r["school"]["value"].rsplit("/", 1)[-1] for r in rows})
    higher = set()
    for i in range(0, len(schools), 150):
        higher |= {r["s"]["value"].rsplit("/", 1)[-1] for r in sparql(Q_HIGHER % " ".join(f"wd:{s}" for s in schools[i:i + 150]))}
        time.sleep(1.5)
    out: dict[str, dict] = {}
    for r in rows:
        bid = qmap[r["person"]["value"].rsplit("/", 1)[-1]]
        sq = r["school"]["value"].rsplit("/", 1)[-1]
        name = r["schoolLabel"]["value"]
        deg = degree_label(r["degreeLabel"]["value"]) if "degreeLabel" in r else None
        if (sq not in higher and not deg) or SECONDARY.search(name) or re.fullmatch(r"Q\d+", name):
            continue
        yr = int(r["end"]["value"][:4]) if "end" in r else None
        rec = out.setdefault(bid, {}).setdefault(name, {"school": name, "degree": None, "rank": 1, "year": yr})
        if deg and deg[1] > rec["rank"]:
            rec.update(degree=deg[0], rank=deg[1])
        if yr and not rec["year"]:
            rec["year"] = yr
    log.info("Wikidata: schools for %d members", len(out))
    return {k: list(v.values()) for k, v in out.items()}


def summarize(items: list[dict]) -> dict:
    items = sorted(items, key=lambda x: (x.get("year") or 9999, -x["rank"]))
    top = max(items, key=lambda x: (x["rank"], x.get("year") or 0))
    return {"list": [{k: x.get(k) for k in ("degree", "school", "year")} for x in items],
            "top": f'{top["degree"]}, {top["school"]}' if top.get("degree") else top["school"]}


def main() -> None:
    members = load_members()
    prev = load_json(SOURCES / "education.json", {}).get("members", {})
    bio, wd = {}, {}
    try:
        bio = bioguide([m["id"] for m in members], prev)
    except Exception as e:
        log.info("Bioguide step failed: %s", e)
    try:
        wd = wikidata(members)
    except Exception as e:
        log.info("Wikidata step failed: %s", e)
    out = {}
    for m in members:
        bid = m["id"]
        if bid in bio:
            # add any college Wikidata knows that the directory text didn't mention
            items = bio[bid] + [w for w in wd.get(bid, []) if not any(w["school"].lower() in b["school"].lower() or b["school"].lower() in w["school"].lower() for b in bio[bid])]
            out[bid] = summarize(items) | {"source": "Biographical Directory of Congress"}
        elif bid in wd:
            out[bid] = summarize(wd[bid]) | {"source": "Wikidata"}
        elif bid in prev:
            out[bid] = prev[bid]
    if out:
        save_json(SOURCES / "education.json", {"updated": now_iso(), "members": out})
    log.info("education: %d of %d members", len(out), len(members))


if __name__ == "__main__":
    main()
