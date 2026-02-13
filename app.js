/**
 * finance.dashboard — app.js v3
 */

// ─── State ────────────────────────────────────────────────
let allTx       = [];
let rothPositions = [];
let hysaTx      = [];
let charts      = {};
let currentUser = null;
let dataFolder  = null;
let settings    = {};
let loadedFiles = [];

// ─── Init ─────────────────────────────────────────────────
(function init() {
  if (sessionStorage.getItem('finance_auth') !== 'true') {
    window.location.href = 'index.html';
    return;
  }
  currentUser = sessionStorage.getItem('finance_user');
  dataFolder  = sessionStorage.getItem('finance_dataFolder');
  const displayName = sessionStorage.getItem('finance_displayName') || currentUser;

  // Merge settings: config → session → localStorage
  const configUser    = window.FINANCE_CONFIG.users[currentUser];
  const sessionSettings = JSON.parse(sessionStorage.getItem('finance_budgetSettings') || '{}');
  const localSettings   = JSON.parse(localStorage.getItem('finance_settings_' + currentUser) || '{}');
  settings = { ...configUser.settings, ...sessionSettings, ...localSettings };

  document.getElementById('userTag').textContent        = displayName;
  document.getElementById('expectedPath').textContent   = dataFolder + '/Debit012026.csv';
  document.getElementById('settingsPath').textContent   = dataFolder + '/';

  populateSettingsForm();
  loadData();
})();

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ─── Settings ─────────────────────────────────────────────
function populateSettingsForm() {
  setVal('settingRent',          settings.rentAmount    || '');
  setVal('settingHysa',          settings.hysaBalance   || '');
  setVal('settingIncomeOverride', settings.incomeOverride || '');
  setVal('settingIncomeKeyword',  settings.incomeKeyword || '');
}
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

function saveSettings() {
  settings.rentAmount     = parseFloat(document.getElementById('settingRent').value) || 0;
  settings.hysaBalance    = parseFloat(document.getElementById('settingHysa').value) || 0;
  settings.incomeOverride = parseFloat(document.getElementById('settingIncomeOverride').value) || null;
  settings.incomeKeyword  = document.getElementById('settingIncomeKeyword').value.trim();
  localStorage.setItem('finance_settings_' + currentUser, JSON.stringify(settings));
  if (allTx.length > 0) renderAll();
  showToast('settings saved');
}

// ─── Load Data ────────────────────────────────────────────
async function loadData() {
  showScreen('loading');
  const cfg   = window.FINANCE_CONFIG;
  const base  = cfg.githubPagesBase;
  const start = cfg.dataStartDate;
  const now   = new Date();

  // build month list
  const months = [];
  let y = start.year, m = start.month;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push({ month: m, year: y });
    if (++m > 12) { m = 1; y++; }
  }

  function tag(mo, yr) { return String(mo).padStart(2,'0') + yr; }
  async function tryFetch(url) {
    try {
      const r = await fetch(url + '?t=' + Date.now());
      return r.ok ? r.text() : null;
    } catch { return null; }
  }

  loadedFiles = [];
  let allDebit = [], allCredit = [];
  rothPositions = [];
  hysaTx = [];

  const results = await Promise.all(months.map(async ({ month, year }) => {
    const t = tag(month, year);
    const [dt, ct, ht, rt] = await Promise.all([
      tryFetch(`${base}/${dataFolder}/Debit${t}.csv`),
      tryFetch(`${base}/${dataFolder}/Credit${t}.csv`),
      tryFetch(`${base}/${dataFolder}/HYSA${t}.csv`),
      tryFetch(`${base}/${dataFolder}/Roth${t}.csv`),
    ]);
    return { t, dt, ct, ht, rt };
  }));

  // use last found Roth (most recent)
  let lastRoth = null;
  results.forEach(({ t, dt, ct, ht, rt }) => {
    if (dt) { allDebit.push(...parseCSV(dt));  loadedFiles.push(`Debit${t}`); }
    if (ct) { allCredit.push(...parseCSV(ct)); loadedFiles.push(`Credit${t}`); }
    if (ht) { hysaTx.push(...parseHYSA(ht));   loadedFiles.push(`HYSA${t}`); }
    if (rt) { lastRoth = rt; loadedFiles.push(`Roth${t}`); }
  });

  if (lastRoth) rothPositions = parseRoth(lastRoth);

  if (!allDebit.length && !allCredit.length) { showScreen('error'); return; }

  allTx = detectTransfers([
    ...allDebit.map(r  => normalizeRow(r, 'debit')),
    ...allCredit.map(r => normalizeRow(r, 'credit'))
  ]);
  allTx.sort((a, b) => b.date - a.date);

  document.getElementById('filesLoaded').textContent  = loadedFiles.length;
  document.getElementById('dataPathHint').textContent = dataFolder + '/';
  document.getElementById('lastUpdated').textContent  = 'updated ' + new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }).toLowerCase();

  populateFilters();
  renderAll();
  showScreen('dashboard');
}

