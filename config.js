// Suas credenciais Firebase
// ⚠️ SUBSTITUA COM SUAS CREDENCIAIS DO FIREBASE CONSOLE
const firebaseConfig = {
    apiKey: "SEU_API_KEY",
    authDomain: "SEU_PROJECT_ID.firebaseapp.com",
    projectId: "SEU_PROJECT_ID",
    storageBucket: "SEU_PROJECT_ID.appspot.com",
    messagingSenderId: "SEU_MESSAGING_SENDER_ID",
    appId: "SEU_APP_ID"
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
