import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==============================
// TOAST NOTIFICATIONS
// ==============================
const toastContainer = document.getElementById("toastContainer");

function showToast(message, type = "info", duration = 3000) {
  if (!toastContainer) return;

  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] ?? "ℹ"}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("removing");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

// ==============================
// CONFIG / CACHE
// ==============================
const quoteCache = new Map(); // symbol => { price, updatedAt }
const QUOTE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const FX_USD_BRL_DOC_ID = "USD-BRL";

// ==============================
// FORMATTERS
// ==============================
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = new Intl.NumberFormat("en-US",  { style: "currency", currency: "USD" });

const brl  = (n) => fmtBRL.format(Number.isFinite(Number(n)) ? Number(n) : 0);
const usd  = (n) => fmtUSD.format(Number.isFinite(Number(n)) ? Number(n) : 0);
const pct  = (n) => `${(Number.isFinite(Number(n)) ? Number(n) * 100 : 0).toFixed(2)}%`;
const fx   = (n) => { const x = Number(n); return Number.isFinite(x) && x > 0 ? x.toFixed(4) : "--"; };

// ==============================
// DATE / TICKER HELPERS
// ==============================
function toDateMaybe(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === "function") return ts.toDate();
  return null;
}

function clampDate(d) {
  return d instanceof Date && !isNaN(d) ? d : null;
}

function normalizeTicker(raw) {
  return String(raw || "").trim().toUpperCase();
}

function isBrazilLikeTicker(ticker) {
  return /[0-9]$/.test(ticker) || ticker.endsWith(".SA");
}

function toQuoteDocIdCandidates(rawTicker) {
  const t = normalizeTicker(rawTicker);
  if (!t) return [];
  if (isBrazilLikeTicker(t)) {
    const withSA = t.endsWith(".SA") ? t : `${t}.SA`;
    return Array.from(new Set([withSA, t]));
  }
  return Array.from(new Set([t, `${t}.SA`]));
}

function usdToBrl(usdValue, usdBrl) {
  const u = Number(usdValue);
  const fxRate = Number(usdBrl);
  if (!Number.isFinite(u) || !Number.isFinite(fxRate) || fxRate <= 0) return null;
  return u * fxRate;
}

