// Suas credenciais Firebase
// ⚠️ SUBSTITUA COM SUAS CREDENCIAIS DO FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyChd7Fs6qstzc3uMdOrcoC-4KMWH24MqZw",
  authDomain: "financial-dashboard-a2b16.firebaseapp.com",
  projectId: "financial-dashboard-a2b16",
  storageBucket: "financial-dashboard-a2b16.firebasestorage.app",
  messagingSenderId: "538205467615",
  appId: "1:538205467615:web:24326fa7f323902059ca6a",
};

// Inicializar Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Variáveis globais
let usuarioAtual = null;
let configuracoes = {
    usdRate: 5.00,
    monthlyRate: 1.00,
    targetGoal: 112000
};
let transacoes = [];
