const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const USD_BRL = 5.5;
const MILLION_GOAL = 1_000_000;
const PASSIVE_INCOME_GOAL = 10_000;

const portfolio = {
  fixedIncome: [
    { name: "CDB RecargaPay 120% CDI", category: "Renda fixa", value: 11534.92, return: "120% CDI" },
    { name: "CDB PagBank 16,5% a.a.", category: "Renda fixa", value: 1249.84, return: "16,5% a.a." },
    { name: "CDB PagBank 16,05% a.a.", category: "Renda fixa", value: 1742.91, return: "16,05% a.a." },
    { name: "Reserva Mercado Pago 105% CDI", category: "Reserva", value: 3000, return: "105% CDI" }
  ],
  international: { asset: "Procter & Gamble (PG)", valueUsd: 474.14, monthlyContribution: 200 },
  monthlyContributionBrazil: 1100,
  passiveIncome: 0,
  property: {
    purchaseValue: 210000,
    currentValue: 200000,
    debt: 158312.73,
    system: "SAC",
    interest: "10,654% a.a.",
    remainingInstallments: 411
  },
  targetAllocation: [
    { label: "Reserva de segurança", percent: 10 },
    { label: "FIIs", percent: 35 },
    { label: "Ações Brasil", percent: 25 },
    { label: "Exterior", percent: 20 },
    { label: "Renda fixa", percent: 10 }
  ]
};

const fixedIncomeTotal = portfolio.fixedIncome.reduce((sum, item) => sum + item.value, 0);
const internationalBrl = portfolio.international.valueUsd * USD_BRL;
const investmentsTotal = fixedIncomeTotal + internationalBrl;
const totalAssets = investmentsTotal + portfolio.property.currentValue;
const netWorth = totalAssets - portfolio.property.debt;
const propertyEquity = portfolio.property.currentValue - portfolio.property.debt;

function money(value) {
  return BRL.format(value);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderKpis() {
  setText("totalAssets", money(totalAssets));
  setText("netWorth", money(netWorth));
  setText("investmentsTotal", money(investmentsTotal));
  setText("passiveIncome", money(portfolio.passiveIncome));
  setText("millionProgress", `${Math.min((netWorth / MILLION_GOAL) * 100, 100).toFixed(1)}%`);
  setText("millionRemaining", money(Math.max(MILLION_GOAL - netWorth, 0)));
}

function renderTables() {
  document.getElementById("brazilInvestments").innerHTML = portfolio.fixedIncome.map(item => `
    <tr><td>${item.name}</td><td>${item.category}</td><td>${money(item.value)}</td><td>${item.return}</td></tr>
  `).join("");

  document.getElementById("targetAllocation").innerHTML = portfolio.targetAllocation.map(item => `
    <div class="allocation-item"><div><strong>${item.label}</strong><span>${item.percent}% da carteira</span></div><div class="bar"><span style="width:${item.percent}%"></span></div></div>
  `).join("");

  document.getElementById("fiiGoals").innerHTML = [
    ["Inicial", 1000], ["Intermediária", 3000], ["Final", PASSIVE_INCOME_GOAL]
  ].map(([phase, value]) => `
    <div><span>${phase}</span><strong>${money(value)}/mês</strong><small>${((portfolio.passiveIncome / value) * 100).toFixed(1)}% concluído</small></div>
  `).join("");

  document.getElementById("propertyRows").innerHTML = [
    ["Valor de compra", money(portfolio.property.purchaseValue)],
    ["Valor atual estimado", money(portfolio.property.currentValue)],
    ["Saldo financiamento", money(portfolio.property.debt)],
    ["Sistema", portfolio.property.system],
    ["Juros", portfolio.property.interest],
    ["Parcelas restantes", portfolio.property.remainingInstallments]
  ].map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("");

  setText("propertyEquity", `Patrimônio líquido do imóvel: ${money(propertyEquity)}.`);
  const debtRatio = (portfolio.property.debt / portfolio.property.currentValue) * 100;
  document.getElementById("debtMeter").style.width = `${debtRatio}%`;
  setText("debtLabel", `${debtRatio.toFixed(1)}% do imóvel ainda financiado.`);
}

function renderAnalyst() {
  const fixedIncomeShare = (fixedIncomeTotal / investmentsTotal) * 100;
  const exteriorShare = (internationalBrl / investmentsTotal) * 100;
  const insights = [
    `Carteira concentrada em renda fixa (${fixedIncomeShare.toFixed(1)}%). Próximos aportes recomendados: aumentar exposição em FIIs e ações.`,
    `Exterior representa ${exteriorShare.toFixed(1)}% dos investimentos atuais; a meta é 20%, então o aporte em PG ajuda no rebalanceamento.`,
    `Para atingir ${money(PASSIVE_INCOME_GOAL)}/mês de renda passiva, priorize ativos geradores de caixa e reinvista dividendos.`,
    `O imóvel adiciona ${money(propertyEquity)} ao patrimônio líquido, mas o financiamento ainda exige monitoramento de juros, amortização e prazo.`
  ];

  document.getElementById("analystInsights").innerHTML = insights.map(text => `<article><strong>Alerta</strong><p>${text}</p></article>`).join("");
}

function createCharts() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = "rgba(243,244,246,.72)";
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";

  const purple = "#6D28D9";
  const green = "#22C55E";
  const gray = "#1F2937";
  const amber = "#F59E0B";

  new Chart(document.getElementById("wealthChart"), {
    type: "line",
    data: { labels: ["Atual", "12m", "24m", "36m", "48m", "60m"], datasets: [{ label: "Patrimônio líquido", data: [netWorth, netWorth + 15600, netWorth + 33000, netWorth + 52500, netWorth + 74200, netWorth + 98400], borderColor: purple, backgroundColor: "rgba(109,40,217,.18)", fill: true, tension: .4 }] },
    options: chartOptions()
  });

  new Chart(document.getElementById("allocationChart"), {
    type: "doughnut",
    data: { labels: ["Renda fixa", "Exterior"], datasets: [{ data: [fixedIncomeTotal, internationalBrl], backgroundColor: [purple, green], borderColor: "#0B0B0F" }] },
    options: { ...chartOptions(), cutout: "68%" }
  });

  new Chart(document.getElementById("dividendChart"), {
    type: "bar",
    data: { labels: ["Inicial", "Interm.", "Final"], datasets: [{ label: "Meta mensal", data: [1000, 3000, 10000], backgroundColor: [gray, purple, green], borderRadius: 12 }] },
    options: chartOptions()
  });

  new Chart(document.getElementById("goalChart"), {
    type: "bar",
    data: { labels: ["Atual", "Meta"], datasets: [{ label: "Patrimônio", data: [netWorth, MILLION_GOAL], backgroundColor: [amber, purple], borderRadius: 12 }] },
    options: chartOptions()
  });
}

function chartOptions() {
  return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: "rgba(255,255,255,.06)" } }, y: { grid: { color: "rgba(255,255,255,.06)" } } } };
}

renderKpis();
renderTables();
renderAnalyst();
createCharts();