// Installments helpers
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function splitAmount(total, parts) {
  const cents = Math.round(Number(total) * 100);
  const base  = Math.floor(cents / parts);
  const rem   = cents % parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const monthNames = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

// ==============================
// DOM REFS
// ==============================
const tabela          = document.getElementById("tabela");
const saldoEl         = document.getElementById("saldo");
const receitasEl      = document.getElementById("receitas");
const despesasEl      = document.getElementById("despesas");
const investimentosEl = document.getElementById("investimentos");
const receitasCount   = document.getElementById("receitasCount");
const despesasCount   = document.getElementById("despesasCount");
const investCount     = document.getElementById("investCount");
const tableCountEl    = document.getElementById("tableCount");

const modalEl         = document.getElementById("modal");
const editDescricaoEl = document.getElementById("editDescricao");
const editValorEl     = document.getElementById("editValor");
const addFormEl       = document.getElementById("addForm");

const descricaoEl     = document.getElementById("descricao");
const valorEl         = document.getElementById("valor");

const payModeWrapEl     = document.getElementById("payModeWrap");
const btnPix            = document.getElementById("btnPix");
const btnCartao         = document.getElementById("btnCartao");
const installmentsWrapEl = document.getElementById("installmentsWrap");
const parcelasEl        = document.getElementById("parcelas");

const investFieldsEl = document.getElementById("investFields");
const stockFieldsEl  = document.getElementById("stockFields");
const cdbFieldsEl    = document.getElementById("cdbFields");
const investTotalEl  = document.getElementById("investTotal");

const tickerEl    = document.getElementById("ticker");
const qtdAcoesEl  = document.getElementById("qtdAcoes");
const precoAcaoEl = document.getElementById("precoAcao");
const cdbPctCdiEl = document.getElementById("cdbPctCdi");

const investKindDD    = document.getElementById("investKindDD");
const investKindBtn   = document.getElementById("investKindBtn");
const investKindMenu  = document.getElementById("investKindMenu");
const investKindValue = document.getElementById("investKindValue");

const stockMarketDD    = document.getElementById("stockMarketDD");
const stockMarketBtn   = document.getElementById("stockMarketBtn");
const stockMarketMenu  = document.getElementById("stockMarketMenu");
const stockMarketValue = document.getElementById("stockMarketValue");

const btnReceita = document.getElementById("btnReceita");
const btnDespesa = document.getElementById("btnDespesa");
const btnInvest  = document.getElementById("btnInvest");
const btnAdd     = document.getElementById("btnAdd");

const yearDD    = document.getElementById("yearDD");
const yearMenu  = document.getElementById("yearMenu");
const yearValue = document.getElementById("yearValue");
const yearBtn   = document.getElementById("yearBtn");

const monthDD    = document.getElementById("monthDD");
const monthMenu  = document.getElementById("monthMenu");
const monthValue = document.getElementById("monthValue");
const monthBtn   = document.getElementById("monthBtn");

const clearFiltersBtn = document.getElementById("clearFilters");

// ==============================
// FIRESTORE
// ==============================
const ref = collection(db, "transactions");
let editId = null;

// ==============================
// STATE
// ==============================
let selectedYear = new Date().getFullYear();
let selectedMonth = "all";
let currentAddType = null;
let investKind = "stock";
let stockMarket = "BR";
let despesaModoPagamento = "pix";

// ==============================
// UI HELPERS
// ==============================
function setActiveTypeButton(activeBtn) {
  [btnReceita, btnDespesa, btnInvest].forEach(b => {
    if (b) b.classList.toggle("is-selected", b === activeBtn);
  });
}

function showAddForm(show) {
  if (!addFormEl) return;
  addFormEl.style.display = show ? "block" : "none";
}

function setPaymentUIVisible(isVisible) {
  if (payModeWrapEl) payModeWrapEl.style.display = isVisible ? "block" : "none";
}

function setPaymentMode(mode) {
  despesaModoPagamento = mode;
  if (btnPix)    btnPix.classList.toggle("is-selected", mode === "pix");
  if (btnCartao) btnCartao.classList.toggle("is-selected", mode === "cartao");
  if (installmentsWrapEl) {
    installmentsWrapEl.style.display = mode === "cartao" ? "block" : "none";
  }
  if (parcelasEl && mode !== "cartao") parcelasEl.value = "1";
}

function getInvestTotalStock() {
  const qtd   = Number(qtdAcoesEl?.value || 0.0);
  const preco = Number(precoAcaoEl?.value || 0.0);
  const q = Number.isFinite(qtd)   ? qtd   : 0.0;
  const p = Number.isFinite(preco) ? preco : 0.0;
  const raw = q * p;
  if (stockMarket !== "US") return raw;
  const fxRate = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
  return usdToBrl(raw, fxRate) ?? 0;
}

function updateInvestTotalUIStock() {
  const total = getInvestTotalStock();
  if (investTotalEl) investTotalEl.textContent = brl(total);
  if (valorEl) valorEl.value = total ? String(total.toFixed(2)) : "";
}

function updateInvestTotalUICdb() {
  const total = Number(valorEl?.value || 0);
  if (investTotalEl) investTotalEl.textContent = brl(total);
}

function applyInvestKindUI() {
  const isStock = investKind === "stock";
  if (stockFieldsEl) stockFieldsEl.hidden = !isStock;
  if (cdbFieldsEl)   cdbFieldsEl.hidden = isStock;
  if (isStock) updateInvestTotalUIStock();
  else updateInvestTotalUICdb();
}

// ==============================
// DROPDOWN HELPERS
// ==============================
function setDDOpen(dd, open) {
  if (!dd) return;
  dd.classList.toggle("is-open", open);
  const btn = dd.querySelector(".dd-btn");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function buildMenu(menuEl, items, activeValue, onPick) {
  if (!menuEl) return;
  menuEl.innerHTML = "";
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "dd-item" + (String(item.value) === String(activeValue) ? " is-active" : "");
    div.setAttribute("role", "option");
    div.innerHTML = `<span class="mini-dot" aria-hidden="true"></span><span>${item.label}</span>`;
    div.onclick = () => onPick(item.value, item.label);
    menuEl.appendChild(div);
  });
}

function wireDropdown(dd, btnEl, setOpen) {
  if (!dd || !btnEl) return;
  btnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!dd.classList.contains("is-open"));
  });
  document.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
}

let investDDSetupDone = false;
function setupInvestDropdownsOnce() {
  if (investDDSetupDone) return;
  investDDSetupDone = true;

  wireDropdown(investKindDD, investKindBtn, (open) => {
    setDDOpen(investKindDD, open);
    setDDOpen(stockMarketDD, false);
  });

  wireDropdown(stockMarketDD, stockMarketBtn, (open) => {
    setDDOpen(stockMarketDD, open);
    setDDOpen(investKindDD, false);
  });

  buildMenu(
    investKindMenu,
    [{ value: "stock", label: "Ação" }, { value: "cdb", label: "CDB" }],
    investKind,
    (value, label) => {
      investKind = String(value);
      if (investKindValue) investKindValue.textContent = label;
      setDDOpen(investKindDD, false);
      applyInvestKindUI();
    }
  );

  buildMenu(
    stockMarketMenu,
    [{ value: "BR", label: "Brasil (BRL)" }, { value: "US", label: "EUA (USD)" }],
    stockMarket,
    (value, label) => {
      stockMarket = String(value);
      if (stockMarketValue) stockMarketValue.textContent = label;
      setDDOpen(stockMarketDD, false);
      if (investKind === "stock") updateInvestTotalUIStock();
    }
  );

  if (investKindValue)  investKindValue.textContent  = investKind === "stock" ? "Ação" : "CDB";
  if (stockMarketValue) stockMarketValue.textContent = stockMarket === "BR" ? "Brasil (BRL)" : "EUA (USD)";
}