function showScreen(s) {
  document.getElementById('loadingScreen').style.display = s==='loading'   ? 'block' : 'none';
  document.getElementById('errorScreen').style.display   = s==='error'     ? 'block' : 'none';
  document.getElementById('dashboard').style.display     = s==='dashboard' ? 'block' : 'none';
}

// ─── CSV Parsers ──────────────────────────────────────────
function parseCSV(text) {
  return Papa.parse(text, { header:true, skipEmptyLines:true }).data || [];
}

function parseHYSA(text) {
  const rows = Papa.parse(text, { header:true, skipEmptyLines:true }).data || [];
  return rows.map(r => ({
    date:   parseDate(r['Transaction date'] || r['Date'] || ''),
    desc:   (r['Description'] || '').trim(),
    type:   (r['Type'] || '').trim(),
    amount: parseAmt(r['Amount'] || '0'),
  })).filter(r => r.date);
}

function parseRoth(text) {
  const rows = Papa.parse(text, { header:true, skipEmptyLines:true }).data || [];
  return rows.map(r => ({
    symbol:       (r['Symbol'] || '').trim(),
    description:  (r['Description'] || '').trim(),
    quantity:     parseAmt(r['Quantity'] || '0'),
    lastPrice:    parseAmt(r['Last Price'] || '0'),
    currentValue: parseAmt(r['Current Value'] || '0'),
    todayGL:      parseAmt(r['Today\'s Gain/Loss Dollar'] || '0'),
    totalGL:      parseAmt(r['Total Gain/Loss Dollar'] || '0'),
    totalGLPct:   parseAmt(r['Total Gain/Loss Percent'] || '0'),
    pctAccount:   parseAmt(r['Percent Of Account'] || '0'),
    costBasis:    parseAmt(r['Cost Basis Total'] || '0'),
  })).filter(r => r.symbol);
}

function normalizeRow(row, accountType) {
  return {
    date:        parseDate(row['Post Date'] || ''),
    description: (row['Description'] || '').trim(),
    category:    (row['Classification'] || 'Uncategorized').trim(),
    accountType,
    debit:       parseAmt(row['Debit']   || '0'),
    credit:      parseAmt(row['Credit']  || '0'),
    balance:     parseAmt(row['Balance'] || '0'),
    isTransfer:  false
  };
}

function parseAmt(s) {
  return parseFloat(s.toString().replace(/[$,%]/g,'').replace(/,/g,'').trim()) || 0;
}
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// ─── Transfer Detection ───────────────────────────────────
function detectTransfers(txs) {
  const W = 3 * 86400000;
  txs.filter(t => t.accountType==='credit' && t.credit>0).forEach(p => {
    const m = txs.find(t => t.accountType==='debit' && t.debit===p.credit && Math.abs(t.date-p.date)<=W && !t.isTransfer);
    if (m) { p.isTransfer=true; m.isTransfer=true; }
  });
  return txs;
}

