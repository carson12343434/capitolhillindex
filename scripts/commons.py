"""Free-licensed photos from Wikimedia Commons, with the credit each license asks for.

Only used when no official portrait exists. We record the photographer and license for every file
and show them wherever the photo appears, since CC BY and CC BY-SA require attribution.
"""
from __future__ import annotations

import re
import time
from urllib.parse import unquote

from common import get, log

API = "https://commons.wikimedia.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"


def sparql(q: str) -> list[dict]:
    r = get(SPARQL, params={"query": q, "format": "json"}, headers={"Accept": "application/sparql-results+json"}, timeout=120)
    return r.json()["results"]["bindings"]


def file_name(commons_url: str) -> str:
    """http://commons.wikimedia.org/wiki/Special:FilePath/Jane%20Doe.jpg -> Jane Doe.jpg"""
    return unquote(commons_url.rsplit("/", 1)[-1])


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


def image_info(names: list[str], width: int = 600) -> dict[str, dict]:
    """File name -> {thumb, page, artist, license, licenseUrl, pd}. Batches of 40 titles."""
    out = {}
    for i in range(0, len(names), 40):
        batch = names[i:i + 40]
        try:
            r = get(API, params={"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata",
                                 "iiurlwidth": width, "titles": "|".join("File:" + n for n in batch)}, timeout=60)
        except Exception as e:
            log.info("commons batch failed: %s", e)
            continue
        pages = r.json().get("query", {}).get("pages", {})
        norm = {n["to"]: n["from"] for n in r.json().get("query", {}).get("normalized", [])}
        for p in pages.values():
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                continue
            title = norm.get(p["title"], p["title"])
            name = title.split(":", 1)[1]
            meta = ii.get("extmetadata", {})
            lic = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
            artist = strip_html(meta.get("Artist", {}).get("value", "")) or strip_html(meta.get("Credit", {}).get("value", ""))
            pd = bool(re.search(r"public domain|^pd\b|cc0", lic, re.I))
            out[name] = {"thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
                         "artist": artist[:120], "license": lic, "licenseUrl": meta.get("LicenseUrl", {}).get("value"), "pd": pd}
        time.sleep(0.5)
    return out


def credit(info: dict) -> str | None:
    """Short credit line, or None when the license doesn't require one."""
    if info.get("pd"):
        return None
    who = info.get("artist") or "Unknown photographer"
    return f"Photo: {who} ({info.get('license') or 'see license'})"
