console.log('🔐 auth.js carregando...');

// Verificar se auth foi inicializado
if (typeof auth === 'undefined') {
  console.error('❌ Firebase Auth não foi inicializado!');
} else {
  console.log('✅ Firebase Auth disponível');
}

// Monitorar autenticação
auth.onAuthStateChanged(async (user) => {
  console.log('👤 Estado de autenticação mudou:', user ? user.email : 'Deslogado');
  
  if (user) {
    usuarioAtual = user;
    console.log('✅ Usuário logado:', user.email);
    
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    document.getElementById('usuarioNome').textContent = `Bem-vindo, ${user.email}!`;
    
    await carregarDadosDoFirebase();
    inicializarDatas();
    atualizar();
  } else {
    usuarioAtual = null;
    console.log('✅ Usuário deslogado');
    
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('appScreen').style.display = 'none';
    limparFormularios();
  }
});

// Fazer Registro
async function fazerRegistro() {
  const nome = document.getElementById('registerNome').value;
  const email = document.getElementById('registerEmail').value;
  const senha = document.getElementById('registerPassword').value;

  console.log('📝 Tentando registrar:', email);

  if (!nome || !email || !senha) {
    mostrarErro('Preencha todos os campos!');
    return;
  }

  if (senha.length < 6) {
    mostrarErro('Senha deve ter pelo menos 6 caracteres!');
    return;
  }

  try {
    const resultado = await auth.createUserWithEmailAndPassword(email, senha);
    console.log('✅ Usuário criado:', resultado.user.email);
    
    // Salvar perfil no Firestore
    await db.collection('usuarios').doc(resultado.user.uid).set({
      nome: nome,
      email: email,
      dataCriacao: new Date(),
      ultimoLogin: new Date()
    });

    console.log('✅ Perfil salvo no Firestore');

    // Criar configurações compartilhadas
    await db.collection('configuracoes').doc('geral').set({
      usdRate: 5.00,
      monthlyRate: 1.00,
      targetGoal: 112000,
      ultimaAtualizacao: new Date()
    }, { merge: true });

    console.log('✅ Configurações criadas');

    limparFormularios();
    mostrarLogin();
    mostrarErro('Conta criada com sucesso! Faça login agora.', 'success');
  } catch (error) {
    console.error('❌ Erro ao criar conta:', error);
    mostrarErro('Erro ao criar conta: ' + error.message);
  }
}

// Fazer Login
async function fazerLogin() {
  const email = document.getElementById('loginEmail').value;
  const senha = document.getElementById('loginPassword').value;

  console.log('🔑 Tentando fazer login:', email);

  if (!email || !senha) {
    mostrarErro('Preencha email e senha!');
    return;
  }

  try {
    const resultado = await auth.signInWithEmailAndPassword(email, senha);
    console.log('✅ Login bem-sucedido:', resultado.user.email);
    limparFormularios();
  } catch (error) {
    console.error('❌ Erro ao fazer login:', error);
    mostrarErro('Erro ao fazer login: ' + error.message);
  }
}

// Fazer Logout
async function fazerLogout() {
  try {
    await auth.signOut();
    console.log('✅ Logout realizado');
    mostrarErro('Logout realizado com sucesso!', 'success');
  } catch (error) {
    console.error('❌ Erro ao fazer logout:', error);
    mostrarErro('Erro ao fazer logout: ' + error.message);
  }
}

// Mostrar/Ocultar Formulários
function mostrarRegistro() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
}

function mostrarLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
}

// Mostrar Erro/Sucesso
function mostrarErro(mensagem, tipo = 'danger') {
  const errorDiv = document.getElementById('authError');
  errorDiv.className = `alert alert-${tipo}`;
  errorDiv.textContent = mensagem;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

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
async function carregarDadosDoFirebase() {
  try {
    console.log('📥 Carregando dados do Firebase...');
    
    // Carregar configurações
    const configDoc = await db.collection('configuracoes').doc('geral').get();
    if (configDoc.exists) {
      const data = configDoc.data();
      configuracoes.usdRate = data.usdRate || 5.00;
      configuracoes.monthlyRate = data.monthlyRate || 1.00;
      configuracoes.targetGoal = data.targetGoal || 112000;
      console.log('✅ Configurações carregadas');
    }

    // Atualizar inputs
    document.getElementById('usdRate').value = configuracoes.usdRate;
    document.getElementById('monthlyRate').value = configuracoes.monthlyRate;
    document.getElementById('targetGoal').value = configuracoes.targetGoal;

    // Carregar transações em tempo real
    db.collection('transacoes')
      .orderBy('data', 'desc')
      .onSnapshot((snapshot) => {
        console.log('📊 Atualizando transações...');
        transacoes = [];
        snapshot.forEach((doc) => {
          transacoes.push({
            id: doc.id,
            ...doc.data()
          });
        });
        console.log(`✅ ${transacoes.length} transações carregadas`);
        atualizar();
      }, (error) => {
        console.error('❌ Erro ao carregar transações:', error);
      });
  } catch (error) {
    console.error('❌ Erro ao carregar dados:', error);
  }
}

console.log('✅ auth.js carregado com sucesso!');
