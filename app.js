/**
 * Finance Dashboard — app.js
 * Per-user data fetched from GitHub Pages
 */

// ─── State ───────────────────────────────────────────────
let allTx          = [];
let charts         = {};
let currentUser    = null;
let dataFolder     = null;
let budgetSettings = {};

// ─── Budget Config (50/30/20) ────────────────────────────
const BUDGET_RULES = {
  needs: {
    label: 'Needs', target: 0.50, color: '#2D5A3D',
    categories: {
      'Housing':        { pct: 0.30, fixed: true  },
      'Groceries':      { pct: 0.08, fixed: false },
      'Transportation': { pct: 0.07, fixed: false },
      'Utilities':      { pct: 0.05, fixed: false },
    }
  },
  wants: {
    label: 'Wants', target: 0.30, color: '#C47B2B',
    categories: {
      'Dining':            { pct: 0.08, fixed: false },
      'Shopping':          { pct: 0.08, fixed: false },
      'Entertainment':     { pct: 0.07, fixed: false },
      'Health & Fitness':  { pct: 0.04, fixed: false },
      'Pharmacy':          { pct: 0.02, fixed: false },
      'Business Services': { pct: 0.01, fixed: false },
    }
  },
  savings: {
    label: 'Savings', target: 0.20, color: '#5B7FA6',
    categories: {}
  }
};

// ─── Init ─────────────────────────────────────────────────
(function init() {
  // Auth guard
  if (sessionStorage.getItem('finance_auth') !== 'true') {
    window.location.href = 'index.html';
    return;
  }

  currentUser = sessionStorage.getItem('finance_user');
  dataFolder  = sessionStorage.getItem('finance_dataFolder');
  const displayName = sessionStorage.getItem('finance_displayName') || currentUser;

  // Load budget settings — from session (set at login from config.js) then override with localStorage
  const sessionSettings = JSON.parse(sessionStorage.getItem('finance_budgetSettings') || '{}');
  const localSettings   = JSON.parse(localStorage.getItem('finance_budget_' + currentUser) || '{}');
  budgetSettings = { rentAmount: 0, incomeOverride: null, rentKeyword: '', incomeKeyword: '', ...sessionSettings, ...localSettings };

  // Update UI
  document.getElementById('userPill').textContent   = displayName;
  document.getElementById('dataPathHint').textContent = dataFolder + '/';
  document.getElementById('expectedPath').textContent = dataFolder + '/debit.csv & credit.csv';
  const sp = document.getElementById('settingsDataPath');
  if (sp) sp.textContent = dataFolder + '/';

  // Populate settings form
  populateSettingsForm();

  // Load data
  loadData();
})();

function logout() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ─── Load Data from GitHub ────────────────────────────────
async function loadData() {
  showScreen('loading');

  const base       = window.FINANCE_CONFIG.githubPagesBase;
  const debitUrl   = base + '/' + dataFolder + '/debit.csv';
  const creditUrl  = base + '/' + dataFolder + '/credit.csv';

  try {
    const [debitText, creditText] = await Promise.all([
      fetchCSV(debitUrl),
      fetchCSV(creditUrl)
    ]);

    const debitRows  = parseCSVText(debitText);
    const creditRows = parseCSVText(creditText);

    if (!debitRows.length && !creditRows.length) {
      showScreen('error');
      return;
    }

    allTx = detectTransfers([
      ...debitRows.map(r  => normalizeRow(r, 'debit')),
      ...creditRows.map(r => normalizeRow(r, 'credit'))
    ]);
    allTx.sort((a, b) => b.date - a.date);

    populateMonthFilter();
    renderDashboard();
    showScreen('dashboard');

  } catch (err) {
    console.error('Error loading data:', err);
    showScreen('error');
  }
}

async function fetchCSV(url) {
  const res = await fetch(url + '?t=' + Date.now()); // cache bust
  if (!res.ok) throw new Error('Could not fetch ' + url);
  return res.text();
}

function showScreen(screen) {
  document.getElementById('loadingScreen').style.display = screen === 'loading'   ? 'block' : 'none';
  document.getElementById('errorScreen').style.display   = screen === 'error'     ? 'block' : 'none';
  document.getElementById('dashboard').style.display     = screen === 'dashboard' ? 'block' : 'none';
}

