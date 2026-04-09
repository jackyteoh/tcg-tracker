/**
 * tracker.js — UI logic for index.html.
 * Depends on core.js (window.TCG).
 */

'use strict';

const {
  CONDITIONS, FINISH_LABELS,
  makeCard, adjPrice, calcProfit,
  fmt, fmtPct, fmtTime, escHtml,
  downloadCSV, parseCSV, csvRowToCard,
  searchCards, fetchCardPrices,
} = window.TCG;

/* ============================================================
   State
   ============================================================ */

let cards = [];
let pendingCSVData = null;
let selectedResult = null;   // { cardId, cardData, finish, prices, tcgUrl }
let refreshing = false;

/* ============================================================
   Summary bar
   ============================================================ */

function updateSummary() {
  let count = 0, cost = 0, market = 0, profit = 0;
  for (const c of cards) {
    count++;
    cost   += parseFloat(c.buyCost) || 0;
    const m = adjPrice(c);
    market += m;
    profit += m - (parseFloat(c.buyCost) || 0);
  }
  document.getElementById('sum-count').textContent  = count;
  document.getElementById('sum-cost').textContent   = fmt(cost);
  document.getElementById('sum-market').textContent = fmt(market);
  const el = document.getElementById('sum-profit');
  el.textContent = fmt(profit);
  el.className   = 'metric-value ' + (profit >= 0 ? 'pos' : 'neg');
}

/* ============================================================
   Table rendering
   ============================================================ */

/**
 * Re-render the entire card table.
 * @param {number[]} [highlightIds=[]]  IDs to briefly highlight green (after refresh)
 */
function renderTable(highlightIds = []) {
  const tbody = document.getElementById('card-body');
  tbody.innerHTML = '';

  for (const card of cards) {
    const adj              = adjPrice(card);
    const { profit, pct }  = calcProfit(card);
    const highlighted      = highlightIds.includes(card.id);

    const tr = document.createElement('tr');
    if (card.sold) tr.classList.add('sold');
    if (highlighted) tr.style.background = 'rgba(60,180,80,0.10)';

    tr.innerHTML = `
      <td>
        ${card.imageUrl
          ? `<img class="card-img"
                  src="${escHtml(card.imageUrl)}"
                  alt="${escHtml(card.name)}"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
             <div class="card-img-placeholder" style="display:none">No image</div>`
          : `<div class="card-img-placeholder" onclick="openSearchModal(${card.id})">Click to search</div>`
        }
      </td>

      <td>
        <input type="text" value="${escHtml(card.name)}" placeholder="Card name"
               oninput="setField(${card.id}, 'name', this.value)">
        ${card.setName
          ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${escHtml(card.setName)}</div>`
          : ''}
        ${card.lastRefreshed
          ? `<div class="refresh-detail">Updated ${fmtTime(card.lastRefreshed)}</div>`
          : ''}
      </td>

      <td style="font-size:12px;color:var(--text-secondary)">
        ${escHtml(FINISH_LABELS[card.finish] || card.finish || '—')}
      </td>

      <td>
        <select onchange="setField(${card.id}, 'condition', this.value)">
          ${CONDITIONS.map(c =>
            `<option value="${c}"${c === card.condition ? ' selected' : ''}>${c}</option>`
          ).join('')}
        </select>
      </td>

      <td>
        <input type="number" value="${card.buyCost}" placeholder="0.00"
               step="0.01" min="0"
               oninput="setField(${card.id}, 'buyCost', this.value)">
      </td>

      <td style="font-size:12px${highlighted ? ';color:var(--text-success)' : ''}">
        ${fmt(card.marketNM)}
      </td>

      <td style="font-size:12px;color:var(--text-secondary)">${fmt(card.priceLow)}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${fmt(card.priceMid)}</td>

      <td style="font-weight:500">
        ${adj > 0 ? fmt(adj) : '<span style="color:var(--text-tertiary)">—</span>'}
      </td>

      <td class="${profit === null ? '' : profit >= 0 ? 'profit-pos' : 'profit-neg'}">
        ${fmt(profit)}
      </td>

      <td class="${pct === null ? '' : pct >= 0 ? 'profit-pos' : 'profit-neg'}">
        ${fmtPct(pct)}
      </td>

      <td>
        ${card.link
          ? `<a href="${escHtml(card.link)}" target="_blank" rel="noopener" class="link-open">TCGPlayer</a>`
          : '<span style="font-size:11px;color:var(--text-tertiary)">—</span>'}
      </td>

      <td style="text-align:center">
        <input type="checkbox" ${card.sold ? 'checked' : ''}
               onchange="setField(${card.id}, 'sold', this.checked)">
      </td>

      <td>
        <button class="trash-btn" onclick="deleteCard(${card.id})" title="Delete card">
          &#x1F5D1;
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  updateSummary();
}

