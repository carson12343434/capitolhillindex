"""Build data.js for the Congress Financial Integrity tracker.

What it pulls
  Members, age, terms, party, state   congress-legislators (GitHub)          no key
  Education (schools + degrees)       Wikidata SPARQL                         no key
  PAC + total receipts                FEC API (api.open.fec.gov)              FEC_API_KEY
  Corporate-PAC dollars (optional)    FEC itemized receipts, --corporate      FEC_API_KEY
  Stock trades                        Quiver Quantitative bulk API            QUIVER_API_KEY
                                      else House/Senate Stock Watcher (free, may be stale)

Usage
  pip install requests pyyaml
  export FEC_API_KEY=...        # free: https://api.open.fec.gov/developers/
  export QUIVER_API_KEY=...     # optional: https://www.quiverquant.com/
  python fetch_data.py                      # everything it can reach
  python fetch_data.py --skip-fec           # skip a source
  python fetch_data.py --corporate          # also split out corporate PACs (slow, many calls)

Any field a source can't fill stays null, and the site shows it as "not loaded",
never as zero.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timezone

import requests
import yaml

from build_members import build

LEGISLATORS_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml"
WIKIDATA_URL = "https://query.wikidata.org/sparql"
FEC_BASE = "https://api.open.fec.gov/v1"
QUIVER_URL = "https://api.quiverquant.com/beta/bulk/congresstrading"
HOUSE_SW_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json"
SENATE_SW_URL = "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json"

UA = {"User-Agent": "congress-integrity-tracker/1.0 (student project)"}
LATE_DAYS = 45  # STOCK Act: report within 45 days of the transaction
CORPORATE_ORG_TYPES = {"C", "W"}  # FEC: corporation, corporation w/o capital stock

session = requests.Session()
session.headers.update(UA)


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def get_json(url: str, params: dict | None = None, headers: dict | None = None, tries: int = 5):
    for attempt in range(tries):
        r = session.get(url, params=params, headers=headers, timeout=60)
        if r.status_code == 429:  # rate limited: back off
            wait = 2 ** attempt * 5
            log(f"  rate limited, waiting {wait}s")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"gave up on {url}")


# ---------------------------------------------------------------- members
def load_members() -> list[dict]:
    log("Members: downloading congress-legislators")
    r = session.get(LEGISLATORS_URL, timeout=60)
    r.raise_for_status()
    return build(yaml.safe_load(r.text), date.today())


# ---------------------------------------------------------------- education
EDU_QUERY = """
SELECT ?person ?schoolLabel ?degreeLabel WHERE {
  VALUES ?person { %s }
  ?person p:P69 ?st . ?st ps:P69 ?school .
  OPTIONAL { ?st pq:P512 ?degree . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}"""


def add_education(members: list[dict]) -> None:
    log("Education: querying Wikidata")
    by_qid = {m["wikidata"]: m for m in members if m["wikidata"]}
    qids = list(by_qid)
    found = defaultdict(dict)  # qid -> {school: set(degrees)}
    for i in range(0, len(qids), 80):
        values = " ".join(f"wd:{q}" for q in qids[i:i + 80])
        data = get_json(WIKIDATA_URL, {"query": EDU_QUERY % values, "format": "json"})
        for row in data["results"]["bindings"]:
            qid = row["person"]["value"].rsplit("/", 1)[-1]
            school = row["schoolLabel"]["value"]
            degrees = found[qid].setdefault(school, set())
            if "degreeLabel" in row:
                degrees.add(row["degreeLabel"]["value"])
        time.sleep(1)
    for qid, m in by_qid.items():
        schools = found.get(qid, {})
        # Wikidata lists high schools too; keep them, the site labels the list "Education".
        m["education"] = [{"school": s, "degrees": sorted(d)} for s, d in schools.items()]
    log(f"  education for {sum(1 for m in members if m['education'])} members")


# ---------------------------------------------------------------- FEC
def current_cycle(today: date) -> int:
    return today.year + (today.year % 2)


def add_fec(members: list[dict], key: str, cycle: int, corporate: bool) -> None:
    log(f"Campaign finance: FEC API, {cycle} cycle")
    org_type_cache: dict[str, str | None] = {}
    for n, m in enumerate(members, 1):
        prefix = "S" if m["chamber"] == "Senate" else "H"
        ids = [i for i in m["fecIds"] if i.startswith(prefix)] or m["fecIds"]
        if not ids:
            continue
        cand = ids[-1]
        try:
            data = get_json(f"{FEC_BASE}/candidate/{cand}/totals/",
                            {"api_key": key, "cycle": cycle, "per_page": 1})
            rows = data.get("results", [])
            if rows:
                t = rows[0]
                m["totalReceipts"] = t.get("receipts")
                m["pacDollars"] = t.get("other_political_committee_contributions")
                m["financeCycle"] = cycle
            if corporate:
                m["corpPacDollars"] = corporate_pac_total(cand, key, cycle, org_type_cache)
        except Exception as e:  # keep going; one bad record shouldn't stop the run
            log(f"  {m['name']}: {e}")
        if n % 50 == 0:
            log(f"  {n}/{len(members)}")
        time.sleep(0.2)


def corporate_pac_total(cand: str, key: str, cycle: int, cache: dict) -> float | None:
    comms = get_json(f"{FEC_BASE}/candidate/{cand}/committees/",
                     {"api_key": key, "designation": "P", "cycle": cycle})
    if not comms.get("results"):
        return None
    committee_id = comms["results"][0]["committee_id"]
    params = {"api_key": key, "committee_id": committee_id, "two_year_transaction_period": cycle,
              "is_individual": "false", "per_page": 100}
    total = 0.0
    while True:
        page = get_json(f"{FEC_BASE}/schedules/schedule_a/", params)
        for rec in page.get("results", []):
            cid = rec.get("contributor_id")
            if not cid or not cid.startswith("C"):
                continue
            org = (rec.get("contributor") or {}).get("organization_type")
            if org is None:
                if cid not in cache:
                    info = get_json(f"{FEC_BASE}/committee/{cid}/", {"api_key": key})
                    res = info.get("results") or [{}]
                    cache[cid] = res[0].get("organization_type")
                org = cache[cid]
            if org in CORPORATE_ORG_TYPES:
                total += rec.get("contribution_receipt_amount") or 0
        last = (page.get("pagination") or {}).get("last_indexes")
        if not last or not page.get("results"):
            return total
        params.update(last)


# ---------------------------------------------------------------- trades
def norm(s: str) -> str:
    s = re.sub(r"\b(hon|mr|mrs|ms|dr|jr|sr|ii|iii|iv)\b\.?", " ", s.lower())
    return re.sub(r"[^a-z ]", " ", s).split()


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:19], fmt).date()
        except ValueError:
            pass
    return None


def trades_quiver(key: str) -> list[dict]:
    log("Trades: Quiver Quantitative bulk feed")
    rows = get_json(QUIVER_URL, headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    return [{
        "bioguide": r.get("BioGuideID"),
        "name": r.get("Representative") or r.get("Name"),
        "chamber": "Senate" if (r.get("House") or "").lower().startswith("sen") else "House",
        "state": None,
        "txn": parse_date(r.get("TransactionDate")),
        "filed": parse_date(r.get("ReportDate")),
    } for r in rows]


def trades_stockwatcher() -> list[dict]:
    log("Trades: House/Senate Stock Watcher (free; check how current it is)")
    out = []
    for r in get_json(HOUSE_SW_URL):
        out.append({"bioguide": None, "name": r.get("representative", ""), "chamber": "House",
                    "state": (r.get("district") or "")[:2] or None,
                    "txn": parse_date(r.get("transaction_date")), "filed": parse_date(r.get("disclosure_date"))})
    for r in get_json(SENATE_SW_URL):
        name = r.get("senator") or f"{r.get('first_name', '')} {r.get('last_name', '')}"
        out.append({"bioguide": None, "name": name, "chamber": "Senate", "state": None,
                    "txn": parse_date(r.get("transaction_date")), "filed": parse_date(r.get("disclosure_date"))})
    return out


def match_member(t: dict, by_id: dict, index: dict) -> dict | None:
    if t["bioguide"] and t["bioguide"] in by_id:
        return by_id[t["bioguide"]]
    words = norm(t["name"] or "")
    if not words:
        return None
    cands = index.get((t["chamber"], words[-1]), [])
    if t["state"]:
        cands = [c for c in cands if c["state"] == t["state"]]
    if len(cands) > 1:
        cands = [c for c in cands if norm(c["first"])[:1] and norm(c["first"])[0][0] == words[0][0]]
    return cands[0] if len(cands) == 1 else None  # ambiguous -> skip rather than guess


def add_trades(members: list[dict], trades: list[dict]) -> None:
    by_id = {m["id"]: m for m in members}
    index = defaultdict(list)
    for m in members:
        index[(m["chamber"], norm(m["last"])[-1])].append(m)
    counts = {m["id"]: {"total": 0, "term": 0, "late": 0} for m in members}
    unmatched = 0
    for t in trades:
        m = match_member(t, by_id, index)
        if not m or not t["txn"]:
            unmatched += 1
            continue
        if t["txn"] < date.fromisoformat(m["firstTookOfficeAny"]):
            continue
        c = counts[m["id"]]
        c["total"] += 1
        if t["txn"] >= date.fromisoformat(m["currentTermStart"]):
            c["term"] += 1
        if t["filed"] and (t["filed"] - t["txn"]).days > LATE_DAYS:
            c["late"] += 1
    for m in members:
        c = counts[m["id"]]
        m["tradesTotal"], m["tradesThisTerm"], m["tradesLate"] = c["total"], c["term"], c["late"]
    log(f"  matched {len(trades) - unmatched} of {len(trades)} trade records")


# ---------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="data.js")
    ap.add_argument("--cycle", type=int, default=current_cycle(date.today()))
    ap.add_argument("--skip-education", action="store_true")
    ap.add_argument("--skip-fec", action="store_true")
    ap.add_argument("--skip-trades", action="store_true")
    ap.add_argument("--corporate", action="store_true", help="split out corporate PAC dollars (slow)")
    args = ap.parse_args()

    members = load_members()
    sources = {"members": "unitedstates/congress-legislators"}

    if not args.skip_education:
        try:
            add_education(members)
            sources["education"] = "Wikidata (educated at / academic degree)"
        except Exception as e:
            log(f"Education skipped: {e}")

    fec_key = os.environ.get("FEC_API_KEY")
    if not args.skip_fec:
        if fec_key:
            add_fec(members, fec_key, args.cycle, args.corporate)
            sources["finance"] = f"FEC candidate totals, {args.cycle} cycle"
        else:
            log("Finance skipped: set FEC_API_KEY (free at api.open.fec.gov/developers)")

    if not args.skip_trades:
        try:
            qkey = os.environ.get("QUIVER_API_KEY")
            trades = trades_quiver(qkey) if qkey else trades_stockwatcher()
            add_trades(members, trades)
            sources["trades"] = "Quiver Quantitative" if qkey else "House/Senate Stock Watcher"
            dates = [t["txn"] for t in trades if t["txn"]]
            if dates:
                sources["tradesThrough"] = max(dates).isoformat()
        except Exception as e:
            log(f"Trades skipped: {e}")

    payload = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "sources": sources, "members": members}
    with open(args.out, "w") as f:
        f.write("window.CONGRESS_DATA = ")
        json.dump(payload, f, separators=(",", ":"))
        f.write(";\n")
    log(f"Wrote {len(members)} members -> {args.out}")


if __name__ == "__main__":
    main()