// ─── CSV Parsing ─────────────────────────────────────────
function parseCSVText(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data || [];
}

function normalizeRow(row, accountType) {
  const debitAmt  = parseFloat((row['Debit']   || '0').toString().replace(/,/g,'')) || 0;
  const creditAmt = parseFloat((row['Credit']  || '0').toString().replace(/,/g,'')) || 0;
  const balance   = parseFloat((row['Balance'] || '0').toString().replace(/,/g,'')) || 0;
  return {
    date:          parseDate(row['Post Date'] || ''),
    description:   (row['Description'] || '').trim(),
    category:      (row['Classification'] || 'Uncategorized').trim(),
    accountType,
    accountNumber: (row['Account Number'] || '').trim(),
    debit: debitAmt, credit: creditAmt, balance,
    status:     (row['Status'] || '').trim(),
    isTransfer: false
  };
}

function parseDate(str) {
  if (!str) return new Date();
  const d = new Date(str);
  return isNaN(d) ? new Date() : d;
}

// ─── Transfer Detection ───────────────────────────────────
function detectTransfers(txs) {
  const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  txs.filter(t => t.accountType === 'credit' && t.credit > 0).forEach(payment => {
    const match = txs.find(t =>
      t.accountType === 'debit' && t.debit === payment.credit &&
      Math.abs(t.date - payment.date) <= WINDOW_MS && !t.isTransfer
    );
    if (match) { payment.isTransfer = true; match.isTransfer = true; }
  });
  return txs;
}

// ─── Helpers ─────────────────────────────────────────────
function fmt(n) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function monthKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0');
}
function monthLabel(key) {
  const [y,m] = key.split('-');
  return new Date(y, m-1, 1).toLocaleString('en-US', { month:'short', year:'numeric' });
}
function getActiveTx() { return allTx.filter(t => !t.isTransfer); }
function getMonths()    { return [...new Set(allTx.map(t => monthKey(t.date)))].sort(); }

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── Settings ────────────────────────────────────────────
function populateSettingsForm() {
  const fields = {
    settingRent:           budgetSettings.rentAmount    || '',
    settingIncomeOverride: budgetSettings.incomeOverride || '',
    settingRentKeyword:    budgetSettings.rentKeyword   || '',
    settingIncomeKeyword:  budgetSettings.incomeKeyword || '',
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
}

function saveBudgetSettings() {
  budgetSettings.rentAmount     = parseFloat(document.getElementById('settingRent').value) || 0;
  budgetSettings.incomeOverride = parseFloat(document.getElementById('settingIncomeOverride').value) || null;
  budgetSettings.rentKeyword    = document.getElementById('settingRentKeyword').value.trim();
  budgetSettings.incomeKeyword  = document.getElementById('settingIncomeKeyword').value.trim();
  localStorage.setItem('finance_budget_' + currentUser, JSON.stringify(budgetSettings));
  if (allTx.length > 0) renderDashboard();
  showToast('Settings saved!');
}

// ─── Income & Spend Detection ─────────────────────────────
function detectMonthlyIncome(tx, mk) {
  if (budgetSettings.incomeOverride) return budgetSettings.incomeOverride;
  const kw = (budgetSettings.incomeKeyword || '').toLowerCase();
  return tx
    .filter(t => monthKey(t.date)===mk && t.credit>0 && t.accountType==='debit' && !t.isTransfer &&
                 (kw ? t.description.toLowerCase().includes(kw) : true))
    .reduce((s,t) => s+t.credit, 0);
}

function getActualSpend(tx, category, mk) {
  if (category === 'Housing') {
    if (budgetSettings.rentKeyword) {
      const kw = budgetSettings.rentKeyword.toLowerCase();
      const found = tx
        .filter(t => monthKey(t.date)===mk && t.debit>0 && t.description.toLowerCase().includes(kw))
        .reduce((s,t) => s+t.debit, 0);
      if (found > 0) return found;
    }
    return budgetSettings.rentAmount || 0;
  }
  return tx
    .filter(t => monthKey(t.date)===mk && t.category===category && t.debit>0 && !t.isTransfer)
    .reduce((s,t) => s+t.debit, 0);
}

// ─── Populate Filters ────────────────────────────────────
function populateMonthFilter() {
  const months = getMonths();
  const sel    = document.getElementById('filterMonth');
  if (sel) {
    sel.innerHTML = '<option value="all">All Months</option>';
    months.forEach(m => { const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m); sel.appendChild(o); });
  }
  const bsel = document.getElementById('budgetMonth');
  if (bsel) {
    bsel.innerHTML = '';
    [...months].reverse().forEach((m,i) => {
      const o=document.createElement('option'); o.value=m; o.textContent=monthLabel(m);
      if (i===0) o.selected=true;
      bsel.appendChild(o);
    });
  }
}

