"""2026 polling averages and forecast.

Polls: VoteHub open polling API (api.votehub.com, CC BY 4.0), fetched daily.
Races and nominees: data/static/races_2026.csv (each state's certified primary results).
Partisan lean: Cook Political Report PVI for each state and district, stored as a D-minus-R margin.

How the averages avoid partisan skew
  1. Polls paid for by a party or campaign (VoteHub's "partisan"/"internal" flags) are moved
     3 points against the sponsor and count half as much.
  2. Each pollster's house effect (how far its national polls sit from everyone else's at the
     same time) is measured and subtracted. It's shrunk toward zero for pollsters with few polls.
  3. A pollster that releases many polls is down-weighted (by the square root of its count),
     so no single firm dominates an average.
  4. Recent polls, larger samples and likely-voter polls count more.
The page shows the national average built from right-leaning pollsters only, left-leaning only
and nonpartisan only, so readers can see the adjustments working.

Forecast
  expected margin = blend of the race's poll average and a fundamentals estimate
  (national generic-ballot average + state/district lean + incumbency), weighted by precision.
  20,000 simulations share one national error, so races move together the way they do on
  election night. Ratings come from each side's win probability:
  Safe 95%+, Likely 80-95%, Lean 60-80%, Toss-up under 60%.

Projected vote share
  The expected margin is split around 50-50 after setting aside the third-party and write-in vote:
  the polled share of a named third candidate where polls include one, otherwise 2%. Undecided
  voters are assumed to split in proportion to the margin, so the two shares plus the other vote sum
  to 100. The range is the middle 80% of simulated outcomes.
Writes data/polls.js and appends to data/sources/forecast_history.json.
"""
from __future__ import annotations

import csv
import math
import re
from collections import defaultdict
from datetime import date, timedelta

import numpy as np

from common import DATA, SOURCES, STATIC, get, load_json, log, now_iso, save_json, write_js
from legislators import load_members

VOTEHUB = "https://api.votehub.com/polls"
ELECTION = date(2026, 11, 3)
N_SIMS = 20000
STATE_NAMES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO", "Connecticut": "CT",
    "Delaware": "DE", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI",
    "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN",
    "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
PRIMARY_WORDS = re.compile(r"\b(democratic|republican|primary|runoff|jungle)\b", re.I)

# model constants (margins are Democratic-side minus Republican-side, in points)
SPONSOR_SHIFT = 3.0
INCUMBENCY = {"HOUSE": 3.0, "SEN": 2.0, "GOV": 3.0}
FUND_SD = {"HOUSE": 7.0, "SEN": 9.0, "GOV": 12.0}
NATIONAL_SD = 2.5
POLL_FLOOR_SD = 4.0
HALF_LIFE = 21.0
OTHER_DEFAULT = 2.0
Z80 = 1.2816


# ---------------------------------------------------------------- helpers
def tokens(s: str) -> list[str]:
    s = re.sub(r"\(.*?\)", " ", s or "")
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", " ", s.lower())
    return re.sub(r"[^a-z\- ]", " ", s).replace("-", " ").split()


def last_name(s: str) -> str:
    t = tokens(s)
    return t[-1] if t else ""


def pdate(s) -> date | None:
    try:
        return date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def pop_weight(pop: str) -> float:
    return {"LV": 1.0, "RV": 0.85, "A": 0.6}.get((pop or "").upper(), 0.8)


def sponsor_party(p: dict) -> str:
    part = str(p.get("partisan") or "").upper()
    return "D" if part.startswith("D") else "R" if part.startswith("R") else ""


def base(p: dict) -> dict:
    n = p.get("sample_size")
    try:
        n = int(float(n))
    except (TypeError, ValueError):
        n = None
    return {"pollster": (p.get("pollster") or "").strip(), "sponsor": "; ".join(p.get("sponsors") or []),
            "party": sponsor_party(p), "internal": bool(p.get("internal")), "end": p.get("end_date"), "start": p.get("start_date"),
            "n": n, "pop": (p.get("population") or "").upper(), "url": p.get("url")}


def pollster_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower().replace("&", "and"))


