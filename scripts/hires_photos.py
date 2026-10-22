"""Larger headshots (600 x 734) for social posts, where photos fill half the frame.

Only for the people posts feature most: every Senate and governor candidate, plus the members with the
most stock trades this term. Same sources and credits as the site's smaller photos:
  members      official portrait, full size (unitedstates/images), falling back to the 450 x 550 version
  everyone else the Wikimedia Commons file already matched by candidate_photos.py, fetched larger

Writes data/photos/hi/*.webp and data/hiphotos.js ({"m:BIOGUIDE" | "STATE|name": "photos/hi/....webp"}).
"""
from __future__ import annotations

import commons
from candidate_photos import key, slug
from common import DATA, SOURCES, load_json, log, read_js, write_js
from imgutil import crop_portrait, open_image, webp
from photos import fetch, save

OUT = DATA / "photos" / "hi"
SIZE = (600, 734)
ORIGINAL = "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/original/{id}.jpg"
MEDIUM = "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/{id}.jpg"


def main() -> None:
    polls = read_js(DATA / "polls.js", {}) or {}
    members = (read_js(DATA / "members.js", {}) or {}).get("members", [])
    matched = load_json(SOURCES / "candidate_photos.json", {})
    out = read_js(DATA / "hiphotos.js", {}) or {}

    member_ids, commons_people = set(), {}
    for r in polls.get("races", []):
        if r["office"] not in ("SEN", "GOV"):
            continue
        for side in ("left", "right", "other"):
            c = r.get(side)
            if not c or not c.get("name"):
                continue
            if c.get("mid"):
                member_ids.add(c["mid"])
            else:
                k = key(r["state"], c["name"])
                if k in matched:
                    commons_people[k] = (matched[k]["file"], slug(r["state"], c["name"]))
    traders = sorted((m for m in members if m.get("trades") and m["trades"].get("term")), key=lambda m: -m["trades"]["term"])[:25]
    member_ids.update(m["id"] for m in traders)

    made = 0
    for bid in sorted(member_ids):
        path = OUT / f"m-{bid}.webp"
        if not path.exists():
            data = fetch(ORIGINAL.format(id=bid)) or fetch(MEDIUM.format(id=bid))
            if not data:
                continue
            made += save(path, webp(crop_portrait(open_image(data), find_face=False), SIZE, 80))
        out[f"m:{bid}"] = f"photos/hi/m-{bid}.webp"

    todo = {k: v for k, v in commons_people.items() if not (OUT / f"{v[1]}.webp").exists()}
    info = commons.image_info(sorted({f for f, _ in todo.values()}), width=1400) if todo else {}
    for k, (f, s) in commons_people.items():
        path = OUT / f"{s}.webp"
        if k in todo:
            i = info.get(f)
            data = fetch(i["thumb"]) if i and i.get("thumb") else None
            img = crop_portrait(open_image(data), find_face=True) if data else None
            if img is None:
                continue
            made += save(path, webp(img, SIZE, 80))
        if path.exists():
            out[k] = f"photos/hi/{s}.webp"

    live = {v.split("/")[-1] for v in out.values()}
    for p in OUT.glob("*.webp"):
        if p.name not in live:
            p.unlink()
    out = {k: v for k, v in out.items() if (DATA / v).exists()}
    write_js(DATA / "hiphotos.js", "CHI_HIPHOTOS", out)
    log.info("hi-res photos: %d people (%d new)", len(out), made)


if __name__ == "__main__":
    main()
