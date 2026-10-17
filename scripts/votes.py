"""Roll call votes for the current Congress with every member's vote and the bill's sponsor.

Votes: Voteview (voteview.com, UCLA), which republishes House Clerk and Senate roll calls.
Bills, titles and sponsors: GovInfo BILLSTATUS bulk data (govinfo.gov), the official
Congress.gov record. Neither needs an API key.
Writes data/votes.js. Bill details are cached in data/sources/bills.json.
"""
from __future__ import annotations

import csv
import io
import re
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date

from common import DATA, SOURCES, get, load_json, log, now_iso, save_json, write_js
from legislators import load_members

VV = "https://voteview.com/static/data/out/{kind}/{ch}{n}_{kind}.csv"
GOVINFO = "https://www.govinfo.gov/bulkdata/BILLSTATUS/{n}/{t}/BILLSTATUS-{n}{t}{num}.xml"
TYPES = {  # voteview prefix -> (govinfo type, congress.gov path, display)
    "HR": ("hr", "house-bill", "H.R."), "HRES": ("hres", "house-resolution", "H.Res."),
    "HJRES": ("hjres", "house-joint-resolution", "H.J.Res."), "HCONRES": ("hconres", "house-concurrent-resolution", "H.Con.Res."),
    "S": ("s", "senate-bill", "S."), "SRES": ("sres", "senate-resolution", "S.Res."),
    "SJRES": ("sjres", "senate-joint-resolution", "S.J.Res."), "SCONRES": ("sconres", "senate-concurrent-resolution", "S.Con.Res."),
}
PARTY = {"100": "D", "200": "R", "328": "I"}


def congress_number(today: date) -> int:
    return (today.year - 1789) // 2 + 1


def ordinal(n: int) -> str:
    return f"{n}{'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def read_csv(kind: str, ch: str, n: int) -> list[dict]:
    r = get(VV.format(kind=kind, ch=ch, n=n), timeout=180)
    return list(csv.DictReader(io.StringIO(r.text)))


def cast(code: str) -> str:
    c = int(float(code or 0))
    return "Y" if 1 <= c <= 3 else "N" if 4 <= c <= 6 else "P" if c in (7, 8) else "-" if c == 9 else " "


def parse_bill(num: str) -> tuple[str, int] | None:
    m = re.fullmatch(r"([A-Z]+)(\d+)", (num or "").replace(" ", "").replace(".", "").upper())
    if not m or m.group(1) not in TYPES:
        return None
    return m.group(1), int(m.group(2))


def bill_info(n: int, prefix: str, num: int) -> dict | None:
    gt, path, disp = TYPES[prefix]
    try:
        xml = get(GOVINFO.format(n=n, t=gt, num=num), tries=2, timeout=60).content
    except Exception as e:
        log.info("  bill %s%s: %s", prefix, num, e)
        return None
    root = ET.fromstring(xml)
    bill = root.find(".//bill") if root.find(".//bill") is not None else root
    title = bill.findtext("title") or bill.findtext(".//titles/item/title") or ""
    sp = bill.find(".//sponsors/item")
    sponsor = None
    if sp is not None:
        sponsor = {"id": sp.findtext("bioguideId"), "name": re.sub(r"\s*\[.*?\]\s*$", "", sp.findtext("fullName") or "").strip(),
                   "party": sp.findtext("party"), "state": sp.findtext("state"), "district": sp.findtext("district")}
    return {"title": title.strip(), "sponsor": sponsor, "cosponsors": len(bill.findall(".//cosponsors/item")),
            "policy": bill.findtext(".//policyArea/name"), "label": f"{disp} {num}",
            "url": f"https://www.congress.gov/bill/{ordinal(n)}-congress/{path}/{num}"}


def main() -> None:
    n = congress_number(date.today())
    bills = load_json(SOURCES / "bills.json", {})
    out_votes, chambers = [], {}
    names = {m["id"]: m["name"] for m in load_members()}
    for ch, name in (("H", "House"), ("S", "Senate")):
        try:
            rolls = read_csv("rollcalls", ch, n)
            votes = read_csv("votes", ch, n)
            mems = read_csv("members", ch, n)
        except Exception as e:
            log.info("Voteview %s unavailable: %s", name, e)
            continue
        mems = [m for m in mems if m.get("chamber", name) != "President"]
        order = sorted({m["icpsr"] for m in mems}, key=lambda i: next((m["bioname"] for m in mems if m["icpsr"] == i), ""))
        pos = {icpsr: i for i, icpsr in enumerate(order)}
        info = {m["icpsr"]: m for m in mems}
        chambers[name] = {"members": [{"id": info[i].get("bioguide_id") or "", "name": names.get(info[i].get("bioguide_id"), info[i].get("bioname", "")),
                                       "current": info[i].get("bioguide_id") in names,
                                       "party": PARTY.get(info[i].get("party_code", ""), "I"), "state": info[i].get("state_abbrev", ""),
                                       "district": info[i].get("district_code", "")} for i in order]}
        grid = defaultdict(lambda: [" "] * len(order))
        for v in votes:
            if v["icpsr"] in pos:
                grid[v["rollnumber"]][pos[v["icpsr"]]] = cast(v["cast_code"])
        for r in rolls:
            b = parse_bill(r.get("bill_number"))
            key = f"{b[0]}{b[1]}" if b else None
            if key and key not in bills:
                bi = bill_info(n, *b)
                if bi:
                    bills[key] = bi
                time.sleep(0.25)
            bi = bills.get(key) if key else None
            out_votes.append({
                "c": ch, "roll": int(r["rollnumber"]), "date": r["date"], "session": r.get("session"),
                "bill": bi["label"] if bi else (r.get("bill_number") or ""), "q": r.get("vote_question") or "",
                "result": r.get("vote_result") or "", "desc": (r.get("vote_desc") or r.get("dtl_desc") or "")[:400],
                "yea": int(float(r.get("yea_count") or 0)), "nay": int(float(r.get("nay_count") or 0)),
                "title": bi["title"] if bi else "", "sponsor": bi["sponsor"] if bi else None,
                "cos": bi["cosponsors"] if bi else None, "policy": bi.get("policy") if bi else None, "url": bi["url"] if bi else None,
                "v": "".join(grid[r["rollnumber"]]),
            })
        log.info("Voteview %s: %d roll calls, %d members", name, len(rolls), len(order))
    if not out_votes:
        log.info("votes: nothing downloaded; keeping the previous file")
        return
    save_json(SOURCES / "bills.json", bills)
    out_votes.sort(key=lambda v: (v["date"], v["c"], v["roll"]), reverse=True)
    write_js(DATA / "votes.js", "CHI_VOTES", {"generated": now_iso(), "congress": n, "chambers": chambers, "votes": out_votes})


if __name__ == "__main__":
    main()