// ==============================
// TOGGLE ADD TYPE
// ==============================
function toggleAddType(tipo, activeBtn) {
  const isOpen    = addFormEl ? addFormEl.style.display !== "none" : false;
  const isSameType = currentAddType === tipo;

  if (isOpen && isSameType) {
    currentAddType = null;
    setActiveTypeButton(null);
    showAddForm(false);
    if (investFieldsEl) investFieldsEl.hidden = true;
    setPaymentUIVisible(false);
    return;
  }

  currentAddType = tipo;
  setActiveTypeButton(activeBtn);
  showAddForm(true);
  setPaymentUIVisible(tipo === "despesa");
  if (tipo === "despesa") setPaymentMode("pix");

  const isInvest = tipo === "investimento";
  if (investFieldsEl) investFieldsEl.hidden = !isInvest;

  if (isInvest) {
    setupInvestDropdownsOnce();
    applyInvestKindUI();
  }

  // Focus first input
  setTimeout(() => {
    const firstInput = addFormEl?.querySelector("input:not([type=hidden])");
    if (firstInput) firstInput.focus();
  }, 50);
}

// Live total updates
if (qtdAcoesEl)  qtdAcoesEl.addEventListener("input",  () => investKind === "stock" && updateInvestTotalUIStock());
if (precoAcaoEl) precoAcaoEl.addEventListener("input", () => investKind === "stock" && updateInvestTotalUIStock());
if (valorEl)     valorEl.addEventListener("input",     () => investKind === "cdb"   && updateInvestTotalUICdb());

// Ticker uppercase auto
if (tickerEl) {
  tickerEl.addEventListener("input", () => {
    const pos = tickerEl.selectionStart;
    tickerEl.value = tickerEl.value.toUpperCase();
    tickerEl.setSelectionRange(pos, pos);
  });
}

// ==============================
// QUOTES (from Firestore)
// ==============================
async function fetchQuoteFromFirestore(docId) {
  const snap = await getDoc(doc(db, "quotes", docId));
  if (!snap.exists()) return null;
  const data = snap.data();
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, updatedAt: Date.now() };
}

async function fetchQuoteSmart(rawTicker, { force = false } = {}) {
  const candidates = toQuoteDocIdCandidates(rawTicker);
  if (!candidates.length) return null;
  const now = Date.now();

  if (!force) {
    for (const sym of candidates) {
      const cached = quoteCache.get(sym);
      if (cached && (now - cached.updatedAt) < QUOTE_TTL_MS) {
        return { symbolUsed: sym, price: cached.price };
      }
    }
  }

  for (const sym of candidates) {
    const q = await fetchQuoteFromFirestore(sym);
    if (q?.price) {
      quoteCache.set(sym, { price: q.price, updatedAt: now });
      return { symbolUsed: sym, price: q.price };
    }
  }

  return null;
}

async function ensureUsdBrlQuote({ force = false } = {}) {
  try { await fetchQuoteSmart(FX_USD_BRL_DOC_ID, { force }); } catch {}
}

async function updateQuotesForInvestments(rows, { force = false } = {}) {
  await ensureUsdBrlQuote({ force });

  const tickers = Array.from(new Set(
    rows
      .filter(r => r.tipo === "investimento" && r.investKind !== "cdb")
      .map(r => normalizeTicker(r.ticker))
      .filter(Boolean)
  ));

  for (const t of tickers) {
    try {
      await fetchQuoteSmart(t, { force });
    } catch (e) {
      console.warn("Quote load failed:", t, e?.message || e);
    }
  }
}

function getCachedQuoteForTicker(rawTicker) {
  const candidates = toQuoteDocIdCandidates(rawTicker);
  for (const sym of candidates) {
    const cached = quoteCache.get(sym);
    if (cached?.price) return { symbol: sym, price: cached.price, updatedAt: cached.updatedAt };
  }
  return null;
}

