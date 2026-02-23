import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/**
 * =====================
 * CONFIG (Alpha Vantage)
 * =====================
 */
const ALPHAVANTAGE_KEY = "SUA_CHAVE_AQUI";
const AV_BASE = "https://www.alphavantage.co/query";
const AV_FUNCTION = "GLOBAL_QUOTE";

// Atualização diária 10:00:00 (local do browser)
const DAILY_QUOTE_HOUR = 10;
const DAILY_QUOTE_MINUTE = 0;
const DAILY_QUOTE_SECOND = 0;

// throttle simples p/ não spammar AV
const AV_DELAY_MS = 450;

/**
 * ==========
 * Helpers
 * ==========
 */
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function toDateMaybe(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === "function") return ts.toDate();
  return null;
}

function clampDate(d) {
  return d instanceof Date && !isNaN(d) ? d : null;
}

function brl(n) {
  const x = Number(n || 0);
  return fmtBRL.format(Number.isFinite(x) ? x : 0);
}

function pct(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0%";
  return `${(x * 100).toFixed(2)}%`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function normalizeTicker(raw) {
  return String(raw || "").trim().toUpperCase();
}

function isBrazilLikeTicker(ticker) {
  return /[0-9]$/.test(ticker) || ticker.endsWith(".SA");
}

function toAlphaVantageSymbolCandidates(rawTicker) {
  const t = normalizeTicker(rawTicker);
  if (!t) return [];

  // Brasil: preferir .SA primeiro
  if (isBrazilLikeTicker(t)) {
    const withSA = t.endsWith(".SA") ? t : `${t}.SA`;
    return Array.from(new Set([withSA, t]));
  }

  // EUA: usar como está
  return Array.from(new Set([t, `${t}.SA`]));
}

const monthNames = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

/**
 * ==========
 * DOM refs
 * ==========
 */
const tabela = document.getElementById("tabela");
const saldoEl = document.getElementById("saldo");
const receitasEl = document.getElementById("receitas");
const despesasEl = document.getElementById("despesas");
const investimentosEl = document.getElementById("investimentos");

const modalEl = document.getElementById("modal");
const editDescricaoEl = document.getElementById("editDescricao");
const editValorEl = document.getElementById("editValor");

const addFormEl = document.getElementById("addForm");

// Inputs
const descricaoEl = document.getElementById("descricao");
const valorEl = document.getElementById("valor");

// Invest inputs
const investFieldsEl = document.getElementById("investFields");
const tickerEl = document.getElementById("ticker");
const qtdAcoesEl = document.getElementById("qtdAcoes");
const precoAcaoEl = document.getElementById("precoAcao");
const investTotalEl = document.getElementById("investTotal");

// Botões
const btnReceita = document.getElementById("btnReceita");
const btnDespesa = document.getElementById("btnDespesa");
const btnInvest = document.getElementById("btnInvest");
const btnAdd = document.getElementById("btnAdd");

// Dropdown (Ano/Mês)
const yearDD = document.getElementById("yearDD");
const yearMenu = document.getElementById("yearMenu");
const yearValue = document.getElementById("yearValue");
const yearBtn = document.getElementById("yearBtn");

const monthDD = document.getElementById("monthDD");
const monthMenu = document.getElementById("monthMenu");
const monthValue = document.getElementById("monthValue");
const monthBtn = document.getElementById("monthBtn");

const clearFiltersBtn = document.getElementById("clearFilters");

/**
 * ==========
 * Firestore
 * ==========
 */
const ref = collection(db, "transactions");
let editId = null;

/**
 * ==========
 * State
 * ==========
 */
let selectedYear = new Date().getFullYear();
let selectedMonth = "all";
let currentAddType = null;

/**
 * ==========
 * UI helpers
 * ==========
 */
function setActiveTypeButton(activeBtn) {
  [btnReceita, btnDespesa, btnInvest].forEach(b => {
    if (!b) return;
    b.classList.toggle("is-selected", b === activeBtn);
  });
}

function showAddForm(show) {
  if (!addFormEl) return;
  addFormEl.style.display = show ? "block" : "none";
}

function getInvestTotal() {
  const qtd = Number(qtdAcoesEl?.value || 0);
  const preco = Number(precoAcaoEl?.value || 0);
  return (Number.isFinite(qtd) ? qtd : 0) * (Number.isFinite(preco) ? preco : 0);
}

function updateInvestTotalUI() {
  const total = getInvestTotal();
  if (investTotalEl) investTotalEl.textContent = brl(total);
  if (valorEl) valorEl.value = total ? String(total.toFixed(2)) : "";
}

/**
 * Toggle:
 * - Clique no tipo => abre form e seleciona tipo
 * - Clique no MESMO tipo novamente => fecha form e limpa seleção
 */
function toggleAddType(tipo, activeBtn) {
  const isOpen = addFormEl ? addFormEl.style.display !== "none" : false;
  const isSameType = currentAddType === tipo;

  if (isOpen && isSameType) {
    // fechar
    currentAddType = null;
    setActiveTypeButton(null);
    showAddForm(false);
    if (investFieldsEl) investFieldsEl.hidden = true;
    return;
  }

  // abrir/trocar
  currentAddType = tipo;
  setActiveTypeButton(activeBtn);
  showAddForm(true);

  const isInvest = tipo === "investimento";
  if (investFieldsEl) investFieldsEl.hidden = !isInvest;
  if (isInvest) updateInvestTotalUI();
}

if (qtdAcoesEl) qtdAcoesEl.addEventListener("input", updateInvestTotalUI);
if (precoAcaoEl) precoAcaoEl.addEventListener("input", updateInvestTotalUI);

/**
 * ==========
 * Alpha Vantage cache
 * ==========
 */
const quoteCache = new Map(); // symbol => { price, updatedAt }
const QUOTE_TTL_MS = 6 * 60 * 60 * 1000; // 6h (pra refletir melhor durante o dia)

async function fetchQuoteForSymbol(symbol) {
  const url = `${AV_BASE}?function=${encodeURIComponent(AV_FUNCTION)}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(ALPHAVANTAGE_KEY)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data?.Note) throw new Error("Alpha Vantage rate limit: " + data.Note);
  if (data?.Information) throw new Error("Alpha Vantage: " + data.Information);
  if (data?.["Error Message"]) throw new Error("Alpha Vantage: " + data["Error Message"]);

  const quote = data?.["Global Quote"];
  const price = Number(quote?.["05. price"]);
  if (!Number.isFinite(price) || price <= 0) return null;

  return price;
}

async function fetchAlphaVantageQuoteSmart(rawTicker, { force = false } = {}) {
  const candidates = toAlphaVantageSymbolCandidates(rawTicker);
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
    try {
      const price = await fetchQuoteForSymbol(sym);
      if (price != null) {
        quoteCache.set(sym, { price, updatedAt: now });
        return { symbolUsed: sym, price };
      }
    } catch (e) {
      console.warn("Cotação falhou:", sym, e?.message || e);
    }
    await sleep(AV_DELAY_MS);
  }

  return null;
}

async function updateQuotesForInvestments(rows, { force = false } = {}) {
  const tickers = Array.from(new Set(
    rows
      .filter(r => r.tipo === "investimento")
      .map(r => normalizeTicker(r.ticker))
      .filter(Boolean)
  ));

  for (const t of tickers) {
    await fetchAlphaVantageQuoteSmart(t, { force });
    await sleep(AV_DELAY_MS);
  }
}

function getCachedQuoteForTicker(rawTicker) {
  const candidates = toAlphaVantageSymbolCandidates(rawTicker);
  for (const sym of candidates) {
    const cached = quoteCache.get(sym);
    if (cached?.price) return { symbol: sym, price: cached.price, updatedAt: cached.updatedAt };
  }
  return null;
}

function getCurrentValueForInvestmentRow(row) {
  if (row.tipo !== "investimento") return null;

  const qtd = Number(row.qtdAcoes || 0);
  if (!Number.isFinite(qtd) || qtd <= 0) return null;

  const t = normalizeTicker(row.ticker);
  if (!t) return null;

  const q = getCachedQuoteForTicker(t);
  if (!q?.price) return null;

  return qtd * q.price;
}

/**
 * ==========
 * Charts
 * ==========
 */
let lineChart = null;
let pieChart = null;

function destroyCharts() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (pieChart) { pieChart.destroy(); pieChart = null; }
}

function chartDefaults() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = "rgba(229,231,235,.62)";
  Chart.defaults.font.family =
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
}

function makeGlowDataset(baseColor, data, label) {
  return {
    label,
    data,
    borderColor: baseColor,
    backgroundColor: baseColor.replace("1)", "0.22)"),
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 4,
    pointBackgroundColor: baseColor,
    tension: 0.35,
    fill: true
  };
}

const glowPlugin = {
  id: "glowPlugin",
  beforeDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.shadowColor = "rgba(109,124,255,.25)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
  },
  afterDatasetsDraw(chart) {
    chart.ctx.restore();
  }
};

function computeFilteredRows(allRows) {
  return allRows.filter(r => {
    const d = clampDate(r.createdAt);
    if (!d) return false;
    if (d.getFullYear() !== selectedYear) return false;
    if (selectedMonth !== "all" && d.getMonth() !== selectedMonth) return false;
    return true;
  });
}

function sumInvestmentsCurrentValue(rows) {
  let total = 0;
  rows.forEach(r => {
    if (r.tipo !== "investimento") return;
    const atual = getCurrentValueForInvestmentRow(r);
    if (atual != null) total += atual;
  });
  return total;
}

function renderCharts(filteredRows) {
  if (typeof Chart === "undefined") return;
  chartDefaults();

  const lineCtx = document.getElementById("barChart");
  const pieCtx = document.getElementById("pieChart");
  if (!lineCtx || !pieCtx) return;

  const blue = "rgba(109,124,255,1)";
  const pink = "rgba(217,70,239,1)";

  let labels = [];
  let receitaSeries = [];
  let despesaSeries = [];

  const hasFixedMonth = selectedMonth !== "all";

  if (hasFixedMonth) {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

    const byDay = Array.from({ length: daysInMonth }, () => ({ receita: 0, despesa: 0 }));

    filteredRows.forEach(r => {
      const d = clampDate(r.createdAt);
      if (!d) return;
      const day = d.getDate() - 1;
      if (r.tipo === "receita") byDay[day].receita += r.valor;
      if (r.tipo === "despesa") byDay[day].despesa += r.valor;
    });

    receitaSeries = byDay.map(x => x.receita);
    despesaSeries = byDay.map(x => x.despesa);
  } else {
    labels = monthNames.map(m => m.slice(0, 3).toLowerCase());

    const byMonthReceita = Array.from({ length: 12 }, () => 0);
    const byMonthDespesa = Array.from({ length: 12 }, () => 0);

    filteredRows.forEach(r => {
      const d = clampDate(r.createdAt);
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

  const investimentosAtual = sumInvestmentsCurrentValue(filteredRows);

  destroyCharts();

  lineChart = new Chart(lineCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        makeGlowDataset(blue, receitaSeries, "Receita"),
        makeGlowDataset(pink, despesaSeries, "Despesa")
      ]
    },
    options: { responsive: true, maintainAspectRatio: false },
    plugins: [glowPlugin]
  });

  pieChart = new Chart(pieCtx, {
    type: "doughnut",
    data: {
      labels: ["Receita", "Despesa", "Investimentos (atual)"],
      datasets: [{
        data: [receitas, despesas, investimentosAtual],
        backgroundColor: [
          "rgba(109,124,255,0.9)",
          "rgba(245,158,11,0.9)",
          "rgba(168,85,247,0.9)"
        ],
        borderColor: "rgba(15,23,42,.9)",
        borderWidth: 3
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: "68%" }
  });
}

/**
 * ==========
 * Table + KPIs
 * ==========
 */
function renderTableAndKpis(filteredRows) {
  if (!tabela) return;

  let receitas = 0, despesas = 0;
  const investimentosAtual = sumInvestmentsCurrentValue(filteredRows);

  tabela.innerHTML = "";

  filteredRows.forEach(r => {
    if (r.tipo === "receita") receitas += r.valor;
    if (r.tipo === "despesa") despesas += r.valor;

    const tr = document.createElement("tr");

    let valorAtual = null;
    let pl = null;
    let plPct = null;
    let quoteLine = `<span class="muted">Cotação: --</span>`;

    if (r.tipo === "investimento" && r.ticker && Number.isFinite(r.qtdAcoes) && r.qtdAcoes > 0) {
      const q = getCachedQuoteForTicker(r.ticker);
      if (q?.price) {
        valorAtual = r.qtdAcoes * q.price;
        pl = valorAtual - r.valor;
        plPct = r.valor > 0 ? (pl / r.valor) : 0;
        quoteLine = `<span>Cotação (${q.symbol}): ${brl(q.price)}</span>`;
      }
    }

    const desc =
      r.tipo === "investimento"
        ? `${r.descricao ?? ""}${r.ticker ? ` (${normalizeTicker(r.ticker)})` : ""} — ${r.qtdAcoes ?? 0} × ${brl(r.precoAcao ?? 0)}`
        : (r.descricao ?? "");

    const valorCell = r.tipo === "investimento"
      ? `
        <div class="val-col">
          <div class="val-main">Investido: ${brl(r.valor)}</div>
          <div class="val-sub">${quoteLine}</div>
          <div class="val-sub">
            ${valorAtual == null ? `<span class="muted">Atual: carregando...</span>` : `<span>Atual: ${brl(valorAtual)}</span>`}
            ${pl == null ? "" : `<span class="pl ${pl >= 0 ? "pl-pos" : "pl-neg"}">P/L: ${brl(pl)} (${pct(plPct)})</span>`}
          </div>
        </div>
      `
      : brl(r.valor);

    tr.innerHTML = `
      <td>${desc}</td>
      <td><span class="type-pill type-${r.tipo}">${r.tipo}</span></td>
      <td>${valorCell}</td>
      <td>
        <button class="action-btn edit" type="button">Editar</button>
        <button class="action-btn delete" type="button">Excluir</button>
      </td>
    `;

    const delBtn = tr.querySelector(".delete");
    if (delBtn) delBtn.onclick = () => deleteDoc(doc(db, "transactions", r.id));

    const editBtn = tr.querySelector(".edit");
    if (editBtn) {
      editBtn.onclick = () => {
        if (!modalEl) return;
        modalEl.style.display = "flex";
        if (editDescricaoEl) editDescricaoEl.value = r.descricao ?? "";
        if (editValorEl) editValorEl.value = Number(r.valor || 0);
        editId = r.id;
      };
    }

    tabela.appendChild(tr);
  });

  if (saldoEl) saldoEl.innerText = brl(receitas - despesas);
  if (receitasEl) receitasEl.innerText = brl(receitas);
  if (despesasEl) despesasEl.innerText = brl(despesas);
  if (investimentosEl) investimentosEl.innerText = brl(investimentosAtual);
}

function renderAll(allRows) {
  const filteredRows = computeFilteredRows(allRows);
  renderTableAndKpis(filteredRows);
  renderCharts(filteredRows);
}

/**
 * ==========
 * Dropdown custom
 * ==========
 */
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

/**
 * ==========
 * Add
 * ==========
 */
async function addCurrent() {
  const descricao = (descricaoEl?.value || "").trim();
  if (!descricao || !currentAddType) return;

  if (currentAddType === "investimento") {
    const ticker = normalizeTicker(tickerEl?.value || "");
    const qtd = Number(qtdAcoesEl?.value || 0);
    const preco = Number(precoAcaoEl?.value || 0);
    const total = qtd * preco;

    if (!Number.isFinite(qtd) || qtd <= 0) return;
    if (!Number.isFinite(preco) || preco <= 0) return;

    await addDoc(ref, {
      descricao,
      tipo: "investimento",
      ticker,
      qtdAcoes: qtd,
      precoAcao: preco,
      valor: total,
      createdAt: serverTimestamp()
    });

    if (descricaoEl) descricaoEl.value = "";
    if (tickerEl) tickerEl.value = "";
    if (qtdAcoesEl) qtdAcoesEl.value = "";
    if (precoAcaoEl) precoAcaoEl.value = "";
    if (valorEl) valorEl.value = "";
    updateInvestTotalUI();
    return;
  }

  const valor = Number(valorEl?.value || 0);
  if (!Number.isFinite(valor) || valor <= 0) return;

  await addDoc(ref, { descricao, valor, tipo: currentAddType, createdAt: serverTimestamp() });

  if (descricaoEl) descricaoEl.value = "";
  if (valorEl) valorEl.value = "";
}

/**
 * ==========
 * Scheduler 10:00:00
 * ==========
 */
function msUntilNextTenAM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(DAILY_QUOTE_HOUR, DAILY_QUOTE_MINUTE, DAILY_QUOTE_SECOND, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleDailyQuoteUpdate() {
  const delay = msUntilNextTenAM();
  setTimeout(async () => {
    try {
      if (window.__ALL_ROWS__) {
        const filtered = computeFilteredRows(window.__ALL_ROWS__);
        await updateQuotesForInvestments(filtered, { force: true });
        renderAll(window.__ALL_ROWS__);
      }
    } finally {
      scheduleDailyQuoteUpdate();
    }
  }, delay);
}

/**
 * ==========
 * Force quote refresh after snapshot
 * ==========
 */
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

/**
 * ==========
 * Wire UI (TOGGLE)
 * ==========
 */
if (btnReceita) btnReceita.addEventListener("click", () => toggleAddType("receita", btnReceita));
if (btnDespesa) btnDespesa.addEventListener("click", () => toggleAddType("despesa", btnDespesa));
if (btnInvest) btnInvest.addEventListener("click", () => toggleAddType("investimento", btnInvest));
if (btnAdd) btnAdd.addEventListener("click", () => addCurrent());

/**
 * ==========
 * Boot
 * ==========
 */
showAddForm(false);
if (investFieldsEl) investFieldsEl.hidden = true;

if (yearValue) yearValue.textContent = String(selectedYear);
if (monthValue) monthValue.textContent = "Todos";

wireDropdown(yearDD, yearBtn, (open) => {
  setDDOpen(yearDD, open);
  setDDOpen(monthDD, false);
});

wireDropdown(monthDD, monthBtn, (open) => {
  setDDOpen(monthDD, open);
  setDDOpen(yearDD, false);
});

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", async () => {
    selectedYear = new Date().getFullYear();
    selectedMonth = "all";
    if (yearValue) yearValue.textContent = String(selectedYear);
    if (monthValue) monthValue.textContent = "Todos";
    setDDOpen(yearDD, false);
    setDDOpen(monthDD, false);

    if (window.__ALL_ROWS__) {
      await ensureQuotesThenRerender(window.__ALL_ROWS__);
    }
  });
}

scheduleDailyQuoteUpdate();

/**
 * ==========
 * Firestore subscription
 * ==========
 */
onSnapshot(query(ref, orderBy("createdAt", "desc")), async snapshot => {
  const allRows = [];
  snapshot.forEach(docItem => {
    const data = docItem.data();
    allRows.push({
      id: docItem.id,
      descricao: data.descricao,
      tipo: data.tipo,
      valor: Number(data.valor || 0),
      ticker: data.ticker,
      qtdAcoes: Number(data.qtdAcoes || 0),
      precoAcao: Number(data.precoAcao || 0),
      createdAt: toDateMaybe(data.createdAt)
    });
  });

  window.__ALL_ROWS__ = allRows;

  renderAll(allRows);

  if (yearMenu && monthMenu && yearValue && monthValue) {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear]);
    allRows.forEach(r => {
      const d = clampDate(r.createdAt);
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
        yearValue.textContent = label;
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
        monthValue.textContent = label;
        setDDOpen(monthDD, false);
        renderAll(window.__ALL_ROWS__);
        await ensureQuotesThenRerender(window.__ALL_ROWS__);
      }
    );

    yearValue.textContent = String(selectedYear);
  }

  await ensureQuotesThenRerender(allRows);
});
