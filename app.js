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
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/**
 * =====================
 * CONFIG (Quotes via Firestore - written by GitHub Actions)
 * =====================
 * Espera docs em: collection "quotes"
 * - docId = ticker (ex: "AAPL", "PETR4.SA")
 * - docId = "USD-BRL" (taxa USD->BRL)
 *
 * Formato esperado:
 * { price: number, updatedAt: Timestamp, source?: string, error?: string }
 */

// cache local no browser (só para não ler Firestore toda hora)
const quoteCache = new Map(); // symbol => { price, updatedAt }
const QUOTE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// FX
const FX_USD_BRL_DOC_ID = "USD-BRL";

/**
 * ==========
 * Helpers
 * ==========
 */
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

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

function usd(n) {
  const x = Number(n || 0);
  return fmtUSD.format(Number.isFinite(x) ? x : 0);
}

function pct(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0%";
  return `${(x * 100).toFixed(2)}%`;
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
  const fx = Number(usdBrl);
  if (!Number.isFinite(u) || !Number.isFinite(fx) || fx <= 0) return null;
  return u * fx;
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

// Invest fields containers
const investFieldsEl = document.getElementById("investFields");
const stockFieldsEl = document.getElementById("stockFields");
const cdbFieldsEl = document.getElementById("cdbFields");
const investTotalEl = document.getElementById("investTotal");

// Stock inputs
const tickerEl = document.getElementById("ticker");
const qtdAcoesEl = document.getElementById("qtdAcoes");
const precoAcaoEl = document.getElementById("precoAcao");

// CDB input
const cdbPctCdiEl = document.getElementById("cdbPctCdi");

// InvestKind DD
const investKindDD = document.getElementById("investKindDD");
const investKindBtn = document.getElementById("investKindBtn");
const investKindMenu = document.getElementById("investKindMenu");
const investKindValue = document.getElementById("investKindValue");

// StockMarket DD
const stockMarketDD = document.getElementById("stockMarketDD");
const stockMarketBtn = document.getElementById("stockMarketBtn");
const stockMarketMenu = document.getElementById("stockMarketMenu");
const stockMarketValue = document.getElementById("stockMarketValue");

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

// Invest state
let investKind = "stock"; // "stock" | "cdb"
let stockMarket = "BR";   // "BR" | "US"

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

/**
 * Total automático (AÇÕES)
 * - BR: total em BRL
 * - US: mostra "total" convertido para BRL usando a taxa do cache (se existir)
 */
function getInvestTotalStock() {
  const qtd = Number(qtdAcoesEl?.value || 0);
  const preco = Number(precoAcaoEl?.value || 0);

  const q = Number.isFinite(qtd) ? qtd : 0;
  const p = Number.isFinite(preco) ? preco : 0;

  const raw = q * p; // BRL (BR) ou USD (US)

  if (stockMarket !== "US") return raw;

  const fx = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
  const converted = usdToBrl(raw, fx);
  return converted ?? 0;
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
  if (cdbFieldsEl) cdbFieldsEl.hidden = isStock;

  if (isStock) updateInvestTotalUIStock();
  else updateInvestTotalUICdb();
}

/**
 * ==========
 * Dropdown custom (Ano/Mês + Invest)
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

let investDDSetupDone = false;
function setupInvestDropdownsOnce() {
  if (investDDSetupDone) return;
  investDDSetupDone = true;

  // Open/close
  wireDropdown(investKindDD, investKindBtn, (open) => {
    setDDOpen(investKindDD, open);
    setDDOpen(stockMarketDD, false);
  });

  wireDropdown(stockMarketDD, stockMarketBtn, (open) => {
    setDDOpen(stockMarketDD, open);
    setDDOpen(investKindDD, false);
  });

  // Menus
  buildMenu(
    investKindMenu,
    [
      { value: "stock", label: "Ação" },
      { value: "cdb", label: "CDB" }
    ],
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
    [
      { value: "BR", label: "Brasil (BRL)" },
      { value: "US", label: "EUA (USD)" }
    ],
    stockMarket,
    (value, label) => {
      stockMarket = String(value);
      if (stockMarketValue) stockMarketValue.textContent = label;
      setDDOpen(stockMarketDD, false);

      // ao trocar BR/US, recalcula preview do total
      if (investKind === "stock") updateInvestTotalUIStock();
    }
  );

  // Valores iniciais
  if (investKindValue) investKindValue.textContent = investKind === "stock" ? "Ação" : "CDB";
  if (stockMarketValue) stockMarketValue.textContent = stockMarket === "BR" ? "Brasil (BRL)" : "EUA (USD)";
}

/**
 * Toggle tipo:
 * - Clicar abre
 * - Clicar no mesmo fecha
 */
function toggleAddType(tipo, activeBtn) {
  const isOpen = addFormEl ? addFormEl.style.display !== "none" : false;
  const isSameType = currentAddType === tipo;

  if (isOpen && isSameType) {
    currentAddType = null;
    setActiveTypeButton(null);
    showAddForm(false);
    if (investFieldsEl) investFieldsEl.hidden = true;
    return;
  }

  currentAddType = tipo;
  setActiveTypeButton(activeBtn);
  showAddForm(true);

  const isInvest = tipo === "investimento";
  if (investFieldsEl) investFieldsEl.hidden = !isInvest;

  if (isInvest) {
    setupInvestDropdownsOnce();
    applyInvestKindUI();
  }
}

// total UI events
if (qtdAcoesEl) qtdAcoesEl.addEventListener("input", () => investKind === "stock" && updateInvestTotalUIStock());
if (precoAcaoEl) precoAcaoEl.addEventListener("input", () => investKind === "stock" && updateInvestTotalUIStock());
if (valorEl) valorEl.addEventListener("input", () => investKind === "cdb" && updateInvestTotalUICdb());

/**
 * ==========
 * Quotes (from Firestore)
 * ==========
 */
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
  try {
    await fetchQuoteSmart(FX_USD_BRL_DOC_ID, { force });
  } catch {
    // ignore
  }
}

