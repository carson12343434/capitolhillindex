"""Headshots for 2026 candidates.

Sitting members of Congress use their official portrait (scripts/photos.py). Everyone else is looked up
on Wikidata by name, and a match is accepted only when it is clearly the same person: a living American
whose description or offices name the race's state, and whose recorded party (if any) matches. Ambiguous
names get no photo. Photos come from Wikimedia Commons, are cropped around the face, and keep the credit
line their license requires.

Bad match? Add the candidate to data/static/candidate_photo_overrides.json:
  {"TX|jane doe": null}                      no photo
  {"TX|jane doe": "Jane Doe portrait.jpg"}   use this Commons file instead

Writes data/photos/c/*.webp, data/candphotos.js and data/sources/candidate_photos.json.
"""
from __future__ import annotations

import re
from collections import defaultdict

import commons
from common import DATA, SOURCES, STATIC, load_json, log, read_js, save_json, write_js
from imgutil import BIG, crop_portrait, open_image, webp
from photos import fetch, save
from polls import STATE_NAMES

OUT = DATA / "photos" / "c"
PARTY_QID = {"D": "Q29552", "R": "Q29468"}
ABBR = {v: k for k, v in STATE_NAMES.items()}


def norm(name: str) -> str:
    s = re.sub(r"\(.*?\)", " ", name or "").lower()
    s = re.sub(r"[^a-z\s'-]", " ", s).replace("'", "").replace("-", " ")
    return " ".join(s.split())


def key(state: str, name: str) -> str:
    return f"{state}|{norm(name)}"


def slug(state: str, name: str) -> str:
    return f"{state.lower()}-{norm(name).replace(' ', '-')}"


def variants(name: str) -> list[str]:
    """'Dan S. Sullivan Jr.' -> ['Dan S. Sullivan Jr.', 'Dan S. Sullivan', 'Dan Sullivan']"""
    out = [name.strip()]
    base = re.sub(r",?\s+(Jr\.?|Sr\.?|II|III|IV)$", "", name.strip())
    out.append(base)
    parts = base.split()
    if len(parts) > 2:
        out.append(f"{parts[0]} {parts[-1]}")
    return list(dict.fromkeys(v for v in out if v))


def candidates() -> list[dict]:
    P = read_js(DATA / "polls.js", {}) or {}
    seen, out = set(), []
    for r in P.get("races", []):
        for side in ("left", "right", "other"):
            c = r.get(side)
            if not c or not c.get("name"):
                continue
            k = key(r["state"], c["name"])
            if k in seen:
                continue
            seen.add(k)
            out.append({"key": k, "state": r["state"], "name": c["name"], "party": c.get("party") or "", "mid": c.get("mid")})
    return out


Q = """SELECT ?item ?name ?img ?desc ?dod ?party ?posLabel ?citizen WHERE {
  VALUES ?name { %s }
  { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
  ?item wdt:P31 wd:Q5 ; wdt:P18 ?img .
  OPTIONAL { ?item wdt:P27 ?citizen }
  OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc) = "en") }
  OPTIONAL { ?item wdt:P570 ?dod }
  OPTIONAL { ?item wdt:P102 ?party }
  OPTIONAL { ?item wdt:P39 ?pos . ?pos rdfs:label ?posLabel FILTER(lang(?posLabel) = "en") }
}"""