// ─── Render Dashboard ────────────────────────────────────
function renderDashboard() {
  const tx = getActiveTx();
  const totalIncome   = tx.reduce((s,t) => s+t.credit, 0);
  const totalExpenses = tx.reduce((s,t) => s+t.debit,  0);
  const netFlow       = totalIncome - totalExpenses;
  const savingsRate   = totalIncome>0 ? (netFlow/totalIncome*100) : 0;

  document.getElementById('metricIncome').textContent   = fmt(totalIncome);
  document.getElementById('metricExpenses').textContent = fmt(totalExpenses);
  const netEl = document.getElementById('metricNet');
  netEl.textContent = (netFlow>=0?'':'-') + fmt(netFlow);
  netEl.className   = 'metric-value ' + (netFlow>=0 ? 'positive' : 'negative');
  const savEl = document.getElementById('metricSavings');
  savEl.textContent = savingsRate.toFixed(1) + '%';
  savEl.className   = 'metric-value ' + (savingsRate>=0 ? 'positive' : 'negative');

  renderCashflowChart(tx);
  renderAccountChart(tx);
  renderCategoryMonthlyChart(tx);
  renderCategoryPie(tx);
  renderCategoryList(tx);
  renderBudget();
  renderTable();
}

// ─── Budget ───────────────────────────────────────────────
function renderBudget() {
  const mk = document.getElementById('budgetMonth')?.value;
  if (!mk) return;
  const tx     = getActiveTx();
  const income = detectMonthlyIncome(tx, mk);

  document.getElementById('budgetIncome').textContent     = fmt(income);
  document.getElementById('budgetMonthLabel').textContent = monthLabel(mk);

  let totalNeeds=0, totalWants=0;
  Object.keys(BUDGET_RULES.needs.categories).forEach(cat => { totalNeeds += getActualSpend(tx,cat,mk); });
  Object.keys(BUDGET_RULES.wants.categories).forEach(cat => { totalWants += getActualSpend(tx,cat,mk); });
  const actualSavings = Math.max(0, income - totalNeeds - totalWants);

  renderSummaryBar('needs',   totalNeeds,   income*0.50, income, BUDGET_RULES.needs.color);
  renderSummaryBar('wants',   totalWants,   income*0.30, income, BUDGET_RULES.wants.color);
  renderSummaryBar('savings', actualSavings, income*0.20, income, BUDGET_RULES.savings.color);
  renderBudgetSection('needs',  tx, mk, income);
  renderBudgetSection('wants',  tx, mk, income);
  renderCashFlow(tx, mk, income, totalNeeds, totalWants, actualSavings);
}

function renderSummaryBar(section, actual, target, income, color) {
  const pct    = income>0 ? (actual/income*100)  : 0;
  const tgtPct = income>0 ? (target/income*100) : 0;
  const over   = actual > target;
  const el     = document.getElementById('summary_' + section);
  if (!el) return;
  el.innerHTML = `
    <div class="summary-row">
      <div class="summary-info">
        <span class="summary-label">${BUDGET_RULES[section].label}</span>
        <span class="summary-target">Target ${tgtPct.toFixed(0)}% &mdash; ${fmt(target)}</span>
      </div>
      <div class="summary-amounts">
        <span class="summary-actual ${over?'over-budget':''}">${fmt(actual)}</span>
        <span class="summary-pct ${over?'over-budget':''}">${pct.toFixed(1)}%</span>
      </div>
    </div>
    <div class="progress-track">
      <div class="progress-fill" style="width:${Math.min(pct,100).toFixed(1)}%; background:${over?'#B94040':color}"></div>
      <div class="progress-target-line" style="left:${Math.min(tgtPct,100).toFixed(1)}%"></div>
    </div>`;
}

