"""Official portraits (public domain) from github.com/unitedstates/images, packed into data/photos.js
as small WebP thumbnails so pages load them without extra requests."""
from __future__ import annotations

import base64
import io
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from common import DATA, http, log, read_js, write_js
from legislators import load_members

URL = "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/225x275/{}.jpg"
SIZE = (96, 118)


def fetch(bid: str) -> tuple[str, str | None]:
    try:
        r = http.get(URL.format(bid), timeout=30)
        if r.status_code != 200:
            return bid, None
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.thumbnail(SIZE)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=70)
        return bid, "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return bid, None


def main() -> None:
    members = load_members()
    old = read_js(DATA / "photos.js", {}) or {}
    with ThreadPoolExecutor(12) as pool:
        got = dict(pool.map(fetch, [m["id"] for m in members]))
    photos = {bid: got.get(bid) or old.get(bid) for bid in (m["id"] for m in members)}
    photos = {k: v for k, v in photos.items() if v}
    write_js(DATA / "photos.js", "CHI_PHOTOS", photos)
    log.info("photos: %d of %d", len(photos), len(members))


if __name__ == "__main__":
    main()
