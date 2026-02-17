/**
 * finance.dashboard — app.js v4
 * 4-level drill-down budget matrix, inline reclassify, oct 2025+
 */

// ─── State ────────────────────────────────────────────────
let allTx         = [];
let rothPositions = [];
let hysaTx        = [];
let charts        = {};
let currentUser   = null;
let dataFolder    = null;
let settings      = {};
let loadedFiles   = [];
let reclassify    = {};
let txMerchantFilter = null;  // for drill-through from recurring

// ─── Init ─────────────────────────────────────────────────
(function init() {
  if (sessionStorage.getItem('finance_auth') !== 'true') { window.location.href = 'index.html'; return; }
  currentUser = sessionStorage.getItem('finance_user');
  dataFolder  = sessionStorage.getItem('finance_dataFolder');
  const displayName = sessionStorage.getItem('finance_displayName') || currentUser;

  const configUser     = window.FINANCE_CONFIG.users[currentUser];
  const sessionSettings = JSON.parse(sessionStorage.getItem('finance_budgetSettings') || '{}');
  const localSettings   = JSON.parse(localStorage.getItem('finance_settings_' + currentUser) || '{}');
  settings    = { ...configUser.settings, ...sessionSettings, ...localSettings };
  reclassify  = JSON.parse(localStorage.getItem('finance_reclassify_' + currentUser) || '{}');

  setText('userTag',      displayName);
  setText('expectedPath', dataFolder + '/Debit102025.csv');
  document.getElementById('settingsPath').textContent = dataFolder + '/';

  populateSettingsForm();
  loadData();
})();

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ─── Settings ─────────────────────────────────────────────
function populateSettingsForm() {
  setVal('settingRent',           settings.rentAmount    || '');
  setVal('settingHysa',           settings.hysaBalance   || '');
  setVal('settingIncomeOverride',  settings.incomeOverride || '');
  setVal('settingIncomeKeyword',   settings.incomeKeyword || '');
}
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function saveSettings() {
  settings.rentAmount     = parseFloat(document.getElementById('settingRent').value) || 0;
  settings.hysaBalance    = parseFloat(document.getElementById('settingHysa').value) || 0;
  settings.incomeOverride = parseFloat(document.getElementById('settingIncomeOverride').value) || null;
  settings.incomeKeyword  = document.getElementById('settingIncomeKeyword').value.trim();
  localStorage.setItem('finance_settings_' + currentUser, JSON.stringify(settings));
  if (allTx.length) renderAll();
  showToast('settings saved');
}

// ─── Load Data ────────────────────────────────────────────
async function loadData() {
  showScreen('loading');
  const cfg   = window.FINANCE_CONFIG;
  const base  = cfg.githubPagesBase;
  const start = cfg.dataStartDate;
  const now   = new Date();

  const months = [];
  let y = start.year, m = start.month;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push({ month: m, year: y });
    if (++m > 12) { m = 1; y++; }
  }

  function tag(mo, yr) { return String(mo).padStart(2,'0') + yr; }
  async function tryFetch(url) {
    try { const r = await fetch(url + '?t=' + Date.now()); return r.ok ? r.text() : null; }
    catch { return null; }
  }

  loadedFiles = [];
  let allDebit = [], allCredit = [];
  rothPositions = []; hysaTx = [];
  let lastRoth = null;

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

  results.forEach(({ t, dt, ct, ht, rt }) => {
    if (dt) { allDebit.push(...parseCSV(dt));  loadedFiles.push(`Debit${t}`); }
    if (ct) { allCredit.push(...parseCSV(ct)); loadedFiles.push(`Credit${t}`); }
    if (ht) { hysaTx.push(...parseHYSA(ht));   loadedFiles.push(`HYSA${t}`); }
    if (rt) { lastRoth = rt;                    loadedFiles.push(`Roth${t}`); }
  });

  if (lastRoth) rothPositions = parseRoth(lastRoth);
  if (!allDebit.length && !allCredit.length) { showScreen('error'); return; }

  allTx = detectTransfers([
    ...allDebit.map(r  => normalizeRow(r, 'debit')),
    ...allCredit.map(r => normalizeRow(r, 'credit'))
  ]);
  allTx.sort((a, b) => b.date - a.date);

  // apply saved reclassifications
  applyReclassify();

  setText('filesLoaded',  loadedFiles.length + '');
  setText('dataPathHint', dataFolder + '/');
  setText('lastUpdated',  'updated ' + new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).toLowerCase());

  populateFilters();
  renderAll();
  showScreen('dashboard');
}