// ─── Helpers ─────────────────────────────────────────────
function fmt(n, decimals=2) {
  const abs = Math.abs(n);
  return '$' + abs.toLocaleString('en-US', { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
}
function fmtPct(n) { return (n>=0?'+':'') + n.toFixed(1) + '%'; }
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function monthLabel(k) { const [y,m]=k.split('-'); return new Date(y,m-1,1).toLocaleString('en-US',{month:'short',year:'numeric'}).toLowerCase(); }
function getActive() { return allTx.filter(t => !t.isTransfer); }
function getMonths() { return [...new Set(allTx.map(t => monthKey(t.date)))].sort(); }
function showToast(msg) { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }

// ─── Income Detection ─────────────────────────────────────
function getMonthlyIncome(tx, mk) {
  if (settings.incomeOverride) return settings.incomeOverride;
  const kw = (settings.incomeKeyword||'').toLowerCase();
  return tx.filter(t => monthKey(t.date)===mk && t.credit>0 && t.accountType==='debit' && !t.isTransfer &&
                        (kw ? t.description.toLowerCase().includes(kw) : true))
           .reduce((s,t)=>s+t.credit, 0);
}

// ─── Category Spend ───────────────────────────────────────
function getCategorySpend(tx, cat, mk) {
  if (cat === 'Housing') return settings.rentAmount || 0;
  return tx.filter(t => monthKey(t.date)===mk && t.category===cat && t.debit>0 && !t.isTransfer)
           .reduce((s,t)=>s+t.debit, 0);
}

// ─── Populate Filters ─────────────────────────────────────
function populateFilters() {
  const months = getMonths();
  // transactions filter
  const sel = document.getElementById('filterMonth');
  sel.innerHTML = '<option value="all">all months</option>';
  months.forEach(m => { const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m); sel.appendChild(o); });

  // budget month
  const bsel = document.getElementById('budgetMonth');
  bsel.innerHTML = '';
  [...months].reverse().forEach((m,i) => {
    const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m);
    if (i===0) o.selected=true;
    bsel.appendChild(o);
  });

  // overview month
  const osel = document.getElementById('overviewMonth');
  osel.innerHTML = '';
  [...months].reverse().forEach((m,i) => {
    const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m);
    if (i===0) o.selected=true;
    osel.appendChild(o);
  });
}

// ─── Render All ───────────────────────────────────────────
function renderAll() {
  renderNetWorth();
  renderOverview();
  renderBudget();
  renderTrends();
  renderRecurring();
  renderPortfolio();
  renderTable();
}

// ─── Net Worth ────────────────────────────────────────────
function renderNetWorth() {
  const tx = getActive();
  // checking: last balance from debit txs
  const debitTx   = tx.filter(t => t.accountType==='debit' && t.balance>0);
  const checkBal  = debitTx.length ? debitTx[0].balance : 0;
  // credit: last balance
  const creditTx  = tx.filter(t => t.accountType==='credit' && t.balance>0);
  const creditBal = creditTx.length ? creditTx[0].balance : 0;
  const hysa      = settings.hysaBalance || 0;
  const roth      = rothPositions.reduce((s,p)=>s+p.currentValue, 0);
  const total     = checkBal + hysa + roth - creditBal;
  const stagnant  = checkBal + hysa;
  const working   = roth;
  const ratio     = total > 0 ? (working/total*100) : 0;

  setText('nwChecking', fmt(checkBal));
  setText('nwCredit',   fmt(creditBal));
  setText('nwHysa',     fmt(hysa));
  setText('nwRoth',     roth > 0 ? fmt(roth) : '—');
  setText('nwTotal',    fmt(total));
  setText('moneyStagnant', fmt(stagnant));
  setText('moneyWorking',  fmt(working));
  setText('moneyRatio',    ratio.toFixed(1) + '%');
}

