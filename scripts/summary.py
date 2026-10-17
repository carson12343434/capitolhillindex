"""Small data file for the home page: headline numbers plus each state's delegation."""
from __future__ import annotations

from common import DATA, log, now_iso, read_js, write_js


def main() -> None:
    mem = read_js(DATA / "members.js", {}) or {}
    polls = read_js(DATA / "polls.js", {}) or {}
    votes = read_js(DATA / "votes.js", {}) or {}
    members = mem.get("members", [])
    traders = sorted((m for m in members if m.get("trades") and m["trades"]["total"]), key=lambda m: -m["trades"]["term"])[:5]
    out = {
        "generated": now_iso(),
        "delegations": [[m["id"], m["name"], m["party"], m["state"], m["chamber"], m.get("district")] for m in members],
        "traders": [{"id": m["id"], "name": m["name"], "party": m["party"], "state": m["state"], "term": m["trades"]["term"], "total": m["trades"]["total"]} for m in traders],
        "polls": None, "votes": [],
    }
    if polls:
        out["polls"] = {k: polls[k] for k in ("daysOut", "generated")} | {
            "senate": {k: polls["senate"][k] for k in ("pD", "pR", "dMean", "rMean")},
            "house": {k: polls["house"][k] for k in ("pD", "pR", "dMean", "rMean")},
            "generic": (polls["national"].get("generic") or {}).get("margin"),
            "close": [{"id": r["id"], "office": r["office"], "state": r["state"], "district": r["district"], "left": r["left"], "right": r["right"],
                       "rating": r["rating"], "slug": r["ratingSlug"], "pLeft": r["pLeft"]}
                      for r in sorted((r for r in polls["races"] if r["office"] == "SEN" and not r.get("uncontested")), key=lambda r: abs(r["pLeft"] - 0.5))[:6]],
            "races": [[r["id"], r["office"], r["state"], r["rating"], r["ratingSlug"], r["left"]["name"], r["right"]["name"]]
                      for r in polls["races"] if r["office"] in ("SEN", "GOV")],
        }
    for v in (votes.get("votes") or [])[:6]:
        out["votes"].append({k: v.get(k) for k in ("c", "roll", "date", "bill", "title", "q", "result", "yea", "nay")})
    write_js(DATA / "summary.js", "CHI_SUMMARY", out)
    log.info("summary written")


if __name__ == "__main__":
    main()