function showScreen(s) {
  document.getElementById('loadingScreen').style.display = s==='loading'   ? 'block' : 'none';
  document.getElementById('errorScreen').style.display   = s==='error'     ? 'block' : 'none';
  document.getElementById('dashboard').style.display     = s==='dashboard' ? 'block' : 'none';
}

// ─── Reclassify ───────────────────────────────────────────
function txKey(t) {
  return [t.date.toISOString().slice(0,10), t.description, t.debit, t.credit].join('|');
}

function applyReclassify() {
  allTx.forEach(t => {
    const k = txKey(t);
    if (reclassify[k]) t.category = reclassify[k];
  });
}

function reclassifyTx(key, newCat) {
  reclassify[key] = newCat;
  localStorage.setItem('finance_reclassify_' + currentUser, JSON.stringify(reclassify));
  applyReclassify();
  renderBudget();
  renderTable();
  showToast('transaction reclassified');
}

// ─── CSV Parsers ──────────────────────────────────────────
function parseCSV(text) { return Papa.parse(text, { header:true, skipEmptyLines:true }).data || []; }

function parseHYSA(text) {
  return (Papa.parse(text, { header:true, skipEmptyLines:true }).data || []).map(r => ({
    date:   parseDate(r['Transaction date'] || r['Date'] || ''),
    desc:   (r['Description'] || '').trim(),
    type:   (r['Type'] || '').trim(),
    amount: parseAmt(r['Amount'] || '0'),
  })).filter(r => r.date);
}