async function updateQuotesForInvestments(rows, { force = false } = {}) {
  // sempre tenta carregar USD/BRL (necessário para ações US)
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
  if (row.tipo !== "investimento") return null;
  if (row.investKind === "cdb") return null;

  const qtd = Number(row.qtdAcoes || 0);
  if (!Number.isFinite(qtd) || qtd <= 0) return null;

  const t = normalizeTicker(row.ticker);
  if (!t) return null;

  const q = getCachedQuoteForTicker(t);
  if (!q?.price) return null;

  // BR: quote já em BRL
  if (row.market !== "US") {
    return qtd * q.price;
  }

  // US: quote em USD -> converte para BRL com USD/BRL atual
  const fx = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
  const currentUsd = qtd * q.price;
  const currentBrl = usdToBrl(currentUsd, fx);
  return currentBrl;
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

function sumInvestmentsValue(rows) {
  let total = 0;

  rows.forEach(r => {
    if (r.tipo !== "investimento") return;

    if (r.investKind === "cdb") {
      total += Number(r.valor || 0);
      return;
    }

    const atual = getCurrentValueForInvestmentRow(r);
    total += (atual != null ? atual : Number(r.valor || 0));
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

  const investimentosTotal = sumInvestmentsValue(filteredRows);

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
      labels: ["Receita", "Despesa", "Investimentos"],
      datasets: [{
        data: [receitas, despesas, investimentosTotal],
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
  const investimentosTotal = sumInvestmentsValue(filteredRows);

  tabela.innerHTML = "";

  filteredRows.forEach(r => {
    if (r.tipo === "receita") receitas += r.valor;
    if (r.tipo === "despesa") despesas += r.valor;

    const tr = document.createElement("tr");

    let valorAtual = null;
    let pl = null;
    let plPct = null;
    let quoteLine = `<span class="muted">Cotação: --</span>`;

    const isStockInvestment = r.tipo === "investimento" && r.investKind !== "cdb";

    if (isStockInvestment && r.ticker && Number.isFinite(r.qtdAcoes) && r.qtdAcoes > 0) {
      const q = getCachedQuoteForTicker(r.ticker);

      if (q?.price) {
        // valorAtual sempre em BRL
        valorAtual = getCurrentValueForInvestmentRow(r);

        pl = (valorAtual == null ? null : (valorAtual - Number(r.valor || 0)));
        plPct = (pl != null && r.valor > 0) ? (pl / r.valor) : null;

        if (r.market === "US") {
          const fx = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
          quoteLine = `<span>Cotação (${q.symbol}): ${usd(q.price)} ${fx ? `| USD/BRL: ${fx.toFixed(4)}` : ""}</span>`;
        } else {
          quoteLine = `<span>Cotação (${q.symbol}): ${brl(q.price)}</span>`;
        }
      }
    }

    const desc =
      r.tipo === "investimento"
        ? (r.investKind === "cdb"
            ? `${r.descricao ?? ""} — CDB ${Number(r.cdbPctCdi || 0)}% do CDI`
            : `${r.descricao ?? ""}${r.ticker ? ` (${normalizeTicker(r.ticker)})` : ""} — ${r.qtdAcoes ?? 0} × ${r.market === "US" ? usd(r.precoAcao ?? 0) : brl(r.precoAcao ?? 0)} ${r.market === "US" ? "(USD)" : "(BRL)"}`
          )
        : (r.descricao ?? "");

    // Linha extra de "investido" para US
    const investedExtraUS =
      (r.tipo === "investimento" && r.investKind !== "cdb" && r.market === "US" && Number.isFinite(r.valorUSD) && r.valorUSD > 0)
        ? `<div class="val-sub"><span class="muted">(${usd(r.valorUSD)} @ câmbio ${Number(r.fxUSDBRL || 0).toFixed(4)})</span></div>`
        : "";

    const valorCell = r.tipo === "investimento"
      ? (r.investKind === "cdb"
          ? `<div class="val-col">
              <div class="val-main">${brl(r.valor)}</div>
              <div class="val-sub"><span class="muted">CDB</span><span class="muted">${Number(r.cdbPctCdi || 0)}% CDI</span></div>
            </div>`
          : `
            <div class="val-col">
              <div class="val-main">Investido: ${brl(r.valor)}</div>
              ${investedExtraUS}
              <div class="val-sub">${quoteLine}</div>
              <div class="val-sub">
                ${valorAtual == null ? `<span class="muted">Atual: --</span>` : `<span>Atual: ${brl(valorAtual)}</span>`}
                ${pl == null ? "" : `<span class="pl ${pl >= 0 ? "pl-pos" : "pl-neg"}">P/L: ${brl(pl)}${plPct == null ? "" : ` (${pct(plPct)})`}</span>`}
              </div>
            </div>
          `)
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
  if (investimentosEl) investimentosEl.innerText = brl(investimentosTotal);
}

function renderAll(allRows) {
  const filteredRows = computeFilteredRows(allRows);
  renderTableAndKpis(filteredRows);
  renderCharts(filteredRows);
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
    if (investKind === "stock") {
      const market = stockMarket;
      const ticker = normalizeTicker(tickerEl?.value || "");
      const qtd = Number(qtdAcoesEl?.value || 0);
      const preco = Number(precoAcaoEl?.value || 0);

      if (!Number.isFinite(qtd) || qtd <= 0) return;
      if (!Number.isFinite(preco) || preco <= 0) return;

      // precoAcao digitado:
      // - BR: BRL
      // - US: USD
      let fxUSDBRL = null;
      let valorUSD = null;
      let totalBRL = null;

      if (market === "US") {
        // garante que temos USD/BRL no cache (se não tiver, tenta buscar do Firestore)
        let fx = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
        if (!fx) {
          await ensureUsdBrlQuote({ force: true });
          fx = quoteCache.get(FX_USD_BRL_DOC_ID)?.price ?? null;
        }

        if (!Number.isFinite(fx) || fx <= 0) {
          alert("Não foi possível obter a cotação USD/BRL. Rode o cron (Update Quotes) e tente novamente.");
          return;
        }

        fxUSDBRL = fx;
        valorUSD = qtd * preco;      // USD
        totalBRL = valorUSD * fx;    // BRL
      } else {
        totalBRL = qtd * preco;      // BRL
      }

      await addDoc(ref, {
        descricao,
        tipo: "investimento",
        investKind: "stock",
        market,
        ticker,
        qtdAcoes: qtd,
        precoAcao: preco,   // BRL (BR) ou USD (US)
        valor: totalBRL,    // sempre BRL
        valorUSD,           // só US
        fxUSDBRL,           // só US
        createdAt: serverTimestamp()
      });

      if (descricaoEl) descricaoEl.value = "";
      if (tickerEl) tickerEl.value = "";
      if (qtdAcoesEl) qtdAcoesEl.value = "";
      if (precoAcaoEl) precoAcaoEl.value = "";
      if (valorEl) valorEl.value = "";
      updateInvestTotalUIStock();
      return;
    }

    // CDB
    const valor = Number(valorEl?.value || 0);
    const pctCdi = Number(cdbPctCdiEl?.value || 0);

    if (!Number.isFinite(valor) || valor <= 0) return;
    if (!Number.isFinite(pctCdi) || pctCdi <= 0) return;

    await addDoc(ref, {
      descricao,
      tipo: "investimento",
      investKind: "cdb",
      valor,
      cdbPctCdi: pctCdi,
      createdAt: serverTimestamp()
    });

    if (descricaoEl) descricaoEl.value = "";
    if (valorEl) valorEl.value = "";
    if (cdbPctCdiEl) cdbPctCdiEl.value = "";
    updateInvestTotalUICdb();
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
 * Wire UI
 * ==========
 */
if (btnReceita) btnReceita.addEventListener("click", () => toggleAddType("receita", btnReceita));
if (btnDespesa) btnDespesa.addEventListener("click", () => toggleAddType("despesa", btnDespesa));
if (btnInvest) btnInvest.addEventListener("click", () => toggleAddType("investimento", btnInvest));
if (btnAdd) btnAdd.addEventListener("click", () => addCurrent());
// ===== Modal Edit: handlers (Salvar/Fechar) =====
const closeModalBtn = document.getElementById("closeModal");
const saveEditBtn = document.getElementById("saveEdit");

function closeEditModal() {
  if (modalEl) modalEl.style.display = "none";
  editId = null;
}

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => closeEditModal());
}

if (saveEditBtn) {
  saveEditBtn.addEventListener("click", async () => {
    try {
      if (!editId) {
        alert("Nenhum lançamento selecionado para edição.");
        return;
      }

      const descricao = (editDescricaoEl?.value || "").trim();
      const valor = Number(editValorEl?.value || 0);

      if (!descricao) {
        alert("Descrição é obrigatória.");
        return;
      }
      if (!Number.isFinite(valor)) {
        alert("Valor inválido.");
        return;
      }

      await updateDoc(doc(db, "transactions", editId), {
        descricao,
        valor
      });

      closeEditModal();
    } catch (e) {
      console.error(e);
      alert("Não foi possível salvar a edição.");
    }
  });
}
/**
 * ==========
 * Boot
 * ==========
 */
showAddForm(false);
if (investFieldsEl) investFieldsEl.hidden = true;

if (yearValue) yearValue.textContent = String(selectedYear);
if (monthValue) monthValue.textContent = "Todos";

// Ano/Mês dropdown
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
      valorUSD: data.valorUSD == null ? null : Number(data.valorUSD || 0),
      fxUSDBRL: data.fxUSDBRL == null ? null : Number(data.fxUSDBRL || 0),
      investKind: data.investKind,
      market: data.market,
      cdbPctCdi: Number(data.cdbPctCdi || 0),
      ticker: data.ticker,
      qtdAcoes: Number(data.qtdAcoes || 0),
      precoAcao: Number(data.precoAcao || 0),
      createdAt: toDateMaybe(data.createdAt)
    });
  });

  window.__ALL_ROWS__ = allRows;

  // anos
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

  // IMPORTANTE: inicializa os dropdowns de investimento (uma vez)
  setupInvestDropdownsOnce();

  renderAll(allRows);
  await ensureQuotesThenRerender(allRows);
});
// Exposto para o pull-to-refresh no mobile
window.refreshApp = async function refreshApp() {
  // limpa cache de quotes (força recarregar USD-BRL e tickers)
  try {
    if (typeof quoteCache?.clear === "function") quoteCache.clear();
  } catch {}

  // re-render com quotes forçadas (sem precisar recarregar a página)
  if (window.__ALL_ROWS__) {
    await ensureQuotesThenRerender(window.__ALL_ROWS__);
  } else {
    // fallback: recarrega se ainda não tem snapshot
    location.reload();
  }
};

