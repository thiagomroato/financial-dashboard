console.log('⚙️ config.js carregando...');

// Aguardar Firebase SDK ser carregado
function esperarFirebase() {
  return new Promise((resolve) => {
    if (typeof firebase !== 'undefined') {
      console.log('✅ Firebase SDK já carregado');
      resolve();
    } else {
      console.log('⏳ Aguardando Firebase SDK...');
      let tentativas = 0;
      const intervalo = setInterval(() => {
        tentativas++;
        if (typeof firebase !== 'undefined') {
          console.log('✅ Firebase SDK carregado após ' + tentativas + ' tentativas');
          clearInterval(intervalo);
          resolve();
        }
        if (tentativas > 100) {
          console.error('❌ Firebase SDK não carregou!');
          clearInterval(intervalo);
          resolve();
        }
      }, 50);
    }
  });
}

// Aguardar e depois inicializar
esperarFirebase().then(() => {
  console.log('✅ Iniciando Firebase...');

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

  try {
    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase app inicializado');

    // Obter referências GLOBAIS
    window.auth = firebase.auth();
    window.db = firebase.firestore();

    console.log('✅ Auth:', window.auth);
    console.log('✅ Firestore:', window.db);

    // Disparar evento customizado para avisar que Firebase está pronto
    window.dispatchEvent(new CustomEvent('firebaseReady'));
    console.log('✅ Evento firebaseReady disparado');

  } catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error);
  }
});

// Variáveis globais
window.usuarioAtual = null;
window.configuracoes = {
  usdRate: 5.00,
  monthlyRate: 1.00,
  targetGoal: 112000
};
window.transacoes = [];

console.log('✅ config.js terminado de carregar');
