"""Current voting members of Congress from the official congress-legislators dataset.

Non-voting delegates (DC, PR, GU, VI, AS, MP) are left out.
"""
from __future__ import annotations

from datetime import date

import yaml

from common import CACHE, LEGISLATORS_URL, get, log

PARTY_CODE = {"Democrat": "D", "Republican": "R", "Independent": "I"}
VOTING = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
}


def age_on(birthday: str | None, today: date) -> int | None:
    if not birthday:
        return None
    y, m, d = map(int, birthday.split("-"))
    return today.year - y - ((today.month, today.day) < (m, d))


def seat_since(terms: list[dict]) -> str:
    """Start of the unbroken run of terms in the current chamber (gaps over ~4 months count as a break)."""
    chamber = terms[-1]["type"]
    start = terms[-1]["start"]
    for prev, nxt in zip(reversed(terms[:-1]), reversed(terms[1:])):
        if prev["type"] != chamber:
            break
        if (date.fromisoformat(nxt["start"]) - date.fromisoformat(prev["end"])).days > 120:
            break
        start = prev["start"]
    return start


def years_served(terms: list[dict], today: date) -> float:
    days = 0
    for t in terms:
        s, e = date.fromisoformat(t["start"]), min(date.fromisoformat(t["end"]), today)
        days += max(0, (e - s).days)
    return round(days / 365.25, 1)


def load_members(today: date | None = None) -> list[dict]:
    today = today or date.today()
    cache = CACHE / "legislators-current.yaml"
    try:
        text = get(LEGISLATORS_URL).text
        cache.write_text(text)
    except Exception as e:  # keep working from the last copy
        log.info("legislators download failed (%s); using cached copy", e)
        text = cache.read_text()
    out = []
    for r in yaml.safe_load(text):
        terms = r["terms"]
        cur = terms[-1]
        if cur["state"] not in VOTING:
            continue
        name = r["name"]
        out.append({
            "id": r["id"]["bioguide"],
            "name": name.get("official_full") or f'{name["first"]} {name["last"]}',
            "first": name.get("nickname") or name["first"],
            "last": name["last"],
            "chamber": "Senate" if cur["type"] == "sen" else "House",
            "state": cur["state"],
            "district": cur.get("district") if cur["type"] == "rep" else None,
            "party": PARTY_CODE.get(cur.get("party"), "I"),
            "caucus": PARTY_CODE.get(cur.get("caucus") or cur.get("party"), "I"),
            "gender": r["bio"].get("gender"),
            "birthday": r["bio"].get("birthday"),
            "age": age_on(r["bio"].get("birthday"), today),
            "houseTerms": sum(1 for t in terms if t["type"] == "rep"),
            "senateTerms": sum(1 for t in terms if t["type"] == "sen"),
            "yearsInCongress": years_served(terms, today),
            "firstTookOffice": terms[0]["start"],
            "seatSince": seat_since(terms),
            "termStart": cur["start"],
            "termEnd": cur["end"],
            "senateClass": cur.get("class"),
            "url": cur.get("url"),
            "fec": r["id"].get("fec", []),
            "icpsr": r["id"].get("icpsr"),
            "wikidata": r["id"].get("wikidata"),
            "wikipedia": r["id"].get("wikipedia"),
        })
    out.sort(key=lambda m: (m["state"], m["chamber"] != "Senate", m["district"] or 0))
    log.info("members: %d voting members", len(out))
    return out
