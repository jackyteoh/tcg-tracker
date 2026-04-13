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
  'link', 'sold', 'tcgplayerId', 'dateAdded', 'lastUpdated',
];

const POKEMON_API = 'https://api.pokemontcg.io/v2/cards';

/* ============================================================
   Card model
   ============================================================ */

let _nextId = 1;

/**
 * Create a card object with sensible defaults.
 * dateAdded and lastUpdated are stored as ISO strings for CSV compatibility.
 * @param {Partial<Card>} overrides
 * @returns {Card}
 */
function makeCard(overrides = {}) {
  const now = new Date().toISOString();
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
    dateAdded:     now,
    lastUpdated:   now,
    ...overrides,
  };
}

/** Reset the ID counter (used by the test suite between runs). */
function resetIdCounter() {
  _nextId = 1;
}

/**
 * Touch the lastUpdated timestamp on a card (mutates in place).
 * Call this whenever a user-driven field changes.
 * @param {Card} card
 */
function touchUpdated(card) {
  card.lastUpdated = new Date().toISOString();
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
   Sorting
   ============================================================ */

/**
 * Sort an array of cards by a given column key.
 * Returns a NEW sorted array (does not mutate the original).
 * @param {Card[]} cards
 * @param {string} key      - Card field name to sort by
 * @param {'asc'|'desc'} dir
 * @returns {Card[]}
 */
function sortCards(cards, key, dir) {
  const multiplier = dir === 'asc' ? 1 : -1;

  return [...cards].sort((a, b) => {
    let av = a[key];
    let bv = b[key];

    // Computed fields not stored on the object
    if (key === 'adjPrice') { av = adjPrice(a); bv = adjPrice(b); }
    if (key === 'profit')   { av = calcProfit(a).profit ?? -Infinity; bv = calcProfit(b).profit ?? -Infinity; }
    if (key === 'pct')      { av = calcProfit(a).pct    ?? -Infinity; bv = calcProfit(b).pct    ?? -Infinity; }

    // Nulls always sort last regardless of direction
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;

    // Numeric comparison
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) return (an - bn) * multiplier;

    // Date string comparison (ISO strings compare lexicographically correctly)
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * multiplier;
    }

    // Boolean comparison
    if (typeof av === 'boolean') return ((av ? 1 : 0) - (bv ? 1 : 0)) * multiplier;

    return 0;
  });
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
 * Format an ISO date string as a compact date+time.
 * e.g. "Apr 10, 2:34 PM"
 * Returns '—' for falsy / invalid input.
 * @param {string|null} iso
 * @returns {string}
 */
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
 * Generate an auto filename like "tcg-tracker-2025-04-10.csv"
 * @returns {string}
 */
function generateFilename() {
  const d   = new Date();
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `tcg-tracker-${y}-${m}-${day}.csv`;
}

/**
 * Trigger a CSV download in the browser.
 * Uses the File System Access API (showSaveFilePicker) when available —
 * this opens a native "Save As" dialog so the user can choose the location.
 * Falls back to a standard anchor-download on unsupported browsers.
 * @param {Card[]} cards
 * @returns {Promise<void>}
 */
