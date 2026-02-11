/**
 * Finance Dashboard — app.js
 * Handles CSV parsing, data processing, charting, and UI
 */

// ─── State ───────────────────────────────────────────────
let rawDebit  = null;
let rawCredit = null;
let allTx     = [];
let charts    = {};

// ─── Auth Guard ──────────────────────────────────────────
(function checkAuth() {
  if (sessionStorage.getItem('finance_auth') !== 'true') {
    window.location.href = 'index.html';
  }
  const user = sessionStorage.getItem('finance_user') || '';
  const el = document.getElementById('welcomeUser');
  if (el) el.textContent = user;
})();

function logout() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ─── File Selection ──────────────────────────────────────
function fileSelected(type, input) {
  const file = input.files[0];
  if (!file) return;

  if (type === 'debit') {
    rawDebit = file;
    document.getElementById('debitStatus').textContent = '✓ ' + file.name;
    document.getElementById('debitBox').classList.add('loaded');
  } else {
    rawCredit = file;
    document.getElementById('creditStatus').textContent = '✓ ' + file.name;
    document.getElementById('creditBox').classList.add('loaded');
  }

  document.getElementById('loadBtn').disabled = !(rawDebit && rawCredit);
}

// ─── CSV Parsing ─────────────────────────────────────────
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data),
      error: e => reject(e)
    });
  });
}

function normalizeRow(row, accountType) {
  // Handle amount columns - strip commas, convert to float
  const debitAmt  = parseFloat((row['Debit']  || '0').toString().replace(/,/g, '')) || 0;
  const creditAmt = parseFloat((row['Credit'] || '0').toString().replace(/,/g, '')) || 0;
  const balance   = parseFloat((row['Balance'] || '0').toString().replace(/,/g, '')) || 0;

  return {
    date:           parseDate(row['Post Date'] || ''),
    description:    (row['Description'] || '').trim(),
    category:       (row['Classification'] || 'Uncategorized').trim(),
    accountType:    accountType,
    accountNumber:  (row['Account Number'] || '').trim(),
    debit:          debitAmt,
    credit:         creditAmt,
    balance:        balance,
    status:         (row['Status'] || '').trim(),
    isTransfer:     false
  };
}

function parseDate(str) {
  if (!str) return new Date();
  const d = new Date(str);
  return isNaN(d) ? new Date() : d;
}

// ─── Transfer Detection ───────────────────────────────────
function detectTransfers(txs) {
  const WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

  // Credit card payments: credits on the credit account
  const creditPayments = txs.filter(t => t.accountType === 'credit' && t.credit > 0);

  creditPayments.forEach(payment => {
    // Find matching debit on the debit account
    const match = txs.find(t =>
      t.accountType === 'debit' &&
      t.debit === payment.credit &&
      Math.abs(t.date - payment.date) <= WINDOW_MS &&
      !t.isTransfer
    );
    if (match) {
      payment.isTransfer = true;
      match.isTransfer   = true;
    }
  });

  return txs;
}

// ─── Main Processing ─────────────────────────────────────
async function processFiles() {
  const btn = document.getElementById('loadBtn');
  btn.textContent = 'Processing…';
  btn.disabled = true;

  try {
    const [debitRows, creditRows] = await Promise.all([
      parseCSV(rawDebit),
      parseCSV(rawCredit)
    ]);

    const debitTx  = debitRows.map(r  => normalizeRow(r,  'debit'));
    const creditTx = creditRows.map(r => normalizeRow(r, 'credit'));

    allTx = detectTransfers([...debitTx, ...creditTx]);
    allTx.sort((a, b) => b.date - a.date);

    populateMonthFilter();
    renderDashboard();

    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    alert('Error reading files: ' + err.message);
  }

  btn.textContent = 'Reload Dashboard';
  btn.disabled = false;
}

// ─── Helpers ─────────────────────────────────────────────
function fmt(n) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function getActiveTx() {
  return allTx.filter(t => !t.isTransfer);
}

// ─── Populate Month Filter ────────────────────────────────
function populateMonthFilter() {
  const months = [...new Set(allTx.map(t => monthKey(t.date)))].sort();
  const sel = document.getElementById('filterMonth');
  sel.innerHTML = '<option value="all">All Months</option>';
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = monthLabel(m);
    sel.appendChild(opt);
  });
}