// ===== Modal Edit (robusto): registra handlers após DOM pronto =====
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("modal");
  const closeModal = document.getElementById("closeModal");
  const saveEdit = document.getElementById("saveEdit");

  const editDescricao = document.getElementById("editDescricao");
  const editValor = document.getElementById("editValor");

  // Log para confirmar que achou os elementos
  console.log("[edit] elements", {
    modal: !!modal,
    closeModal: !!closeModal,
    saveEdit: !!saveEdit,
    editDescricao: !!editDescricao,
    editValor: !!editValor
  });

  function closeEditModal() {
    if (modal) modal.style.display = "none";
    editId = null;
  }

  if (closeModal) {
    closeModal.addEventListener("click", () => closeEditModal());
  }

  if (saveEdit) {
    saveEdit.addEventListener("click", async () => {
      console.log("[edit] click save", { editId });

      try {
        if (!editId) {
          alert("Nenhum lançamento selecionado para edição (editId vazio).");
          return;
        }

        const descricao = (editDescricao?.value || "").trim();
        const valor = Number(editValor?.value);

        if (!descricao) {
          alert("Descrição é obrigatória.");
          return;
        }
        if (!Number.isFinite(valor)) {
          alert("Valor inválido.");
          return;
        }

        const refDoc = doc(db, "transactions", editId);
        await updateDoc(refDoc, { descricao, valor });

        console.log("[edit] saved", { editId, descricao, valor });
        closeEditModal();
      } catch (e) {
        console.error("[edit] save failed", e);
        alert(`Falha ao salvar: ${e?.message || e}`);
      }
    });
  }
});
