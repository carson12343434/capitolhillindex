"""Download official member portraits and pack them into photos.js.

Source: https://github.com/unitedstates/images (public-domain official portraits,
keyed by bioguide ID). Each photo is shrunk to a small WebP thumbnail and stored
as a data URI so the site works offline and from a single folder.

Usage: python fetch_photos.py members.json photos.js
"""
import base64
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image

URL = "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/225x275/{}.jpg"
SIZE = (96, 118)


def fetch(bioguide: str) -> tuple[str, str | None]:
    try:
        r = requests.get(URL.format(bioguide), timeout=30)
        if r.status_code != 200:
            return bioguide, None
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.thumbnail(SIZE)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=68)
        return bioguide, "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return bioguide, None


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    with open(src) as f:
        data = json.load(f)
    members = data["members"] if isinstance(data, dict) else data
    with ThreadPoolExecutor(12) as pool:
        photos = {k: v for k, v in pool.map(fetch, [m["id"] for m in members]) if v}
    with open(out, "w") as f:
        f.write("window.CONGRESS_PHOTOS = ")
        json.dump(photos, f, separators=(",", ":"))
        f.write(";\n")
    print(f"{len(photos)} of {len(members)} photos -> {out}", file=sys.stderr)