function parseRoth(text) {
  return (Papa.parse(text, { header:true, skipEmptyLines:true }).data || []).map(r => ({
    symbol:       (r['Symbol'] || '').trim(),
    description:  (r['Description'] || '').trim(),
    currentValue: parseAmt(r['Current Value'] || '0'),
    todayGL:      parseAmt(r["Today's Gain/Loss Dollar"] || '0'),
    totalGL:      parseAmt(r['Total Gain/Loss Dollar'] || '0'),
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
    isTransfer:  false,
  };
}

function parseAmt(s) { return parseFloat(s.toString().replace(/[$,%]/g,'').replace(/,/g,'').trim()) || 0; }
function parseDate(s) { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; }

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
function fmt(n) { return '$' + Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function monthLabel(k) { const [y,m]=k.split('-'); return new Date(y,m-1,1).toLocaleString('en-US',{month:'short',year:'numeric'}).toLowerCase(); }
function getActive() { return allTx.filter(t => !t.isTransfer); }
function getMonths() { return [...new Set(allTx.map(t => monthKey(t.date)))].sort(); }
function showToast(msg) { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2400); }

// ─── Income ───────────────────────────────────────────────
function getIncome(tx, mk) {
  if (settings.incomeOverride) return settings.incomeOverride;
  const kw = (settings.incomeKeyword||'').toLowerCase();
  return tx.filter(t => monthKey(t.date)===mk && t.credit>0 && t.accountType==='debit' && !t.isTransfer &&
                        (kw ? t.description.toLowerCase().includes(kw) : true))
           .reduce((s,t) => s+t.credit, 0);
}

// ─── Spend Helpers ────────────────────────────────────────
function catSpend(tx, cat, mk) {
  if (cat === 'Housing') return settings.rentAmount || 0;
  return tx.filter(t => monthKey(t.date)===mk && t.category===cat && t.debit>0 && !t.isTransfer)
           .reduce((s,t) => s+t.debit, 0);
}

// ─── Merchant grouping ────────────────────────────────────
function merchantName(desc) {
  // strip numbers, special chars, clean to core merchant name
  return desc.toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[#*_\-\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').slice(0, 3).join(' ');
}

function groupByMerchant(txs) {
  const groups = {};
  txs.forEach(t => {
    const key = merchantName(t.description);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  return groups;
}

// ─── Populate Filters ─────────────────────────────────────
function populateFilters() {
  // Only show months where we actually have loaded files
  const allMonths = getMonths();
  const loadedMonthTags = loadedFiles.map(f => {
    // Extract MMYYYY from filenames like "Debit012026"
    const match = f.match(/(\d{6})$/);
    return match ? match[1] : null;
  }).filter(Boolean);
  
  // Convert tags to month keys (YYYY-MM)
  const loadedMonthKeys = [...new Set(loadedMonthTags.map(tag => {
    const mm = tag.slice(0,2);
    const yyyy = tag.slice(2);
    return yyyy + '-' + mm;
  }))].sort();
  
  // Use loaded months for all dropdowns
  const months = loadedMonthKeys.length ? loadedMonthKeys : allMonths;
  
  ['filterMonth'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="all">all months</option>';
    months.forEach(m => { const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m); sel.appendChild(o); });
  });
  ['budgetMonth','overviewMonth'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    [...months].reverse().forEach((m,i) => {
      const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m);
      if (i===0) o.selected=true;
      sel.appendChild(o);
    });
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
  const tx       = getActive();
  const debitBal = (tx.find(t => t.accountType==='debit' && t.balance>0)||{}).balance || 0;
  const creditBal= (tx.find(t => t.accountType==='credit'&& t.balance>0)||{}).balance || 0;
  const hysa     = settings.hysaBalance || 0;
  const roth     = rothPositions.reduce((s,p)=>s+p.currentValue, 0);
  const total    = debitBal + hysa + roth - creditBal;
  const stagnant = debitBal;                 // checking only
  const working  = hysa + roth;             // hysa + roth = working
  const ratio    = total > 0 ? (working/total*100) : 0;

  setText('nwChecking', fmt(debitBal));
  setText('nwCredit',   fmt(creditBal));
  setText('nwHysa',     fmt(hysa));
  setText('nwRoth',     roth > 0 ? fmt(roth) : '—');
  setText('nwTotal',    fmt(total));
  setText('mStagnant',  fmt(stagnant));
  setText('mWorking',   fmt(working));
  setText('mRatio',     ratio.toFixed(1) + '%');
}

// ─── Overview ─────────────────────────────────────────────
function renderOverview() {
  const mk     = document.getElementById('overviewMonth')?.value;
  if (!mk) return;
  const tx     = getActive();
  const income = getIncome(tx, mk);
  const spent  = tx.filter(t=>monthKey(t.date)===mk&&t.debit>0).reduce((s,t)=>s+t.debit,0);
  const rem    = income - spent;
  const savPct = income > 0 ? (rem/income*100) : 0;

  setText('ovIncome', fmt(income));
  setText('ovSpent',  fmt(spent));
  const remEl = document.getElementById('ovRemaining');
  if (remEl) { remEl.textContent=fmt(rem); remEl.className='card-value '+(rem>=0?'pos':'neg'); }
  const savEl = document.getElementById('ovSavRate');
  if (savEl) { savEl.textContent=savPct.toFixed(1)+'%'; savEl.className='card-value '+(savPct>=20?'pos':''); }
  const remB = document.getElementById('ovRemBar');
  if (remB) remB.style.width = Math.min(Math.max(rem/income*100,0),100).toFixed(1)+'%';
  const savB = document.getElementById('ovSavBar');
  if (savB) savB.style.width = Math.min(Math.max(savPct,0),100).toFixed(1)+'%';
}

// ─── Budget Matrix (4 levels) ─────────────────────────────
function renderBudget() {
  const mk     = document.getElementById('budgetMonth')?.value;
  if (!mk) return;
  const tx     = getActive();
  const income = getIncome(tx, mk);
  const ratios = settings.budgetRatios || { housing:0.41, otherNeeds:0.15, wants:0.20, savings:0.24 };

  const allCats = [
    { group:'needs',  label:'needs',  budget: income * (ratios.housing + ratios.otherNeeds),
      categories: ['Housing', ...(settings.needsCategories||['Groceries','Transportation','Utilities'])] },
    { group:'wants',  label:'wants',  budget: income * ratios.wants,
      categories: settings.wantsCategories||['Dining','Shopping','Entertainment','Health & Fitness','Pharmacy','Business Services'] },
  ];

  let totalSpent = 0;
  const el = document.getElementById('budgetMatrix');

  // build matrix HTML
  let html = `<div class="mx-head">
    <span>category</span><span>spent</span><span>budget</span><span>diff</span><span>bar</span>
  </div>`;

  allCats.forEach(group => {
    const groupSpent  = group.categories.reduce((s,c) => s + catSpend(tx,c,mk), 0);
    const groupBudget = group.budget;
    const groupDiff   = groupBudget - groupSpent;
    const groupOver   = groupSpent > groupBudget;
    const groupPct    = groupBudget > 0 ? Math.min(groupSpent/groupBudget*100,100) : 0;
    totalSpent += groupSpent;

    const gid = 'g_' + group.group;
    html += `
      <div class="mx-group" onclick="toggleMx('${gid}')">
        <div class="mx-group-name"><span class="caret open" id="c_${gid}">▶</span>${group.label}</div>
        <div class="mx-val">${fmt(groupSpent)}</div>
        <div class="mx-val" style="color:var(--muted)">${fmt(groupBudget)}</div>
        <div class="mx-diff ${groupOver?'neg':'pos'}">${groupOver?'-':'+'}${fmt(Math.abs(groupDiff))}</div>
        <div class="minibar"><div class="minibar-fill" style="width:${groupPct.toFixed(1)}%;background:${groupOver?'var(--neg)':'var(--ink)'}"></div></div>
      </div>
      <div id="${gid}">`;

    // level 2 — categories
    group.categories.forEach(cat => {
      const catBudget  = cat==='Housing' ? income*ratios.housing
                       : group.group==='needs' ? income*ratios.otherNeeds/((settings.needsCategories||[]).length||3)
                       : income*ratios.wants/((settings.wantsCategories||[]).length||6);
      const catActual  = catSpend(tx, cat, mk);
      const catDiff    = catBudget - catActual;
      const catOver    = catActual > catBudget;
      const catPct     = catBudget > 0 ? Math.min(catActual/catBudget*100,100) : 0;

      // transactions for this category this month
      const catTx = cat==='Housing' ? [] :
        tx.filter(t => monthKey(t.date)===mk && t.category===cat && t.debit>0 && !t.isTransfer);

      // group into merchants
      const merchants = groupByMerchant(catTx);
      const catId  = 'cat_' + group.group + '_' + cat.replace(/\s/g,'_');
      html += `
        <div class="mx-cat" onclick="toggleMx('${catId}')">
          <div class="mx-cat-name"><span class="caret" id="c_${catId}">▶</span>${cat.toLowerCase()}</div>
          <div class="mx-val">${fmt(catActual)}</div>
          <div class="mx-val" style="color:var(--muted)">${fmt(catBudget)}</div>
          <div class="mx-diff ${catOver?'neg':'pos'}">${catOver?'-':'+'}${fmt(Math.abs(catDiff))}</div>
          <div class="minibar"><div class="minibar-fill" style="width:${catPct.toFixed(1)}%;background:${catOver?'var(--neg)':catPct>=80?'var(--warn)':'var(--pos)'}"></div></div>
        </div>
        <div class="hidden" id="${catId}">`;

      // level 3 — merchants
      Object.entries(merchants).sort((a,b) =>
        b[1].reduce((s,t)=>s+t.debit,0) - a[1].reduce((s,t)=>s+t.debit,0)
      ).forEach(([merchant, mtxs]) => {
        const mSpent = mtxs.reduce((s,t)=>s+t.debit,0);
        const mid    = 'mx_' + catId + '_' + merchant.replace(/\s/g,'_').slice(0,20);
        html += `
          <div class="mx-merchant" onclick="toggleMx('${mid}')">
            <div class="mx-merchant-name"><span class="caret" id="c_${mid}">▶</span>${merchant}</div>
            <div class="mx-val" style="color:var(--muted)">${fmt(mSpent)}</div>
            <div></div><div></div><div></div>
          </div>
          <div class="hidden" id="${mid}">`;

        // level 4 — individual transactions
        mtxs.sort((a,b)=>b.date-a.date).forEach(t => {
          const k   = txKey(t);
          const d   = t.date.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
          const allCatOptions = [
            'Housing','Groceries','Transportation','Utilities',
            'Dining','Shopping','Entertainment','Health & Fitness','Pharmacy','Business Services','Uncategorized'
          ].map(c => `<option value="${c}" ${c===t.category?'selected':''}>${c.toLowerCase()}</option>`).join('');
          html += `
            <div class="mx-tx">
              <div class="mx-tx-name">
                <span class="mx-tx-date">${d}</span>
                ${t.description.toLowerCase()}
                <select class="reclassify-select" onchange="reclassifyTx('${k}', this.value)" onclick="event.stopPropagation()">
                  ${allCatOptions}
                </select>
              </div>
              <div class="mx-val" style="color:var(--muted);font-size:0.72rem">${fmt(t.debit)}</div>
              <div></div><div></div><div></div>
            </div>`;
        });
        html += `</div>`;  // close merchant
      });
      html += `</div>`;  // close category
    });
    html += `</div>`;  // close group
  });

  // savings row
  const savBudget  = income * (ratios.savings||0.24);
  const savActual  = Math.max(0, income - totalSpent);
  const savDiff    = savActual - savBudget;
  html += `
    <div class="mx-group" style="cursor:default;border-top:1px solid var(--border)">
      <div class="mx-group-name">savings</div>
      <div class="mx-val ${savActual>=savBudget?'pos':'neg'}">${fmt(savActual)}</div>
      <div class="mx-val" style="color:var(--muted)">${fmt(savBudget)}</div>
      <div class="mx-diff ${savActual>=savBudget?'pos':'neg'}">${savDiff>=0?'+':'-'}${fmt(Math.abs(savDiff))}</div>
      <div class="minibar"><div class="minibar-fill" style="width:${Math.min(savActual/savBudget*100,100).toFixed(1)}%;background:${savActual>=savBudget?'var(--pos)':'var(--neg)'}"></div></div>
    </div>`;

  el.innerHTML = html;
  setText('bTotal',   fmt(income));
  setText('bSpent',   fmt(totalSpent));
  setText('bLeftover', fmt(Math.max(0, income - totalSpent)));
}

function toggleMx(id) {
  const el    = document.getElementById(id);
  const caret = document.getElementById('c_' + id);
  if (!el) return;
  el.classList.toggle('hidden');
  if (caret) caret.classList.toggle('open');
}

// ─── Trends (Hierarchical) ────────────────────────────────
function renderTrends() {
  const months = getMonths();
  const last3  = months.slice(-3);
  if (!last3.length) return;
  const tx     = getActive();
  const m0=last3[last3.length-1], m1=last3[last3.length-2], m2=last3[last3.length-3];

  const ratios = settings.budgetRatios || { housing:0.41, otherNeeds:0.15, wants:0.20, savings:0.24 };
  const groups = [
    { key:'needs', label:'needs', categories: ['Housing', ...(settings.needsCategories||['Groceries','Transportation','Utilities'])] },
    { key:'wants', label:'wants', categories: settings.wantsCategories||['Dining','Shopping','Entertainment','Health & Fitness','Pharmacy','Business Services'] },
  ];

  let html = `<div class="tr-head">
    <span>category</span>
    <span>${m2?monthLabel(m2):'—'}</span>
    <span>${m1?monthLabel(m1):'—'}</span>
    <span>${monthLabel(m0)}</span>
    <span>vs prev</span>
    <span>vs 2mo</span>
  </div>`;

  groups.forEach(group => {
    // Group totals
    const gv0 = group.categories.reduce((s,c)=>s+catSpend(tx,c,m0),0);
    const gv1 = m1?group.categories.reduce((s,c)=>s+catSpend(tx,c,m1),0):0;
    const gv2 = m2?group.categories.reduce((s,c)=>s+catSpend(tx,c,m2),0):0;
    const gd1 = m1 ? gv0-gv1 : null;
    const gd2 = m2 ? gv0-gv2 : null;

    const gid = 'tg_'+group.key;
    html += `
      <div class="tr-row" style="background:var(--bg);cursor:pointer;font-weight:500" onclick="toggleMx('${gid}')">
        <div style="display:flex;align-items:center;gap:6px;font-size:0.72rem;letter-spacing:0.06em;">
          <span class="caret open" id="c_${gid}">▶</span>${group.label}
        </div>
        <div class="tr-val">${gv2>0?fmt(gv2):'—'}</div>
        <div class="tr-val">${gv1>0?fmt(gv1):'—'}</div>
        <div class="tr-val">${gv0>0?fmt(gv0):'—'}</div>
        <div class="tr-diff ${gd1===null?'':(gd1>0?'up':'dn')}">${gd1===null?'—':(gd1>0?'+':'')+fmt(gd1)}</div>
        <div class="tr-diff ${gd2===null?'':(gd2>0?'up':'dn')}">${gd2===null?'—':(gd2>0?'+':'')+fmt(gd2)}</div>
      </div>
      <div id="${gid}">`;

    // Level 2 — Categories
    group.categories.forEach(cat => {
      const cv0 = catSpend(tx,cat,m0);
      const cv1 = m1?catSpend(tx,cat,m1):0;
      const cv2 = m2?catSpend(tx,cat,m2):0;
      if (!cv0&&!cv1&&!cv2) return;
      const cd1 = m1 ? cv0-cv1 : null;
      const cd2 = m2 ? cv0-cv2 : null;

      const catTx0 = cat==='Housing'?[]:tx.filter(t=>monthKey(t.date)===m0&&t.category===cat&&t.debit>0&&!t.isTransfer);
      const catTx1 = cat==='Housing'?[]:(m1?tx.filter(t=>monthKey(t.date)===m1&&t.category===cat&&t.debit>0&&!t.isTransfer):[]);
      const catTx2 = cat==='Housing'?[]:(m2?tx.filter(t=>monthKey(t.date)===m2&&t.category===cat&&t.debit>0&&!t.isTransfer):[]);

      const catId = 'tc_'+group.key+'_'+cat.replace(/\s/g,'_');
      html += `
        <div class="tr-row" style="padding-left:28px;cursor:pointer" onclick="toggleMx('${catId}')">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="caret" id="c_${catId}">▶</span>${cat.toLowerCase()}
          </div>
          <div class="tr-val">${cv2>0?fmt(cv2):'—'}</div>
          <div class="tr-val">${cv1>0?fmt(cv1):'—'}</div>
          <div class="tr-val">${cv0>0?fmt(cv0):'—'}</div>
          <div class="tr-diff ${cd1===null?'':(cd1>0?'up':'dn')}">${cd1===null?'—':(cd1>0?'+':'')+fmt(cd1)}</div>
          <div class="tr-diff ${cd2===null?'':(cd2>0?'up':'dn')}">${cd2===null?'—':(cd2>0?'+':'')+fmt(cd2)}</div>
        </div>
        <div class="hidden" id="${catId}">`;

      // Level 3 — Merchants (aggregate across 3 months)
      const allCatTx = [...catTx0, ...catTx1, ...catTx2];
      const merchants = groupByMerchant(allCatTx);
      
      Object.entries(merchants).sort((a,b)=>
        b[1].reduce((s,t)=>s+t.debit,0) - a[1].reduce((s,t)=>s+t.debit,0)
      ).forEach(([merchant, mtxs]) => {
        const mv0 = mtxs.filter(t=>monthKey(t.date)===m0).reduce((s,t)=>s+t.debit,0);
        const mv1 = m1?mtxs.filter(t=>monthKey(t.date)===m1).reduce((s,t)=>s+t.debit,0):0;
        const mv2 = m2?mtxs.filter(t=>monthKey(t.date)===m2).reduce((s,t)=>s+t.debit,0):0;
        if (!mv0&&!mv1&&!mv2) return;
        const md1 = m1 ? mv0-mv1 : null;
        const md2 = m2 ? mv0-mv2 : null;

        const mid = 'tm_'+catId+'_'+merchant.replace(/\s/g,'_').slice(0,20);
        html += `
          <div class="tr-row" style="padding-left:46px;cursor:pointer" onclick="toggleMx('${mid}')">
            <div style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:0.75rem">
              <span class="caret" id="c_${mid}">▶</span>${merchant}
            </div>
            <div class="tr-val" style="color:var(--muted);font-size:0.75rem">${mv2>0?fmt(mv2):'—'}</div>
            <div class="tr-val" style="color:var(--muted);font-size:0.75rem">${mv1>0?fmt(mv1):'—'}</div>
            <div class="tr-val" style="color:var(--muted);font-size:0.75rem">${mv0>0?fmt(mv0):'—'}</div>
            <div class="tr-diff ${md1===null?'':(md1>0?'up':'dn')}" style="font-size:0.7rem">${md1===null?'—':(md1>0?'+':'')+fmt(md1)}</div>
            <div class="tr-diff ${md2===null?'':(md2>0?'up':'dn')}" style="font-size:0.7rem">${md2===null?'—':(md2>0?'+':'')+fmt(md2)}</div>
          </div>
          <div class="hidden" id="${mid}">`;

        // Level 4 — Transactions
        mtxs.sort((a,b)=>b.date-a.date).forEach(t => {
          const mk = monthKey(t.date);
          const d = t.date.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
          const col2 = mk===m2?fmt(t.debit):'—';
          const col1 = mk===m1?fmt(t.debit):'—';
          const col0 = mk===m0?fmt(t.debit):'—';
          html += `
            <div class="tr-row" style="padding-left:64px;border-bottom:1px solid var(--grid)">
              <div style="color:var(--muted);font-size:0.7rem">
                <span style="opacity:0.6">${d}</span> ${t.description.toLowerCase()}
              </div>
              <div class="tr-val" style="color:var(--muted);font-size:0.7rem">${col2}</div>
              <div class="tr-val" style="color:var(--muted);font-size:0.7rem">${col1}</div>
              <div class="tr-val" style="color:var(--muted);font-size:0.7rem">${col0}</div>
              <div></div><div></div>
            </div>`;
        });

        html += `</div>`;  // close merchant
      });
      html += `</div>`;  // close category
    });
    html += `</div>`;  // close group
  });

  document.getElementById('trendMatrix').innerHTML = html;
}

// ─── Recurring ────────────────────────────────────────────
function renderRecurring() {
  const tx     = getActive().filter(t=>t.debit>0);
  const months = getMonths();
  if (months.length < 2) {
    document.getElementById('recurringList').innerHTML = '<div style="padding:32px 14px;text-align:center;color:var(--muted);font-size:0.75rem">need 2+ months of data</div>';
    return;
  }
  const byDesc = {};
  tx.forEach(t => {
    const key = t.description.toLowerCase().trim();
    if (!byDesc[key]) byDesc[key] = [];
    byDesc[key].push(t);
  });
  const recurring = [];
  Object.entries(byDesc).forEach(([desc, txs]) => {
    const seen = [...new Set(txs.map(t=>monthKey(t.date)))];
    if (seen.length < 2) return;
    const avg   = txs.reduce((s,t)=>s+t.debit,0)/txs.length;
    const stdev = Math.sqrt(txs.reduce((s,t)=>s+Math.pow(t.debit-avg,2),0)/txs.length);
    if (avg > 5 && stdev/avg > 0.25) return;
    const latest = txs.sort((a,b)=>b.date-a.date)[0];
    recurring.push({ 
      description: latest.description, 
      category: latest.category, 
      avgAmount: avg, 
      monthsFound: seen.length, 
      frequency: seen.length>=3?'monthly':'2+ months',
      merchantKey: merchantName(latest.description)
    });
  });
  recurring.sort((a,b)=>b.avgAmount-a.avgAmount);
  const el = document.getElementById('recurringList');
  if (!recurring.length) {
    el.innerHTML = '<div style="padding:32px 14px;text-align:center;color:var(--muted);font-size:0.75rem">no recurring expenses detected</div>';
    return;
  }
  el.innerHTML = `<div class="recur-head"><span>description</span><span>category</span><span>avg/month</span><span>frequency</span><span></span></div>` +
    recurring.map(r => `
      <div class="recur-row">
        <div>${r.description.toLowerCase()}</div>
        <div style="color:var(--muted);font-size:0.7rem">${r.category.toLowerCase()}</div>
        <div class="recur-val">${fmt(r.avgAmount)}</div>
        <div class="recur-val"><span class="badge">${r.frequency}</span></div>
        <div class="drill-btn" onclick="drillToTransactions('${r.merchantKey.replace(/'/g,"\\'")}')" title="view transactions">→</div>
      </div>`).join('');
}

function drillToTransactions(merchant) {
  txMerchantFilter = merchant;
  switchTab('transactions');
  renderTable();
}

// ─── Portfolio ────────────────────────────────────────────
function renderPortfolio() {
  const el = document.getElementById('positionsList');
  if (!rothPositions.length) {
    el.innerHTML = '<div style="padding:32px 14px;text-align:center;color:var(--muted);font-size:0.75rem">upload Roth012026.csv to see positions</div>';
    setText('rothTotal','—'); setText('rothGain','—'); setText('rothToday','—');
  } else {
    const total   = rothPositions.reduce((s,p)=>s+p.currentValue,0);
    const gain    = rothPositions.reduce((s,p)=>s+p.totalGL,0);
    const today   = rothPositions.reduce((s,p)=>s+p.todayGL,0);
    setText('rothTotal', fmt(total));
    const ge = document.getElementById('rothGain');
    if (ge) { ge.textContent=(gain>=0?'+':'')+fmt(gain); ge.className='card-value '+(gain>=0?'pos':'neg'); }
    const te = document.getElementById('rothToday');
    if (te) { te.textContent=(today>=0?'+':'')+fmt(today); te.className='card-value '+(today>=0?'pos':'neg'); }
    el.innerHTML = `<div class="pos-head"><span>symbol</span><span>description</span><span>value</span><span>cost basis</span><span>total gain</span><span>% of acct</span></div>` +
      rothPositions.map(p => `
        <div class="pos-row">
          <div class="pos-sym">${p.symbol}</div>
          <div style="font-size:0.7rem;color:var(--muted)">${p.description.toLowerCase()}</div>
          <div class="pos-val">${p.currentValue>0?fmt(p.currentValue):'—'}</div>
          <div class="pos-val" style="color:var(--muted)">${p.costBasis>0?fmt(p.costBasis):'—'}</div>
          <div class="pos-gain ${p.totalGL>=0?'pos':'neg'}">${p.totalGL!==0?(p.totalGL>0?'+':'')+fmt(p.totalGL):'—'}</div>
          <div class="pos-val" style="color:var(--muted)">${p.pctAccount>0?p.pctAccount.toFixed(1)+'%':'—'}</div>
        </div>`).join('');
  }
  const hysa     = settings.hysaBalance || 0;
  const interest = hysaTx.filter(t=>t.type.toLowerCase().includes('interest')).reduce((s,t)=>s+t.amount,0);
  const lastTx   = [...hysaTx].sort((a,b)=>b.date-a.date)[0];
  setText('hysaBal',      fmt(hysa));
  setText('hysaInt',      interest>0?fmt(interest):'—');
  setText('hysaLast',     lastTx?fmt(lastTx.amount):'—');
  setText('hysaLastDate', lastTx?lastTx.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}).toLowerCase():'');
}

// ─── Transactions ─────────────────────────────────────────
function renderTable() {
  const mf = document.getElementById('filterMonth')?.value   || 'all';
  const af = document.getElementById('filterAccount')?.value || 'all';
  const tf = document.getElementById('filterType')?.value    || 'all';
  let f = allTx.filter(t => {
    if (mf!=='all' && monthKey(t.date)!==mf) return false;
    if (af!=='all' && t.accountType!==af)    return false;
    if (tf==='expense' && !(t.debit>0  && !t.isTransfer)) return false;
    if (tf==='income'  && !(t.credit>0 && !t.isTransfer)) return false;
    // Apply merchant filter if set from drill-through
    if (txMerchantFilter && merchantName(t.description) !== txMerchantFilter) return false;
    return true;
  });
  const body = document.getElementById('tableBody');
  if (!f.length) { 
    const msg = txMerchantFilter 
      ? `no transactions for "${txMerchantFilter}" <span style="cursor:pointer;text-decoration:underline;margin-left:8px" onclick="clearMerchantFilter()">clear filter</span>`
      : 'no transactions match your filters';
    body.innerHTML=`<div class="tx-empty">${msg}</div>`; 
    return; 
  }
  body.innerHTML = f.map(t => {
    const d = t.date.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
    const badge = t.isTransfer ? `<span class="tx-badge">transfer</span>`
      : t.accountType==='debit' ? `<span class="tx-badge db">checking</span>`
      : `<span class="tx-badge cr">credit</span>`;
    return `<div class="tx-row">
      <div class="tx-date">${d}</div>
      <div class="tx-desc">${t.description.toLowerCase()}</div>
      <div class="tx-cat">${t.category.toLowerCase()}</div>
      <div>${badge}</div>
      ${t.debit>0  ? `<div class="tx-dr">-${fmt(t.debit)}</div>`  : '<div></div>'}
      ${t.credit>0 ? `<div class="tx-cr">+${fmt(t.credit)}</div>` : '<div></div>'}
    </div>`;
  }).join('');
  
  // Show clear filter message if merchant filter is active
  if (txMerchantFilter) {
    const filterMsg = document.createElement('div');
    filterMsg.style.cssText = 'padding:10px 14px;background:var(--bg);border-bottom:1px solid var(--border);font-size:0.72rem;color:var(--muted);';
    filterMsg.innerHTML = `filtering by: <strong style="color:var(--ink)">${txMerchantFilter}</strong> <span style="cursor:pointer;text-decoration:underline;margin-left:8px;color:var(--ink)" onclick="clearMerchantFilter()">clear</span>`;
    body.insertAdjacentElement('beforebegin', filterMsg);
  }
}

function clearMerchantFilter() {
  txMerchantFilter = null;
  renderTable();
}

// ─── Tab Switch ───────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(p=>p.classList.remove('active'));
  document.querySelector(`.nav-btn[onclick="switchTab('${name}')"]`).classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}