def lookup(cands: list[dict]) -> dict[str, str]:
    """Candidate key -> Commons file name, for confident matches only."""
    by_name = defaultdict(list)
    for c in cands:
        for v in variants(c["name"]):
            by_name[v].append(c)
    names = sorted(by_name)
    items: dict[str, dict] = {}
    for i in range(0, len(names), 25):
        batch = names[i:i + 25]
        lits = " ".join('"%s"@en' % n.replace('"', '\\"') for n in batch)
        try:
            rows = commons.sparql(Q % lits)
        except Exception as e:
            log.info("wikidata batch failed: %s", e)
            continue
        for r in rows:
            q = r["item"]["value"].rsplit("/", 1)[-1]
            it = items.setdefault(q, {"names": set(), "img": commons.file_name(r["img"]["value"]), "desc": "", "dead": False,
                                      "party": set(), "pos": set(), "citizen": set()})
            it["names"].add(r["name"]["value"])
            it["desc"] = r.get("desc", {}).get("value", it["desc"])
            it["dead"] |= "dod" in r
            if "party" in r:
                it["party"].add(r["party"]["value"].rsplit("/", 1)[-1])
            if "posLabel" in r:
                it["pos"].add(r["posLabel"]["value"])
            if "citizen" in r:
                it["citizen"].add(r["citizen"]["value"].rsplit("/", 1)[-1])

    out = {}
    for c in cands:
        if c.get("mid"):
            continue
        state_name = ABBR.get(c["state"], "")
        want_party = PARTY_QID.get(c["party"][:1]) if c["party"] in ("D", "R") else None
        pool = [it for it in items.values() if it["names"] & set(variants(c["name"]))]
        ok = []
        for it in pool:
            if it["dead"] or (it["citizen"] and "Q30" not in it["citizen"]):
                continue
            if want_party and it["party"] and want_party not in it["party"]:
                continue
            text = " ".join([it["desc"], *it["pos"]])
            in_state = bool(state_name) and state_name.lower() in text.lower()
            politics = bool(it["pos"]) or "politician" in it["desc"].lower()
            party_match = bool(want_party) and want_party in it["party"]
            if in_state or (len(pool) == 1 and politics and party_match):
                ok.append((in_state, it))
        if len(ok) > 1:
            ok = [o for o in ok if o[0]]
        if len(ok) == 1:
            out[c["key"]] = ok[0][1]["img"]
    return out


def main() -> None:
    cands = candidates()
    if not cands:
        log.info("candidate photos: no races found")
        return
    member_credits = load_json(SOURCES / "photo_credits.json", {})
    overrides = load_json(STATIC / "candidate_photo_overrides.json", {})
    prev = load_json(SOURCES / "candidate_photos.json", {})

    found = lookup([c for c in cands if not c.get("mid")])
    if not found and prev:
        log.info("candidate photos: Wikidata returned nothing; keeping the previous set")
        return
    for k, v in overrides.items():
        if v is None:
            found.pop(k, None)
        else:
            found[k] = v
    log.info("candidate photos: %d non-member matches on Wikidata", len(found))

    need = sorted({f for k, f in found.items() if not (prev.get(k, {}).get("file") == f and (OUT / f"{prev[k]['slug']}.webp").exists())})
    info = commons.image_info(sorted(set(found.values())), width=800)
    if found and not info:
        log.info("candidate photos: Commons unreachable; keeping the previous set")
        return
    result, kept, added = {}, 0, 0
    for c in cands:
        k = c["key"]
        if c.get("mid"):
            if (DATA / "photos" / "m" / f"{c['mid']}.webp").exists():
                cr = member_credits.get(c["mid"], {})
                result[k] = {"src": f"photos/m/{c['mid']}.webp", "credit": cr.get("credit"), "page": cr.get("page")}
            continue
        f = found.get(k)
        i = info.get(f) if f else None
        if not f or not i:
            continue
        s = slug(c["state"], c["name"])
        path = OUT / f"{s}.webp"
        if f in need or not path.exists():
            data = fetch(i["thumb"]) if i.get("thumb") else None
            img = crop_portrait(open_image(data), find_face=True) if data else None
            if img is None:
                continue
            save(path, webp(img, BIG, 78))
            added += 1
        else:
            kept += 1
        result[k] = {"src": f"photos/c/{s}.webp", "credit": commons.credit(i), "page": i.get("page")}
        prev[k] = {"file": f, "slug": s}

    # drop files for candidates no longer in any race
    live = {v["src"].split("/")[-1] for v in result.values() if v["src"].startswith("photos/c/")}
    for p in OUT.glob("*.webp"):
        if p.name not in live:
            p.unlink()
    save_json(SOURCES / "candidate_photos.json", {k: v for k, v in prev.items() if k in result})
    write_js(DATA / "candphotos.js", "CHI_CANDPHOTOS", result)
    log.info("candidate photos: %d of %d candidates have a headshot (%d new, %d unchanged)", len(result), len(cands), added, kept)


if __name__ == "__main__":
    main()
