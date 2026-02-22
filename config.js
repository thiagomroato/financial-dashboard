// Suas credenciais Firebase
// Nota: chaves de API do Firebase são seguras para uso público no lado do cliente.
// A proteção de dados é garantida pelas Regras de Segurança do Firestore.
// Consulte o README para configurar as regras de segurança corretamente.
const firebaseConfig = {
  apiKey: "AIzaSyChd7Fs6qstzc3uMdOrcoC-4KMWH24MqZw",
  authDomain: "financial-dashboard-a2b16.firebaseapp.com",
  projectId: "financial-dashboard-a2b16",
  storageBucket: "financial-dashboard-a2b16.firebasestorage.app",
  messagingSenderId: "538205467615",
  appId: "1:538205467615:web:24326fa7f323902059ca6a",
  measurementId: "G-6JXMBQH9G1"
};

// Inicializar Firebase
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