# ---------------------------------------------------------------- inputs
def load_races() -> list[dict]:
    rows = list(csv.DictReader((STATIC / "races_2026.csv").open()))
    for r in rows:
        r["lean"] = float(r["lean"] or 0)
        r["special"] = r["special"] == "1"
        r["inc_running"] = r["inc_running"] == "1"
    return rows


def fetch_polls() -> list[dict]:
    """All polls, plus targeted requests per poll type in case the unfiltered list is capped."""
    cache = SOURCES / "votehub_polls.json"
    hdr = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; CapitolHillIndex/1.0)"}

    def pull(params=None) -> list[dict]:
        d = get(VOTEHUB, params=params, headers=hdr, timeout=120).json()
        return (d.get("polls") or d.get("data") or []) if isinstance(d, dict) else d

    try:
        data = pull()
        seen = {p.get("id") or (p.get("pollster"), p.get("end_date"), p.get("subject")) for p in data}
        since = (date.today() - timedelta(days=200)).isoformat()
        for t in ("generic-ballot", "approval", "us-senator", "governor", "us-representative"):
            try:
                extra = pull({"poll_type": t, "from_date": since})
            except Exception as e:
                log.info("  VoteHub %s: %s", t, e)
                continue
            added = 0
            for p in extra:
                k = p.get("id") or (p.get("pollster"), p.get("end_date"), p.get("subject"))
                if k not in seen:
                    seen.add(k)
                    data.append(p)
                    added += 1
            log.info("  VoteHub %s: %d returned, %d new", t, len(extra), added)
        # National polls change fastest; ask for just the last 30 days too, in case long requests are capped.
        recent = (date.today() - timedelta(days=30)).isoformat()
        for t in ("generic-ballot", "approval"):
            try:
                extra = pull({"poll_type": t, "from_date": recent})
            except Exception as e:
                log.info("  VoteHub %s (recent): %s", t, e)
                continue
            for p in extra:
                k = p.get("id") or (p.get("pollster"), p.get("end_date"), p.get("subject"))
                if k not in seen:
                    seen.add(k)
                    data.append(p)
        save_json(cache, data)
        stats = defaultdict(lambda: {"count": 0, "latest": ""})
        for p in data:
            st = stats[(p.get("poll_type") or "unknown").lower()]
            st["count"] += 1
            st["latest"] = max(st["latest"], p.get("end_date") or "")
        save_json(SOURCES / "poll_feed_stats.json", {"checked": now_iso(), "types": dict(stats)})
        log.info("VoteHub: %d polls", len(data))
        return data
    except Exception as e:
        log.info("VoteHub unavailable (%s); using last saved polls", e)
        return load_json(cache, [])


# ---------------------------------------------------------------- national
def national_polls(raw: list[dict]) -> tuple[list[dict], list[dict]]:
    gen, appr = [], []
    today = date.today()
    for p in raw:
        if pdate(p.get("end_date")) and pdate(p["end_date"]) > today:
            continue
        t = (p.get("poll_type") or "").lower()
        ans = {(a.get("choice") or "").lower(): a.get("pct") for a in p.get("answers") or []}
        if t == "generic-ballot":
            d = next((v for k, v in ans.items() if k.startswith("dem")), None)
            r = next((v for k, v in ans.items() if k.startswith("rep")), None)
            if d is not None and r is not None and pdate(p.get("end_date")):
                gen.append({**base(p), "d": float(d), "r": float(r), "m": float(d) - float(r)})
        elif t == "approval" and "trump" in (p.get("subject") or "").lower():
            a, dis = ans.get("approve"), ans.get("disapprove")
            if a is not None and dis is not None and pdate(p.get("end_date")):
                appr.append({**base(p), "a": float(a), "d": float(dis), "m": float(a) - float(dis)})
    return gen, appr


def residuals(polls: list[dict], window: int = 14) -> dict[str, list[float]]:
    """Each nonpartisan poll's distance from the other pollsters' average around the same date."""
    out = defaultdict(list)
    dated = [(pdate(p["end"]), p) for p in polls if not p["party"] and not p["internal"]]
    for d0, p in dated:
        others = [(q["m"], math.sqrt(min(q["n"] or 600, 3000))) for d, q in dated
                  if abs((d - d0).days) <= window and pollster_key(q["pollster"]) != pollster_key(p["pollster"])]
        if len(others) < 3:
            continue
        cons = sum(m * w for m, w in others) / sum(w for _, w in others)
        out[pollster_key(p["pollster"])].append(p["m"] - cons)
    return out