async function downloadCSV(cards) {
  const content  = exportCSV(cards);
  const filename = generateFilename();

  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      const fh = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'CSV spreadsheet',
          accept: { 'text/csv': ['.csv'] },
        }],
      });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled — do nothing
      // Other errors: fall through to anchor download
    }
  }

  // Fallback — browser auto-chooses the Downloads folder
  const blob = new Blob([content], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
    const obj  = {};
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
 * Preserves dateAdded from the CSV; sets lastUpdated to now if missing.
 * @param {Object} row
 * @returns {Card}
 */
function csvRowToCard(row) {
  const now = new Date().toISOString();
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
    dateAdded:   row.dateAdded   || now,
    lastUpdated: row.lastUpdated || now,
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

/**
 * Try to look up a card via a TCGPlayer URL by extracting the numeric product ID,
 * then querying the Pokémon TCG API's tcgplayer.productId field.
 *
 * TCGPlayer URLs contain the product ID as the first numeric segment after /product/:
 *   https://www.tcgplayer.com/product/523161/pokemon-...
 *
 * Returns null when the URL format isn't recognised or the lookup finds nothing.
 * @param {string} url
 * @returns {Promise<Object|null>}  raw Pokémon TCG API card object, or null
 */
async function fetchCardByUrl(url) {
  const productMatch = url.match(/tcgplayer\.com\/product\/(\d+)/i);
  if (!productMatch) return null;

  const productId = productMatch[1];
  try {
    const res = await fetch(
      `${POKEMON_API}?q=tcgplayer.productId:${productId}` +
      `&select=id,name,images,set,number,tcgplayer`
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/* ============================================================
   Seed / dummy data
   ============================================================ */

/**
 * Returns an array of pre-populated card objects for local development.
 * Prices are approximate real-world values as of early 2025.
 * @returns {Card[]}
 */
function getSeedCards() {
  // Helper: ISO string N days ago
  const daysAgo = (n) => {
    const t = new Date();
    t.setDate(t.getDate() - n);
    return t.toISOString();
  };

  return [
    makeCard({
      name: 'Charizard ex',
      setName: 'Scarlet & Violet — 151',
      finish: 'holofoil',
      condition: 'NM',
      buyCost: '18.00',
      marketNM: 32.50,
      priceLow: 25.00,
      priceMid: 30.00,
      imageUrl: 'https://images.pokemontcg.io/sv3pt5/6_hires.png',
      link: 'https://www.tcgplayer.com/product/502558',
      tcgplayerId: 'sv3pt5-6',
      sold: false,
      dateAdded: daysAgo(14),
      lastUpdated: daysAgo(2),
    }),
    makeCard({
      name: 'Pikachu ex',
      setName: 'Scarlet & Violet — 151',
      finish: 'holofoil',
      condition: 'NM',
      buyCost: '8.50',
      marketNM: 12.00,
      priceLow: 9.00,
      priceMid: 11.00,
      imageUrl: 'https://images.pokemontcg.io/sv3pt5/25_hires.png',
      link: 'https://www.tcgplayer.com/product/523170/pokemon-scarlet-violet-151-pikachu-ex',
      tcgplayerId: 'sv3pt5-25',
      sold: false,
      dateAdded: daysAgo(14),
      lastUpdated: daysAgo(14),
    }),
    makeCard({
      name: 'Mewtwo ex',
      setName: 'Scarlet & Violet — 151',
      finish: 'holofoil',
      condition: 'LP',
      buyCost: '22.00',
      marketNM: 28.00,
      priceLow: 22.00,
      priceMid: 26.00,
      imageUrl: 'https://images.pokemontcg.io/sv3pt5/205_hires.png',
      link: 'https://www.tcgplayer.com/product/523206/pokemon-scarlet-violet-151-mewtwo-ex',
      tcgplayerId: 'sv3pt5-205',
      sold: false,
      dateAdded: daysAgo(10),
      lastUpdated: daysAgo(10),
    }),
    makeCard({
      name: 'Charizard VSTAR',
      setName: 'Pokémon GO',
      finish: 'holofoil',
      condition: 'NM',
      buyCost: '14.00',
      marketNM: 11.50,
      priceLow: 9.00,
      priceMid: 10.75,
      imageUrl: 'https://images.pokemontcg.io/pgo/10_hires.png',
      link: 'https://www.tcgplayer.com/product/482767/pokemon-pokemon-go-charizard-vstar',
      tcgplayerId: 'pgo-10',
      sold: false,
      dateAdded: daysAgo(30),
      lastUpdated: daysAgo(30),
    }),
    makeCard({
      name: 'Rayquaza VMAX',
      setName: 'Evolving Skies',
      finish: 'holofoil',
      condition: 'NM',
      buyCost: '30.00',
      marketNM: 52.00,
      priceLow: 44.00,
      priceMid: 49.00,
      imageUrl: 'https://images.pokemontcg.io/swsh7/218_hires.png',
      link: 'https://www.tcgplayer.com/product/241600/pokemon-evolving-skies-rayquaza-vmax',
      tcgplayerId: 'swsh7-218',
      sold: false,
      dateAdded: daysAgo(60),
      lastUpdated: daysAgo(5),
    }),
    makeCard({
      name: 'Umbreon VMAX',
      setName: 'Evolving Skies',
      finish: 'holofoil',
      condition: 'NM',
      buyCost: '38.00',
      marketNM: 60.00,
      priceLow: 50.00,
      priceMid: 56.00,
      imageUrl: 'https://images.pokemontcg.io/swsh7/215_hires.png',
      link: 'https://www.tcgplayer.com/product/241597/pokemon-evolving-skies-umbreon-vmax',
      tcgplayerId: 'swsh7-215',
      sold: true,
      dateAdded: daysAgo(45),
      lastUpdated: daysAgo(7),
    }),
    makeCard({
      name: 'Lugia VSTAR',
      setName: 'Silver Tempest',
      finish: 'holofoil',
      condition: 'MP',
      buyCost: '20.00',
      marketNM: 38.00,
      priceLow: 30.00,
      priceMid: 35.00,
      imageUrl: 'https://images.pokemontcg.io/swsh7/218_hires.png',
      link: 'https://www.tcgplayer.com/product/268391/pokemon-silver-tempest-lugia-vstar',
      tcgplayerId: 'swsh12-227',
      sold: false,
      dateAdded: daysAgo(20),
      lastUpdated: daysAgo(20),
    }),
    makeCard({
      name: 'Mew VMAX',
      setName: 'Fusion Strike',
      finish: 'holofoil',
      condition: 'NM',
      buyCost: '16.00',
      marketNM: 22.00,
      priceLow: 17.50,
      priceMid: 20.00,
      imageUrl: 'https://images.pokemontcg.io/swsh8/271_hires.png',
      link: 'https://www.tcgplayer.com/product/249454/pokemon-fusion-strike-mew-vmax',
      tcgplayerId: 'swsh8-271',
      sold: false,
      dateAdded: daysAgo(8),
      lastUpdated: daysAgo(8),
    }),
  ];
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
  touchUpdated,
  // Calculations
  adjPrice,
  calcProfit,
  // Sorting
  sortCards,
  // Formatters
  fmt,
  fmtPct,
  fmtTime,
  fmtDate,
  escHtml,
  // CSV
  exportCSV,
  downloadCSV,
  generateFilename,
  parseCSV,
  splitCSVLine,
  csvRowToCard,
  // API
  searchCards,
  fetchCardPrices,
  fetchCardByUrl,
  // Seed data
  getSeedCards,
};