// ─── Overview ─────────────────────────────────────────────
function renderOverview() {
  const mk     = document.getElementById('overviewMonth')?.value;
  if (!mk) return;
  const tx     = getActive();
  const income = getMonthlyIncome(tx, mk);
  const spent  = tx.filter(t=>monthKey(t.date)===mk && t.debit>0).reduce((s,t)=>s+t.debit,0);
  const rem    = income - spent;
  const savPct = income > 0 ? (rem/income*100) : 0;

  setText('ovIncome',      fmt(income));
  setText('ovSpent',       fmt(spent));
  const remEl = document.getElementById('ovRemaining');
  if (remEl) { remEl.textContent = fmt(rem); remEl.className = 's-value ' + (rem>=0?'pos':'neg'); }
  const savEl = document.getElementById('ovSavingsRate');
  if (savEl) { savEl.textContent = savPct.toFixed(1)+'%'; savEl.className = 's-value ' + (savPct>=20?'pos':''); }
  const remBar = document.getElementById('ovRemainingBar');
  if (remBar) remBar.style.width = Math.min(Math.max((rem/income*100),0),100).toFixed(1)+'%';
  const savBar = document.getElementById('ovSavingsBar');
  if (savBar) savBar.style.width = Math.min(Math.max(savPct,0),100).toFixed(1)+'%';
}

// ─── Budget Matrix ────────────────────────────────────────
function renderBudget() {
  const mk     = document.getElementById('budgetMonth')?.value;
  if (!mk) return;
  const tx     = getActive();
  const income = getMonthlyIncome(tx, mk);
  const ratios = settings.budgetRatios || { housing:0.41, otherNeeds:0.15, wants:0.20, savings:0.24 };

  // Build groups
  const groups = [
    {
      key: 'housing', label: 'housing', budget: income * ratios.housing,
      rows: [{ name: 'Rent / Housing', cat: 'Housing', actual: settings.rentAmount || 0, budget: income * ratios.housing }]
    },
    {
      key: 'needs', label: 'needs', budget: income * ratios.otherNeeds,
      rows: (settings.needsCategories || ['Groceries','Transportation','Utilities']).map(cat => ({
        name: cat.toLowerCase(), cat, actual: getCategorySpend(tx, cat, mk), budget: income * ratios.otherNeeds / 3
      }))
    },
    {
      key: 'wants', label: 'wants', budget: income * ratios.wants,
      rows: (settings.wantsCategories || ['Dining','Shopping','Entertainment','Health & Fitness','Pharmacy','Business Services']).map(cat => ({
        name: cat.toLowerCase(), cat, actual: getCategorySpend(tx, cat, mk), budget: income * ratios.wants / 6
      }))
    },
  ];

  let totalBudget = income;
  let totalSpent  = groups.reduce((s,g) => s + g.rows.reduce((ss,r)=>ss+r.actual,0), 0);
  let leftover    = income - totalSpent;

  setText('budgetTotal',   fmt(income));
  setText('budgetSpent',   fmt(totalSpent));
  setText('budgetLeftover', fmt(leftover));

  const el = document.getElementById('budgetMatrix');
  el.innerHTML = `
    <div class="matrix-header">
      <span>category</span>
      <span>spent</span>
      <span>budget</span>
      <span>diff</span>
      <span>progress</span>
    </div>`;

  groups.forEach(group => {
    const groupActual = group.rows.reduce((s,r)=>s+r.actual,0);
    const groupDiff   = group.budget - groupActual;
    const over        = groupActual > group.budget;
    const pct         = group.budget > 0 ? Math.min(groupActual/group.budget*100,100) : 0;
    const diffClass   = over ? 'neg' : 'pos';

    const subId = 'sub_' + group.key;
    el.innerHTML += `
      <div class="matrix-row group-header" onclick="toggleGroup('${subId}')">
        <div class="row-name"><span class="caret" id="caret_${subId}">▶</span> ${group.label}</div>
        <div class="row-val">${fmt(groupActual)}</div>
        <div class="row-val" style="color:var(--muted)">${fmt(group.budget)}</div>
        <div class="row-val row-diff ${diffClass}">${over?'-':'+'}${fmt(Math.abs(groupDiff))}</div>
        <div class="row-bar-cell">
          <div class="mini-bar"><div class="mini-bar-fill" style="width:${pct.toFixed(1)}%;background:${over?'var(--negative)':'var(--ink)'}"></div></div>
        </div>
      </div>
      <div class="sub-rows collapsed" id="${subId}">
        ${group.rows.map(row => {
          const rowPct  = row.budget>0 ? Math.min(row.actual/row.budget*100,100) : 0;
          const rowOver = row.actual > row.budget;
          const rowDiff = row.budget - row.actual;
          return `
          <div class="matrix-row sub-row">
            <div class="row-name">${row.name}</div>
            <div class="row-val">${fmt(row.actual)}</div>
            <div class="row-val" style="color:var(--muted)">${fmt(row.budget)}</div>
            <div class="row-val row-diff ${rowOver?'neg':'pos'}">${rowOver?'-':'+'}${fmt(Math.abs(rowDiff))}</div>
            <div class="row-bar-cell">
              <div class="mini-bar"><div class="mini-bar-fill" style="width:${rowPct.toFixed(1)}%;background:${rowOver?'var(--negative)':'var(--positive)'}"></div></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  });

  // Savings row
  const savBudget = income * (ratios.savings || 0.24);
  const savActual = Math.max(0, income - totalSpent);
  const savOver   = savActual < savBudget;
  const savDiff   = savActual - savBudget;
  el.innerHTML += `
    <div class="matrix-row group-header" style="border-top: 1px solid var(--border);">
      <div class="row-name" style="padding-left:0">savings</div>
      <div class="row-val ${savOver?'neg':'pos'}">${fmt(savActual)}</div>
      <div class="row-val" style="color:var(--muted)">${fmt(savBudget)}</div>
      <div class="row-val row-diff ${savOver?'neg':'pos'}">${savDiff>=0?'+':'-'}${fmt(Math.abs(savDiff))}</div>
      <div class="row-bar-cell">
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.min(savActual/savBudget*100,100).toFixed(1)}%;background:${savOver?'var(--negative)':'var(--positive)'}"></div></div>
      </div>
    </div>`;
}

