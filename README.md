# TCG Card Tracker

A browser-based Pokémon TCG card tracker with live prices from the
[Pokémon TCG API](https://pokemontcg.io/) (TCGPlayer market data).

## Features

- **Search by name** — images, set info, and TCGPlayer prices auto-populate
- **Paste TCGPlayer URL** — look up a card directly from a product URL
- **Condition-adjusted pricing** — NM / LP / MP / HP / DMG multipliers
- **Column sorting** — click any column header to sort ↑ / ↓
- **Date Added & Last Updated** columns — automatically tracked
- **Refresh prices** — re-fetches live market data for all API-linked cards
- **Mark as Sold** — row turns green; excluded from expected profit
- **Import CSV** — native Save dialog (Chrome/Edge) or file picker fallback
- **Export CSV** — auto-named `tcg-tracker-YYYY-MM-DD.csv`, native Save As dialog where supported
- **Seed data** — 8 pre-loaded cards so you can explore the UI immediately
- **Unit test suite** at `/tests.html` — 76 tests across 11 groups

## Project structure

```
tcg-tracker/
├── index.html          Main tracker page
├── tests.html          Test suite page
├── css/
│   ├── style.css       Shared styles (light + dark mode)
│   └── tests.css       Test suite additional styles
└── js/
    ├── core.js         Shared logic: card model, calculations, sorting, CSV, API
    ├── tracker.js      Tracker UI: rendering, search modal, refresh, import/export
    └── tests.js        Unit test runner & 76 test definitions (11 groups)
```

## Running locally

> **A local HTTP server is required.** The Pokémon TCG API uses `fetch()`,
> which browsers block from `file://` URLs due to CORS restrictions.

### Option 1 — Python (nothing to install)

```bash
cd tcg-tracker
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 2 — Node / npx

```bash
cd tcg-tracker
npx serve .
# Open the URL shown in the terminal
```

### Option 3 — VS Code Live Server

Right-click `index.html` → **Open with Live Server**.

## Adding cards

The **"+ Add card via search"** button opens a modal with two tabs:

| Tab | How it works |
|-----|-------------|
| **Search by name** | Type a card name → results from pokemontcg.io with live TCGPlayer prices |
| **Paste TCGPlayer URL** | Paste a URL like `tcgplayer.com/product/523161/…` → auto-lookup |

After a result appears, select the finish type (Normal / Holofoil / Rev. Holo …),
then click **Add to list**.

## Sorting

Click any column header to sort ascending. Click again to reverse. The active
sort column shows an ↑ or ↓ arrow; inactive columns show a faint ↕.

Sortable columns: Name, Finish, Condition, Buy cost, Market (NM), Low, Mid,
Adj. price, Profit, Profit %, Sold, Date added, Last updated.

## Date tracking

| Field | Set when |
|-------|---------|
| **Date Added** | Card is first created (search add, URL add, or CSV import) |
| **Last Updated** | Any field on the card is edited; also updated on price refresh |

Both fields survive CSV export/import.

## CSV format

Exported files are named `tcg-tracker-YYYY-MM-DD.csv`. Columns:

```
name, setName, finish, imageUrl, condition, buyCost,
marketNM, priceLow, priceMid, link, sold, tcgplayerId,
dateAdded, lastUpdated
```

On import you can choose to **add to the existing list** or **replace it**.

## Condition price multipliers

| Condition | Multiplier |
|-----------|-----------|
| NM (Near Mint) | 100% |
| LP (Lightly Played) | 85% |
| MP (Moderately Played) | 70% |
| HP (Heavily Played) | 50% |
| DMG (Damaged) | 30% |

**Adjusted price** = `marketNM × multiplier` (falls back to `priceMid` when `marketNM` is unavailable).

## API key (optional)

The Pokémon TCG API works without a key at a lower rate limit (~1 000 req/day).
For heavy use, register free at <https://dev.pokemontcg.io> and add your key
to the `fetch()` calls in `js/core.js`:

```js
// in searchCards() and fetchCardPrices():
headers: { 'X-Api-Key': 'YOUR_KEY_HERE' }
```

## Running the tests

Open `http://localhost:8080/tests.html` and click **Run all tests**.

| Group | Tests |
|-------|------:|
| Condition multipliers & adjusted price | 9 |
| Profit & profit % calculation | 9 |
| fmt() and fmtPct() display formatting | 11 |
| CSV export & import round-trip | 11 |
| makeCard defaults & overrides | 9 |
| Condition list completeness | 5 |
| splitCSVLine edge cases | 3 |
| Date fields — dateAdded & lastUpdated | 10 |
| Sorting — sortCards() | 8 |
| generateFilename() | 4 |
| Seed data — getSeedCards() | 5 |
| **Total** | **84** |