function renderBudgetSection(section, tx, mk, income) {
  const container = document.getElementById('budget_' + section);
  if (!container) return;
  const cats  = BUDGET_RULES[section].categories;
  const color = BUDGET_RULES[section].color;
  container.innerHTML = Object.entries(cats).map(([cat, rule]) => {
    const target = income * rule.pct;
    const actual = getActualSpend(tx, cat, mk);
    const pct    = target>0 ? Math.min((actual/target)*100, 100) : 0;
    const over   = actual > target;
    const near   = !over && pct >= 80;
    const icon   = over ? '🔴' : near ? '🟡' : '🟢';
    const cls    = over ? 'over-budget' : near ? 'near-budget' : '';
    return `
      <div class="budget-row">
        <div class="budget-row-top">
          <div class="budget-cat">
            <span>${icon}</span>
            <span class="budget-cat-name">${cat}${rule.fixed ? ' <span class="fixed-badge">fixed</span>' : ''}</span>
          </div>
          <div class="budget-amounts">
            <span class="budget-actual ${cls}">${fmt(actual)}</span>
            <span class="budget-slash">/</span>
            <span class="budget-target">${fmt(target)}</span>
            <span class="budget-pct ${cls}">${(income>0 ? actual/income*100 : 0).toFixed(1)}%</span>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct.toFixed(1)}%; background:${over?'#B94040':near?'#C47B2B':color}"></div>
        </div>
      </div>`;
  }).join('');
}

function renderCashFlow(tx, mk, income, needs, wants, savings) {
  const el = document.getElementById('cashFlowBreakdown');
  if (!el) return;
  const remaining     = income - needs - wants;
  const savingsPct    = income>0 ? (savings/income*100) : 0;
  const targetSavings = income * 0.20;
  const savingsGap    = targetSavings - savings;
  el.innerHTML = `
    <div class="cf-row cf-income"><span>Monthly Income</span><span class="cf-amount positive">${fmt(income)}</span></div>
    <div class="cf-row"><span>Needs (50% target)</span><span class="cf-amount negative">- ${fmt(needs)}</span></div>
    <div class="cf-row"><span>Wants (30% target)</span><span class="cf-amount negative">- ${fmt(wants)}</span></div>
    <div class="cf-divider"></div>
    <div class="cf-row cf-result">
      <span>Remaining for Savings</span>
      <span class="cf-amount ${remaining>=0?'positive':'negative'}">${remaining>=0?'':'-'}${fmt(remaining)}</span>
    </div>
    <div class="cf-row"><span>Your Savings Rate</span><span class="cf-amount ${savingsPct>=20?'positive':'near-budget'}">${savingsPct.toFixed(1)}%</span></div>
    <div class="cf-row"><span>20% Savings Target</span><span class="cf-amount">${fmt(targetSavings)}</span></div>
    <div class="cf-row cf-alert">
      ${savingsGap>0
        ? `<span>⚠️ Gap to savings goal</span><span class="cf-amount over-budget">- ${fmt(savingsGap)}</span>`
        : `<span>✅ Savings goal met!</span><span class="cf-amount positive">+ ${fmt(Math.abs(savingsGap))}</span>`
      }
    </div>`;
}

// ─── Charts ───────────────────────────────────────────────
const FONT = { family:'DM Sans', size:11 };
const GRID = '#F0EDE8';
const TICK = '#7A7A72';
const COLORS = ['#2D5A3D','#4A7C59','#C47B2B','#B94040','#5B7FA6','#8B6BAE','#4AACAA','#A08060','#7A9E4A','#C45A7B'];

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function renderCashflowChart(tx) {
  destroyChart('cashflow');
  const months   = getMonths();
  const income   = months.map(m => tx.filter(t=>monthKey(t.date)===m).reduce((s,t)=>s+t.credit,0));
  const expenses = months.map(m => tx.filter(t=>monthKey(t.date)===m).reduce((s,t)=>s+t.debit, 0));
  charts['cashflow'] = new Chart(document.getElementById('cashflowChart'), {
    type:'bar',
    data:{ labels:months.map(monthLabel), datasets:[
      { label:'Income',   data:income,   backgroundColor:'#4A7C5920', borderColor:'#4A7C59', borderWidth:2 },
      { label:'Expenses', data:expenses, backgroundColor:'#B9404020', borderColor:'#B94040', borderWidth:2 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ font:FONT, color:TICK } } },
      scales:{ x:{ ticks:{ font:FONT, color:TICK }, grid:{ color:GRID } }, y:{ ticks:{ font:FONT, color:TICK }, grid:{ color:GRID } } }
    }
  });
}

