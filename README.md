# 💰 Dashboard Financeiro 2030 - Colaborativo com Firebase

Um aplicativo web completo para gerenciamento financeiro compartilhado em tempo real com Firebase Firestore.

## 🎯 Funcionalidades

✅ **Autenticação Firebase**
- Registro com Email/Senha
- Login seguro
- Logout

✅ **Dashboard Colaborativo**
- Múltiplos usuários compartilham os MESMOS dados
- Sincronização em tempo real
- Rastreamento de quem fez cada ação

✅ **Gerenciamento de Transações**
- Adicionar Receitas, Despesas e Investimentos
- Visualizar histórico com usuário de cada ação
- Deletar transações

✅ **Visualizações Avançadas**
- 4 gráficos em tempo real
- Evolução do Patrimônio
- Projeção até 2030
- Distribuição por Categoria
- Receita vs Despesa

✅ **Armazenamento em Firebase Firestore**
- Dados compartilhados entre usuários
- Sincronização automática
- Backup automático

## 🚀 Como Usar

### 1. Acessar a Aplicação
https://thiagomroato.github.io/financial-dashboard

### 2. Criar uma Conta
- Clique em **"Criar Conta"**
- Preencha nome, email e senha
- Clique em **"Registrar"**

### 3. Fazer Login
- Digite seu email e senha
- Clique em **"Entrar"**

### 4. Compartilhar com Outros
- Peça a outros usuários para criar uma conta
- Todos verão os mesmos dados em tempo real!

### 5. Adicionar Transações
- **Receita**: Clique em "Adicionar Receita"
- **Despesa**: Clique em "Adicionar Despesa"
- **Investimento**: Clique em "Adicionar Investimento"

### 6. Acompanhar em Tempo Real
- Mudanças aparecem instantaneamente para todos
- Gráficos atualizam automaticamente

## 🔐 Segurança

✅ Senhas criptografadas
✅ Autenticação Firebase
✅ Regras de segurança Firestore
✅ Dados privados no Firebase

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript ES6
- **Backend**: Firebase (Autenticação + Firestore)
- **UI**: Bootstrap 5
- **Gráficos**: Chart.js
- **Ícones**: Font Awesome

## 📊 Configuração Firebase

### Estrutura do Firestore
├── transacoes/│   ├── {id}: documento de transação│   │   ├── data│   │   ├── tipo (receita/despesa/investimento)│   │   ├── categoria│   │   ├── descricao│   │   ├── valor│   │   ├── moeda│   │   ├── usuarioId│   │   ├── usuarioEmail│   │   ├── dataCriacao│   │   └── dataAtualizacao│├── configuracoes/│   └── geral/│       ├── usdRate│       ├── monthlyRate│       ├── targetGoal│       └── ultimaAtualizacao│└── usuarios/└── {uid}/├── nome├── email├── dataCriacao└── ultimoLogin

### Regras de Segurança

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Todos podem ler e escrever transações
    match /transacoes/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Usuários podem ler seu próprio perfil
    match /usuarios/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    
    // Todos podem ler e escrever configurações
    match /configuracoes/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