function toggleGroup(id) {
  const el    = document.getElementById(id);
  const caret = document.getElementById('caret_' + id);
  if (!el) return;
  el.classList.toggle('collapsed');
  if (caret) caret.classList.toggle('open');
}

// ─── Trends ───────────────────────────────────────────────
function renderTrends() {
  const months  = getMonths();
  const last3   = months.slice(-3);
  if (last3.length < 1) return;
  const tx      = getActive();
  const allCats = [...new Set(tx.filter(t=>t.debit>0).map(t=>t.category))].sort();

  const el = document.getElementById('trendMatrix');
  const m0 = last3[last3.length-1];
  const m1 = last3[last3.length-2];
  const m2 = last3[last3.length-3];

  el.innerHTML = `
    <div class="trend-header">
      <span>category</span>
      <span>${m2 ? monthLabel(m2) : '—'}</span>
      <span>${m1 ? monthLabel(m1) : '—'}</span>
      <span>${monthLabel(m0)}</span>
      <span>vs prev</span>
      <span>vs 2mo</span>
    </div>`;

  allCats.forEach(cat => {
    const v0 = tx.filter(t=>monthKey(t.date)===m0&&t.category===cat&&t.debit>0).reduce((s,t)=>s+t.debit,0);
    const v1 = m1 ? tx.filter(t=>monthKey(t.date)===m1&&t.category===cat&&t.debit>0).reduce((s,t)=>s+t.debit,0) : 0;
    const v2 = m2 ? tx.filter(t=>monthKey(t.date)===m2&&t.category===cat&&t.debit>0).reduce((s,t)=>s+t.debit,0) : 0;
    if (v0===0 && v1===0 && v2===0) return;
    const d1 = m1 ? v0-v1 : null;
    const d2 = m2 ? v0-v2 : null;
    const cls1 = d1===null ? '' : d1>0?'up':'down';
    const cls2 = d2===null ? '' : d2>0?'up':'down';
    el.innerHTML += `
      <div class="trend-row">
        <div style="font-size:0.78rem">${cat.toLowerCase()}</div>
        <div class="trend-val">${v2>0?fmt(v2):'—'}</div>
        <div class="trend-val">${v1>0?fmt(v1):'—'}</div>
        <div class="trend-val">${v0>0?fmt(v0):'—'}</div>
        <div class="trend-diff ${cls1}">${d1===null?'—':(d1>0?'+':'')+fmt(d1)}</div>
        <div class="trend-diff ${cls2}">${d2===null?'—':(d2>0?'+':'')+fmt(d2)}</div>
      </div>`;
  });
}

