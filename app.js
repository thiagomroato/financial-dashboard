import { db } from './config.js';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// Adicionar Receita
window.adicionarReceita = async function() {
  const data = document.getElementById('receitaData').value;
  const categoria = document.getElementById('receitaCategoria').value;
  const descricao = document.getElementById('receitaDescricao').value;
  const valor = parseFloat(document.getElementById('receitaValor').value);

  if (!data || !descricao || !valor) {
    alert('Preencha todos os campos!');
    return;
  }

  try {
    await addDoc(collection(db, 'transacoes'), {
      data: data,
      tipo: 'receita',
      categoria: categoria,
      descricao: descricao,
      valor: valor,
      moeda: 'BRL',
      usuarioId: window.usuarioAtual.uid,
      usuarioEmail: window.usuarioAtual.email,
      dataCriacao: new Date(),
      dataAtualizacao: new Date()
    });

    const modal = bootstrap.Modal.getInstance(document.getElementById('receitaModal'));
    modal.hide();

    document.getElementById('receitaData').value = '';
    document.getElementById('receitaDescricao').value = '';
    document.getElementById('receitaValor').value = '';
  } catch (error) {
    alert('Erro ao adicionar receita: ' + error.message);
  }
};

// Adicionar Despesa
window.adicionarDespesa = async function() {
  const data = document.getElementById('despesaData').value;
  const categoria = document.getElementById('despesaCategoria').value;
  const descricao = document.getElementById('despesaDescricao').value;
  const valor = parseFloat(document.getElementById('despesaValor').value);

  if (!data || !descricao || !valor) {
    alert('Preencha todos os campos!');
    return;
  }

  try {
    await addDoc(collection(db, 'transacoes'), {
      data: data,
      tipo: 'despesa',
      categoria: categoria,
      descricao: descricao,
      valor: valor,
      moeda: 'BRL',
      usuarioId: window.usuarioAtual.uid,
      usuarioEmail: window.usuarioAtual.email,
      dataCriacao: new Date(),
      dataAtualizacao: new Date()
    });

    const modal = bootstrap.Modal.getInstance(document.getElementById('despesaModal'));
    modal.hide();

    document.getElementById('despesaData').value = '';
    document.getElementById('despesaDescricao').value = '';
    document.getElementById('despesaValor').value = '';
  } catch (error) {
    alert('Erro ao adicionar despesa: ' + error.message);
  }
};

// Adicionar Investimento
window.adicionarInvestimento = async function() {
  const data = document.getElementById('investimentoData').value;
  const tipo = document.getElementById('investimentoTipo').value;
  const moeda = document.getElementById('investimentoMoeda').value;
  const valor = parseFloat(document.getElementById('investimentoValor').value);

  if (!data || !valor) {
    alert('Preencha todos os campos!');
    return;
  }

  try {
    await addDoc(collection(db, 'transacoes'), {
      data: data,
      tipo: 'investimento',
      categoria: tipo,
      descricao: tipo,
      valor: valor,
      moeda: moeda,
      usuarioId: window.usuarioAtual.uid,
      usuarioEmail: window.usuarioAtual.email,
      dataCriacao: new Date(),
      dataAtualizacao: new Date()
    });

    const modal = bootstrap.Modal.getInstance(document.getElementById('investimentoModal'));
    modal.hide();

    document.getElementById('investimentoData').value = '';
    document.getElementById('investimentoValor').value = '';
  } catch (error) {
    alert('Erro ao adicionar investimento: ' + error.message);
  }
};

// Deletar transação
window.deletarTransacao = async function(id) {
  if (confirm('Tem certeza que deseja deletar esta transação?')) {
    try {
      await deleteDoc(doc(db, 'transacoes', id));
    } catch (error) {
      alert('Erro ao deletar: ' + error.message);
    }
  }
};

// Calcular Patrimônio
function calcularPatrimonio() {
  let patrimonio = 0;

  window.transacoes.forEach(t => {
    let valor = t.valor;

    if (t.moeda === 'USD') {
      valor = valor * window.configuracoes.usdRate;
    }

    if (t.tipo === 'receita' || t.tipo === 'investimento') {
      patrimonio += valor;
    } else if (t.tipo === 'despesa') {
      patrimonio -= valor;
    }
  });

  return patrimonio;
}

// Obter mês atual
function getMesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

