"""Headshots for 2026 candidates.

Sitting members of Congress use their official portrait (scripts/photos.py). Everyone else is looked up
on Wikidata by name (search API, then each item's claims), and a match is accepted only when it is clearly the same person: a living American
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
OPPOSITE = {"D": "Q29468", "R": "Q29552"}
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


API = "https://www.wikidata.org/w/api.php"


def wd(params: dict) -> dict:
    from common import get
    return get(API, params={"format": "json", **params}, timeout=60).json()


def search(name: str) -> list[str] | None:
    """Item IDs for a name, or None if the request failed (so it can be retried)."""
    try:
        return [x["id"] for x in wd({"action": "wbsearchentities", "search": name, "language": "en", "type": "item", "limit": 7}).get("search", [])]
    except Exception:
        return None


def entities(ids: list[str], props: str) -> dict:
    out = {}
    for i in range(0, len(ids), 50):
        try:
            out.update(wd({"action": "wbgetentities", "ids": "|".join(ids[i:i + 50]), "props": props, "languages": "en"}).get("entities", {}))
        except Exception as e:
            log.info("wbgetentities failed: %s", e)
    return out


def claim_ids(e: dict, prop: str) -> list[str]:
    out = []
    for c in e.get("claims", {}).get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v:
            out.append(v["id"])
        elif isinstance(v, str):
            out.append(v)
    return out


def lookup(cands: list[dict], report: dict) -> dict[str, str]:
    """Candidate key -> Commons file name, for confident matches only. Reasons for misses go in `report`."""
    from concurrent.futures import ThreadPoolExecutor
    names = sorted({v for c in cands for v in variants(c["name"])})
    with ThreadPoolExecutor(2) as pool:
        hits = dict(zip(names, pool.map(search, names)))
    import time
    for attempt in range(3):
        failed = [n for n, v in hits.items() if v is None]
        if not failed:
            break
        log.info("wikidata: retrying %d searches", len(failed))
        time.sleep(20)
        for n in failed:
            hits[n] = search(n)
            time.sleep(0.4)
    hits = {n: v or [] for n, v in hits.items()}
    qids = sorted({q for v in hits.values() for q in v})
    ents = entities(qids, "labels|aliases|descriptions|claims")
    related = sorted({q for e in ents.values() for p in ("P39", "P551", "P3602", "P1001") for q in claim_ids(e, p)})
    rel_labels = {q: e.get("labels", {}).get("en", {}).get("value", "") for q, e in entities(related, "labels").items()}
    log.info("wikidata: %d names searched, %d items, %d related labels", len(names), len(ents), len(rel_labels))

    out = {}
    for c in cands:
        if c.get("mid"):
            continue
        vs = {norm(v) for v in variants(c["name"])}
        state_name = ABBR.get(c["state"], "")
        want_party = PARTY_QID.get(c["party"][:1]) if c["party"] in ("D", "R") else None
        pool = []
        for v in variants(c["name"]):
            for q in hits.get(v, []):
                e = ents.get(q)
                if not e or q in [x[0] for x in pool]:
                    continue
                labels = [e.get("labels", {}).get("en", {}).get("value", "")] + [a["value"] for a in e.get("aliases", {}).get("en", [])]
                if not any(norm(l) in vs for l in labels):
                    continue
                if "Q5" not in claim_ids(e, "P31"):
                    continue
                pool.append((q, e))
        if not pool:
            report[c["key"]] = "no Wikidata item with this name"
            continue
        ok, why, eligible = [], [], []
        for q, e in pool:
            img = claim_ids(e, "P18")
            if not img:
                why.append(f"{q}: no image")
                continue
            if claim_ids(e, "P570"):
                why.append(f"{q}: deceased")
                continue
            cit = claim_ids(e, "P27")
            if cit and "Q30" not in cit:
                why.append(f"{q}: not American")
                continue
            parties = claim_ids(e, "P102")
            # State affiliates (Minnesota DFL, Alaska Democratic Party...) aren't a mismatch; only the other major party is.
            opp = OPPOSITE.get(c["party"][:1]) if c["party"] in ("D", "R") else None
            if opp and opp in parties and want_party not in parties:
                why.append(f"{q}: other party")
                continue
            eligible.append((q, e, img[0], parties))
        for q, e, img, parties in eligible:
            desc = e.get("descriptions", {}).get("en", {}).get("value", "")
            text = " ".join([desc] + [rel_labels.get(x, "") for p in ("P39", "P551", "P3602", "P1001") for x in claim_ids(e, p)])
            in_state = bool(state_name) and state_name.lower() in text.lower()
            politics = bool(claim_ids(e, "P39")) or bool(claim_ids(e, "P3602")) or bool(parties) or "politic" in desc.lower()
            if in_state or (len(eligible) == 1 and politics):
                ok.append((in_state, q, img))
            else:
                why.append(f"{q}: no tie to {state_name} ({desc[:60]})")
        if len(ok) > 1:
            ok = [o for o in ok if o[0]]
        if len(ok) == 1:
            out[c["key"]] = ok[0][2]
        else:
            report[c["key"]] = "ambiguous: " + ", ".join(o[1] for o in ok) if ok else "; ".join(why)[:300]
    return out


def main() -> None:
    cands = candidates()
    if not cands:
        log.info("candidate photos: no races found")
        return
    member_credits = load_json(SOURCES / "photo_credits.json", {})
    overrides = load_json(STATIC / "candidate_photo_overrides.json", {})
    prev = load_json(SOURCES / "candidate_photos.json", {})

    report: dict[str, str] = {}
    found = lookup([c for c in cands if not c.get("mid")], report)
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
                report[k] = "photo found but no clear face" if data else "photo download failed"
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
    save_json(SOURCES / "candidate_photos_report.json", {k: v for k, v in sorted(report.items()) if k not in result})
    write_js(DATA / "candphotos.js", "CHI_CANDPHOTOS", result)
    log.info("candidate photos: %d of %d candidates have a headshot (%d new, %d unchanged)", len(result), len(cands), added, kept)


if __name__ == "__main__":
    main()
