import { db } from "./firebase.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const transactionsRef = collection(db, "transactions");

let entradas = 0;
let despesas = 0;

onSnapshot(transactionsRef, (snapshot) => {

  entradas = 0;
  despesas = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.tipo === "entrada") {
      entradas += data.valor;
    } else {
      despesas += data.valor;
    }
  });

  document.getElementById("entradas").innerText = "R$ " + entradas.toFixed(2);
  document.getElementById("despesas").innerText = "R$ " + despesas.toFixed(2);
  document.getElementById("saldo").innerText = "R$ " + (entradas - despesas).toFixed(2);

  renderCharts();

});

function renderCharts() {

  new Chart(document.getElementById("barChart"), {
    type: 'bar',
    data: {
      labels: ['Salário', 'Extras', 'Investimentos'],
      datasets: [{
        data: [15000, 3000, 3000]
      }]
    }
  });

  new Chart(document.getElementById("pieChart"), {
    type: 'doughnut',
    data: {
      labels: ['Moradia', 'Cartão', 'Lazer'],
      datasets: [{
        data: [3000, 1800, 900]
      }]
    }
  });

  new Chart(document.getElementById("lineChart"), {
    type: 'line',
    data: {
      labels: ['Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      datasets: [{
        label: 'Saldo',
        data: [1000, 2000, 1500, 3000, 2500, 4200]
      }]
    }
  });

}