// ─── Render Dashboard ────────────────────────────────────
function renderDashboard() {
  const tx = getActiveTx();

  // Metrics
  const totalIncome   = tx.reduce((s, t) => s + t.credit, 0);
  const totalExpenses = tx.reduce((s, t) => s + t.debit, 0);
  const netFlow       = totalIncome - totalExpenses;
  const savingsRate   = totalIncome > 0 ? (netFlow / totalIncome * 100) : 0;

  document.getElementById('metricIncome').textContent   = fmt(totalIncome);
  document.getElementById('metricExpenses').textContent = fmt(totalExpenses);

  const netEl = document.getElementById('metricNet');
  netEl.textContent = (netFlow >= 0 ? '' : '-') + fmt(netFlow);
  netEl.className = 'metric-value ' + (netFlow >= 0 ? 'positive' : 'negative');

  const savEl = document.getElementById('metricSavings');
  savEl.textContent = savingsRate.toFixed(1) + '%';
  savEl.className = 'metric-value ' + (savingsRate >= 0 ? 'positive' : 'negative');

  renderCashflowChart(tx);
  renderAccountChart(tx);
  renderCategoryMonthlyChart(tx);
  renderCategoryPie(tx);
  renderCategoryList(tx);
  renderTable();
}

// ─── Charts ───────────────────────────────────────────────
const CHART_DEFAULTS = {
  plugins: { legend: { labels: { font: { family: 'DM Sans', size: 12 }, color: '#7A7A72' } } },
  scales: {
    x: { ticks: { font: { family: 'DM Sans', size: 11 }, color: '#7A7A72' }, grid: { color: '#F0EDE8' } },
    y: { ticks: { font: { family: 'DM Sans', size: 11 }, color: '#7A7A72' }, grid: { color: '#F0EDE8' } }
  }
};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function renderCashflowChart(tx) {
  destroyChart('cashflow');
  const months = [...new Set(tx.map(t => monthKey(t.date)))].sort();
  const income   = months.map(m => tx.filter(t => monthKey(t.date) === m).reduce((s,t) => s + t.credit, 0));
  const expenses = months.map(m => tx.filter(t => monthKey(t.date) === m).reduce((s,t) => s + t.debit,  0));

  charts['cashflow'] = new Chart(document.getElementById('cashflowChart'), {
    type: 'bar',
    data: {
      labels: months.map(monthLabel),
      datasets: [
        { label: 'Income',   data: income,   backgroundColor: '#4A7C5920', borderColor: '#4A7C59', borderWidth: 2 },
        { label: 'Expenses', data: expenses, backgroundColor: '#B9404020', borderColor: '#B94040', borderWidth: 2 }
      ]
    },
    options: { ...CHART_DEFAULTS, responsive: true, maintainAspectRatio: false }
  });
}

function renderAccountChart(tx) {
  destroyChart('account');
  const debitSpend  = tx.filter(t => t.accountType === 'debit'  && t.debit > 0).reduce((s,t) => s + t.debit, 0);
  const creditSpend = tx.filter(t => t.accountType === 'credit' && t.debit > 0).reduce((s,t) => s + t.debit, 0);

  charts['account'] = new Chart(document.getElementById('accountChart'), {
    type: 'doughnut',
    data: {
      labels: ['Debit / Checking', 'Credit Card'],
      datasets: [{
        data: [debitSpend, creditSpend],
        backgroundColor: ['#4A7C5940', '#C47B2B40'],
        borderColor:     ['#4A7C59',   '#C47B2B'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 12 }, color: '#7A7A72' } } }
    }
  });
}