function getCurrentValueForInvestmentRow(row) {
  if (row.tipo !== "investimento" || row.investKind === "cdb") return null;
  const qtd = Number(row.qtdAcoes || 0);
  if (!Number.isFinite(qtd) || qtd <= 0) return null;
  const t = normalizeTicker(row.ticker);
  if (!t) return null;
  const q = getCachedQuoteForTicker(t);
  if (!q?.price) return null;
  if (row.market !== "US") return qtd * q.price;
  const fxRate = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
  return usdToBrl(qtd * q.price, fxRate);
}

// ==============================
// CHARTS
// ==============================
let lineChart = null;
let pieChart  = null;

function destroyCharts() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (pieChart)  { pieChart.destroy();  pieChart  = null; }
}

function chartDefaults() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.color      = "rgba(232,234,240,.55)";
  Chart.defaults.font.family = "'DM Sans', ui-sans-serif, system-ui, sans-serif";
  Chart.defaults.font.size   = 11;
}

const glowPlugin = {
  id: "glowPlugin",
  beforeDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.shadowColor  = "rgba(124,143,255,.2)";
    ctx.shadowBlur   = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
  },
  afterDatasetsDraw(chart) { chart.ctx.restore(); }
};

function computeFilteredRows(allRows) {
  const getRowDate = (r) => clampDate(r.dateRef || r.createdAt);

  if (selectedMonth === "all") {
    return allRows.filter(r => {
      const d = getRowDate(r);
      return d && d.getFullYear() === selectedYear;
    });
  }

  return allRows.filter(r => {
    const d = getRowDate(r);
    if (!d || d.getFullYear() !== selectedYear) return false;
    if (r.tipo === "investimento") return true;
    return d.getMonth() === selectedMonth;
  });
}

function sumInvestmentsValue(rows) {
  return rows.reduce((acc, r) => {
    if (r.tipo !== "investimento") return acc;
    if (r.investKind === "cdb") return acc + Number(r.valor || 0);
    const atual = getCurrentValueForInvestmentRow(r);
    return acc + (atual != null ? atual : Number(r.valor || 0));
  }, 0);
}

