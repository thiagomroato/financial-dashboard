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

// Dropdown custom (Ano/Mês)
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
 * Filter state
 * ==========
 */
let selectedYear = new Date().getFullYear(); // default: ano atual
let selectedMonth = "all"; // "all" | 0..11

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

function renderCharts(filteredRows) {
  chartDefaults();

  const blue = "rgba(109,124,255,1)";
  const pink = "rgba(217,70,239,1)";
  const purple = "rgba(168,85,247,1)";
  const amber = "rgba(245,158,11,1)";

  const lineCtx = document.getElementById("barChart");
  const pieCtx = document.getElementById("pieChart");

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

  let receitas = 0, despesas = 0, investimentos = 0;
  filteredRows.forEach(r => {
    if (r.tipo === "receita") receitas += r.valor;
    if (r.tipo === "despesa") despesas += r.valor;
    if (r.tipo === "investimento") investimentos += r.valor;
  });

  destroyCharts();

  if (lineCtx) {
    lineChart = new Chart(lineCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          makeGlowDataset(blue, receitaSeries, "Receita"),
          makeGlowDataset(pink, despesaSeries, "Despesa")
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
          tooltip: {
            backgroundColor: "rgba(2,6,23,.92)",
            borderColor: "rgba(255,255,255,.10)",
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtBRL.format(ctx.parsed.y || 0)}`
            }
          }
        },
        scales: {
          x: { grid: { color: "rgba(255,255,255,.04)" }, ticks: { color: "rgba(229,231,235,.55)" } },
          y: {
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: {
              color: "rgba(229,231,235,.55)",
              callback: (v) => {
                const n = Number(v);
                if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`;
                return String(n);
              }
            }
          }
        }
      },
      plugins: [glowPlugin]
    });
  }

  if (pieCtx) {
    pieChart = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["Receita", "Despesa", "Investimento"],
        datasets: [{
          data: [receitas, despesas, investimentos],
          backgroundColor: [
            blue.replace("1)", "0.9)"),
            amber.replace("1)", "0.9)"),
            purple.replace("1)", "0.9)")
          ],
          borderColor: "rgba(15,23,42,.9)",
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { position: "right", labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10 } },
          tooltip: {
            backgroundColor: "rgba(2,6,23,.92)",
            borderColor: "rgba(255,255,255,.10)",
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `${ctx.label}: ${fmtBRL.format(ctx.parsed || 0)}`
            }
          }
        }
      }
    });
  }
}