def house_effects(gen: list[dict], appr: list[dict]) -> dict[str, dict]:
    rg, ra = residuals(gen), residuals(appr)
    names = {}
    for p in gen + appr:
        names.setdefault(pollster_key(p["pollster"]), p["pollster"])
    he = {}
    for k in set(rg) | set(ra):
        vals = list(rg.get(k, [])) + [-0.5 * x for x in ra.get(k, [])]  # pro-Trump approval lean ~ half a point of R lean on the ballot
        he[k] = {"name": names.get(k, k), "he": sum(vals) / (len(vals) + 3), "n": len(vals)}
    return he


def weight(p: dict, today: date, counts: dict) -> float:
    age = max(0, (today - pdate(p["end"])).days)
    w = 0.5 ** (age / HALF_LIFE)
    w *= math.sqrt(min(p["n"] or 600, 3000) / 600)
    w *= pop_weight(p["pop"])
    if p["party"] or p["internal"]:
        w *= 0.5
    w /= math.sqrt(counts.get(pollster_key(p["pollster"]), 1))
    return w


def adjust(p: dict, he: dict, kind: str = "ballot") -> float:
    """Margin with sponsor and house-effect corrections.
    Ballot margins are Democratic side minus Republican side. For approval (approve minus
    disapprove) a pollster that leans Democratic shows lower approval, so its effect is added back
    at twice the ballot size (see house_effects)."""
    m = p["m"]
    h = he.get(pollster_key(p["pollster"]), {}).get("he", 0.0)
    if kind == "approval":
        return m + 2 * h if not (p["party"] or p["internal"]) else m
    if p["party"] == "D":
        m -= SPONSOR_SHIFT
    elif p["party"] == "R":
        m += SPONSOR_SHIFT
    elif not p["internal"]:
        m -= h
    return m


def average(polls: list[dict], he: dict, today: date, days: int, field_a="d", field_b="r", kind="ballot", min_n: int = 0) -> dict | None:
    """Weighted average of polls ending in the last `days` days. With min_n, the window stretches back
    far enough to include at least that many polls (recency weighting still favors new ones)."""
    dated = sorted((p for p in polls if pdate(p["end"]) and pdate(p["end"]) <= today), key=lambda p: p["end"], reverse=True)
    recent = [p for p in dated if (today - pdate(p["end"])).days <= days]
    if len(recent) < min_n:
        recent = dated[:min_n]
    if not recent:
        return None
    counts = defaultdict(int)
    for p in recent:
        counts[pollster_key(p["pollster"])] += 1
    ws = [weight(p, today, counts) for p in recent]
    adj = [adjust(p, he, kind) for p in recent]
    W = sum(ws)
    m = sum(a * w for a, w in zip(adj, ws)) / W
    raw = sum(p["m"] for p in recent) / len(recent)
    a = sum((p[field_a] - (p["m"] - x) / 2) * w for p, x, w in zip(recent, adj, ws)) / W
    b = sum((p[field_b] + (p["m"] - x) / 2) * w for p, x, w in zip(recent, adj, ws)) / W
    n_eff = W * W / sum(w * w for w in ws)
    return {"margin": round(m, 2), "a": round(a, 1), "b": round(b, 1), "raw": round(raw, 2), "n": len(recent), "nEff": round(n_eff, 1),
            "last": max(p["end"] for p in recent)}


def series(polls: list[dict], he: dict, today: date, start: date, days: int = 30, fields=("d", "r"), kind="ballot") -> list:
    out = []
    d = start
    while d <= today:
        avg = average([p for p in polls if pdate(p["end"]) <= d], he, d, days, fields[0], fields[1], kind, min_n=12)
        if avg:
            out.append([d.isoformat(), avg["margin"], avg["a"], avg["b"]])
        d += timedelta(days=3)
    return out


