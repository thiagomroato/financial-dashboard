import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ref = collection(db, "transactions");

const receitasEl = document.getElementById("receitas");
const despesasEl = document.getElementById("despesas");
const investimentosEl = document.getElementById("investimentos");
const saldoEl = document.getElementById("saldo");
const lista = document.getElementById("lista");

const descricaoInput = document.getElementById("descricao");
const valorInput = document.getElementById("valor");

const btnReceita = document.getElementById("btnReceita");
const btnDespesa = document.getElementById("btnDespesa");
const btnInvest = document.getElementById("btnInvest");

let editId = null;

async function add(tipo) {
  const descricao = descricaoInput.value;
  const valor = Number(valorInput.value);

  if (!descricao || !valor) return;

  await addDoc(ref, {
    descricao,
    valor,
    tipo,
    createdAt: serverTimestamp()
  });

  descricaoInput.value = "";
  valorInput.value = "";
}

btnReceita.onclick = () => add("receita");
btnDespesa.onclick = () => add("despesa");
btnInvest.onclick = () => add("investimento");

onSnapshot(ref, (snapshot) => {

  let receitas = 0;
  let despesas = 0;
  let investimentos = 0;

  lista.innerHTML = "";

  snapshot.forEach(docItem => {
    const data = docItem.data();

    if (data.tipo === "receita") receitas += data.valor;
    if (data.tipo === "despesa") despesas += data.valor;
    if (data.tipo === "investimento") investimentos += data.valor;

    const li = document.createElement("li");

    li.innerHTML = `
      <span>${data.descricao} - R$ ${data.valor.toFixed(2)} (${data.tipo})</span>
      <div class="actions">
        <button class="edit">Editar</button>
        <button class="delete">Excluir</button>
      </div>
    `;

    li.querySelector(".delete").onclick = async () => {
      await deleteDoc(doc(db, "transactions", docItem.id));
    };

    li.querySelector(".edit").onclick = () => {
      document.getElementById("modal").style.display = "flex";
      document.getElementById("editDescricao").value = data.descricao;
      document.getElementById("editValor").value = data.valor;
      editId = docItem.id;
    };

    lista.appendChild(li);
  });

  receitasEl.innerText = "R$ " + receitas.toFixed(2);
  despesasEl.innerText = "R$ " + despesas.toFixed(2);
  investimentosEl.innerText = "R$ " + investimentos.toFixed(2);

  saldoEl.innerText = "R$ " + (receitas - despesas).toFixed(2);
});

document.getElementById("saveEdit").onclick = async () => {
  const novaDescricao = document.getElementById("editDescricao").value;
  const novoValor = Number(document.getElementById("editValor").value);

  await updateDoc(doc(db, "transactions", editId), {
    descricao: novaDescricao,
    valor: novoValor
  });

  document.getElementById("modal").style.display = "none";
};