function renderAccountChart(tx) {
  destroyChart('account');
  const ds = tx.filter(t=>t.accountType==='debit' &&t.debit>0).reduce((s,t)=>s+t.debit,0);
  const cs = tx.filter(t=>t.accountType==='credit'&&t.debit>0).reduce((s,t)=>s+t.debit,0);
  charts['account'] = new Chart(document.getElementById('accountChart'), {
    type:'doughnut',
    data:{ labels:['Debit / Checking','Credit Card'],
      datasets:[{ data:[ds,cs], backgroundColor:['#4A7C5940','#C47B2B40'], borderColor:['#4A7C59','#C47B2B'], borderWidth:2 }]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ font:FONT, color:TICK } } }
    }
  });
}

function renderCategoryMonthlyChart(tx) {
  destroyChart('catMonthly');
  const months = getMonths();
  const cats   = [...new Set(tx.filter(t=>t.debit>0).map(t=>t.category))];
  charts['catMonthly'] = new Chart(document.getElementById('categoryMonthlyChart'), {
    type:'bar',
    data:{ labels:months.map(monthLabel),
      datasets:cats.map((cat,i) => ({
        label:cat,
        data:months.map(m => tx.filter(t=>monthKey(t.date)===m&&t.category===cat&&t.debit>0).reduce((s,t)=>s+t.debit,0)),
        backgroundColor:COLORS[i%COLORS.length]+'80', borderColor:COLORS[i%COLORS.length], borderWidth:1
      }))
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ font:FONT, color:TICK } } },
      scales:{
        x:{ stacked:true, ticks:{ font:FONT, color:TICK }, grid:{ color:GRID } },
        y:{ stacked:true, ticks:{ font:FONT, color:TICK }, grid:{ color:GRID } }
      }
    }
  });
}

function renderCategoryPie(tx) {
  destroyChart('catPie');
  const cats = {};
  tx.filter(t=>t.debit>0).forEach(t => { cats[t.category]=(cats[t.category]||0)+t.debit; });
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  charts['catPie'] = new Chart(document.getElementById('categoryPieChart'), {
    type:'pie',
    data:{ labels:sorted.map(s=>s[0]),
      datasets:[{ data:sorted.map(s=>s[1]),
        backgroundColor:sorted.map((_,i)=>COLORS[i%COLORS.length]+'99'),
        borderColor:sorted.map((_,i)=>COLORS[i%COLORS.length]), borderWidth:1.5
      }]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'right', labels:{ font:FONT, color:TICK, boxWidth:14 } } }
    }
  });
}

function renderCategoryList(tx) {
  const cats = {};
  tx.filter(t=>t.debit>0).forEach(t => { cats[t.category]=(cats[t.category]||0)+t.debit; });
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const maxVal = sorted[0] ? sorted[0][1] : 1;
  document.getElementById('categoryList').innerHTML = sorted.map(([cat,amt]) => `
    <div class="category-row">
      <div class="category-name">${cat}</div>
      <div class="category-bar-wrap"><div class="category-bar" style="width:${(amt/maxVal*100).toFixed(1)}%"></div></div>
      <div class="category-amount">${fmt(amt)}</div>
    </div>`).join('');
}

// ─── Transactions Table ───────────────────────────────────
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
  const tbody = document.getElementById('tableBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--ink-muted)">No transactions match your filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(t => {
    const d = t.date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const badge = t.isTransfer
      ? `<span class="badge badge-transfer">Transfer</span>`
      : t.accountType==='debit'
        ? `<span class="badge badge-debit">Debit</span>`
        : `<span class="badge badge-credit">Credit</span>`;
    return `<tr>
      <td>${d}</td><td>${t.description}</td><td>${t.category}</td><td>${badge}</td>
      ${t.debit>0  ? `<td class="amount-debit">-${fmt(t.debit)}</td>`   : '<td></td>'}
      ${t.credit>0 ? `<td class="amount-credit">+${fmt(t.credit)}</td>` : '<td></td>'}
    </tr>`;
  }).join('');
}

// ─── Tab Switching ────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab-btn[onclick="switchTab('${name}')"]`).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}
