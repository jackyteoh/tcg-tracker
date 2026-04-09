/**
 * core.js — shared logic for the TCG Card Tracker.
 * Imported by both tracker.js and tests.js.
 */

'use strict';

/* ============================================================
   Constants
   ============================================================ */

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

const COND_MULT = {
  NM:  1.00,
  LP:  0.85,
  MP:  0.70,
  HP:  0.50,
  DMG: 0.30,
};

const FINISH_LABELS = {
  normal:               'Normal',
  holofoil:             'Holofoil',
  reverseHolofoil:      'Rev. Holo',
  firstEditionHolofoil: '1st Ed Holo',
  firstEditionNormal:   '1st Ed Normal',
};

// Fields persisted to CSV (order determines column order).
const CSV_HEADERS = [
  'name', 'setName', 'finish', 'imageUrl', 'condition',
  'buyCost', 'marketNM', 'priceLow', 'priceMid',
  'link', 'sold', 'tcgplayerId',
];

const POKEMON_API = 'https://api.pokemontcg.io/v2/cards';

/* ============================================================
   Card model
   ============================================================ */

let _nextId = 1;

/**
 * Create a card object with sensible defaults.
 * @param {Partial<Card>} overrides
 * @returns {Card}
 */
function makeCard(overrides = {}) {
  return {
    id:            _nextId++,
    name:          '',
    imageUrl:      '',
    setName:       '',
    finish:        'normal',
    condition:     'NM',
    buyCost:       '',
    marketNM:      null,
    priceLow:      null,
    priceMid:      null,
    link:          '',
    sold:          false,
    tcgplayerId:   '',
    lastRefreshed: null,
    ...overrides,
  };
}

/** Reset the ID counter (used by the test suite between runs). */
function resetIdCounter() {
  _nextId = 1;
}

/* ============================================================
   Price calculations
   ============================================================ */

/**
 * Condition-adjusted price.
 * Uses marketNM first, falls back to priceMid, then 0.
 * @param {Card} card
 * @returns {number}
 */
function adjPrice(card) {
  const base = card.marketNM ?? card.priceMid ?? 0;
  return base * (COND_MULT[card.condition] ?? 1);
}

/**
 * Profit amount and percentage vs buy cost.
 * Returns null values when either input is missing.
 * @param {Card} card
 * @returns {{ profit: number|null, pct: number|null }}
 */
function calcProfit(card) {
  const adj = adjPrice(card);
  const buy = parseFloat(card.buyCost) || 0;
  if (!adj || !buy) return { profit: null, pct: null };
  const profit = adj - buy;
  return { profit, pct: (profit / buy) * 100 };
}

/* ============================================================
   Formatting helpers
   ============================================================ */

/**
 * Format a number as a USD dollar string, or '—' for null/NaN.
 * @param {number|null} n
 * @param {number} [decimals=2]
 * @returns {string}
 */
function fmt(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Number(n).toFixed(decimals);
}

/**
 * Format a percentage with a leading + for positives, or '—' for null.
 * @param {number|null} n
 * @returns {string}
 */
function fmtPct(n) {
  if (n === null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

/**
 * Format a timestamp as HH:MM, or 'never'.
 * @param {number|null} ts  Unix ms timestamp
 * @returns {string}
 */
function fmtTime(ts) {
  if (!ts) return 'never';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Escape a string for safe insertion into HTML attribute values or text nodes.
 * @param {string} s
 * @returns {string}
 */
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   CSV export / import
   ============================================================ */

/**
 * Serialize an array of card objects to CSV text.
 * @param {Card[]} cards
 * @returns {string}
 */
function exportCSV(cards) {
  const rows = [CSV_HEADERS.join(',')];
  for (const c of cards) {
    const row = CSV_HEADERS.map(h => `"${String(c[h] ?? '').replace(/"/g, '""')}"`);
    rows.push(row.join(','));
  }
  return rows.join('\n');
}

/**
 * Trigger a CSV download in the browser.
 * @param {Card[]} cards
 * @param {string} [filename='tcg-tracker.csv']
 */
function downloadCSV(cards, filename = 'tcg-tracker.csv') {
  const blob = new Blob([exportCSV(cards)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Parse CSV text into an array of plain objects keyed by the header row.
 * @param {string} text
 * @returns {Object[]}
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

/**
 * Split a single CSV line respecting double-quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

/**
 * Convert a parsed CSV row object back into a Card object.
 * @param {Object} row
 * @returns {Card}
 */
function csvRowToCard(row) {
  return makeCard({
    name:        row.name        || '',
    imageUrl:    row.imageUrl    || '',
    setName:     row.setName     || '',
    finish:      row.finish      || 'normal',
    condition:   CONDITIONS.includes(row.condition) ? row.condition : 'NM',
    buyCost:     row.buyCost     || '',
    marketNM:    row.marketNM    ? parseFloat(row.marketNM)  : null,
    priceLow:    row.priceLow    ? parseFloat(row.priceLow)  : null,
    priceMid:    row.priceMid    ? parseFloat(row.priceMid)  : null,
    link:        row.link        || '',
    sold:        row.sold === 'true' || row.sold === '1',
    tcgplayerId: row.tcgplayerId || '',
  });
}

/* ============================================================
   Pokémon TCG API
   ============================================================ */

/**
 * Search cards by name via the Pokémon TCG API.
 * @param {string} query
 * @returns {Promise<Object[]>}  Array of raw API card objects
 */
async function searchCards(query) {
  const url = `${POKEMON_API}?q=name:"${encodeURIComponent(query)}"` +
              `&pageSize=12&orderBy=-set.releaseDate` +
              `&select=id,name,images,set,number,tcgplayer`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch current price data for a single card by its Pokémon TCG API id.
 * @param {string} tcgplayerId
 * @returns {Promise<Object|null>}  prices object or null on failure
 */
async function fetchCardPrices(tcgplayerId) {
  const res = await fetch(`${POKEMON_API}/${encodeURIComponent(tcgplayerId)}?select=tcgplayer`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.tcgplayer?.prices || null;
}

/* ============================================================
   Expose to global scope (used by tracker.js and tests.js)
   ============================================================ */

window.TCG = {
  // Constants
  CONDITIONS,
  COND_MULT,
  FINISH_LABELS,
  CSV_HEADERS,
  // Card model
  makeCard,
  resetIdCounter,
  // Calculations
  adjPrice,
  calcProfit,
  // Formatters
  fmt,
  fmtPct,
  fmtTime,
  escHtml,
  // CSV
  exportCSV,
  downloadCSV,
  parseCSV,
  splitCSVLine,
  csvRowToCard,
  // API
  searchCards,
  fetchCardPrices,
};