// ─── Recurring Detection ──────────────────────────────────
function renderRecurring() {
  const tx     = getActive().filter(t => t.debit>0);
  const months = getMonths();
  if (months.length < 2) return;

  // Group by description — find items appearing in 2+ months with similar amounts
  const byDesc = {};
  tx.forEach(t => {
    const key = t.description.toLowerCase().trim();
    if (!byDesc[key]) byDesc[key] = [];
    byDesc[key].push(t);
  });

  const recurring = [];
  Object.entries(byDesc).forEach(([desc, txs]) => {
    const monthsPresent = [...new Set(txs.map(t=>monthKey(t.date)))];
    if (monthsPresent.length < 2) return;
    const avg    = txs.reduce((s,t)=>s+t.debit,0) / txs.length;
    const latest = txs.sort((a,b)=>b.date-a.date)[0];
    // check consistency — stdev < 10% of avg
    const stdev = Math.sqrt(txs.reduce((s,t)=>s+Math.pow(t.debit-avg,2),0)/txs.length);
    if (stdev/avg > 0.25 && avg > 5) return; // too variable unless small amount
    recurring.push({
      description: latest.description,
      category:    latest.category,
      avgAmount:   avg,
      monthsFound: monthsPresent.length,
      lastDate:    latest.date,
      frequency:   monthsPresent.length >= 3 ? 'monthly' : '2+ months',
    });
  });
  recurring.sort((a,b) => b.avgAmount - a.avgAmount);

  const el = document.getElementById('recurringList');
  if (!recurring.length) {
    el.innerHTML = '<div style="padding:32px 16px; text-align:center; color:var(--muted); font-size:0.78rem">no recurring expenses detected yet — need 2+ months of data</div>';
    return;
  }
  el.innerHTML = `
    <div class="recurring-header">
      <span>description</span>
      <span>category</span>
      <span style="text-align:right">avg amount</span>
      <span style="text-align:right">frequency</span>
    </div>` +
    recurring.map(r => `
      <div class="recurring-row">
        <div class="rec-name">${r.description.toLowerCase()}</div>
        <div style="color:var(--muted); font-size:0.72rem">${r.category.toLowerCase()}</div>
        <div class="rec-val">${fmt(r.avgAmount)}</div>
        <div class="rec-val"><span class="rec-badge">${r.frequency}</span></div>
      </div>`).join('');
}

