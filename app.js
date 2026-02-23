import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const lista = document.getElementById("lista");
const totalSpan = document.getElementById("total");
const addBtn = document.getElementById("addBtn");

const transactionsRef = collection(db, "transactions");

addBtn.addEventListener("click", async () => {
  const descricao = document.getElementById("descricao").value;
  const valor = document.getElementById("valor").value;

  if (!descricao || !valor) {
    alert("Preencha todos os campos");
    return;
  }

  try {
    await addDoc(transactionsRef, {
      descricao,
      valor: Number(valor),
      createdAt: serverTimestamp()
    });

    document.getElementById("descricao").value = "";
    document.getElementById("valor").value = "";
  } catch (error) {
    console.error("Erro ao adicionar:", error);
    alert("Erro ao salvar. Veja console.");
  }
});

onSnapshot(transactionsRef, (snapshot) => {
  lista.innerHTML = "";
  let total = 0;

  snapshot.forEach((docItem) => {
    const data = docItem.data();
    total += data.valor;

    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <span>${data.descricao}</span>
      <span>R$ ${data.valor.toFixed(2)}</span>
      <button data-id="${docItem.id}">🗑</button>
    `;

    li.querySelector("button").addEventListener("click", async () => {
      await deleteDoc(doc(db, "transactions", docItem.id));
    });

    lista.appendChild(li);
  });

  totalSpan.textContent = total.toFixed(2);
});
