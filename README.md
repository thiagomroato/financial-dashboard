# 💰 Dashboard Financeiro 2030 - Colaborativo

Um aplicativo web colaborativo para gerenciamento financeiro compartilhado, com autenticação Firebase e sincronização em tempo real via Firestore.

## 🎯 Funcionalidades

✅ **Autenticação Firebase**
- Login e registro com Email/Senha
- Sessão persistente entre visitas

✅ **Colaborativo em Tempo Real**
- Dados compartilhados entre múltiplos usuários via Firestore
- Sincronização automática em tempo real (onSnapshot)
- Rastreamento de quem adicionou cada transação

✅ **Dashboard Interativo**
- KPIs em tempo real (Patrimônio atual, Receitas, Despesas, Meta 2030)
- Gráficos dinâmicos e responsivos

✅ **Gerenciamento de Transações**
- Adicionar Receitas (Salário, Rendimento, Bônus, Aporte)
- Adicionar Despesas (Alimentação, Transporte, Moradia, Lazer, etc)
- Adicionar Investimentos (Ações Brasil, P&G USD, Renda Fixa)

✅ **Visualizações Avançadas**
- Evolução do Patrimônio (gráfico de linha)
- Projeção até 2030 (gráfico de barras)
- Distribuição por Categoria (gráfico donut)
- Comparação Receita vs Despesa (gráfico de barras)

✅ **Configurações Personalizáveis**
- Cotação USD → BRL customizável
- Taxa de rendimento mensal ajustável
- Meta de patrimônio personalizada

## 🚀 Como Usar

### 1. Acessar a Aplicação
O app está disponível em: `https://thiagomroato.github.io/financial-dashboard`

### 2. Criar Conta / Login
- Acesse a tela inicial e clique em **Criar Conta**
- Informe seu nome, email e senha (mínimo 6 caracteres)
- Após o registro, faça login com suas credenciais

### 3. Adicionar Dados
- **Receita**: Clique em "Adicionar Receita" e preencha os dados
- **Despesa**: Clique em "Adicionar Despesa" e preencha os dados
- **Investimento**: Clique em "Adicionar Investimento" e preencha os dados

### 4. Visualizar Dashboard
- Todos os gráficos são atualizados em tempo real
- O email do usuário que criou cada transação é exibido na tabela
- Dados são compartilhados com todos os usuários autenticados

### 5. Ajustar Configurações
- Clique em ⚙️ Configurações para:
  - Alterar cotação USD
  - Ajustar taxa de rendimento
  - Modificar meta de patrimônio 2030

## 🔥 Configuração Firebase

As credenciais Firebase estão em `config.js`. Para usar seu próprio projeto Firebase:

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Crie um novo projeto ou use o existente
3. Ative **Authentication** → Email/Password
4. Ative **Firestore Database**
5. Nas regras do Firestore, permita acesso para usuários autenticados:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

6. Copie as credenciais do seu projeto e substitua em `config.js`

## 🛠️ Tecnologias

- **HTML5** - Estrutura
- **CSS3** - Estilo responsivo
- **JavaScript Vanilla** - Lógica da aplicação
- **Bootstrap 5** - Framework CSS
- **Chart.js** - Gráficos interativos
- **Font Awesome** - Ícones
- **Firebase Authentication** - Autenticação de usuários
- **Firebase Firestore** - Banco de dados em tempo real

## 💾 Armazenamento

Todos os dados são salvos no **Firebase Firestore** e sincronizados em tempo real entre todos os usuários autenticados.

## 🎨 Design

- Interface moderna e responsiva
- Gradientes visuais atraentes
- Animações suaves
- Compatível com mobile, tablet e desktop

## 🔒 Segurança

- Autenticação obrigatória para acessar o dashboard
- Dados protegidos pelas regras de segurança do Firestore
- Cada transação registra o usuário responsável

## 📄 Licença

Este projeto está disponível para uso pessoal e educacional.

---

**Desenvolvido com ❤️ para gerenciamento financeiro inteligente e colaborativo**
