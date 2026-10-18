"""Wrap each page body in src/pages/ with the shared head, header and footer.

Run after editing anything in src/pages/:  python scripts/build_pages.py
Writes index.html, members/index.html, polls/index.html, ... plus sitemap.xml and robots.txt.
"""
from __future__ import annotations

import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "pages"
SITE_NAME = "Capitol Hill Index"


def site_url() -> str:
    cfg = (ROOT / "assets" / "config.js").read_text()
    m = re.search(r'siteUrl:\s*"([^"]+)"', cfg)
    return (m.group(1) if m else "https://capitolhillindex.com").rstrip("/")


# slug, output path, nav label, <title>, meta description
PAGES = [
    ("home", "", None, "Capitol Hill Index: Nonpartisan Congress Stock Trades, Polls and Votes",
     "Nonpartisan, built from official records: every member of Congress's stock trades, PAC money and votes, a financial integrity score, and lean-corrected 2026 election polls."),
    ("members", "members/", "Members", "Congress Stock Trades and Financial Integrity Index",
     "Every voting member of Congress with stock trades, trading volume, corporate PAC money, education, age, tenure and a financial integrity score."),
    ("polls", "polls/", "Polls", "2026 Election Polls and Forecast: Senate, House and Governor",
     "Daily-updated 2026 midterm polling averages adjusted for pollster lean, race ratings from Safe to Toss-up, maps and projected Senate and House control."),
    ("votes", "votes/", "Votes", "How Congress Voted: Roll Call Votes by Member and Bill",
     "See how every senator and representative voted on each bill, amendment and nomination, with the bill's sponsor and the party breakdown."),
    ("political-quiz", "political-quiz/", "Political Quiz", "Political Party Quiz: Democrat, Republican or Independent?",
     "Answer 16 questions about issues and priorities to see where you fall on the economic and social scales and which party you match."),
    ("headcount", "headcount/", "Headcount", "Headcount: Name All Senators and Representatives Quiz",
     "How many members of Congress can you name? Try all 100 senators, the whole House, or just your state's delegation."),
    ("capitle", "capitle/", "Capitle", "Capitle: Guess the Politician, a Daily Congress Game",
     "A new member of Congress every day. Guess who it is from party, state, chamber, age and years in office, with hints if you need them."),
    ("standards", "standards/", None, "Our Standards: Nonpartisan, Official Data | Capitol Hill Index",
     "Capitol Hill Index is nonpartisan: every number comes from official government records or nonpartisan research, and every member is measured by the same rules."),
    ("account", "account/", None, "Your Account | Capitol Hill Index",
     "Sign in to save your home state, quiz results and game streak."),
    ("stats", "stats/", None, "Site Stats | Capitol Hill Index", "Visits and activity across Capitol Hill Index."),
    ("404", "404.html", None, "Page not found | Capitol Hill Index", "That page doesn't exist."),
]
NAV = [p for p in PAGES if p[2]]
PRIVATE = {"account", "stats", "404"}
FONTS = "https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&display=swap"


def out_file(path: str) -> Path:
    if path.endswith(".html"):
        return ROOT / path
    return ROOT / path / "index.html"


def prefix_for(path: str) -> str:
    if path == "404.html":
        return "/"  # GitHub Pages serves this file for any missing path, so links must be absolute
    depth = 0 if path.endswith(".html") or path == "" else path.count("/")
    return "../" * depth or "./"


def head(slug: str, path: str, title: str, desc: str, url: str, pre: str) -> str:
    canon = f"{url}/{path}" if path != "404.html" else url + "/"
    ld = ""
    if slug == "home":
        ld = '<script type="application/ld+json">' + json.dumps({
            "@context": "https://schema.org", "@type": "WebSite", "name": SITE_NAME, "url": url + "/",
            "description": desc}) + "</script>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">{'<meta name="robots" content="noindex">' if slug in PRIVATE else ""}
<link rel="canonical" href="{canon}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{url}/assets/brand/share-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{url}/assets/brand/share-card.png">
<meta name="theme-color" content="#ffffff">
<meta name="chi-root" content="{pre}">
<link rel="icon" href="{pre}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{pre}assets/site.css">
<script src="{pre}assets/config.js"></script>
<script src="{pre}assets/site.js"></script>
{ld}
</head>"""


def header(slug: str, pre: str) -> str:
    links = "".join(
        f'<a href="{pre}{p[1]}"{" aria-current=page" if p[0] == slug else ""}>{p[2]}</a>' for p in NAV)
    return f"""<body>
<header class="top"><div class="wrap">
<a class="brand" href="{pre}"><img src="{pre}assets/brand/seal.svg" alt="" width="28" height="28">Capitol Hill Index</a>
<nav class="nav" aria-label="Main">{links}</nav>
<a class="acct" id="acct" href="{pre}account/">Sign in</a>
</div></header>"""


def footer(pre: str) -> str:
    links = "".join(f'<a href="{pre}{p[1]}">{p[2]}</a>' for p in NAV)
    return f"""<footer class="foot"><div class="wrap">
<span>Capitol Hill Index · Nonpartisan. Built from official records and nonpartisan research. <a href="{pre}standards/" style="text-decoration:underline">Our standards</a></span>
<nav aria-label="Footer">{links}</nav>
</div></footer>
</body>
</html>
"""


def main() -> None:
    url = site_url()
    for slug, path, _nav, title, desc in PAGES:
        src = SRC / f"{slug}.html"
        if not src.exists():
            print(f"skip {slug}: no {src.name}")
            continue
        pre = prefix_for(path)
        body = src.read_text().replace("{{root}}", pre)
        page = head(slug, path, title, desc, url, pre) + "\n" + header(slug, pre) + "\n" + body + "\n" + footer(pre)
        out = out_file(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page)
        print(f"wrote {out.relative_to(ROOT)}")

    entries = "".join(
        f"<url><loc>{url}/{p[1]}</loc></url>"
        for p in PAGES if p[0] not in PRIVATE)
    (ROOT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>\n')
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /account/\nDisallow: /stats/\nSitemap: {url}/sitemap.xml\n")
    print("wrote sitemap.xml, robots.txt")


if __name__ == "__main__":
    main()