def lean_groups(polls: list[dict], he: dict, today: date) -> dict:
    """National average from right-leaning pollsters only, left-leaning only and nonpartisan only."""
    def lean_of(p):
        if p["party"]:
            return p["party"]
        h = he.get(pollster_key(p["pollster"]), {}).get("he", 0)
        return "D" if h > 0.75 else "R" if h < -0.75 else "N"
    out = {}
    for g, label in (("R", "Right-leaning pollsters"), ("D", "Left-leaning pollsters"), ("N", "Nonpartisan pollsters")):
        sub = [p for p in polls if lean_of(p) == g]
        raw = average(sub, {}, today, 45, min_n=5)
        adj = average(sub, he, today, 45, min_n=5)
        if raw:
            out[g] = {"label": label, "raw": raw["margin"], "adjusted": adj["margin"], "n": raw["n"]}
    return out


# ---------------------------------------------------------------- races
def race_key(p: dict) -> tuple[str, str] | None:
    """Map a VoteHub poll to (office, race_id-ish key)."""
    t = (p.get("poll_type") or "").lower()
    subj = p.get("subject") or ""
    if "2026" not in subj and not (pdate(p.get("end_date")) and pdate(p.get("end_date")) >= date(2025, 1, 1)):
        return None
    if PRIMARY_WORDS.search(subj):
        return None
    if t in ("us-senator", "senate", "us-senate", "governor"):
        st = None
        for name in sorted(STATE_NAMES, key=len, reverse=True):
            if name.lower() in subj.lower() or name.lower() in (p.get("seat_name") or "").lower():
                st = STATE_NAMES[name]
                break
        if not st:
            return None
        if t == "governor":
            return ("GOV", f"{st}-GOV")
        return ("SEN", f"{st}-SEN-SP" if "special" in subj.lower() else f"{st}-SEN")
    if t in ("us-representative", "house", "us-house"):
        m = re.search(r"\b([A-Z]{2})[- ]?(\d{1,2}|AL)\b", (p.get("seat_name") or "") + " " + subj)
        if m:
            n = m.group(2)
            return ("HOUSE", f"{m.group(1)}-{'AL' if n == 'AL' else f'{int(n):02d}'}")
    return None


def match_answers(answers: list[dict], race: dict) -> tuple[float, float, float | None] | None:
    def find(name, exclude=()):
        if not name:
            return None
        full, ln = tokens(name), last_name(name)
        best = None
        for i, a in enumerate(answers):
            if i in exclude or a.get("pct") is None:
                continue
            at = tokens(a.get("choice"))
            if at == full or (ln and ln in at):
                if best is None or float(a["pct"]) > float(answers[best]["pct"]):
                    best = i
        return best
    li = find(race["main_left"])
    ri = find(race["main_right"], exclude=(li,))
    if li is None or ri is None:
        return None
    oi = find(race.get("other"), exclude=(li, ri))
    return float(answers[li]["pct"]), float(answers[ri]["pct"]), (float(answers[oi]["pct"]) if oi is not None else None)


def race_polls(raw: list[dict], races: dict[str, dict]) -> dict[str, list[dict]]:
    out = defaultdict(list)
    today = date.today()
    for p in raw:
        if pdate(p.get("end_date")) and pdate(p["end_date"]) > today:
            continue  # a poll can't have finished in the future; the feed occasionally has typos
        k = race_key(p)
        if not k:
            continue
        rid = k[1]
        if rid not in races and rid.endswith("-SEN") and rid + "-SP" in races:
            rid += "-SP"
        if rid not in races:
            continue
        mt = match_answers(p.get("answers") or [], races[rid])
        if not mt:
            continue
        out[rid].append({**base(p), "d": mt[0], "r": mt[1], "m": mt[0] - mt[1], "o": mt[2]})
    return out