/* ============================================================
   Field mutation helpers
   ============================================================ */

function setField(id, field, value) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  card[field] = value;
  renderTable();
}

function deleteCard(id) {
  cards = cards.filter(c => c.id !== id);
  renderTable();
}

/* ============================================================
   Refresh prices
   ============================================================ */

async function refreshAllPrices() {
  if (refreshing) return;

  const refreshable = cards.filter(c => c.tcgplayerId);
  if (!refreshable.length) {
    setStatus('No cards with API data to refresh. Add cards via search first.', 'err');
    return;
  }

  refreshing = true;
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">&#8635;</span> Refreshing…';
  setStatus(
    `<span class="spin" style="display:inline-block;animation:spin 0.85s linear infinite">&#8635;</span>` +
    ` Fetching prices for ${refreshable.length} card${refreshable.length > 1 ? 's' : ''}…`, ''
  );

  let ok = 0, fail = 0;
  const updatedIds = [];

  for (const card of refreshable) {
    try {
      const prices = await fetchCardPrices(card.tcgplayerId);
      if (prices) {
        const p = prices[card.finish] || prices[Object.keys(prices)[0]] || {};
        if (p.market  !== undefined) card.marketNM  = p.market;
        if (p.low     !== undefined) card.priceLow  = p.low;
        if (p.mid     !== undefined) card.priceMid  = p.mid;
        card.lastRefreshed = Date.now();
        updatedIds.push(card.id);
        ok++;
      } else {
        fail++;
      }
    } catch {
      fail++;
    }
    // Brief pause between requests to be a polite API citizen
    await new Promise(r => setTimeout(r, 150));
  }

  renderTable(updatedIds);

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msg  = `Refreshed ${ok} card${ok !== 1 ? 's' : ''}` +
               (fail ? ` · ${fail} failed` : '') +
               `  ·  ${time}`;
  setStatus(msg, fail && !ok ? 'err' : 'ok');

  btn.disabled = false;
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 8a7 7 0 1 0 1.4-4.2"/><polyline points="1,2 1,6 5,6"/>
    </svg>
    Refresh prices`;
  refreshing = false;
}

function setStatus(html, type = '') {
  const el = document.getElementById('refresh-status-bar');
  el.className = 'refresh-status ' + type;
  el.innerHTML = html;
}

/* ============================================================
   Search modal
   ============================================================ */

function openSearchModal(editId) {
  selectedResult = null;
  document.getElementById('search-input').value = '';
  document.getElementById('search-results-area').innerHTML = '';
  document.getElementById('add-selected-btn').disabled = true;
  document.getElementById('search-modal').dataset.editId = editId || '';
  document.getElementById('search-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('search-input').focus(), 80);
}

function closeSearchModal() {
  document.getElementById('search-modal').style.display = 'none';
}

async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;

  const area  = document.getElementById('search-results-area');
  const btn   = document.getElementById('search-btn');
  area.innerHTML = '<div class="loading-state">Searching…</div>';
  btn.disabled   = true;
  selectedResult = null;
  document.getElementById('add-selected-btn').disabled = true;

  try {
    const data = await searchCards(q);
    if (!data.length) {
      area.innerHTML = '<div class="no-results">No cards found. Try a different name.</div>';
      return;
    }
    renderSearchResults(data);
  } catch {
    area.innerHTML = '<div class="no-results">Search failed. Check your connection and try again.</div>';
  } finally {
    btn.disabled = false;
  }
}

function renderSearchResults(data) {
  const area = document.getElementById('search-results-area');
  area.innerHTML = '';
  area.className = 'search-results';

  for (const card of data) {
    const prices      = card.tcgplayer?.prices || {};
    const finishKeys  = Object.keys(prices);
    const defaultFin  = finishKeys[0] || null;

    const div = document.createElement('div');
    div.className = 'result-card';
    div.dataset.cardId         = card.id;
    div.dataset.selectedFinish = defaultFin || '';

    const pricePills = finishKeys.map(fk => {
      const p = prices[fk];
      return `<span class="price-pill${fk === defaultFin ? ' selected-type' : ''}"
                     data-finish="${fk}"
                     onclick="selectFinish('${card.id}','${fk}',event)">
                ${FINISH_LABELS[fk] || fk}: ${p.market ? '$' + Number(p.market).toFixed(2) : '—'}
              </span>`;
    }).join('');

    const finishBtns = finishKeys.length > 1
      ? finishKeys.map(fk =>
          `<button class="finish-btn${fk === defaultFin ? ' active' : ''}"
                   data-finish="${fk}"
                   onclick="selectFinish('${card.id}','${fk}',event)">
             ${FINISH_LABELS[fk] || fk}
           </button>`
        ).join('')
      : '';

    div.innerHTML = `
      <img class="result-img" src="${escHtml(card.images?.small || '')}" alt="${escHtml(card.name)}">
      <div class="result-info">
        <div class="result-name">${escHtml(card.name)}</div>
        <div class="result-set">${escHtml(card.set?.name || '')} · #${escHtml(card.number || '')}</div>
        <div class="result-prices">
          ${pricePills || '<span style="font-size:11px;color:var(--text-tertiary)">No price data</span>'}
        </div>
        ${finishBtns ? `<div class="finish-picker">${finishBtns}</div>` : ''}
      </div>
    `;

    // Store full card data for later
    div.dataset.cardJson = JSON.stringify({
      id:       card.id,
      name:     card.name,
      imageUrl: card.images?.large || card.images?.small || '',
      setName:  card.set?.name || '',
      tcgplayer: card.tcgplayer || null,
    });

    div.addEventListener('click', () => selectResultCard(card, div));
    area.appendChild(div);
  }
}

function selectFinish(cardId, finish, evt) {
  evt.stopPropagation();
  const div = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!div) return;
  div.dataset.selectedFinish = finish;
  div.querySelectorAll('.price-pill').forEach(p => p.classList.toggle('selected-type', p.dataset.finish === finish));
  div.querySelectorAll('.finish-btn').forEach(b => b.classList.toggle('active', b.dataset.finish === finish));
  if (selectedResult && selectedResult.cardId === cardId) selectedResult.finish = finish;
}

function selectResultCard(card, div) {
  document.querySelectorAll('.result-card').forEach(d => d.classList.remove('selected'));
  div.classList.add('selected');

  const finish   = div.dataset.selectedFinish || Object.keys(card.tcgplayer?.prices || {})[0] || 'normal';
  const cardData = JSON.parse(div.dataset.cardJson);

  selectedResult = {
    cardId: card.id,
    cardData,
    finish,
    prices: card.tcgplayer?.prices || {},
    tcgUrl: card.tcgplayer?.url   || '',
  };
  document.getElementById('add-selected-btn').disabled = false;
}

function addSelectedCard() {
  if (!selectedResult) return;

  const { cardData, finish, prices, tcgUrl } = selectedResult;
  const p = prices[finish] || {};

  const editId = parseInt(document.getElementById('search-modal').dataset.editId) || 0;
  const entry  = {
    name:        cardData.name,
    imageUrl:    cardData.imageUrl,
    setName:     cardData.setName,
    finish,
    marketNM:    p.market ?? null,
    priceLow:    p.low    ?? null,
    priceMid:    p.mid    ?? null,
    link:        tcgUrl || '',
    condition:   'NM',
    buyCost:     '',
    sold:        false,
    tcgplayerId: cardData.id,
  };

  if (editId) {
    const idx = cards.findIndex(c => c.id === editId);
    if (idx >= 0) cards[idx] = { ...cards[idx], ...entry };
  } else {
    cards.push(makeCard(entry));
  }

  closeSearchModal();
  renderTable();
}

/* ============================================================
   CSV import
   ============================================================ */

function triggerImport() {
  document.getElementById('file-input').click();
}

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    pendingCSVData = evt.target.result;
    document.getElementById('import-modal').style.display = 'flex';
  };
  reader.readAsText(file);
  e.target.value = '';
}

function closeImportModal() {
  document.getElementById('import-modal').style.display = 'none';
  pendingCSVData = null;
}

function doImport(mode) {
  if (!pendingCSVData) return;
  const rows = parseCSV(pendingCSVData);
  if (mode === 'replace') cards = [];
  for (const row of rows) cards.push(csvRowToCard(row));
  closeImportModal();
  renderTable();
}

/* ============================================================
   CSV export
   ============================================================ */

function exportCSV() {
  downloadCSV(cards);
}

/* ============================================================
   Keyboard shortcuts
   ============================================================ */

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSearchModal();
    closeImportModal();
  }
});

/* ============================================================
   Init
   ============================================================ */

renderTable();
