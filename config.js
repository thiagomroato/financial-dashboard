console.log('⚙️ config.js carregando...');

// Verificar se Firebase foi carregado
if (typeof firebase === 'undefined') {
  console.error('❌ Firebase não foi carregado!');
} else {
  console.log('✅ Firebase SDK carregado');
}

// Firebase Config
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
try {
  const app = firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase app inicializado');
} catch (error) {
  console.error('❌ Erro ao inicializar Firebase:', error);
}

// Obter referências GLOBAIS
const auth = firebase.auth();
const db = firebase.firestore();

console.log('✅ Auth e Firestore obtidos');
console.log('✅ config.js carregado com sucesso!');

// Variáveis globais
let usuarioAtual = null;
let configuracoes = {
  usdRate: 5.00,
  monthlyRate: 1.00,
  targetGoal: 112000
};
let transacoes = [];

console.log('✅ Variáveis globais inicializadas');
