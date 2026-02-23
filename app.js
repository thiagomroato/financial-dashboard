import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const lista = document.getElementById("lista");
const totalSpan = document.getElementById("total");

const transactionsRef = collection(db, "transactions");

async function loadTransactions() {
  lista.innerHTML = "";
  let total = 0;

  const snapshot = await getDocs(transactionsRef);
  snapshot.forEach((documento) => {
    const data = documento.data();
    total += Number(data.valor);

    const li = document.createElement("li");
    li.innerHTML = `
      ${data.descricao} - R$ ${data.valor}
      <button onclick="removeTransaction('${documento.id}')">X</button>
    `;
    lista.appendChild(li);
  });

  totalSpan.textContent = total.toFixed(2);
}

window.addTransaction = async function () {
  const descricao = document.getElementById("descricao").value;
  const valor = document.getElementById("valor").value;

  if (!descricao || !valor) return;

  await addDoc(transactionsRef, {
    descricao,
    valor: Number(valor),
    createdAt: new Date()
  });

  loadTransactions();
};

window.removeTransaction = async function (id) {
  await deleteDoc(doc(db, "transactions", id));
  loadTransactions();
};

loadTransactions();
