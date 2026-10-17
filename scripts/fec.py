"""PAC money and total fundraising per member, from FEC bulk files (no API key needed).

For each two-year period we read:
  weball{yy}.zip  candidate totals (total receipts, money from other political committees)
  pas2{yy}.zip    every contribution a PAC made to a candidate
  cm{yy}.zip      committee master file: tells us which PACs are tied to corporations
Corporate PAC money = contributions (types 24K and 24Z) from PACs whose connected organization
is a corporation (FEC organization type C or W).

Spans:
  last  = the member's most recent completed election: House 2023-24; senators the six years
          ending with their last election. Appointed senators use the current period.
  cycle = the current two-year period (2025-26) so far.
Writes data/sources/fec.json.
"""
from __future__ import annotations

import io
import zipfile
from collections import defaultdict
from datetime import date

from common import CACHE, SOURCES, get, log, now_iso, save_json
from legislators import load_members

BULK = "https://www.fec.gov/files/bulk-downloads/{year}/{name}{yy}.zip"
CORPORATE = {"C", "W"}
TRADE = {"T"}
LABOR = {"L"}


def current_period(today: date) -> int:
    return today.year + today.year % 2


def spans(m: dict, today: date) -> dict[str, list[int]]:
    cur = current_period(today)
    if m["chamber"] == "House":
        return {"last": [cur - 2], "cycle": [cur]}
    s, e = date.fromisoformat(m["termStart"]), date.fromisoformat(m["termEnd"])
    full_term = 5.5 <= (e - s).days / 365.25 <= 6.2 and s.month == 1
    if not full_term:
        return {"last": [cur], "cycle": [cur]}
    elected = s.year - 1
    return {"last": [elected - 4, elected - 2, elected], "cycle": [cur]}


def fetch_zip(name: str, period: int) -> zipfile.ZipFile:
    yy = f"{period % 100:02d}"
    f = CACHE / "fec" / f"{name}{yy}.zip"
    f.parent.mkdir(parents=True, exist_ok=True)
    # The closed periods never change; the current one is refreshed each run.
    if not f.exists() or period >= current_period(date.today()):
        r = get(BULK.format(year=period, name=name, yy=yy), timeout=600)
        f.write_bytes(r.content)
    return zipfile.ZipFile(f)


def lines(z: zipfile.ZipFile):
    name = z.namelist()[0]
    with z.open(name) as fh:
        for raw in io.TextIOWrapper(fh, encoding="latin-1"):
            yield raw.rstrip("\r\n").split("|")


def num(s: str) -> float:
    try:
        return float(s)
    except (TypeError, ValueError):
        return 0.0


def read_period(period: int, cand_ids: set[str]) -> dict[str, dict]:
    """Totals per candidate ID for one two-year period."""
    out = defaultdict(lambda: {"receipts": 0.0, "pac": 0.0, "corp": 0.0, "trade": 0.0, "labor": 0.0, "indiv": 0.0})
    for f in lines(fetch_zip("weball", period)):
        if len(f) >= 26 and f[0] in cand_ids:
            o = out[f[0]]
            o["receipts"] += num(f[5])
            o["indiv"] += num(f[17])
            o["pac"] += num(f[25])
    org = {}
    for f in lines(fetch_zip("cm", period)):
        if len(f) >= 13:
            org[f[0]] = f[12]
    for f in lines(fetch_zip("pas2", period)):
        if len(f) < 17 or f[16] not in cand_ids or f[5] not in ("24K", "24Z"):
            continue
        kind = org.get(f[0], "")
        amt = num(f[14])
        if kind in CORPORATE:
            out[f[16]]["corp"] += amt
        elif kind in TRADE:
            out[f[16]]["trade"] += amt
        elif kind in LABOR:
            out[f[16]]["labor"] += amt
    log.info("FEC %s: %d of our candidate IDs found", period, len(out))
    return out


def main() -> None:
    today = date.today()
    members = load_members(today)
    plan = {}
    need: dict[int, set[str]] = defaultdict(set)
    for m in members:
        prefix = "S" if m["chamber"] == "Senate" else "H"
        ids = [i for i in m["fec"] if i.startswith(prefix)]
        if not ids:
            continue
        sp = spans(m, today)
        plan[m["id"]] = (ids, sp)
        for periods in sp.values():
            for p in periods:
                need[p].update(ids)
    periods = {}
    for p in sorted(need):
        try:
            periods[p] = read_period(p, need[p])
        except Exception as e:
            log.info("FEC %s failed: %s", p, e)
    result = {}
    for mid, (ids, sp) in plan.items():
        rec = {}
        for label, plist in sp.items():
            if not all(p in periods for p in plist):
                continue
            tot = defaultdict(float)
            for p in plist:
                for cid in ids:
                    for k, v in periods[p].get(cid, {}).items():
                        tot[k] += v
            if tot:
                rec[label] = {k: round(v) for k, v in tot.items()} | {"years": f"{plist[0] - 1}-{plist[-1]}"}
        if rec:
            result[mid] = rec
    if result:
        save_json(SOURCES / "fec.json", {"updated": now_iso(), "members": result})
    log.info("FEC: totals for %d members", len(result))


if __name__ == "__main__":
    main()