def forecast_race(r: dict, polls: list[dict], he: dict, G: float, today: date) -> dict:
    office = r["office"]
    left, right = r["main_left"], r["main_right"]
    res = {"id": r["race_id"], "office": office, "state": r["state"], "district": r["district"], "special": r["special"],
           "incumbent": r["incumbent"], "incParty": r["inc_party"], "incRunning": r["inc_running"],
           "left": {"name": left, "party": r["main_left_party"]}, "right": {"name": right, "party": r["main_right_party"]},
           "other": {"name": r["other"], "party": r["other_party"]} if r["other"] else None, "lean": r["lean"], "status": r["status"]}
    if not right or not left:
        winner = "left" if left else "right"
        res.update(mean=60.0 if winner == "left" else -60.0, sd=1.0, uncontested=True, fund=None, polls=None,
                   share={"left": 100.0 if left else 0.0, "right": 100.0 if right else 0.0, "other": 0.0})
        return res
    inc = 0.0
    if r["inc_running"] and r["inc_party"]:
        side = 1 if r["inc_party"] == r["main_left_party"] else -1 if r["inc_party"] == r["main_right_party"] else 0
        inc = side * INCUMBENCY[office]
    fund = G + r["lean"] + inc
    sd_f = FUND_SD[office]
    avg = average(polls, he, today, 120) if polls else None
    if avg and avg["n"] >= 1:
        sd_p = math.sqrt(25 / max(avg["nEff"], 0.5) + POLL_FLOOR_SD ** 2)
        wp, wf = 1 / sd_p ** 2, 1 / sd_f ** 2
        mean = (avg["margin"] * wp + fund * wf) / (wp + wf)
        sd = 1 / math.sqrt(wp + wf)
    else:
        mean, sd = fund, sd_f
    plist = sorted(polls, key=lambda p: p["end"], reverse=True)[:12]
    res.update(mean=round(mean, 2), sd=round(sd, 2), uncontested=False, fund=round(fund, 1), share=vote_share(mean, sd, polls, today),
               polls=None if not avg else {**avg, "list": [{"pollster": p["pollster"], "end": p["end"], "n": p["n"], "pop": p["pop"],
                                                             "left": p["d"], "right": p["r"], "party": p["party"], "internal": p["internal"],
                                                             "adj": round(adjust(p, he) - p["m"], 1)} for p in plist]})
    return res


def vote_share(mean: float, sd: float, polls: list[dict], today: date) -> dict:
    """Projected share for each main candidate (see module notes)."""
    named = [p["o"] for p in polls if p.get("o") is not None and pdate(p["end"]) and (today - pdate(p["end"])).days <= 120]
    other = max(OTHER_DEFAULT, sum(named) / len(named)) if named else OTHER_DEFAULT
    half = (100 - other) / 2
    sd = math.hypot(sd, NATIONAL_SD)  # the simulations add a shared national error on top of each race's own
    clip = lambda v: round(min(100 - other, max(0.0, v)), 1)
    return {"left": clip(half + mean / 2), "right": clip(half - mean / 2), "other": round(other, 1),
            "leftLo": clip(half + (mean - Z80 * sd) / 2), "leftHi": clip(half + (mean + Z80 * sd) / 2),
            "rightLo": clip(half - (mean + Z80 * sd) / 2), "rightHi": clip(half - (mean - Z80 * sd) / 2)}


def attach_members(races: list[dict], members: list[dict]) -> None:
    """Add age and member ID for any candidate or incumbent who serves in Congress now."""
    idx = defaultdict(list)
    for m in members:
        idx[(m["state"], last_name(m["last"]))].append(m)
    def find(name, state, district=None):
        if not name:
            return None
        c = idx.get((state, last_name(name)), [])
        if len(c) > 1:
            first = tokens(name)[0] if tokens(name) else ""
            c = [m for m in c if tokens(m["first"])[:1] == [first] or tokens(m["name"])[:1] == [first]] or c
        if len(c) > 1 and district:
            c = [m for m in c if m["district"] and int(m["district"]) == int(district)] or c
        return c[0] if len(c) == 1 else None
    for r in races:
        for side in ("left", "right"):
            m = find(r[side]["name"], r["state"], r["district"] if r["office"] == "HOUSE" else None)
            if m:
                r[side]["age"], r[side]["mid"] = m["age"], m["id"]
        m = find(r["incumbent"], r["state"], r["district"] if r["office"] == "HOUSE" else None)
        if m:
            r["incumbentAge"], r["incumbentId"] = m["age"], m["id"]


RATINGS = [(0.95, "Safe"), (0.80, "Likely"), (0.60, "Lean")]


