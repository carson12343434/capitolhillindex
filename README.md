# Capitol Hill Index

A nonpartisan site tracking every voting member of Congress: stock trades, trading volume and estimated gains, PAC money, education, roll call votes, a financial integrity score, and a daily 2026 election forecast. Also includes a political party quiz, Headcount (a name-every-member quiz) and Capitle (a daily guess-the-politician game).

## Pages

| Path | Page |
|---|---|
| `/` | Home |
| `/members/` | Members, money and integrity score |
| `/polls/` | 2026 polls, ratings, maps and chamber forecast |
| `/votes/` | Roll call votes with sponsors and member votes |
| `/political-quiz/` | Party match quiz |
| `/headcount/` | Headcount: name the senators and representatives |
| `/capitle/` | Capitle: guess the politician daily game |
| `/account/` | Sign in and home state |

Page bodies live in `src/pages/`. After editing one, run `python scripts/build_pages.py` to rebuild the finished pages.

## Data updates

Two scheduled jobs in `.github/workflows/` keep the data current. Neither needs an API key.

**Daily (6 a.m. and 6 p.m. Eastern):** House stock trades, Senate trades when the Senate site allows downloads, polls and forecast, roll call votes.

**Weekly (Monday):** FEC campaign money, education, estimated trading gains, portraits.

To run one now: **Actions** tab → pick the job → **Run workflow**.

| Data | Source |
|---|---|
| Members, ages, terms | [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) |
| House stock trades | House Clerk periodic transaction reports, parsed by [congresskit](https://github.com/kovagent/congresskit) |
| Senate stock trades | [Senate eFD](https://efdsearch.senate.gov) (often blocks cloud servers) |
| PAC and total receipts | [FEC bulk data](https://www.fec.gov/data/browse-data/?tab=bulk-data) |
| Education | Biographical Directory of Congress, Wikidata |
| Votes | [Voteview](https://voteview.com) |
| Bill sponsors and titles | [GovInfo BILLSTATUS](https://www.govinfo.gov/bulkdata/BILLSTATUS) |
| Polls | [VoteHub](https://votehub.com/polls/api/) (CC BY 4.0) |
| Nominees and partisan lean | Wikipedia, state election offices, Cook PVI |
| Stock prices for gain estimates | Yahoo Finance, Stooq |
| Portraits | [unitedstates/images](https://github.com/unitedstates/images) (public domain) |

`data/static/races_2026.csv` holds the 506 races and nominees. Edit it by hand if a nominee changes.

## Settings

`assets/config.js` holds three settings: the site address, the GoatCounter code for visitor stats, and the Firebase config for accounts. `SETUP.md` walks through each.
