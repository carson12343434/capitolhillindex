"""Combine every member source into data/members.js for the site.

Inputs (each written by its own script, so one failing source never blanks the others):
  legislators.py      who serves now, age, terms, dates
  data/sources/trades.json     trade counts, late filings, trading volume, recent trades
  data/sources/gains.json      estimated gain on disclosed stock purchases
  data/sources/fec.json        PAC, corporate PAC and total receipts
  data/sources/education.json  colleges and degrees
"""
from __future__ import annotations

from common import DATA, SOURCES, load_json, log, now_iso, write_js
from legislators import load_members

RANK = {"PhD": 5, "MD": 5, "JD": 5, "MA": 4, "MS": 4, "MBA": 4, "BA": 3, "BS": 3, "Bachelor's": 3, "AA": 2, "GED": 1}


def edu_record(o: dict) -> dict:
    items = o["list"]
    top = max(items, key=lambda x: (RANK.get(x.get("degree") or "", 0), x.get("year") or 0))
    label = top["degree"] if top.get("degree") == "GED" else f'{top["degree"]}, {top["school"]}' if top.get("degree") else top["school"]
    return {"list": items, "top": label, "source": o.get("source")}


def main() -> None:
    members = load_members()
    trades = load_json(SOURCES / "trades.json", {})
    gains = load_json(SOURCES / "gains.json", {})
    fec = load_json(SOURCES / "fec.json", {})
    edu = load_json(SOURCES / "education.json", {})
    covered = trades.get("covered", {})
    over = load_json(DATA / "static" / "member_overrides.json", {})
    credits = load_json(SOURCES / "photo_credits.json", {})
    out = []
    for m in members:
        bid = m["id"]
        rec = {k: m[k] for k in ("id", "name", "first", "last", "chamber", "state", "district", "party", "caucus", "gender", "age",
                                 "birthday", "houseTerms", "senateTerms", "yearsInCongress", "firstTookOffice", "seatSince",
                                 "termStart", "termEnd", "url")}
        t = trades.get("members", {}).get(bid)
        if t is None and covered.get(m["chamber"]):
            t = {"total": 0, "term": 0, "late": 0, "volLow": 0, "volHigh": 0, "buys": 0, "sells": 0, "lastTrade": None, "recent": []}
        # A senator who served in the House has House trades even though Senate coverage is missing;
        # those are real but incomplete, so flag them.
        if t is not None and m["chamber"] == "Senate" and not covered.get("Senate"):
            t = {**t, "partial": True}
        rec["trades"] = t
        rec["gains"] = gains.get("members", {}).get(bid)
        rec["fec"] = fec.get("members", {}).get(bid)
        fec_ids = (rec["fec"] or {}).pop("ids", None) if rec["fec"] else None
        rec["edu"] = edu.get("members", {}).get(bid)
        if not rec["edu"] and bid in over.get("education", {}):
            rec["edu"] = edu_record(over["education"][bid])
        if bid in over.get("notes", {}):
            rec["fecNote"] = over["notes"][bid]
        if (credits.get(bid) or {}).get("credit"):
            rec["photoCredit"] = credits[bid]["credit"]
        prefix = "S" if m["chamber"] == "Senate" else "H"
        rec["fecId"] = next((i for i in reversed(m["fec"] or fec_ids or []) if i.startswith(prefix)), None)
        rec["upIn2026"] = m["chamber"] == "House" or m["termEnd"][:4] in ("2026", "2027")
        out.append(rec)
    payload = {
        "generated": now_iso(),
        "sources": {
            "trades": {"updated": trades.get("updated"), "throughHouse": trades.get("throughHouse"), "covered": covered},
            "gains": {"updated": gains.get("updated")},
            "fec": {"updated": fec.get("updated")},
            "education": {"updated": edu.get("updated")},
        },
        "members": out,
    }
    write_js(DATA / "members.js", "CHI_MEMBERS", payload)
    log.info("members: %d written", len(out))


if __name__ == "__main__":
    main()