// Calcular receitas do mês
function calcularReceitasMes() {
  const mesAtual = getMesAtual();
  return window.transacoes
    .filter(t => t.tipo === 'receita' && t.data.startsWith(mesAtual))
    .reduce((sum, t) => sum + t.valor, 0);
}

// Calcular despesas do mês
function calcularDespesasMes() {
  const mesAtual = getMesAtual();
  return window.transacoes
    .filter(t => t.tipo === 'despesa' && t.data.startsWith(mesAtual))
    .reduce((sum, t) => sum + t.valor, 0);
}

// Atualizar KPIs
function atualizarKPIs() {
  const patrimonio = calcularPatrimonio();
  const receitas = calcularReceitasMes();
  const despesas = calcularDespesasMes();

  document.getElementById('totalPatrimonio').textContent = formatarMoeda(patrimonio);
  document.getElementById('totalReceitas').textContent = formatarMoeda(receitas);
  document.getElementById('totalDespesas').textContent = formatarMoeda(despesas);
  document.getElementById('metaGoal').textContent = formatarMoeda(window.configuracoes.targetGoal);
}

// Formatar moeda
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor);
}

// Atualizar tabela
function atualizarTabela() {
  const tbody = document.getElementById('transactionsTable');
  tbody.innerHTML = '';

  window.transacoes.forEach(t => {
    let valor = t.valor;
    let moedaDisplay = 'R$';

    if (t.moeda === 'USD') {
      moedaDisplay = 'US$';
    }

    let tipoClass = t.tipo === 'receita' ? 'badge-receita' : t.tipo === 'despesa' ? 'badge-despesa' : 'badge-investimento';
    let tipoDisplay = t.tipo.charAt(0).toUpperCase() + t.tipo.slice(1);

    const row = `
      <tr>
        <td>${formatarData(t.data)}</td>
        <td><span class="badge ${tipoClass}">${tipoDisplay}</span></td>
        <td>${t.categoria}</td>
        <td>${t.descricao}</td>
        <td>${moedaDisplay} ${valor.toFixed(2)}</td>
        <td><small>${t.usuarioEmail}</small></td>
        <td><button class="btn-delete" onclick="deletarTransacao('${t.id}')">Deletar</button></td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// Formatar data
function formatarData(data) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
}

// Inicializar datas
window.inicializarDatas = function() {
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('receitaData').value = hoje;
  document.getElementById('despesaData').value = hoje;
  document.getElementById('investimentoData').value = hoje;
};

// Gráficos
let patrimonioChart, projecaoChart, categoriaChart, receitaDespesaChart;

function atualizarGraficoPatrimonio() {
  const ctx = document.getElementById('patrimonioChart');
  if (!ctx) return;
  
  const dados = {};

  window.transacoes.forEach(t => {
    if (!dados[t.data]) {
      dados[t.data] = 0;
    }

    let valor = t.valor;
    if (t.moeda === 'USD') {
      valor = valor * window.configuracoes.usdRate;
    }

    if (t.tipo === 'receita' || t.tipo === 'investimento') {
      dados[t.data] += valor;
    } else if (t.tipo === 'despesa') {
      dados[t.data] -= valor;
    }
  });

  const datas = Object.keys(dados).sort();
  let patrimonio = 0;
  const valores = datas.map(data => {
    patrimonio += dados[data];
    return patrimonio;
  });

  if (patrimonioChart) {
    patrimonioChart.destroy();
  }

  patrimonioChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: datas.map(d => formatarData(d)),
      datasets: [{
        label: 'Patrimônio',
        data: valores,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return 'R$ ' + value.toLocaleString('pt-BR');
            }
          }
        }
      }
    }
  });
}

function atualizarGraficoProjecao() {
  const ctx = document.getElementById('projecaoChart');
  if (!ctx) return;

  const patrimonioAtual = calcularPatrimonio();
  const anosProjecao = [];
  const valoresProjecao = [];

  for (let ano = 2026; ano <= 2030; ano++) {
    const mesesPassados = (ano - 2026) * 12;
    const monthlyRate = window.configuracoes.monthlyRate / 100;
    const aporte = 1300;
    
    let valor = patrimonioAtual;
    for (let mes = 0; mes < mesesPassados; mes++) {
      valor = valor * (1 + monthlyRate) + aporte;
    }

    anosProjecao.push(ano.toString());
    valoresProjecao.push(Math.round(valor));
  }

  if (projecaoChart) {
    projecaoChart.destroy();
  }

  projecaoChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: anosProjecao,
      datasets: [{
        label: 'Patrimônio Projetado',
        data: valoresProjecao,
        backgroundColor: [
          'rgba(102, 126, 234, 0.8)',
          'rgba(118, 75, 162, 0.8)',
          'rgba(245, 87, 108, 0.8)',
          'rgba(240, 147, 251, 0.8)',
          'rgba(67, 233, 123, 0.8)'
        ],
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return 'R$ ' + value.toLocaleString('pt-BR');
            }
          }
        }
      }
    }
  });
}

function atualizarGraficoCategoria() {
  const ctx = document.getElementById('categoriaChart');
  if (!ctx) return;

  const categorias = {};

  window.transacoes.forEach(t => {
    if (!categorias[t.categoria]) {
      categorias[t.categoria] = 0;
    }

    let valor = t.valor;
    if (t.moeda === 'USD') {
      valor = valor * window.configuracoes.usdRate;
    }

    if (t.tipo === 'receita' || t.tipo === 'investimento') {
      categorias[t.categoria] += valor;
    }
  });

  const cores = [
    '#667eea', '#764ba2', '#f5576c', '#f093fb', '#43e97b', 
    '#38f9d7', '#4facfe', '#00f2fe', '#f5af19', '#ff6b6b'
  ];

  if (categoriaChart) {
    categoriaChart.destroy();
  }

  categoriaChart = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(categorias),
      datasets: [{
        data: Object.values(categorias),
        backgroundColor: cores.slice(0, Object.keys(categorias).length)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function atualizarGraficoReceitaDespesa() {
  const ctx = document.getElementById('receitaDespesaChart');
  if (!ctx) return;

  const meses = {};

  window.transacoes.forEach(t => {
    const mesChave = t.data.substring(0, 7);
    if (!meses[mesChave]) {
      meses[mesChave] = { receita: 0, despesa: 0 };
    }

    let valor = t.valor;
    if (t.moeda === 'USD') {
      valor = valor * window.configuracoes.usdRate;
    }

    if (t.tipo === 'receita' || t.tipo === 'investimento') {
      meses[mesChave].receita += valor;
    } else if (t.tipo === 'despesa') {
      meses[mesChave].despesa += valor;
    }
  });

  const mesesOrdenados = Object.keys(meses).sort();
  const receitas = mesesOrdenados.map(m => meses[m].receita);
  const despesas = mesesOrdenados.map(m => meses[m].despesa);

  if (receitaDespesaChart) {
    receitaDespesaChart.destroy();
  }

  receitaDespesaChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: mesesOrdenados.map(m => m.replace('-', '/')),
      datasets: [
        {
          label: 'Receitas',
          data: receitas,
          backgroundColor: 'rgba(67, 233, 123, 0.8)',
          borderRadius: 8
        },
        {
          label: 'Despesas',
          data: despesas,
          backgroundColor: 'rgba(245, 87, 108, 0.8)',
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return 'R$ ' + value.toLocaleString('pt-BR');
            }
          }
        }
      }
    }
  });
}

// Salvar configurações
window.salvarConfigurações = async function() {
  const usdRate = parseFloat(document.getElementById('usdRate').value);
  const monthlyRate = parseFloat(document.getElementById('monthlyRate').value);
  const targetGoal = parseFloat(document.getElementById('targetGoal').value);

  if (!usdRate || !monthlyRate || !targetGoal) {
    alert('Preencha todos os campos!');
    return;
  }

  try {
    await setDoc(doc(db, 'configuracoes', 'geral'), {
      usdRate: usdRate,
      monthlyRate: monthlyRate,
      targetGoal: targetGoal,
      ultimaAtualizacao: new Date()
    });

    window.configuracoes.usdRate = usdRate;
    window.configuracoes.monthlyRate = monthlyRate;
    window.configuracoes.targetGoal = targetGoal;

    alert('Configurações salvas com sucesso!');
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    modal.hide();
    atualizar();
  } catch (error) {
    alert('Erro ao salvar: ' + error.message);
  }
};

// Atualizar tudo
window.atualizar = function() {
  atualizarKPIs();
  atualizarTabela();
  atualizarGraficoPatrimonio();
  atualizarGraficoProjecao();
  atualizarGraficoCategoria();
  atualizarGraficoReceitaDespesa();
};