def rating(p_left: float, left_party: str, right_party: str) -> tuple[str, str]:
    """Label uses the leading candidate's party; color follows the side (left = Democratic side)."""
    lead_left = p_left >= 0.5
    p = p_left if lead_left else 1 - p_left
    party = left_party if lead_left else right_party
    for thr, lab in RATINGS:
        if p >= thr:
            return f"{lab} {party}", f"{lab.lower()}-{'d' if lead_left else 'r'}"
    return "Toss-up", "tossup"


def simulate(races: list[dict], not_up: dict, rng: np.random.Generator) -> dict:
    nat = rng.normal(0, NATIONAL_SD, N_SIMS)
    out = {}
    for office in ("SEN", "HOUSE", "GOV"):
        rs = [r for r in races if r["office"] == office]
        means = np.array([r["mean"] for r in rs])
        sds = np.array([r["sd"] for r in rs])
        draws = means[None, :] + nat[:, None] + rng.normal(0, 1, (N_SIMS, len(rs))) * sds[None, :]
        left_wins = draws > 0
        for i, r in enumerate(rs):
            r["pLeft"] = round(float(left_wins[:, i].mean()), 4)
            r["rating"], r["ratingSlug"] = rating(r["pLeft"], r["left"]["party"], r["right"]["party"])
        if office == "GOV":
            d = (left_wins & np.array([r["left"]["party"] == "D" for r in rs])[None, :]).sum(1)
            out[office] = {"dMean": round(float(d.mean()), 1), "up": len(rs)}
            continue
        # seat counts by caucus; Kevin Kiley (no party label) caucuses with Republicans,
        # independent Senate candidates are counted on their own
        lp = np.array([r["left"]["party"] for r in rs]); rp = np.array([r["right"]["party"] for r in rs])
        win_party = np.where(left_wins, lp[None, :], rp[None, :])
        if office == "HOUSE":
            win_party = np.where(win_party == "I", "R", win_party)
        held = not_up if office == "SEN" else {}
        D = (win_party == "D").sum(1) + held.get("D", 0)
        R = (win_party == "R").sum(1) + held.get("R", 0)
        I = (win_party == "I").sum(1) + held.get("I", 0)
        total = len(rs) + sum(held.values())
        if office == "SEN":
            p_r = float((R >= 50).mean())       # the vice president (R) breaks 50-50 ties
            p_d = float((D >= 51).mean())
        else:
            p_r = float((R >= 218).mean())
            p_d = float((D >= 218).mean())
        hist = defaultdict(int)
        for x in D.tolist():
            hist[x] += 1
        out[office] = {"total": total, "up": len(rs), "notUp": held, "dMean": round(float(D.mean()), 1), "rMean": round(float(R.mean()), 1),
                       "iMean": round(float(I.mean()), 1), "dP10": int(np.percentile(D, 10)), "dP90": int(np.percentile(D, 90)),
                       "pD": round(p_d, 4), "pR": round(p_r, 4), "pOther": round(1 - p_d - p_r, 4),
                       "dHist": {str(k): round(v / N_SIMS, 4) for k, v in sorted(hist.items())}}
    return out


def counts_by_rating(races: list[dict], office: str) -> dict:
    order = ["safe-d", "likely-d", "lean-d", "tossup", "lean-r", "likely-r", "safe-r"]
    c = {k: 0 for k in order}
    for r in races:
        if r["office"] == office:
            c[r["ratingSlug"]] += 1
    return c


