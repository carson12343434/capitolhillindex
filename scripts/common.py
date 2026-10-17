"""Shared helpers for the data scripts."""
from __future__ import annotations

import json
import logging
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SOURCES = DATA / "sources"
STATIC = DATA / "static"
CACHE = ROOT / ".cache"
for d in (DATA, SOURCES, STATIC, CACHE):
    d.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S", stream=sys.stderr)
log = logging.getLogger("chi")

UA = "CapitolHillIndex/1.0 (nonpartisan civic data site; contact via GitHub repo)"
http = requests.Session()
http.headers.update({"User-Agent": UA})

LEGISLATORS_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml"
STOCK_ACT = date(2012, 4, 4)


def get(url: str, *, params=None, headers=None, tries: int = 4, timeout: int = 90, stream: bool = False) -> requests.Response:
    last = None
    for attempt in range(tries):
        try:
            r = http.get(url, params=params, headers=headers, timeout=timeout, stream=stream)
            if r.status_code in (429, 502, 503, 504):
                wait = int(r.headers.get("Retry-After") or 0) or 5 * 2 ** attempt
                log.info("  %s -> %s, retrying in %ss", url, r.status_code, wait)
                time.sleep(min(wait, 120))
                continue
            if 400 <= r.status_code < 500:
                r.raise_for_status()  # not worth retrying
            r.raise_for_status()
            return r
        except requests.HTTPError as e:
            if e.response is not None and 400 <= e.response.status_code < 500:
                raise RuntimeError(f"failed: {url}: {e}") from e
            last = e
            time.sleep(3 * (attempt + 1))
        except requests.RequestException as e:
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed: {url}: {last}")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    tmp.replace(path)


def load_json(path: Path, default=None):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_js(path: Path, var: str, obj) -> None:
    """Write data as a script that sets window.<var>, so pages work from any host or straight from disk."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(f"window.{var}=" + json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + ";\n")
    tmp.replace(path)
    log.info("wrote %s (%.0f KB)", path.relative_to(ROOT), path.stat().st_size / 1024)


def read_js(path: Path, default=None):
    try:
        txt = path.read_text()
        return json.loads(txt[txt.index("=") + 1:].rstrip().rstrip(";"))
    except (FileNotFoundError, ValueError):
        return default


def ymd(n) -> date | None:
    """congresskit stores dates as YYYYMMDD integers."""
    try:
        n = int(n)
        d = date(n // 10000, n // 100 % 100, n % 100)
    except (TypeError, ValueError):
        return None
    return d if date(2000, 1, 1) <= d <= date.today() else None
