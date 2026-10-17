"""Estimated gain on disclosed stock purchases, per member.

For each disclosed purchase we take the midpoint of the reported dollar range, then compare the
stock's price on the purchase date with its price when the member later disclosed selling that
stock (or today's price if no later sale was disclosed). Prices are weekly closes from Yahoo
Finance, with Stooq as a fallback. This is an estimate: disclosures give dollar ranges, not exact
amounts, and partial sales are treated as full exits.

Reads data/sources/trades_rows.json, writes data/sources/gains.json.
"""
from __future__ import annotations

import bisect
import csv
import io
import time
from collections import defaultdict
from datetime import date, datetime, timezone

from common import CACHE, SOURCES, get, load_json, log, now_iso, save_json

PRICE_DIR = CACHE / "prices"
PRICE_DIR.mkdir(parents=True, exist_ok=True)
MAX_AGE_DAYS = 6


def _yahoo(t: str) -> list[tuple[str, float]]:
    sym = t.replace(".", "-")
    r = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}", params={"range": "15y", "interval": "1wk"},
            headers={"User-Agent": "Mozilla/5.0"}, tries=2, timeout=30)
    res = r.json()["chart"]["result"][0]
    closes = res["indicators"]["adjclose"][0]["adjclose"] if res["indicators"].get("adjclose") else res["indicators"]["quote"][0]["close"]
    out = []
    for ts, c in zip(res["timestamp"], closes):
        if c:
            out.append((datetime.fromtimestamp(ts, timezone.utc).date().isoformat(), float(c)))
    return out


def _stooq(t: str) -> list[tuple[str, float]]:
    r = get(f"https://stooq.com/q/d/l/", params={"s": f"{t.lower()}.us", "i": "w"}, tries=2, timeout=30)
    rows = list(csv.DictReader(io.StringIO(r.text)))
    return [(x["Date"], float(x["Close"])) for x in rows if x.get("Close") not in (None, "", "null")]


def prices(ticker: str) -> list[tuple[str, float]] | None:
    f = PRICE_DIR / f"{ticker.replace('/', '_')}.csv"
    if f.exists() and (time.time() - f.stat().st_mtime) < MAX_AGE_DAYS * 86400:
        rows = [(a, float(b)) for a, b in csv.reader(f.open())]
        return rows or None
    data = []
    for src in (_yahoo, _stooq):
        try:
            data = src(ticker)
            if data:
                break
        except Exception:
            continue
    with f.open("w", newline="") as fh:
        csv.writer(fh).writerows(data)
    time.sleep(0.4)
    return data or None


def price_on(series: list[tuple[str, float]], d: str) -> float | None:
    dates = [x[0] for x in series]
    i = bisect.bisect_right(dates, d) - 1
    if i < 0:
        return None
    return series[i][1]


def estimate(rows: list[list], price_fn) -> dict:
    """rows: [bioguide, date, ticker, type, low, high]. price_fn(ticker) -> sorted [(date, close)] or None."""
    today = date.today().isoformat()
    by_member = defaultdict(lambda: defaultdict(list))
    for bid, d, t, typ, low, high in rows:
        by_member[bid][t].append((d, typ, low, high))
    out = {}
    for bid, tickers in by_member.items():
        gain = basis = 0.0
        priced = total = 0
        for t, txns in tickers.items():
            txns.sort()
            buys = [x for x in txns if x[1] == "purchase"]
            if not buys:
                continue
            total += len(buys)
            series = price_fn(t)
            if not series:
                continue
            sells = [x[0] for x in txns if x[1] in ("sale", "partial_sale")]
            for d, _, low, high in buys:
                if low is None:
                    continue
                mid = (low + (high or low)) / 2
                exit_d = next((s for s in sells if s > d), today)
                p0, p1 = price_on(series, d), price_on(series, exit_d)
                if not p0 or not p1:
                    continue
                gain += mid * (p1 / p0 - 1)
                basis += mid
                priced += 1
        if total:
            out[bid] = {"estGain": round(gain), "basis": round(basis), "priced": priced, "purchases": total}
    return out


def main() -> None:
    rows = load_json(CACHE / "trades_rows.json", {}).get("rows", [])
    if not rows:
        log.info("gains: no trade rows; run trades.py first")
        return
    tickers = sorted({r[2] for r in rows if r[3] == "purchase"})
    log.info("gains: fetching prices for %d tickers", len(tickers))
    cache: dict[str, list | None] = {}
    ok = 0
    for i, t in enumerate(tickers, 1):
        cache[t] = prices(t)
        ok += bool(cache[t])
        if i % 200 == 0:
            log.info("  %d/%d tickers (%d with prices)", i, len(tickers), ok)
    if ok < len(tickers) * 0.3:
        log.info("gains: only %d/%d tickers priced; keeping previous estimates", ok, len(tickers))
        return
    est = estimate(rows, lambda t: cache.get(t))
    save_json(SOURCES / "gains.json", {"updated": now_iso(), "tickersPriced": ok, "tickers": len(tickers), "members": est})
    log.info("gains: estimates for %d members", len(est))


if __name__ == "__main__":
    main()
