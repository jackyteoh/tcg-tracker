/**
 * tests.js — unit test suite for tests.html.
 * Depends on core.js (window.TCG).
 */

'use strict';

const {
  CONDITIONS, COND_MULT, FINISH_LABELS,
  makeCard, resetIdCounter, touchUpdated,
  adjPrice, calcProfit, sortCards,
  fmt, fmtPct, fmtDate,
  exportCSV, parseCSV, splitCSVLine, csvRowToCard,
  generateFilename, getSeedCards,
} = window.TCG;

/* ============================================================
   Micro assertion library
   ============================================================ */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `${msg || 'Expected equal'} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
    );
  }
}

function assertClose(actual, expected, eps = 0.001, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(
      `${msg || 'Expected approximately equal'} — got ${actual}, expected ${expected} (±${eps})`
    );
  }
}

function assertNull(val, msg) {
  if (val !== null) {
    throw new Error(`${msg || 'Expected null'} — got ${JSON.stringify(val)}`);
  }
}

function assertThrows(fn, msg) {
  try { fn(); }
  catch { return; }
  throw new Error(msg || 'Expected function to throw, but it did not');
}

/* ============================================================
   Test groups
   ============================================================ */

const TEST_GROUPS = [

  {
    name: 'Condition multipliers & adjusted price',
    tests: [
      {
        name: 'NM condition uses 1.0x multiplier',
        fn: () => {
          const c = makeCard({ marketNM: 10, condition: 'NM' });
          assertClose(adjPrice(c), 10);
        },
      },
      {
        name: 'LP condition uses 0.85x multiplier',
        fn: () => {
          const c = makeCard({ marketNM: 10, condition: 'LP' });
          assertClose(adjPrice(c), 8.5);
        },
      },
      {
        name: 'MP condition uses 0.70x multiplier',
        fn: () => {
          const c = makeCard({ marketNM: 10, condition: 'MP' });
          assertClose(adjPrice(c), 7.0);
        },
      },
      {
        name: 'HP condition uses 0.50x multiplier',
        fn: () => {
          const c = makeCard({ marketNM: 10, condition: 'HP' });
          assertClose(adjPrice(c), 5.0);
        },
      },
      {
        name: 'DMG condition uses 0.30x multiplier',
        fn: () => {
          const c = makeCard({ marketNM: 10, condition: 'DMG' });
          assertClose(adjPrice(c), 3.0);
        },
      },
      {
        name: 'Falls back to priceMid when marketNM is null',
        fn: () => {
          const c = makeCard({ marketNM: null, priceMid: 8, condition: 'NM' });
          assertClose(adjPrice(c), 8);
        },
      },
      {
        name: 'Returns 0 when all prices are null',
        fn: () => {
          const c = makeCard({ marketNM: null, priceMid: null, condition: 'NM' });
          assertClose(adjPrice(c), 0);
        },
      },
      {
        name: 'Condition multiplier applied on priceMid fallback',
        fn: () => {
          const c = makeCard({ marketNM: null, priceMid: 10, condition: 'LP' });
          assertClose(adjPrice(c), 8.5);
        },
      },
      {
        name: 'marketNM takes priority over priceMid',
        fn: () => {
          const c = makeCard({ marketNM: 20, priceMid: 5, condition: 'NM' });
          assertClose(adjPrice(c), 20);
        },
      },
    ],
  },

  {
    name: 'Profit & profit % calculation',
    tests: [
      {
        name: 'Positive profit: market > buy cost',
        fn: () => {
          const c = makeCard({ marketNM: 20, buyCost: '10', condition: 'NM' });
          const { profit, pct } = calcProfit(c);
          assertClose(profit, 10);
          assertClose(pct, 100);
        },
      },
      {
        name: 'Negative profit: market < buy cost',
        fn: () => {
          const c = makeCard({ marketNM: 5, buyCost: '10', condition: 'NM' });
          assertClose(calcProfit(c).profit, -5);
        },
      },
      {
        name: 'Profit is null when buyCost is empty string',
        fn: () => {
          const c = makeCard({ marketNM: 20, buyCost: '', condition: 'NM' });
          assertNull(calcProfit(c).profit);
        },
      },
      {
        name: 'Profit is null when buyCost is zero',
        fn: () => {
          const c = makeCard({ marketNM: 20, buyCost: '0', condition: 'NM' });
          assertNull(calcProfit(c).profit);
        },
      },
      {
        name: 'Profit is null when no price data',
        fn: () => {
          const c = makeCard({ marketNM: null, priceMid: null, buyCost: '10', condition: 'NM' });
          assertNull(calcProfit(c).profit);
        },
      },
      {
        name: 'Profit % is 50% when buy=10, market=15 at NM',
        fn: () => {
          const c = makeCard({ marketNM: 15, buyCost: '10', condition: 'NM' });
          assertClose(calcProfit(c).pct, 50);
        },
      },
      {
        name: 'Condition multiplier is factored into profit',
        fn: () => {
          // LP: 10 * 0.85 = 8.5 adj; profit = 8.5 - 6 = 2.5
          const c = makeCard({ marketNM: 10, buyCost: '6', condition: 'LP' });
          assertClose(calcProfit(c).profit, 2.5, 0.01);
        },
      },
      {
        name: 'Breakeven: profit=0 when buy equals adjusted price',
        fn: () => {
          const c = makeCard({ marketNM: 10, buyCost: '10', condition: 'NM' });
          assertClose(calcProfit(c).profit, 0);
        },
      },
      {
        name: 'pct is null when profit is null',
        fn: () => {
          const c = makeCard({ marketNM: null, buyCost: '10', condition: 'NM' });
          assertNull(calcProfit(c).pct);
        },
      },
    ],
  },

  {
    name: 'fmt() and fmtPct() display formatting',
    tests: [
      {
        name: 'Formats positive number as dollar string',
        fn: () => assertEqual(fmt(3.5), '$3.50'),
      },
      {
        name: 'Formats zero as $0.00',
        fn: () => assertEqual(fmt(0), '$0.00'),
      },
      {
        name: 'Returns — for null',
        fn: () => assertEqual(fmt(null), '—'),
      },
      {
        name: 'Returns — for undefined',
        fn: () => assertEqual(fmt(undefined), '—'),
      },
      {
        name: 'Returns — for NaN',
        fn: () => assertEqual(fmt(NaN), '—'),
      },
      {
        name: 'Respects custom decimal places (0)',
        fn: () => assertEqual(fmt(1.5, 0), '$2'),
      },
      {
        name: 'fmtPct shows + sign for positive',
        fn: () => assertEqual(fmtPct(50), '+50.0%'),
      },
      {
        name: 'fmtPct shows no + for negative',
        fn: () => assertEqual(fmtPct(-20), '-20.0%'),
      },
      {
        name: 'fmtPct returns — for null',
        fn: () => assertEqual(fmtPct(null), '—'),
      },
      {
        name: 'fmtPct returns — for NaN',
        fn: () => assertEqual(fmtPct(NaN), '—'),
      },
      {
        name: 'fmt handles large numbers correctly',
        fn: () => assertEqual(fmt(1234.5), '$1234.50'),
      },
    ],
  },

  {
    name: 'CSV export & import round-trip',
    tests: [
      {
        name: 'Exported CSV has correct header columns',
        fn: () => {
          const csv = exportCSV([]);
          const header = csv.split('\n')[0];
          ['name', 'condition', 'buyCost', 'marketNM', 'tcgplayerId', 'sold', 'finish'].forEach(col => {
            assert(header.includes(col), `Missing header column: ${col}`);
          });
        },
      },
      {
        name: 'Single card exports and re-imports with correct field values',
        fn: () => {
          const card = makeCard({ name: 'Charizard', condition: 'LP', buyCost: '25', finish: 'holofoil', tcgplayerId: 'xy1-1' });
          const rows = parseCSV(exportCSV([card]));
          assertEqual(rows.length, 1);
          assertEqual(rows[0].name, 'Charizard');
          assertEqual(rows[0].condition, 'LP');
          assertEqual(rows[0].buyCost, '25');
          assertEqual(rows[0].finish, 'holofoil');
          assertEqual(rows[0].tcgplayerId, 'xy1-1');
        },
      },
      {
        name: 'Numeric price fields survive export/import',
        fn: () => {
          const card = makeCard({ marketNM: 12.50, priceLow: 10.00, priceMid: 11.25 });
          const rows = parseCSV(exportCSV([card]));
          assertClose(parseFloat(rows[0].marketNM), 12.50);
          assertClose(parseFloat(rows[0].priceLow), 10.00);
          assertClose(parseFloat(rows[0].priceMid), 11.25);
        },
      },
      {
        name: 'sold=true survives round-trip',
        fn: () => {
          const card = makeCard({ name: 'Pikachu', sold: true });
          const rows = parseCSV(exportCSV([card]));
          assertEqual(rows[0].sold, 'true');
        },
      },
      {
        name: 'sold=false survives round-trip',
        fn: () => {
          const card = makeCard({ name: 'Pikachu', sold: false });
          const rows = parseCSV(exportCSV([card]));
          assertEqual(rows[0].sold, 'false');
        },
      },
      {
        name: 'Card name with commas survives round-trip',
        fn: () => {
          const card = makeCard({ name: 'Pikachu, base set' });
          const rows = parseCSV(exportCSV([card]));
          assertEqual(rows[0].name, 'Pikachu, base set');
        },
      },
      {
        name: 'Card name with double-quotes survives round-trip',
        fn: () => {
          const card = makeCard({ name: 'Pikachu "the great"' });
          const rows = parseCSV(exportCSV([card]));
          assertEqual(rows[0].name, 'Pikachu "the great"');
        },
      },
      {
        name: 'Multiple cards all export correctly',
        fn: () => {
          const cards = [makeCard({ name: 'A' }), makeCard({ name: 'B' }), makeCard({ name: 'C' })];
          const rows  = parseCSV(exportCSV(cards));
          assertEqual(rows.length, 3);
          assertEqual(rows[0].name, 'A');
          assertEqual(rows[2].name, 'C');
        },
      },
      {
        name: 'parseCSV returns [] for header-only input',
        fn: () => {
          const csv  = exportCSV([]);
          const rows = parseCSV(csv);
          assertEqual(rows.length, 0);
        },
      },
      {
        name: 'csvRowToCard restores condition from string',
        fn: () => {
          const card = makeCard({ condition: 'MP', buyCost: '5' });
          const rows = parseCSV(exportCSV([card]));
          const restored = csvRowToCard(rows[0]);
          assertEqual(restored.condition, 'MP');
        },
      },
      {
        name: 'csvRowToCard defaults invalid condition to NM',
        fn: () => {
          const restored = csvRowToCard({ condition: 'INVALID' });
          assertEqual(restored.condition, 'NM');
        },
      },
    ],
  },

  {
    name: 'makeCard defaults & overrides',
    tests: [
      { name: 'Default condition is NM',      fn: () => assertEqual(makeCard().condition, 'NM') },
      { name: 'Default finish is normal',      fn: () => assertEqual(makeCard().finish, 'normal') },
      { name: 'Default sold is false',         fn: () => assertEqual(makeCard().sold, false) },
      { name: 'Default marketNM is null',      fn: () => assertNull(makeCard().marketNM) },
      { name: 'Default priceLow is null',      fn: () => assertNull(makeCard().priceLow) },
      { name: 'Default priceMid is null',      fn: () => assertNull(makeCard().priceMid) },
      { name: 'Default tcgplayerId is empty',  fn: () => assertEqual(makeCard().tcgplayerId, '') },
      {
        name: 'Override fields are applied',
        fn: () => {
          const c = makeCard({ name: 'Mewtwo', buyCost: '50', condition: 'HP' });
          assertEqual(c.name, 'Mewtwo');
          assertEqual(c.buyCost, '50');
          assertEqual(c.condition, 'HP');
        },
      },
      {
        name: 'Each call produces a unique id',
        fn: () => {
          const a = makeCard(), b = makeCard();
          assert(a.id !== b.id, 'IDs should be different');
        },
      },
    ],
  },

  {
    name: 'Condition list completeness',
    tests: [
      {
        name: 'All 5 conditions defined in COND_MULT',
        fn: () => {
          ['NM', 'LP', 'MP', 'HP', 'DMG'].forEach(c => {
            assert(COND_MULT[c] !== undefined, `Missing condition: ${c}`);
          });
        },
      },
      {
        name: 'NM multiplier is exactly 1.0',
        fn: () => assertEqual(COND_MULT.NM, 1.0),
      },
      {
        name: 'All multipliers are between 0 (exclusive) and 1 (inclusive)',
        fn: () => {
          Object.values(COND_MULT).forEach(v => {
            assert(v > 0 && v <= 1, `Out of range: ${v}`);
          });
        },
      },
      {
        name: 'Multipliers are strictly decreasing: NM → DMG',
        fn: () => {
          const vals = ['NM', 'LP', 'MP', 'HP', 'DMG'].map(c => COND_MULT[c]);
          for (let i = 1; i < vals.length; i++) {
            assert(vals[i] < vals[i - 1], `Not decreasing at index ${i}: ${vals[i - 1]} → ${vals[i]}`);
          }
        },
      },
      {
        name: 'CONDITIONS array has all 5 entries',
        fn: () => {
          assertEqual(CONDITIONS.length, 5);
          ['NM', 'LP', 'MP', 'HP', 'DMG'].forEach(c => {
            assert(CONDITIONS.includes(c), `Missing from CONDITIONS: ${c}`);
          });
        },
      },
    ],
  },

  {
    name: 'splitCSVLine edge cases',
    tests: [
      {
        name: 'Splits simple unquoted fields',
        fn: () => {
          const result = splitCSVLine('a,b,c');
          assertEqual(result.length, 3);
          assertEqual(result[1], 'b');
        },
      },
      {
        name: 'Handles quoted field with comma inside',
        fn: () => {
          const result = splitCSVLine('"hello, world",foo');
          assertEqual(result[0], 'hello, world');
          assertEqual(result[1], 'foo');
        },
      },
      {
        name: 'Handles empty fields',
        fn: () => {
          const result = splitCSVLine('a,,c');
          assertEqual(result[1], '');
        },
      },
    ],
  },

  {
    name: 'Date fields — dateAdded & lastUpdated',
    tests: [
      {
        name: 'makeCard sets dateAdded to a valid ISO string',
        fn: () => {
          const c = makeCard();
          assert(typeof c.dateAdded === 'string', 'dateAdded should be a string');
          assert(!isNaN(new Date(c.dateAdded)), 'dateAdded should be a valid date');
        },
      },
      {
        name: 'makeCard sets lastUpdated to a valid ISO string',
        fn: () => {
          const c = makeCard();
          assert(!isNaN(new Date(c.lastUpdated)), 'lastUpdated should be a valid date');
        },
      },
      {
        name: 'dateAdded override is preserved by makeCard',
        fn: () => {
          const iso = '2024-01-15T10:00:00.000Z';
          const c   = makeCard({ dateAdded: iso });
          assertEqual(c.dateAdded, iso);
        },
      },
      {
        name: 'touchUpdated mutates lastUpdated to a more recent time',
        fn: () => {
          const c = makeCard({ lastUpdated: '2020-01-01T00:00:00.000Z' });
          touchUpdated(c);
          assert(c.lastUpdated > '2020-01-01T00:00:00.000Z', 'lastUpdated should be more recent after touch');
        },
      },
      {
        name: 'dateAdded and lastUpdated survive CSV round-trip',
        fn: () => {
          const iso  = '2024-06-01T12:00:00.000Z';
          const card = makeCard({ dateAdded: iso, lastUpdated: iso });
          const rows = parseCSV(exportCSV([card]));
          assertEqual(rows[0].dateAdded,   iso);
          assertEqual(rows[0].lastUpdated, iso);
        },
      },
      {
        name: 'csvRowToCard preserves dateAdded from CSV row',
        fn: () => {
          const iso      = '2023-11-20T08:30:00.000Z';
          const restored = csvRowToCard({ dateAdded: iso });
          assertEqual(restored.dateAdded, iso);
        },
      },
      {
        name: 'fmtDate returns — for null',
        fn: () => assertEqual(fmtDate(null), '—'),
      },
      {
        name: 'fmtDate returns — for empty string',
        fn: () => assertEqual(fmtDate(''), '—'),
      },
      {
        name: 'fmtDate returns — for an invalid date string',
        fn: () => assertEqual(fmtDate('not-a-date'), '—'),
      },
      {
        name: 'fmtDate returns a formatted string for a valid ISO date',
        fn: () => {
          const result = fmtDate('2024-04-10T14:30:00.000Z');
          assert(result.length > 3, 'fmtDate should return a non-trivial string');
          assert(result !== '—', 'fmtDate should not return — for a valid date');
        },
      },
    ],
  },

  {
    name: 'Sorting — sortCards()',
    tests: [
      {
        name: 'Sorts by name ascending (A → Z)',
        fn: () => {
          const input  = [makeCard({ name: 'Zekrom' }), makeCard({ name: 'Arcanine' }), makeCard({ name: 'Mewtwo' })];
          const sorted = sortCards(input, 'name', 'asc');
          assertEqual(sorted[0].name, 'Arcanine');
          assertEqual(sorted[2].name, 'Zekrom');
        },
      },
      {
        name: 'Sorts by name descending (Z → A)',
        fn: () => {
          const input  = [makeCard({ name: 'Arcanine' }), makeCard({ name: 'Zekrom' })];
          const sorted = sortCards(input, 'name', 'desc');
          assertEqual(sorted[0].name, 'Zekrom');
        },
      },
      {
        name: 'Sorts by buyCost numerically ascending',
        fn: () => {
          const input  = [makeCard({ buyCost: '30' }), makeCard({ buyCost: '5' }), makeCard({ buyCost: '12' })];
          const sorted = sortCards(input, 'buyCost', 'asc');
          assertEqual(sorted[0].buyCost, '5');
          assertEqual(sorted[2].buyCost, '30');
        },
      },
      {
        name: 'Sorts by marketNM descending',
        fn: () => {
          const input  = [makeCard({ marketNM: 10 }), makeCard({ marketNM: 50 }), makeCard({ marketNM: 25 })];
          const sorted = sortCards(input, 'marketNM', 'desc');
          assertEqual(sorted[0].marketNM, 50);
          assertEqual(sorted[2].marketNM, 10);
        },
      },
      {
        name: 'Null values sort last regardless of direction',
        fn: () => {
          const a = makeCard({ marketNM: 20 });
          const b = makeCard({ marketNM: null });
          const c = makeCard({ marketNM: 5 });
          const asc  = sortCards([b, a, c], 'marketNM', 'asc');
          const desc = sortCards([b, a, c], 'marketNM', 'desc');
          assertEqual(asc[asc.length - 1].marketNM,   null);
          assertEqual(desc[desc.length - 1].marketNM, null);
        },
      },
      {
        name: 'Does not mutate the original array',
        fn: () => {
          const input  = [makeCard({ name: 'B' }), makeCard({ name: 'A' })];
          const sorted = sortCards(input, 'name', 'asc');
          assertEqual(input[0].name,  'B', 'Original array should be unchanged');
          assertEqual(sorted[0].name, 'A', 'Sorted array should be reordered');
        },
      },
      {
        name: 'Sorts by dateAdded ISO string ascending (older first)',
        fn: () => {
          const older  = makeCard({ dateAdded: '2023-01-01T00:00:00.000Z' });
          const newer  = makeCard({ dateAdded: '2024-06-01T00:00:00.000Z' });
          const sorted = sortCards([newer, older], 'dateAdded', 'asc');
          assertEqual(sorted[0].dateAdded, '2023-01-01T00:00:00.000Z');
        },
      },
      {
        name: 'Sorts by sold boolean ascending (false before true)',
        fn: () => {
          const a = makeCard({ sold: true  });
          const b = makeCard({ sold: false });
          const sorted = sortCards([a, b], 'sold', 'asc');
          assertEqual(sorted[0].sold, false);
        },
      },
    ],
  },

  {
    name: 'generateFilename()',
    tests: [
      {
        name: 'Returns a string ending in .csv',
        fn: () => {
          const name = generateFilename();
          assert(name.endsWith('.csv'), 'Expected .csv suffix, got: ' + name);
        },
      },
      {
        name: 'Starts with tcg-tracker-',
        fn: () => {
          const name = generateFilename();
          assert(name.startsWith('tcg-tracker-'), 'Expected tcg-tracker- prefix, got: ' + name);
        },
      },
      {
        name: "Contains today's year",
        fn: () => {
          const name = generateFilename();
          const year = String(new Date().getFullYear());
          assert(name.includes(year), 'Expected year ' + year + ' in filename: ' + name);
        },
      },
      {
        name: 'Matches pattern tcg-tracker-YYYY-MM-DD.csv',
        fn: () => {
          const name = generateFilename();
          assert(/tcg-tracker-\d{4}-\d{2}-\d{2}\.csv/.test(name),
            'Filename "' + name + '" does not match expected pattern');
        },
      },
    ],
  },

  {
    name: 'Seed data — getSeedCards()',
    tests: [
      {
        name: 'Returns a non-empty array',
        fn: () => {
          const seeds = getSeedCards();
          assert(Array.isArray(seeds) && seeds.length > 0, 'getSeedCards should return a non-empty array');
        },
      },
      {
        name: 'Every card has a non-empty name',
        fn: () => {
          getSeedCards().forEach((c, i) => {
            assert(c.name.length > 0, 'Card at index ' + i + ' has empty name');
          });
        },
      },
      {
        name: 'Every card has a valid condition',
        fn: () => {
          getSeedCards().forEach(c => {
            assert(CONDITIONS.includes(c.condition), 'Card "' + c.name + '" has invalid condition: ' + c.condition);
          });
        },
      },
      {
        name: 'Every card has a valid dateAdded ISO string',
        fn: () => {
          getSeedCards().forEach(c => {
            assert(!isNaN(new Date(c.dateAdded)), 'Card "' + c.name + '" has invalid dateAdded: ' + c.dateAdded);
          });
        },
      },
      {
        name: 'At least one sold card exists in seed data',
        fn: () => {
          assert(getSeedCards().some(c => c.sold === true), 'Seed data should include at least one sold card');
        },
      },
    ],
  },

];

/* ============================================================
   Test runner
   ============================================================ */

let logLines = [];

function log(msg) {
  logLines.push(msg);
  const el = document.getElementById('log-area');
  if (el) { el.textContent = logLines.join('\n'); el.scrollTop = el.scrollHeight; }
}

function toggleLog() {
  const el = document.getElementById('log-area');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function runAll() {
  logLines = [];
  resetIdCounter();

  const btn = document.getElementById('run-btn');
  btn.disabled    = true;
  btn.textContent = 'Running…';

  const t0         = performance.now();
  let totalPass    = 0;
  let totalFail    = 0;
  const totalTests = TEST_GROUPS.reduce((s, g) => s + g.tests.length, 0);
  let done         = 0;
  const groupResults = [];

  for (const group of TEST_GROUPS) {
    const gResults = [];
    for (const test of group.tests) {
      const start = performance.now();
      let status  = 'pass';
      let err     = null;
      try {
        await test.fn();
      } catch (e) {
        status = 'fail';
        err    = e.message;
      }
      const dur = performance.now() - start;
      gResults.push({ name: test.name, status, err, dur });

      if (status === 'pass') {
        totalPass++;
        log(`PASS  ${group.name} > ${test.name}`);
      } else {
        totalFail++;
        log(`FAIL  ${group.name} > ${test.name}\n      ${err}`);
      }

      done++;
      document.getElementById('progress').style.width = (done / totalTests * 100) + '%';
      await new Promise(r => setTimeout(r, 10));
    }
    groupResults.push({ group, results: gResults });
  }

  const elapsed = performance.now() - t0;
  document.getElementById('m-total').textContent = totalTests;
  document.getElementById('m-pass').textContent  = totalPass;
  document.getElementById('m-fail').textContent  = totalFail;
  document.getElementById('m-dur').textContent   = elapsed.toFixed(0) + 'ms';

  /* Render results */
  const area = document.getElementById('results-area');
  area.innerHTML = '';

  for (const { group, results } of groupResults) {
    const groupFail = results.filter(r => r.status === 'fail').length;
    const allPass   = groupFail === 0;

    const div = document.createElement('div');
    div.className = 'group';
    div.innerHTML = `
      <div class="group-header" onclick="toggleGroup(this)">
        <span>${escHtml(group.name)}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="group-badge ${allPass ? 'badge-pass' : 'badge-fail'}">
            ${allPass ? 'All passed' : groupFail + ' failed'} · ${results.length} tests
          </span>
          <span class="group-chevron">▼</span>
        </div>
      </div>
      <div class="test-list">
        ${results.map(r => `
          <div class="test-row ${r.status}">
            <span class="test-icon">${r.status === 'pass' ? '✓' : '✗'}</span>
            <div class="test-name">
              ${escHtml(r.name)}
              ${r.err ? `<div class="test-err">${escHtml(r.err)}</div>` : ''}
              <div class="test-detail">${r.dur.toFixed(1)} ms</div>
            </div>
          </div>`
        ).join('')}
      </div>`;
    area.appendChild(div);
  }

  btn.disabled  = false;
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,2 13,8 3,14"/></svg>
    Run all tests`;
}

function toggleGroup(header) {
  const list = header.nextElementSibling;
  const isCollapsed = list.style.display === 'none';
  list.style.display = isCollapsed ? 'flex' : 'none';
  header.classList.toggle('collapsed', !isCollapsed);
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   Event Listeners - test page
   ============================================================ */

const test_toggle_log_btn = document.getElementById("test-toggle-log-btn");

test_toggle_log_btn.addEventListener("click", toggleLog);

const run_all_btn = document.getElementById("run-btn")

run_all_btn.addEventListener("click", runAll);
