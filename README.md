# TCG Card Tracker

A browser-based Pokémon TCG card tracker with live prices from the
[Pokémon TCG API](https://pokemontcg.io/) (TCGPlayer market data).

## Features

- Search cards by name — images, set info and TCGPlayer prices populate automatically
- Condition-adjusted pricing (NM / LP / MP / HP / DMG)
- Profit & profit % vs your buy cost
- **Refresh prices** button — re-fetches current market data for all cards in your list
- Mark cards as Sold (row turns green)
- Import & Export CSV — full round-trip, with add-to-list or replace options
- Unit test suite at `/tests.html`

## Project structure

```
tcg-tracker/
├── index.html          Main tracker page
├── tests.html          Test suite page
├── css/
│   ├── style.css       Shared styles (light + dark mode)
│   └── tests.css       Test suite additional styles
└── js/
    ├── core.js         Shared logic: card model, calculations, CSV, API helpers
    ├── tracker.js      Tracker UI: rendering, search modal, refresh, import/export
    └── tests.js        Unit test runner & test definitions
```

## Running locally

### Option 1 — Python (no install required)

```bash
cd tcg-tracker
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 2 — Node.js (npx)

```bash
cd tcg-tracker
npx serve .
# Open the URL printed in the terminal
```

### Option 3 — VS Code Live Server extension

Open the folder in VS Code, right-click `index.html` → **Open with Live Server**.

> **Why a server?** The Pokémon TCG API requires HTTP requests. Browsers block
> `fetch()` calls from `file://` URLs due to CORS restrictions, so you must
> serve the files over HTTP even locally.

## API key (optional)

The Pokémon TCG API works without an API key at a lower rate limit
(~1 000 requests/day). If you search frequently or have a large list,
register a free key at <https://dev.pokemontcg.io> and add it to the
`fetch()` calls in `js/core.js`:

```js
// In searchCards() and fetchCardPrices() in core.js:
headers: { 'X-Api-Key': 'YOUR_KEY_HERE' }
```

## Running the tests

Navigate to `http://localhost:8080/tests.html` and click **Run all tests**.

The suite covers:

| Group | Tests |
|---|---|
| Condition multipliers & adjusted price | 9 |
| Profit & profit % calculation | 9 |
| fmt() and fmtPct() display formatting | 11 |
| CSV export & import round-trip | 11 |
| makeCard defaults & overrides | 9 |
| Condition list completeness | 5 |
| splitCSVLine edge cases | 3 |

## CSV format

The exported CSV uses these columns (in order):

```
name, setName, finish, imageUrl, condition, buyCost,
marketNM, priceLow, priceMid, link, sold, tcgplayerId
```

The same file can be re-imported via the **Import CSV** button.

## Condition price multipliers

| Condition | Multiplier |
|---|---|
| NM (Near Mint) | 100% |
| LP (Lightly Played) | 85% |
| MP (Moderately Played) | 70% |
| HP (Heavily Played) | 50% |
| DMG (Damaged) | 30% |

Adjusted price = `marketNM × multiplier` (falls back to `priceMid` if `marketNM` is unavailable).