// ─── Portfolio ────────────────────────────────────────────
function renderPortfolio() {
  // Roth positions
  const el = document.getElementById('positionsList');
  if (!rothPositions.length) {
    el.innerHTML = '<div style="padding:32px 16px; text-align:center; color:var(--muted); font-size:0.78rem">upload Roth012026.csv to see positions</div>';
    setText('rothTotal', '—'); setText('rothGain', '—'); setText('rothToday', '—');
  } else {
    const total     = rothPositions.reduce((s,p)=>s+p.currentValue,0);
    const totalGain = rothPositions.reduce((s,p)=>s+p.totalGL,0);
    const todayGL   = rothPositions.reduce((s,p)=>s+p.todayGL,0);
    setText('rothTotal', fmt(total));
    const gainEl = document.getElementById('rothGain');
    if (gainEl) { gainEl.textContent = (totalGain>=0?'+':'')+fmt(totalGain); gainEl.className = 'nw-value ' + (totalGain>=0?'pos':'neg'); }
    const todayEl = document.getElementById('rothToday');
    if (todayEl) { todayEl.textContent = (todayGL>=0?'+':'')+fmt(todayGL); todayEl.className = 'nw-value ' + (todayGL>=0?'pos':'neg'); }

    el.innerHTML = `
      <div class="positions-header">
        <span>symbol</span>
        <span>description</span>
        <span>value</span>
        <span>cost basis</span>
        <span>total gain</span>
        <span>% of acct</span>
      </div>` +
      rothPositions.map(p => `
        <div class="position-row">
          <div class="pos-symbol">${p.symbol}</div>
          <div style="font-size:0.75rem; color:var(--muted)">${p.description.toLowerCase()}</div>
          <div class="pos-val">${p.currentValue>0?fmt(p.currentValue):'—'}</div>
          <div class="pos-val" style="color:var(--muted)">${p.costBasis>0?fmt(p.costBasis):'—'}</div>
          <div class="pos-gain ${p.totalGL>=0?'pos':'neg'}">${p.totalGL!==0?(p.totalGL>0?'+':'')+fmt(p.totalGL):'—'}</div>
          <div class="pos-val" style="color:var(--muted)">${p.pctAccount>0?p.pctAccount.toFixed(1)+'%':'—'}</div>
        </div>`).join('');
  }

  // HYSA
  const hysa    = settings.hysaBalance || 0;
  const interest = hysaTx.filter(t=>t.type.toLowerCase().includes('interest')).reduce((s,t)=>s+t.amount,0);
  const lastTx   = hysaTx.sort((a,b)=>b.date-a.date)[0];
  setText('hysaBalance',  fmt(hysa));
  setText('hysaInterest', interest>0 ? fmt(interest) : '—');
  setText('hysaLast',     lastTx ? fmt(lastTx.amount) : '—');
  setText('hysaLastDate', lastTx ? lastTx.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}).toLowerCase() : '');
}

// ─── Transactions ─────────────────────────────────────────
function renderTable() {
  const mf = document.getElementById('filterMonth')?.value   || 'all';
  const af = document.getElementById('filterAccount')?.value || 'all';
  const tf = document.getElementById('filterType')?.value    || 'all';
  let filtered = allTx.filter(t => {
    if (mf!=='all' && monthKey(t.date)!==mf) return false;
    if (af!=='all' && t.accountType!==af)    return false;
    if (tf==='expense' && !(t.debit>0  && !t.isTransfer)) return false;
    if (tf==='income'  && !(t.credit>0 && !t.isTransfer)) return false;
    return true;
  });

  const body = document.getElementById('tableBody');
  if (!filtered.length) {
    body.innerHTML = '<div class="tx-empty">no transactions match your filters</div>';
    return;
  }
  body.innerHTML = filtered.map(t => {
    const d = t.date.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
    const badge = t.isTransfer
      ? `<span class="tx-badge transfer-badge">transfer</span>`
      : t.accountType==='debit'
        ? `<span class="tx-badge debit-badge">checking</span>`
        : `<span class="tx-badge credit-badge">credit</span>`;
    return `<div class="tx-row">
      <div class="tx-date">${d}</div>
      <div class="tx-desc">${t.description.toLowerCase()}</div>
      <div class="tx-cat">${t.category.toLowerCase()}</div>
      <div>${badge}</div>
      ${t.debit>0  ? `<div class="tx-debit">-${fmt(t.debit)}</div>`   : '<div></div>'}
      ${t.credit>0 ? `<div class="tx-credit">+${fmt(t.credit)}</div>` : '<div></div>'}
    </div>`;
  }).join('');
}

// ─── Tab Switch ───────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector(`.nav-btn[onclick="switchTab('${name}')"]`).classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}

// ─── Utils ────────────────────────────────────────────────
function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }
