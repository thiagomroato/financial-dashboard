import { auth, db } from './config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// Monitorar autenticação
onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.usuarioAtual = user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    document.getElementById('usuarioNome').textContent = `Bem-vindo, ${user.email}!`;
    
    await carregarDadosDoFirebase();
    inicializarDatas();
    atualizar();
  } else {
    window.usuarioAtual = null;
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('appScreen').style.display = 'none';
    limparFormularios();
  }
});

// Fazer Registro
window.fazerRegistro = async function() {
  const nome = document.getElementById('registerNome').value;
  const email = document.getElementById('registerEmail').value;
  const senha = document.getElementById('registerPassword').value;

  if (!nome || !email || !senha) {
    mostrarErro('Preencha todos os campos!');
    return;
  }

  if (senha.length < 6) {
    mostrarErro('Senha deve ter pelo menos 6 caracteres!');
    return;
  }

  try {
    const resultado = await createUserWithEmailAndPassword(auth, email, senha);
    
    // Salvar perfil no Firestore
    await setDoc(doc(db, 'usuarios', resultado.user.uid), {
      nome: nome,
      email: email,
      dataCriacao: new Date(),
      ultimoLogin: new Date()
    });

    // Criar configurações compartilhadas
    await setDoc(doc(db, 'configuracoes', 'geral'), {
      usdRate: 5.00,
      monthlyRate: 1.00,
      targetGoal: 112000,
      ultimaAtualizacao: new Date()
    }, { merge: true });

    limparFormularios();
    mostrarLogin();
    mostrarErro('Conta criada com sucesso! Faça login agora.', 'success');
  } catch (error) {
    mostrarErro('Erro ao criar conta: ' + error.message);
  }
};

// Fazer Login
window.fazerLogin = async function() {
  const email = document.getElementById('loginEmail').value;
  const senha = document.getElementById('loginPassword').value;

  if (!email || !senha) {
    mostrarErro('Preencha email e senha!');
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    limparFormularios();
  } catch (error) {
    mostrarErro('Erro ao fazer login: ' + error.message);
  }
};

// Fazer Logout
window.fazerLogout = async function() {
  try {
    await signOut(auth);
    mostrarErro('Logout realizado com sucesso!', 'success');
  } catch (error) {
    mostrarErro('Erro ao fazer logout: ' + error.message);
  }
};

// Mostrar/Ocultar Formulários
window.mostrarRegistro = function() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
};

window.mostrarLogin = function() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
};

// Mostrar Erro/Sucesso
window.mostrarErro = function(mensagem, tipo = 'danger') {
  const errorDiv = document.getElementById('authError');
  errorDiv.className = `alert alert-${tipo}`;
  errorDiv.textContent = mensagem;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
};

// Limpar Formulários
function limparFormularios() {
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('registerNome').value = '';
  document.getElementById('registerEmail').value = '';
  document.getElementById('registerPassword').value = '';
  document.getElementById('authError').style.display = 'none';
}

// Carregar dados do Firebase
export async function carregarDadosDoFirebase() {
  try {
    const { getDoc, doc, collection, onSnapshot, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
    
    // Carregar configurações
    const configDoc = await getDoc(doc(db, 'configuracoes', 'geral'));
    if (configDoc.exists()) {
      const data = configDoc.data();
      window.configuracoes.usdRate = data.usdRate || 5.00;
      window.configuracoes.monthlyRate = data.monthlyRate || 1.00;
      window.configuracoes.targetGoal = data.targetGoal || 112000;
    }

    // Atualizar inputs
    document.getElementById('usdRate').value = window.configuracoes.usdRate;
    document.getElementById('monthlyRate').value = window.configuracoes.monthlyRate;
    document.getElementById('targetGoal').value = window.configuracoes.targetGoal;

    // Carregar transações em tempo real
    const q = query(collection(db, 'transacoes'), orderBy('data', 'desc'));
    onSnapshot(q, (snapshot) => {
      window.transacoes = [];
      snapshot.forEach((doc) => {
        window.transacoes.push({
          id: doc.id,
          ...doc.data()
        });
      });
      atualizar();
    });
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }
}

window.carregarDadosDoFirebase = carregarDadosDoFirebase;
