"""Turn the official congress-legislators YAML into a compact member list.

Source: https://github.com/unitedstates/congress-legislators (legislators-current.yaml)
Usage:  python build_members.py legislators-current.yaml members.json
"""
import json
import sys
from datetime import date

import yaml

PARTY_CODE = {"Democrat": "D", "Republican": "R", "Independent": "I"}
VOTING_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY",
    "LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
    "OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
}


def age_on(birthday: str, today: date) -> int | None:
    if not birthday:
        return None
    y, m, d = map(int, birthday.split("-"))
    return today.year - y - ((today.month, today.day) < (m, d))


def current_stint_start(terms: list[dict]) -> str:
    """Start date of the unbroken run of terms in the current chamber.

    Gaps of more than ~120 days between one term's end and the next term's start
    count as a break (e.g. someone who left and later came back).
    """
    chamber = terms[-1]["type"]
    start = terms[-1]["start"]
    for prev, nxt in zip(reversed(terms[:-1]), reversed(terms[1:])):
        if prev["type"] != chamber:
            break
        gap = (date.fromisoformat(nxt["start"]) - date.fromisoformat(prev["end"])).days
        if gap > 120:
            break
        start = prev["start"]
    return start


def build(records: list[dict], today: date) -> list[dict]:
    members = []
    for r in records:
        terms = r["terms"]
        cur = terms[-1]
        name = r["name"]
        display = name.get("official_full") or f'{name["first"]} {name["last"]}'
        house_terms = sum(1 for t in terms if t["type"] == "rep")
        senate_terms = sum(1 for t in terms if t["type"] == "sen")
        members.append({
            "id": r["id"]["bioguide"],
            "name": display,
            "last": name["last"],
            "first": name.get("nickname") or name["first"],
            "chamber": "Senate" if cur["type"] == "sen" else "House",
            "state": cur["state"],
            "district": cur.get("district"),
            "voting": cur["state"] in VOTING_STATES,
            "party": PARTY_CODE.get(cur.get("party"), cur.get("party", "?")[:1]),
            "birthday": r["bio"].get("birthday"),
            "age": age_on(r["bio"].get("birthday"), today),
            "houseTerms": house_terms,
            "senateTerms": senate_terms,
            "firstTookOfficeAny": terms[0]["start"],
            "currentSeatSince": current_stint_start(terms),
            "currentTermStart": cur["start"],
            "currentTermEnd": cur["end"],
            "fecIds": r["id"].get("fec", []),
            "wikidata": r["id"].get("wikidata"),
            "url": cur.get("url"),
            # Filled by fetch_data.py; None means "not loaded yet", never zero.
            "education": None,
            "tradesTotal": None,
            "tradesThisTerm": None,
            "tradesLate": None,
            "pacDollars": None,
            "corpPacDollars": None,
            "totalReceipts": None,
            "financeCycle": None,
        })
    members.sort(key=lambda m: (m["state"], m["chamber"] != "Senate", m["district"] or 0))
    return members


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    with open(src) as f:
        records = yaml.safe_load(f)
    members = build(records, date.today())
    with open(out, "w") as f:
        json.dump(members, f, indent=1)
    print(f"{len(members)} members -> {out}")
