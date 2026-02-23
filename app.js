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

function clampDate(d) {
  return d instanceof Date && !isNaN(d) ? d : new Date();
}

const monthNames = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function monthIndexFromLabel(label) {
  const idx = monthNames.findIndex(m => m.toLowerCase() === String(label).toLowerCase());
  return idx >= 0 ? idx : null;
}

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

/**
 * ==========
 * Firestore
 * ==========
 */
const ref = collection(db, "transactions");
let editId = null;

/**
 * ==========
 * UI state (somente para o modo do gráfico, não filtra dados)
 * ==========
 */
let selectedYear = null;  // number | null
let selectedMonth = null; // 0-11 | null

/**
 * ==========
 * Charts
 * ==========
 */
let barChartInstance = null;
let pieChartInstance = null;

function destroyCharts() {
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
  if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance = null; }
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
    backgroundColor: baseColor.replace("1)", "0.25)"),
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 4,
    pointBackgroundColor: baseColor,
    tension: 0.35
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

function renderCharts({ rows, byMonthReceita, byMonthDespesa, pieData }) {
  chartDefaults();

  const blue = "rgba(109,124,255,1)";
  const pink = "rgba(217,70,239,1)";
  const purple = "rgba(168,85,247,1)";
  const amber = "rgba(245,158,11,1)";

  const barCtx = document.getElementById("barChart");
  const pieCtx = document.getElementById("pieChart");

  // Modo do gráfico:
  // - se selectedMonth != null => agrega por dia (usando o ano selecionado, ou ano atual)
  // - caso contrário => agrega geral por mês (todas as transações, qualquer ano)
  let labels = [];
  let receitaSeries = [];
  let despesaSeries = [];

  if (selectedMonth != null) {
    const y = selectedYear ?? new Date().getFullYear();
    const daysInMonth = new Date(y, selectedMonth + 1, 0).getDate();

    labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const byDay = Array.from({ length: daysInMonth }, () => ({ receita: 0, despesa: 0 }));

    // IMPORTANTE: não filtra; só agrega os que caem nesse mês/ano para o gráfico de dias
    rows.forEach(r => {
      if (!r.createdAt) return;
      const d = clampDate(r.createdAt);
      if (d.getFullYear() !== y) return;
      if (d.getMonth() !== selectedMonth) return;

      const day = d.getDate() - 1;
      if (r.tipo === "receita") byDay[day].receita += r.valor;
      if (r.tipo === "despesa") byDay[day].despesa += r.valor;
    });

    receitaSeries = byDay.map(x => x.receita);
    despesaSeries = byDay.map(x => x.despesa);
  } else {
    labels = monthNames.map(m => m.slice(0, 3).toLowerCase());
    receitaSeries = byMonthReceita;
    despesaSeries = byMonthDespesa;
  }

  if (barCtx) {
    barChartInstance = new Chart(barCtx, {
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
          legend: {
            labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 }
          },
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
          x: {
            grid: { color: "rgba(255,255,255,.04)" },
            ticks: { color: "rgba(229,231,235,.55)" }
          },
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
    pieChartInstance = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["Receita", "Despesa", "Investimento"],
        datasets: [{
          data: pieData,
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
          legend: {
            position: "right",
            labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10 }
          },
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

/**
 * ==========
 * Pills: agora não filtram Firestore, só mudam o "modo" do gráfico
 * ==========
 */
function setupPills() {
  const yearPills = Array.from(document.querySelectorAll('[aria-label="Anos"] .pill'));
  const monthPills = Array.from(document.querySelectorAll('[aria-label="Meses"] .pill'));

  const now = new Date();
  selectedYear = Number(yearPills.find(p => p.classList.contains("is-active"))?.textContent) || now.getFullYear();
  selectedMonth = monthIndexFromLabel(monthPills.find(p => p.classList.contains("is-active"))?.textContent);

  function setActive(pills, activeEl) {
    pills.forEach(p => p.classList.toggle("is-active", p === activeEl));
  }

  yearPills.forEach(p => {
    p.addEventListener("click", () => {
      selectedYear = Number(p.textContent) || now.getFullYear();
      setActive(yearPills, p);
      // só re-renderiza charts (dados já estão em memória via snapshot)
      if (window.__ALL_ROWS__) renderAll(window.__ALL_ROWS__);
    });
  });

  monthPills.forEach(p => {
    p.addEventListener("click", () => {
      selectedMonth = monthIndexFromLabel(p.textContent);
      setActive(monthPills, p);
      if (window.__ALL_ROWS__) renderAll(window.__ALL_ROWS__);
    });
  });

  monthPills.forEach(p => {
    p.addEventListener("dblclick", () => {
      selectedMonth = null;
      monthPills.forEach(x => x.classList.remove("is-active"));
      if (window.__ALL_ROWS__) renderAll(window.__ALL_ROWS__);
    });
  });
}

/**
 * ==========
 * Render KPIs / table / chart aggregations (GERAL)
 * ==========
 */
function renderAll(rows) {
  let receitas = 0, despesas = 0, investimentos = 0;

  // Geral por mês (todas as transações, todos os anos)
  const byMonthReceita = Array.from({ length: 12 }, () => 0);
  const byMonthDespesa = Array.from({ length: 12 }, () => 0);

  tabela.innerHTML = "";

  rows.forEach(r => {
    if (r.tipo === "receita") receitas += r.valor;
    if (r.tipo === "despesa") despesas += r.valor;
    if (r.tipo === "investimento") investimentos += r.valor;

    // para o gráfico geral por mês, usa o mês do createdAt
    if (r.createdAt) {
      const m = clampDate(r.createdAt).getMonth();
      if (r.tipo === "receita") byMonthReceita[m] += r.valor;
      if (r.tipo === "despesa") byMonthDespesa[m] += r.valor;
    }

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

  const pieData = [receitas, despesas, investimentos];

  destroyCharts();
  renderCharts({ rows, byMonthReceita, byMonthDespesa, pieData });
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

  await addDoc(ref, {
    descricao,
    valor,
    tipo,
    createdAt: serverTimestamp()
  });

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
 * Extra UI pills for type styling (optional)
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
 * Boot (GERAL)
 * ==========
 */
setupPills();

onSnapshot(query(ref, orderBy("createdAt", "desc")), snapshot => {
  const rows = [];
  snapshot.forEach(docItem => {
    const data = docItem.data();
    rows.push({
      id: docItem.id,
      descricao: data.descricao,
      tipo: data.tipo,
      valor: Number(data.valor || 0),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null
    });
  });

  // cache em memória para re-render ao clicar nas pills
  window.__ALL_ROWS__ = rows;

  renderAll(rows);
});
