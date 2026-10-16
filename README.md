# Capitol Hill Index

A one-page site listing every sitting member of Congress with age, terms served,
time in their current seat, state, party, portrait, education, stock trades, PAC
money, and a reweightable financial integrity score.

## Files

| File | What it does |
|---|---|
| `index.html` | The website. Open it in a browser; it reads `data.js` and `photos.js` from the same folder. |
| `data.js` | Member data. Ships with bio and term data filled in; trades, PAC money and education are empty until you run the fetch script. |
| `photos.js` | Official portraits as small embedded thumbnails. |
| `build_members.py` | Turns the official legislators file into the member list (ages, terms, dates). |
| `fetch_data.py` | Pulls everything and rewrites `data.js`. |
| `fetch_photos.py` | Re-downloads portraits after new members are sworn in. |

## Fill in the missing data

```bash
pip install requests pyyaml pillow
export FEC_API_KEY=your_key        # free, instant: https://api.open.fec.gov/developers/
export QUIVER_API_KEY=your_key     # optional, better trade data: https://www.quiverquant.com/
python fetch_data.py               # writes data.js (education, PAC $, trades)
python fetch_data.py --corporate   # also splits out corporate-only PAC money (slower)
```

Then reopen `index.html`. On Windows, use `set FEC_API_KEY=...` instead of `export`.

Without a Quiver key the script uses the free House/Senate Stock Watcher files,
which stopped updating regularly; the site shows the date the trade data runs
through so you can tell.

## How the score works

Each factor scores 0–100; sliders on the page set the weights (default 40/30/30).

- **Trading restraint** = 100 − 25 × log₂(1 + trades per year in office since April 2012, when the STOCK Act took effect). 1/yr → 75, 3/yr → 50, 15/yr → 0.
- **On-time disclosure** = share of trades reported within 45 days, the STOCK Act deadline.
- **PAC independence** = 100 − 2 × (PAC share of total receipts). 25% → 50, 50%+ → 0. Uses corporate-only PAC money when `--corporate` was run, otherwise all PACs.

Factors with no data drop out and the rest are reweighted. 80+ shows green,
60–79 amber, below 60 red. A low score flags a pattern worth a closer look; it
does not prove wrongdoing.

## Known limits

- Trade counts come from periodic transaction reports, so they count reported transactions, not dollar amounts; spouse and dependent trades are included as filed.
- Name matching for free trade data skips ambiguous names instead of guessing.
- Wikidata education lists can include high schools and can be incomplete.
- "Terms" counts every term in the official record, including short appointed ones.