function renderTableAndKpis(filteredRows) {
  let receitas = 0, despesas = 0, investimentos = 0;
  tabela.innerHTML = "";

  filteredRows.forEach(r => {
    if (r.tipo === "receita") receitas += r.valor;
    if (r.tipo === "despesa") despesas += r.valor;
    if (r.tipo === "investimento") investimentos += r.valor;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.descricao ?? ""}</td>
      <td><span class="type-pill type-${r.tipo}">${r.tipo}</span></td>
      <td>${fmtBRL.format(r.valor)}</td>
      <td>
        <button class="action-btn edit" type="button">Editar</button>
        <button class="action-btn delete" type="button">Excluir</button>
      </td>
    `;

    tr.querySelector(".delete").onclick = () =>
      deleteDoc(doc(db, "transactions", r.id));

    tr.querySelector(".edit").onclick = () => {
      modalEl.style.display = "flex";
      editDescricaoEl.value = r.descricao ?? "";
      editValorEl.value = r.valor ?? 0;
      editId = r.id;
    };

    tabela.appendChild(tr);
  });

  saldoEl.innerText = fmtBRL.format(receitas - despesas);
  receitasEl.innerText = fmtBRL.format(receitas);
  despesasEl.innerText = fmtBRL.format(despesas);
  investimentosEl.innerText = fmtBRL.format(investimentos);
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
  menuEl.innerHTML = "";
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "dd-item" + (String(item.value) === String(activeValue) ? " is-active" : "");
    div.setAttribute("role", "option");
    div.dataset.value = String(item.value);
    div.innerHTML = `<span class="mini-dot" aria-hidden="true"></span><span>${item.label}</span>`;
    div.onclick = () => onPick(item.value, item.label);
    menuEl.appendChild(div);
  });
}

function wireDropdown(dd, btnEl, setOpen) {
  btnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!dd.classList.contains("is-open"));
  });

  document.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

/**
 * ==========
 * Add / Edit
 * ==========
 */
async function add(tipo) {
  const descricao = document.getElementById("descricao").value.trim();
  const valor = Number(document.getElementById("valor").value);

  if (!descricao || !Number.isFinite(valor) || valor <= 0) return;

  await addDoc(ref, { descricao, valor, tipo, createdAt: serverTimestamp() });

  document.getElementById("descricao").value = "";
  document.getElementById("valor").value = "";
}

document.getElementById("btnReceita").onclick = () => add("receita");
document.getElementById("btnDespesa").onclick = () => add("despesa");
document.getElementById("btnInvest").onclick = () => add("investimento");

document.getElementById("saveEdit").onclick = async () => {
  if (!editId) return;

  await updateDoc(doc(db, "transactions", editId), {
    descricao: editDescricaoEl.value.trim(),
    valor: Number(editValorEl.value)
  });

  modalEl.style.display = "none";
};

/**
 * ==========
 * Type-pill CSS inject
 * ==========
 */
(function injectTypePillCSS() {
  const css = `
    .type-pill{
      display:inline-block;
      padding:6px 10px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(17,24,39,.35);
      font-size:12px;
      font-weight:800;
      letter-spacing:.2px;
      text-transform: capitalize;
    }
    .type-receita{ border-color: rgba(34,197,94,.25); color: rgba(165,245,197,.95); }
    .type-despesa{ border-color: rgba(239,68,68,.25); color: rgba(255,190,190,.95); }
    .type-investimento{ border-color: rgba(168,85,247,.25); color: rgba(229,199,255,.95); }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/**
 * ==========
 * Boot
 * ==========
 */
yearValue.textContent = String(selectedYear);
monthValue.textContent = "Todos";

wireDropdown(yearDD, yearBtn, (open) => {
  setDDOpen(yearDD, open);
  setDDOpen(monthDD, false);
});

wireDropdown(monthDD, monthBtn, (open) => {
  setDDOpen(monthDD, open);
  setDDOpen(yearDD, false);
});

if (clearFiltersBtn) {
  clearFiltersBtn.onclick = () => {
    selectedYear = new Date().getFullYear();
    selectedMonth = "all";
    yearValue.textContent = String(selectedYear);
    monthValue.textContent = "Todos";
    setDDOpen(yearDD, false);
    setDDOpen(monthDD, false);
    if (window.__ALL_ROWS__) renderAll(window.__ALL_ROWS__);
  };
}

onSnapshot(query(ref, orderBy("createdAt", "desc")), snapshot => {
  const allRows = [];
  snapshot.forEach(docItem => {
    const data = docItem.data();
    allRows.push({
      id: docItem.id,
      descricao: data.descricao,
      tipo: data.tipo,
      valor: Number(data.valor || 0),
      createdAt: toDateMaybe(data.createdAt)
    });
  });

  window.__ALL_ROWS__ = allRows;

  const currentYear = new Date().getFullYear();
  const years = new Set([currentYear]);
  allRows.forEach(r => {
    const d = clampDate(r.createdAt);
    if (d) years.add(d.getFullYear());
  });
  const sortedYears = Array.from(years).sort((a, b) => b - a);

  // garante selectedYear existente; senão usa ano atual
  if (!sortedYears.includes(selectedYear)) selectedYear = currentYear;

  buildMenu(
    yearMenu,
    sortedYears.map(y => ({ value: y, label: String(y) })),
    selectedYear,
    (value, label) => {
      selectedYear = Number(value);
      yearValue.textContent = label;
      setDDOpen(yearDD, false);
      renderAll(window.__ALL_ROWS__);
    }
  );

  buildMenu(
    monthMenu,
    [{ value: "all", label: "Todos" }, ...monthNames.map((m, i) => ({ value: i, label: m }))],
    selectedMonth,
    (value, label) => {
      selectedMonth = value === "all" ? "all" : Number(value);
      monthValue.textContent = label;
      setDDOpen(monthDD, false);
      renderAll(window.__ALL_ROWS__);
    }
  );

  // Atualiza label inicial após rebuild do menu
  yearValue.textContent = String(selectedYear);
  renderAll(allRows);
});
