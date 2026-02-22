// Verificar se usuário está logado
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        usuarioAtual = user;
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'block';
        document.getElementById('usuarioNome').textContent = `Bem-vindo, ${user.email}!`;
        
        carregarDadosDoFirebase();
        inicializarDatas();
        atualizar();
    } else {
        usuarioAtual = null;
        document.getElementById('authScreen').style.display = 'block';
        document.getElementById('appScreen').style.display = 'none';
        limparFormularios();
    }
});

// Fazer Login
async function fazerLogin() {
    const email = document.getElementById('loginEmail').value;
    const senha = document.getElementById('loginPassword').value;

    if (!email || !senha) {
        mostrarErro('Preencha email e senha!');
        return;
    }

    try {
        await firebase.auth().signInWithEmailAndPassword(email, senha);
        limparFormularios();
    } catch (error) {
        mostrarErro('Erro ao fazer login: ' + error.message);
    }
}

// Fazer Registro
async function fazerRegistro() {
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
        // Criar usuário
        const resultado = await firebase.auth().createUserWithEmailAndPassword(email, senha);
        
        // Salvar perfil no Firestore
        await db.collection('usuarios').doc(resultado.user.uid).set({
            nome: nome,
            email: email,
            dataCriacao: new Date(),
            ultimoLogin: new Date()
        });

        // Criar documento de configurações compartilhadas
        await db.collection('configuracoes').doc('geral').set({
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
}

// Fazer Logout
async function fazerLogout() {
    try {
        await firebase.auth().signOut();
        mostrarErro('Logout realizado com sucesso!', 'success');
    } catch (error) {
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