function renderCharts(filteredRows) {
  if (typeof Chart === "undefined") return;
  chartDefaults();

  const lineCtx = document.getElementById("barChart");
  const pieCtx  = document.getElementById("pieChart");
  if (!lineCtx || !pieCtx) return;

  const blue   = "rgba(124,143,255,1)";
  const pinkFx = "rgba(248,113,113,1)";
  const green  = "rgba(52,211,153,1)";

  let labels = [], receitaSeries = [], despesaSeries = [];
  const hasFixedMonth = selectedMonth !== "all";

  if (hasFixedMonth) {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const byDay = Array.from({ length: daysInMonth }, () => ({ receita: 0, despesa: 0 }));
    filteredRows.forEach(r => {
      const d = clampDate(r.dateRef || r.createdAt);
      if (!d) return;
      const day = d.getDate() - 1;
      if (r.tipo === "receita") byDay[day].receita += r.valor;
      if (r.tipo === "despesa") byDay[day].despesa += r.valor;
    });
    receitaSeries = byDay.map(x => x.receita);
    despesaSeries = byDay.map(x => x.despesa);
  } else {
    labels = monthNames.map(m => m.slice(0, 3));
    const byMonthReceita = Array.from({ length: 12 }, () => 0);
    const byMonthDespesa = Array.from({ length: 12 }, () => 0);
    filteredRows.forEach(r => {
      const d = clampDate(r.dateRef || r.createdAt);
      if (!d) return;
      const m = d.getMonth();
      if (r.tipo === "receita") byMonthReceita[m] += r.valor;
      if (r.tipo === "despesa") byMonthDespesa[m] += r.valor;
    });
    receitaSeries = byMonthReceita;
    despesaSeries = byMonthDespesa;
  }

  let receitas = 0, despesas = 0;
  filteredRows.forEach(r => {
    if (r.tipo === "receita") receitas += r.valor;
    if (r.tipo === "despesa") despesas += r.valor;
  });

  const investimentosTotal = sumInvestmentsValue(filteredRows);

  destroyCharts();

  const makeDataset = (color, data, label) => ({
    label,
    data,
    borderColor: color,
    backgroundColor: color.replace("1)", "0.12)"),
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    pointBackgroundColor: color,
    pointBorderColor: "rgba(6,8,16,.8)",
    pointBorderWidth: 1.5,
    tension: 0.4,
    fill: true
  });

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500, easing: "easeOutQuart" }
  };

  const gridColor = "rgba(255,255,255,.05)";
  const axisColor = "rgba(232,234,240,.3)";

  lineChart = new Chart(lineCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        makeDataset(blue, receitaSeries, "Receita"),
        makeDataset(pinkFx, despesaSeries, "Despesa")
      ]
    },
    options: {
      ...commonOptions,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "rgba(12,17,30,.95)",
          borderColor: "rgba(255,255,255,.1)",
          borderWidth: 1,
          padding: 10,
          titleFont: { size: 11, weight: "700" },
          bodyFont: { size: 11 },
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${brl(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: axisColor, font: { size: 10 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: axisColor,
            font: { size: 10 },
            callback: (v) => brl(v)
          }
        }
      }
    },
    plugins: [glowPlugin]
  });

  pieChart = new Chart(pieCtx, {
    type: "doughnut",
    data: {
      labels: ["Receita", "Despesa", "Investimentos"],
      datasets: [{
        data: [receitas, despesas, investimentosTotal],
        backgroundColor: [
          "rgba(124,143,255,.85)",
          "rgba(248,113,113,.85)",
          "rgba(192,132,252,.85)"
        ],
        borderColor: "rgba(6,8,16,.9)",
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      ...commonOptions,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 14,
            font: { size: 11, weight: "600" },
            color: "rgba(232,234,240,.6)",
            usePointStyle: true,
            pointStyleWidth: 8
          }
        },
        tooltip: {
          backgroundColor: "rgba(12,17,30,.95)",
          borderColor: "rgba(255,255,255,.1)",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${brl(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ==============================
// TABLE + KPIs
// ==============================
function renderTableAndKpis(filteredRows) {
  if (!tabela) return;

  let receitas  = 0, despesas = 0;
  let nReceitas = 0, nDespesas = 0, nInvest = 0;
  const investimentosTotal = sumInvestmentsValue(filteredRows);

  tabela.innerHTML = "";

  if (filteredRows.length === 0) {
    const colspan = 4;
    tabela.innerHTML = `
      <tr>
        <td colspan="${colspan}">
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <div class="empty-state-text">Nenhum lançamento no período selecionado.</div>
          </div>
        </td>
      </tr>`;
  }

  filteredRows.forEach(r => {
    if (r.tipo === "receita")      { receitas  += r.valor; nReceitas++; }
    if (r.tipo === "despesa")      { despesas  += r.valor; nDespesas++; }
    if (r.tipo === "investimento") { nInvest++; }

    const tr = document.createElement("tr");
    tr.classList.add("animate-in");

    let valorAtual = null, pl = null, plPct = null;
    let quoteLine  = `<span class="muted">Cotação: —</span>`;

    const isStockInvest = r.tipo === "investimento" && r.investKind !== "cdb";

    if (isStockInvest && r.ticker && Number.isFinite(r.qtdAcoes) && r.qtdAcoes > 0) {
      const q = getCachedQuoteForTicker(r.ticker);
      if (q?.price) {
        valorAtual = getCurrentValueForInvestmentRow(r);
        const investedBRL = Number(r.valor || 0);
        pl    = valorAtual != null ? valorAtual - investedBRL : null;
        plPct = pl != null && investedBRL > 0 ? pl / investedBRL : null;

        quoteLine = r.market === "US"
          ? `<span>Cotação (${normalizeTicker(r.ticker)}): ${usd(q.price)} | USD/BRL: ${fx(quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null)}</span>`
          : `<span>Cotação (${q.symbol}): ${brl(q.price)}</span>`;
      }
    }

    // Description text
    const desc = r.tipo === "investimento"
      ? (r.investKind === "cdb"
          ? `${r.descricao ?? ""} — CDB ${Number(r.cdbPctCdi || 0)}% CDI`
          : `${r.descricao ?? ""}${r.ticker ? ` (${normalizeTicker(r.ticker)})` : ""} — ${r.qtdAcoes ?? 0} × ${r.market === "US" ? usd(r.precoAcao ?? 0) : brl(r.precoAcao ?? 0)} ${r.market === "US" ? "USD" : "BRL"}`)
      : (r.descricao ?? "");

    // Value cell
    const valorCell = r.tipo === "investimento"
      ? (r.investKind === "cdb"
          ? `<div class="val-col">
               <div class="val-main">${brl(r.valor)}</div>
               <div class="val-sub"><span class="muted">CDB ${Number(r.cdbPctCdi || 0)}% CDI</span></div>
             </div>`
          : `<div class="val-col">
               <div class="val-main">Investido: ${r.market === "US" && Number.isFinite(r.valorUSD) && r.valorUSD > 0 ? usd(r.valorUSD) : brl(r.valor)}</div>
               <div class="val-sub">${quoteLine}</div>
               <div class="val-sub">
                 ${valorAtual == null
                   ? `<span class="muted">Atual: —</span>`
                   : `<span>Atual: ${brl(valorAtual)}</span>`}
                 ${pl == null ? "" : `<span class="pl ${pl >= 0 ? "pl-pos" : "pl-neg"}">P/L: ${brl(pl)}${plPct != null ? ` (${pct(plPct)})` : ""}</span>`}
               </div>
             </div>`)
      : brl(r.valor);

    tr.innerHTML = `
      <td>${desc}</td>
      <td><span class="type-pill type-${r.tipo}">${r.tipo}</span></td>
      <td>${valorCell}</td>
      <td>
        <button class="action-btn edit" type="button" aria-label="Editar">Editar</button>
        <button class="action-btn delete" type="button" aria-label="Excluir">Excluir</button>
      </td>`;

    tr.querySelector(".delete").onclick = async () => {
      if (!confirm(`Excluir "${r.descricao}"?`)) return;
      try {
        await deleteDoc(doc(db, "transactions", r.id));
        showToast("Lançamento excluído.", "success");
      } catch (e) {
        showToast("Falha ao excluir.", "error");
      }
    };

    tr.querySelector(".edit").onclick = () => {
      if (!modalEl) return;
      modalEl.classList.add("is-open");
      if (editDescricaoEl) editDescricaoEl.value = r.descricao ?? "";
      if (editValorEl)     editValorEl.value     = Number(r.valor || 0);
      editId = r.id;
      setTimeout(() => editDescricaoEl?.focus(), 50);
    };

    tabela.appendChild(tr);
  });

  // Update KPIs
  if (saldoEl)         saldoEl.innerText         = brl(receitas - despesas);
  if (receitasEl)      receitasEl.innerText      = brl(receitas);
  if (despesasEl)      despesasEl.innerText      = brl(despesas);
  if (investimentosEl) investimentosEl.innerText = brl(investimentosTotal);

  if (receitasCount) receitasCount.textContent = `${nReceitas} lançamento${nReceitas !== 1 ? "s" : ""}`;
  if (despesasCount) despesasCount.textContent = `${nDespesas} lançamento${nDespesas !== 1 ? "s" : ""}`;
  if (investCount)   investCount.textContent   = `${nInvest} posição${nInvest !== 1 ? "ões" : ""}`;
  if (tableCountEl)  tableCountEl.textContent  = `${filteredRows.length} registro${filteredRows.length !== 1 ? "s" : ""}`;
}

function renderAll(allRows) {
  const filteredRows = computeFilteredRows(allRows);
  renderTableAndKpis(filteredRows);
  renderCharts(filteredRows);
}

// ==============================
// ADD TRANSACTION
// ==============================
function resetAddForm() {
  if (descricaoEl) descricaoEl.value = "";
  if (valorEl)     valorEl.value = "";
}

async function addCurrent() {
  const descricao = (descricaoEl?.value || "").trim();
  if (!descricao || !currentAddType) {
    showToast("Preencha a descrição.", "error");
    return;
  }

  const btnAddEl = document.getElementById("btnAdd");
  if (btnAddEl) { btnAddEl.disabled = true; btnAddEl.textContent = "Salvando…"; }

  try {
    if (currentAddType === "investimento") {
      await addInvestimento(descricao);
    } else if (currentAddType === "despesa") {
      await addDespesa(descricao);
    } else {
      await addReceita(descricao);
    }
    showToast("Lançamento adicionado!", "success");
  } catch (e) {
    console.error(e);
    showToast(`Erro: ${e?.message || "Tente novamente."}`, "error");
  } finally {
    if (btnAddEl) { btnAddEl.disabled = false; btnAddEl.textContent = "Adicionar lançamento"; }
  }
}

async function addInvestimento(descricao) {
  if (investKind === "stock") {
    const market = stockMarket;
    const ticker = normalizeTicker(tickerEl?.value || "");
    const qtd    = Number(qtdAcoesEl?.value || 0);
    const preco  = Number(precoAcaoEl?.value || 0);

    if (!Number.isFinite(qtd) || qtd <= 0)   { throw new Error("Quantidade inválida."); }
    if (!Number.isFinite(preco) || preco <= 0) { throw new Error("Preço inválido."); }
    if (!ticker) { throw new Error("Ticker não informado."); }

    let fxUSDBRL = null, valorUSD = null, totalBRL = null;

    if (market === "US") {
      let fxRate = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
      if (!fxRate) {
        await ensureUsdBrlQuote({ force: true });
        fxRate = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
      }
      if (!Number.isFinite(fxRate) || fxRate <= 0) {
        throw new Error("Cotação USD/BRL indisponível. Rode o cron (Update Quotes) e tente novamente.");
      }
      fxUSDBRL = fxRate;
      valorUSD = qtd * preco;
      totalBRL = valorUSD * fxRate;
    } else {
      totalBRL = qtd * preco;
    }

    await addDoc(ref, {
      descricao, tipo: "investimento", investKind: "stock",
      market, ticker, qtdAcoes: qtd, precoAcao: preco,
      valor: totalBRL, valorUSD, fxUSDBRL,
      createdAt: serverTimestamp()
    });

    resetAddForm();
    if (tickerEl)    tickerEl.value    = "";
    if (qtdAcoesEl)  qtdAcoesEl.value  = "";
    if (precoAcaoEl) precoAcaoEl.value = "";
    updateInvestTotalUIStock();
    return;
  }

  // CDB
  const valor   = Number(valorEl?.value || 0);
  const pctCdi  = Number(cdbPctCdiEl?.value || 0);
  if (!Number.isFinite(valor) || valor <= 0)   { throw new Error("Valor inválido."); }
  if (!Number.isFinite(pctCdi) || pctCdi <= 0) { throw new Error("% do CDI inválido."); }

  await addDoc(ref, {
    descricao, tipo: "investimento", investKind: "cdb",
    valor, cdbPctCdi: pctCdi,
    createdAt: serverTimestamp()
  });

  resetAddForm();
  if (cdbPctCdiEl) cdbPctCdiEl.value = "";
  updateInvestTotalUICdb();
}

async function addDespesa(descricao) {
  const valor = Number(valorEl?.value || 0);
  if (!Number.isFinite(valor) || valor <= 0) { throw new Error("Valor inválido."); }

  const baseDate = new Date();
  const modo = despesaModoPagamento || "pix";

  if (modo === "cartao") {
    const parcelas = Math.max(1, Number(parcelasEl?.value || 1) | 0);
    const values   = splitAmount(valor, parcelas);
    const grupoId  = uid();

    for (let i = 0; i < parcelas; i++) {
      await addDoc(ref, {
        descricao: `${descricao} (${i + 1}/${parcelas})`,
        tipo: "despesa", valor: values[i],
        modoPagamento: "cartao",
        parcelasTotal: parcelas, parcelaNumero: i + 1,
        grupoParcelamentoId: grupoId,
        dateRef: Timestamp.fromDate(addMonths(baseDate, i)),
        createdAt: serverTimestamp()
      });
    }
    if (parcelasEl) parcelasEl.value = "1";
  } else {
    await addDoc(ref, {
      descricao, tipo: "despesa", valor,
      modoPagamento: "pix",
      dateRef: Timestamp.fromDate(baseDate),
      createdAt: serverTimestamp()
    });
  }

  resetAddForm();
  setPaymentMode("pix");
}

async function addReceita(descricao) {
  const valor = Number(valorEl?.value || 0);
  if (!Number.isFinite(valor) || valor <= 0) { throw new Error("Valor inválido."); }

  await addDoc(ref, {
    descricao, tipo: "receita", valor,
    createdAt: serverTimestamp()
  });

  resetAddForm();
}

// ==============================
// QUOTE REFRESH
// ==============================
let quoteRefreshInFlight = false;
async function ensureQuotesThenRerender(allRows) {
  if (quoteRefreshInFlight) return;
  quoteRefreshInFlight = true;
  try {
    const filtered = computeFilteredRows(allRows);
    await updateQuotesForInvestments(filtered, { force: true });
    renderAll(allRows);
  } finally {
    quoteRefreshInFlight = false;
  }
}

// ==============================
// WIRE UI EVENTS
// ==============================
btnReceita?.addEventListener("click", () => toggleAddType("receita",      btnReceita));
btnDespesa?.addEventListener("click", () => toggleAddType("despesa",      btnDespesa));
btnInvest?.addEventListener("click",  () => toggleAddType("investimento", btnInvest));
btnAdd?.addEventListener("click", addCurrent);

// Allow Enter key to submit form
addFormEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName !== "BUTTON") addCurrent();
});

btnPix?.addEventListener("click",    () => setPaymentMode("pix"));
btnCartao?.addEventListener("click", () => setPaymentMode("cartao"));

// Edit modal
(function wireEditModal() {
  const modal        = document.getElementById("modal");
  const closeModalEl = document.getElementById("closeModal");
  const saveEdit     = document.getElementById("saveEdit");
  const editDescricao = document.getElementById("editDescricao");
  const editValor     = document.getElementById("editValor");

  if (!modal || !saveEdit || !editDescricao || !editValor) return;

  const closeEditModal = () => {
    modal.classList.remove("is-open");
    editId = null;
  };

  closeModalEl?.addEventListener("click", closeEditModal);

  saveEdit.addEventListener("click", async () => {
    if (!editId) { showToast("Nenhum lançamento selecionado.", "error"); return; }

    const descricao = (editDescricao.value || "").trim();
    const valor     = Number(editValor.value);

    if (!descricao) { showToast("Descrição obrigatória.", "error"); return; }
    if (!Number.isFinite(valor)) { showToast("Valor inválido.", "error"); return; }

    saveEdit.disabled = true;
    saveEdit.textContent = "Salvando…";

    try {
      await updateDoc(doc(db, "transactions", editId), { descricao, valor });
      closeEditModal();
      showToast("Lançamento atualizado!", "success");
    } catch (e) {
      console.error(e);
      showToast(`Falha ao salvar: ${e?.message || e}`, "error");
    } finally {
      saveEdit.disabled = false;
      saveEdit.textContent = "Salvar alterações";
    }
  });
})();

// ==============================
// BOOT
// ==============================
showAddForm(false);
if (investFieldsEl) investFieldsEl.hidden = true;
setPaymentUIVisible(false);
if (yearValue)  yearValue.textContent  = String(selectedYear);
if (monthValue) monthValue.textContent = "Todos";

wireDropdown(yearDD, yearBtn, (open) => {
  setDDOpen(yearDD, open);
  setDDOpen(monthDD, false);
});

wireDropdown(monthDD, monthBtn, (open) => {
  setDDOpen(monthDD, open);
  setDDOpen(yearDD, false);
});

clearFiltersBtn?.addEventListener("click", async () => {
  selectedYear  = new Date().getFullYear();
  selectedMonth = "all";
  if (yearValue)  yearValue.textContent  = String(selectedYear);
  if (monthValue) monthValue.textContent = "Todos";
  setDDOpen(yearDD,  false);
  setDDOpen(monthDD, false);
  if (window.__ALL_ROWS__) await ensureQuotesThenRerender(window.__ALL_ROWS__);
});

// ==============================
// FIRESTORE SUBSCRIPTION
// ==============================
onSnapshot(query(ref, orderBy("createdAt", "desc")), async snapshot => {
  const allRows = [];
  snapshot.forEach(docItem => {
    const data = docItem.data();
    allRows.push({
      id:         docItem.id,
      descricao:  data.descricao,
      tipo:       data.tipo,
      valor:      Number(data.valor     || 0),
      valorUSD:   data.valorUSD  == null ? null : Number(data.valorUSD  || 0),
      fxUSDBRL:   data.fxUSDBRL  == null ? null : Number(data.fxUSDBRL  || 0),
      investKind: data.investKind,
      market:     data.market,
      cdbPctCdi:  Number(data.cdbPctCdi || 0),
      ticker:     data.ticker,
      qtdAcoes:   Number(data.qtdAcoes  || 0),
      precoAcao:  Number(data.precoAcao || 0),
      createdAt:  toDateMaybe(data.createdAt),
      dateRef:    toDateMaybe(data.dateRef) || null
    });
  });

  window.__ALL_ROWS__ = allRows;

  // Build year options
  const currentYear = new Date().getFullYear();
  const years = new Set([currentYear]);
  allRows.forEach(r => {
    const d = clampDate(r.dateRef || r.createdAt);
    if (d) years.add(d.getFullYear());
  });
  const sortedYears = Array.from(years).sort((a, b) => b - a);
  if (!sortedYears.includes(selectedYear)) selectedYear = currentYear;

  buildMenu(
    yearMenu,
    sortedYears.map(y => ({ value: y, label: String(y) })),
    selectedYear,
    async (value, label) => {
      selectedYear = Number(value);
      if (yearValue) yearValue.textContent = label;
      setDDOpen(yearDD, false);
      renderAll(window.__ALL_ROWS__);
      await ensureQuotesThenRerender(window.__ALL_ROWS__);
    }
  );

  buildMenu(
    monthMenu,
    [{ value: "all", label: "Todos" }, ...monthNames.map((m, i) => ({ value: i, label: m }))],
    selectedMonth,
    async (value, label) => {
      selectedMonth = value === "all" ? "all" : Number(value);
      if (monthValue) monthValue.textContent = label;
      setDDOpen(monthDD, false);
      renderAll(window.__ALL_ROWS__);
      await ensureQuotesThenRerender(window.__ALL_ROWS__);
    }
  );

  if (yearValue) yearValue.textContent = String(selectedYear);

  setupInvestDropdownsOnce();
  renderAll(allRows);
  await ensureQuotesThenRerender(allRows);
});

// Pull-to-refresh (mobile)
window.refreshApp = async function refreshApp() {
  try { if (typeof quoteCache?.clear === "function") quoteCache.clear(); } catch {}
  if (window.__ALL_ROWS__) {
    await ensureQuotesThenRerender(window.__ALL_ROWS__);
    showToast("Dados atualizados!", "success");
  } else {
    location.reload();
  }
};