# ---------------------------------------------------------------- president / other
def other_polls(raw: list[dict], today: date) -> list[dict]:
    groups = defaultdict(list)
    for p in raw:
        t = (p.get("poll_type") or "").lower()
        subj = p.get("subject") or ""
        if "president" in t or "2028" in subj:
            if pdate(p.get("end_date")) and (today - pdate(p["end_date"])).days <= 120:
                groups[subj or t].append(p)
    out = []
    for subj, ps in groups.items():
        tot = defaultdict(list)
        for p in ps:
            for a in p.get("answers") or []:
                if a.get("pct") is not None:
                    tot[" ".join(tokens(a["choice"]))].append((a["choice"], float(a["pct"])))
        def label(v):  # most common spelling, preferring the hyphenated/punctuated form on ties
            names = [n for n, _ in v]
            return max(set(names), key=lambda n: (names.count(n), sum(c in "-.'" for c in n)))
        cands = sorted(({"name": label(v), "avg": round(sum(x for _, x in v) / len(v), 1), "n": len(v)} for k, v in tot.items()
                        if len(v) >= max(1, len(ps) // 3)), key=lambda x: -x["avg"])[:8]
        out.append({"subject": subj, "n": len(ps), "last": max(p["end_date"] for p in ps), "candidates": cands})
    return sorted(out, key=lambda x: -x["n"])[:6]


# ---------------------------------------------------------------- main
def main() -> None:
    today = date.today()
    raw = fetch_polls()
    if not raw:
        log.info("no polls available; keeping the previous forecast")
        return
    races_rows = load_races()
    races_by_id = {r["race_id"]: r for r in races_rows}

    gen, appr = national_polls(raw)
    he = house_effects(gen, appr)
    g_avg = average(gen, he, today, 45, min_n=12)
    G = g_avg["margin"] if g_avg else 0.0
    a_avg = average(appr, he, today, 30, "a", "d", "approval", min_n=12)
    log.info("generic ballot D%+.1f from %d polls; %d pollsters with house effects", G, g_avg["n"] if g_avg else 0, len(he))

    rp = race_polls(raw, races_by_id)
    races = [forecast_race(r, rp.get(r["race_id"], []), he, G, today) for r in races_rows]

    members = load_members(today)
    attach_members(races, members)
    senators = [m for m in members if m["chamber"] == "Senate"]
    up_ids = {r["state"] + ("-SP" if r["special"] else "") for r in races_rows if r["office"] == "SEN"}
    not_up = defaultdict(int)
    for m in senators:
        if m["termEnd"][:4] not in ("2026", "2027"):
            not_up[m["caucus"] if m["caucus"] in ("D", "R") else "I"] += 1
    rng = np.random.default_rng(int(today.strftime("%Y%m%d")))
    chambers = simulate(races, dict(not_up), rng)
    for off, key in (("SEN", "senate"), ("HOUSE", "house"), ("GOV", "governors")):
        chambers[off]["ratings"] = counts_by_rating(races, off)

    hist = load_json(SOURCES / "forecast_history.json", [])
    hist = [h for h in hist if h["date"] != today.isoformat()] + [{
        "date": today.isoformat(), "generic": round(G, 2), "senatePD": chambers["SEN"]["pD"], "senatePR": chambers["SEN"]["pR"],
        "housePD": chambers["HOUSE"]["pD"], "housePR": chambers["HOUSE"]["pR"], "senateD": chambers["SEN"]["dMean"], "houseD": chambers["HOUSE"]["dMean"]}]
    save_json(SOURCES / "forecast_history.json", hist[-400:])

    pollsters = sorted(({"name": v["name"], "he": round(v["he"], 2), "n": v["n"]} for v in he.values() if v["n"] >= 2), key=lambda x: x["he"])
    start = today - timedelta(days=180)
    payload = {
        "generated": now_iso(), "electionDay": ELECTION.isoformat(), "daysOut": (ELECTION - today).days,
        "national": {
            "generic": g_avg, "genericSeries": series(gen, he, today, start), "genericByLean": lean_groups(gen, he, today),
            "approval": a_avg, "approvalSeries": series(appr, he, today, start, fields=("a", "d"), kind="approval"), "pollsters": pollsters,
            "nGeneric": len(gen), "nApproval": len(appr),
        },
        "senate": chambers["SEN"], "house": chambers["HOUSE"], "governors": chambers["GOV"],
        "races": races, "president": other_polls(raw, today), "history": hist[-120:],
        "sources": {"polls": "VoteHub (CC BY 4.0)", "races": "State primary results", "lean": "Cook Political Report PVI",
                    "nPolls": len(raw), "nRacePolls": sum(len(v) for v in rp.values())},
    }
    write_js(DATA / "polls.js", "CHI_POLLS", payload)
    log.info("forecast: Senate D %.1f (P(D)=%.2f, P(R)=%.2f); House D %.1f (P(D)=%.2f)",
             chambers["SEN"]["dMean"], chambers["SEN"]["pD"], chambers["SEN"]["pR"], chambers["HOUSE"]["dMean"], chambers["HOUSE"]["pD"])


if __name__ == "__main__":
    main()