function renderCategoryMonthlyChart(tx) {
  destroyChart('catMonthly');
  const months     = [...new Set(tx.map(t => monthKey(t.date)))].sort();
  const categories = [...new Set(tx.filter(t => t.debit > 0).map(t => t.category))];

  const COLORS = ['#2D5A3D','#4A7C59','#C47B2B','#B94040','#5B7FA6','#8B6BAE','#4AACAA','#A08060','#7A9E4A','#C45A7B'];

  const datasets = categories.map((cat, i) => ({
    label: cat,
    data: months.map(m =>
      tx.filter(t => monthKey(t.date) === m && t.category === cat && t.debit > 0)
        .reduce((s, t) => s + t.debit, 0)
    ),
    backgroundColor: COLORS[i % COLORS.length] + '80',
    borderColor:     COLORS[i % COLORS.length],
    borderWidth: 1
  }));

  charts['catMonthly'] = new Chart(document.getElementById('categoryMonthlyChart'), {
    type: 'bar',
    data: { labels: months.map(monthLabel), datasets },
    options: {
      ...CHART_DEFAULTS,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { font: { family: 'DM Sans', size: 11 }, color: '#7A7A72' }, grid: { color: '#F0EDE8' } },
        y: { stacked: true, ticks: { font: { family: 'DM Sans', size: 11 }, color: '#7A7A72' }, grid: { color: '#F0EDE8' } }
      }
    }
  });
}

function renderCategoryPie(tx) {
  destroyChart('catPie');
  const expenses = tx.filter(t => t.debit > 0);
  const cats = {};
  expenses.forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.debit; });

  const sorted  = Object.entries(cats).sort((a,b) => b[1] - a[1]);
  const COLORS  = ['#2D5A3D','#4A7C59','#C47B2B','#B94040','#5B7FA6','#8B6BAE','#4AACAA','#A08060','#7A9E4A','#C45A7B'];

  charts['catPie'] = new Chart(document.getElementById('categoryPieChart'), {
    type: 'pie',
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{
        data: sorted.map(s => s[1]),
        backgroundColor: sorted.map((_, i) => COLORS[i % COLORS.length] + '99'),
        borderColor:     sorted.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { family: 'DM Sans', size: 11 }, color: '#7A7A72', boxWidth: 14 } } }
    }
  });
}

function renderCategoryList(tx) {
  const expenses = tx.filter(t => t.debit > 0);
  const cats = {};
  expenses.forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.debit; });
  const sorted = Object.entries(cats).sort((a,b) => b[1] - a[1]);
  const maxVal = sorted[0] ? sorted[0][1] : 1;

  const list = document.getElementById('categoryList');
  list.innerHTML = sorted.map(([cat, amt]) => `
    <div class="category-row">
      <div class="category-name">${cat}</div>
      <div class="category-bar-wrap"><div class="category-bar" style="width:${(amt/maxVal*100).toFixed(1)}%"></div></div>
      <div class="category-amount">${fmt(amt)}</div>
    </div>
  `).join('');
}

// ─── Transactions Table ───────────────────────────────────
function renderTable() {
  const monthFilter   = document.getElementById('filterMonth').value;
  const accountFilter = document.getElementById('filterAccount').value;
  const typeFilter    = document.getElementById('filterType').value;

  let filtered = allTx.filter(t => {
    if (monthFilter !== 'all' && monthKey(t.date) !== monthFilter) return false;
    if (accountFilter !== 'all' && t.accountType !== accountFilter) return false;
    if (typeFilter === 'expense' && !(t.debit > 0 && !t.isTransfer)) return false;
    if (typeFilter === 'income'  && !(t.credit > 0 && !t.isTransfer)) return false;
    return true;
  });

  const tbody = document.getElementById('tableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--ink-muted)">No transactions match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const dateStr    = t.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const acctBadge  = t.isTransfer
      ? `<span class="badge badge-transfer">Transfer</span>`
      : t.accountType === 'debit'
        ? `<span class="badge badge-debit">Debit</span>`
        : `<span class="badge badge-credit">Credit</span>`;
    const debitCell  = t.debit  > 0 ? `<td class="amount-debit">-${fmt(t.debit)}</td>`   : `<td></td>`;
    const creditCell = t.credit > 0 ? `<td class="amount-credit">+${fmt(t.credit)}</td>` : `<td></td>`;

    return `
      <tr>
        <td>${dateStr}</td>
        <td>${t.description}</td>
        <td>${t.category}</td>
        <td>${acctBadge}</td>
        ${debitCell}
        ${creditCell}
      </tr>
    `;
  }).join('');
}

// ─── Tab Switching ────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  document.querySelector(`.tab-btn[onclick="switchTab('${name}')"]`).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}
