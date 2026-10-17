"""Best-effort pull of Senate periodic transaction reports from efdsearch.senate.gov.

The Senate site often refuses requests from cloud servers (HTTP 403). When that happens this
script exits quietly and the site keeps showing Senate trades as "not available".
It works incrementally: each run reads at most MAX_REPORTS new reports and remembers which
reports it has already parsed in data/sources/senate_trades.json.
"""
from __future__ import annotations

import re
import time
from datetime import datetime

from bs4 import BeautifulSoup

from common import SOURCES, http, load_json, log, now_iso, save_json
from legislators import load_members

BASE = "https://efdsearch.senate.gov"
MAX_REPORTS = 700


def amount_range(text: str) -> tuple[int | None, int | None]:
    nums = [int(x.replace(",", "")) for x in re.findall(r"\$([\d,]+)", text or "")]
    if not nums:
        return None, None
    return nums[0], nums[-1]


def parse_date(s: str):
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    return None


def session_ok() -> bool:
    r = http.get(f"{BASE}/search/home/", timeout=30)
    if r.status_code != 200:
        log.info("Senate eFD refused the request (HTTP %s); skipping Senate trades", r.status_code)
        return False
    token = BeautifulSoup(r.text, "html.parser").find("input", {"name": "csrfmiddlewaretoken"})
    if not token:
        return False
    r = http.post(f"{BASE}/search/home/", data={"prohibition_agreement": "1", "csrfmiddlewaretoken": token["value"]},
                  headers={"Referer": f"{BASE}/search/home/"}, timeout=30)
    return r.status_code == 200


def report_list() -> list[list]:
    out, start = [], 0
    csrf = http.cookies.get("csrftoken", "")
    while True:
        r = http.post(f"{BASE}/search/report/data/", timeout=60, headers={"Referer": f"{BASE}/search/", "X-CSRFToken": csrf},
                      data={"start": str(start), "length": "100", "report_types": "[11]", "filer_types": "[]",
                            "submitted_start_date": "01/01/2012 00:00:00", "submitted_end_date": "", "candidate_state": "",
                            "senator_state": "", "office_id": "", "first_name": "", "last_name": "", "csrfmiddlewaretoken": csrf})
        if r.status_code != 200:
            break
        rows = r.json().get("data", [])
        out.extend(rows)
        if len(rows) < 100:
            break
        start += 100
        time.sleep(1)
    return out


def main() -> None:
    state = load_json(SOURCES / "senate_trades.json", {"rows": [], "seen": []})
    seen = set(state.get("seen", []))
    try:
        if not session_ok():
            return
        reports = report_list()
    except Exception as e:
        log.info("Senate eFD unavailable: %s", e)
        return
    senators = [m for m in load_members() if m["chamber"] == "Senate"]
    by_last = {}
    for m in senators:
        by_last.setdefault(m["last"].lower(), []).append(m)

    done = 0
    for first, last, office, link_html, received in reports:
        m_link = re.search(r'href="([^"]+)"', link_html or "")
        if not m_link or "/ptr/" not in m_link.group(1):
            continue  # paper filings are scanned images
        rid = m_link.group(1).rstrip("/").rsplit("/", 1)[-1]
        if rid in seen:
            continue
        cands = by_last.get(last.strip().lower(), [])
        if len(cands) > 1:
            cands = [c for c in cands if c["first"][:1].lower() == first.strip()[:1].lower()]
        if len(cands) != 1:
            seen.add(rid)
            continue
        member = cands[0]
        try:
            page = http.get(BASE + m_link.group(1), timeout=60)
            page.raise_for_status()
        except Exception as e:
            log.info("  report %s: %s", rid, e)
            break
        filed = parse_date(received)
        table = BeautifulSoup(page.text, "html.parser").find("table")
        for tr in (table.find_all("tr")[1:] if table else []):
            td = [c.get_text(" ", strip=True) for c in tr.find_all("td")]
            if len(td) < 8:
                continue
            txn = parse_date(td[1])
            low, high = amount_range(td[7])
            typ = td[6].lower()
            typ = "purchase" if "purchase" in typ else "partial_sale" if "partial" in typ else "sale" if "sale" in typ else "exchange"
            ticker = td[3] if td[3] not in ("--", "") else ""
            if txn:
                state["rows"].append({"bioguide": member["id"], "txn": txn.isoformat(), "filed": filed.isoformat() if filed else None,
                                      "ticker": ticker, "asset": td[4][:120], "assetType": td[5].lower(), "type": typ,
                                      "low": low, "high": high, "owner": td[2].lower()})
        seen.add(rid)
        done += 1
        if done >= MAX_REPORTS:
            break
        time.sleep(1.2)
    state["seen"] = sorted(seen)
    state["updated"] = now_iso()
    save_json(SOURCES / "senate_trades.json", state)
    log.info("Senate eFD: parsed %d new reports, %d rows total", done, len(state["rows"]))


if __name__ == "__main__":
    main()
