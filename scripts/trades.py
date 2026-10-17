"""Stock trades disclosed under the STOCK Act, summarized per member.

House: congresskit (github.com/kovagent/congresskit), parsed nightly from House Clerk periodic
transaction reports and joined to bioguide IDs. Senate: best-effort pull from the Senate's eFD
site (see senate_trades.py), which often blocks cloud servers.

Writes data/sources/trades.json and data/sources/trades_rows.json (rows used by gains.py).
"""
from __future__ import annotations

import io
from collections import defaultdict
from datetime import date

import pandas as pd

from common import CACHE, SOURCES, STOCK_ACT, get, load_json, log, now_iso, save_json, ymd
from legislators import load_members

CK_RAW = "https://raw.githubusercontent.com/kovagent/congresskit/main/data/year={y}/congress-{y}.parquet"
LATE_DAYS = 45
RECENT_N = 15


def house_rows() -> pd.DataFrame:
    frames = []
    for y in range(2015, date.today().year + 1):  # congresskit coverage starts in 2015
        try:
            r = get(CK_RAW.format(y=y), timeout=120)
            frames.append(pd.read_parquet(io.BytesIO(r.content)))
        except Exception as e:
            log.info("  congresskit %s: %s", y, e)
    if not frames:
        raise RuntimeError("no House trade files downloaded")
    df = pd.concat(frames, ignore_index=True)
    df = df.drop_duplicates(subset=["doc_id", "txn_date", "ticker", "asset_description", "txn_type", "amount_low", "amount_high", "owner"])
    log.info("House trade rows: %d", len(df))
    return df


def summarize(members: list[dict], rows: list[dict], source: str) -> dict:
    by_id = {m["id"]: m for m in members}
    agg = defaultdict(lambda: {"total": 0, "term": 0, "late": 0, "volLow": 0, "volHigh": 0, "buys": 0, "sells": 0, "recent": []})
    for t in rows:
        m = by_id.get(t["bioguide"])
        if not m or not t["txn"]:
            continue
        start = max(date.fromisoformat(m["firstTookOffice"]), STOCK_ACT)
        if t["txn"] < start:
            continue
        a = agg[m["id"]]
        a["total"] += 1
        if t["txn"] >= date.fromisoformat(m["termStart"]):
            a["term"] += 1
        if t["filed"] and (t["filed"] - t["txn"]).days > LATE_DAYS:
            a["late"] += 1
        a["volLow"] += t["low"] or 0
        a["volHigh"] += t["high"] or 0
        if t["type"] == "purchase":
            a["buys"] += 1
        elif "sale" in (t["type"] or ""):
            a["sells"] += 1
        a["recent"].append(t)
    out = {}
    for mid, a in agg.items():
        rec = sorted(a.pop("recent"), key=lambda t: t["txn"], reverse=True)[:RECENT_N]
        a["lastTrade"] = rec[0]["txn"].isoformat() if rec else None
        a["recent"] = [[t["txn"].isoformat(), t["ticker"] or "", (t["asset"] or "")[:70], t["type"], t["low"], t["high"], t["owner"] or ""] for t in rec]
        a["source"] = source
        out[mid] = a
    return out


def main() -> None:
    members = load_members()
    house = []
    df = house_rows()
    for r in df.itertuples(index=False):
        house.append({"bioguide": r.bioguide_id, "txn": ymd(r.txn_date), "filed": ymd(r.filing_date), "ticker": r.ticker,
                      "asset": r.asset_description, "assetType": r.asset_type, "type": r.txn_type,
                      "low": int(r.amount_low) if r.amount_low == r.amount_low else None,
                      "high": int(r.amount_high) if r.amount_high == r.amount_high else None, "owner": r.owner})
    summary = summarize(members, house, "House Clerk via congresskit")

    senate_rows = load_json(SOURCES / "senate_trades.json", {}).get("rows", [])
    if senate_rows:
        srows = [{**t, "txn": date.fromisoformat(t["txn"]), "filed": date.fromisoformat(t["filed"]) if t.get("filed") else None} for t in senate_rows]
        summary.update(summarize([m for m in members if m["chamber"] == "Senate"], srows, "Senate eFD"))

    covered = {"House": True, "Senate": bool(senate_rows)}
    save_json(SOURCES / "trades.json", {"updated": now_iso(), "covered": covered,
                                        "throughHouse": max((t["filed"] for t in house if t["filed"]), default=None).isoformat(),
                                        "members": summary})
    # Rows for the gains estimate: purchases and sales of listed stock, members only.
    ids = {m["id"] for m in members}
    keep = [[t["bioguide"], t["txn"].isoformat(), t["ticker"], t["type"], t["low"], t["high"]] for t in house
            if t["bioguide"] in ids and t["txn"] and t["ticker"] and (t["assetType"] in ("stock", "other", None)) and t["type"] in ("purchase", "sale", "partial_sale")]
    save_json(CACHE / "trades_rows.json", {"updated": now_iso(), "rows": keep})
    log.info("trades: %d members with trades; %d rows kept for gains", len(summary), len(keep))


if __name__ == "__main__":
    main()
