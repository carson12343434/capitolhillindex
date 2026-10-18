"""Portraits for every member of Congress.

Official portraits are public domain and come first, in this order:
  1. github.com/unitedstates/images (from the Government Publishing Office's Pictorial Directory)
  2. the Clerk of the House (House members)
  3. Congress.gov
  4. the Biographical Directory of the United States Congress
New members often wait weeks for an official portrait, so if none of those has one, a free-licensed
photo from Wikimedia Commons is used (cropped around the face) and its credit recorded.

Writes
  data/photos.js                     small inline thumbnails for the members table
  data/photos/m/{bioguide}.webp      larger portraits for race cards and social posts
  data/sources/photo_credits.json    credit lines for any photo whose license needs one

  python scripts/photos.py            refresh everyone (weekly)
  python scripts/photos.py --missing  only members without a portrait yet (daily)
"""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor

import commons
from common import DATA, SOURCES, http, load_json, log, read_js, save_json, write_js
from imgutil import BIG, SMALL, crop_portrait, data_uri, open_image, webp
from legislators import load_members

OUT = DATA / "photos" / "m"
OFFICIAL = [
    ("unitedstates", "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/{id}.jpg", None),
    ("House Clerk", "https://clerk.house.gov/images/members/{id}.jpg", "House"),
    ("Congress.gov", "https://www.congress.gov/img/member/{lid}_200.jpg", None),
    ("Biographical Directory", "https://bioguide.congress.gov/bioguide/photo/{l}/{id}.jpg", None),
]


def fetch(url: str) -> bytes | None:
    try:
        r = http.get(url, timeout=30)
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image") and len(r.content) > 2000:
            return r.content
    except Exception:
        pass
    return None


def official(m: dict) -> tuple[str, bytes] | None:
    for name, pattern, chamber in OFFICIAL:
        if chamber and m["chamber"] != chamber:
            continue
        data = fetch(pattern.format(id=m["id"], lid=m["id"].lower(), l=m["id"][0]))
        if data:
            return name, data
    return None


def save(path, data: bytes) -> bool:
    """Write only when the bytes changed, so weekly refreshes don't churn the repo."""
    if path.exists() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return True


def from_commons(members: list[dict]) -> dict[str, tuple[bytes, dict]]:
    qids = {m["wikidata"]: m["id"] for m in members if m.get("wikidata")}
    if not qids:
        return {}
    try:
        rows = commons.sparql("SELECT ?p ?img WHERE { VALUES ?p { %s } ?p wdt:P18 ?img . }" % " ".join("wd:" + q for q in qids))
    except Exception as e:
        log.info("wikidata lookup failed: %s", e)
        return {}
    files = {qids[r["p"]["value"].rsplit("/", 1)[-1]]: commons.file_name(r["img"]["value"]) for r in rows}
    info = commons.image_info(sorted(set(files.values())))
    out = {}
    for bid, f in files.items():
        i = info.get(f)
        data = fetch(i["thumb"]) if i and i.get("thumb") else None
        if data:
            out[bid] = (data, i)
    return out


def main() -> None:
    only_missing = "--missing" in sys.argv
    members = load_members()
    small = read_js(DATA / "photos.js", {}) or {}
    credits = load_json(SOURCES / "photo_credits.json", {})
    todo = [m for m in members if not (only_missing and m["id"] in small and (OUT / f"{m['id']}.webp").exists())]
    log.info("photos: checking %d of %d members", len(todo), len(members))

    with ThreadPoolExecutor(10) as pool:
        got = dict(zip([m["id"] for m in todo], pool.map(official, todo)))
    changed = 0
    for m in todo:
        hit = got.get(m["id"])
        if not hit:
            continue
        img = crop_portrait(open_image(hit[1]), find_face=False)
        changed += save(OUT / f"{m['id']}.webp", webp(img, BIG, 78))
        small[m["id"]] = data_uri(webp(img, SMALL, 70))
        credits[m["id"]] = {"source": hit[0], "credit": None}

    still = [m for m in todo if not got.get(m["id"])]
    if still:
        log.info("photos: no official portrait yet for %d: %s", len(still), ", ".join(m["name"] for m in still))
        for bid, (data, info) in from_commons(still).items():
            img = crop_portrait(open_image(data), find_face=True)
            if img is None:
                log.info("  no clear face in the Commons photo for %s", bid)
                continue
            changed += save(OUT / f"{bid}.webp", webp(img, BIG, 78))
            small[bid] = data_uri(webp(img, SMALL, 70))
            credits[bid] = {"source": "Wikimedia Commons", "credit": commons.credit(info), "page": info.get("page")}

    ids = {m["id"] for m in members}
    small = {k: v for k, v in small.items() if k in ids}
    credits = {k: v for k, v in credits.items() if k in ids}
    write_js(DATA / "photos.js", "CHI_PHOTOS", small)
    save_json(SOURCES / "photo_credits.json", credits)
    missing = [m["name"] for m in members if m["id"] not in small]
    log.info("photos: %d of %d members have a portrait (%d files changed)%s", len(small), len(members), changed,
             f"; still missing: {', '.join(missing)}" if missing else "")


if __name__ == "__main__":
    main()
