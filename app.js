import { fetchTransactions, insertTransaction, loginComEmail, logout, supabase } from './db.js';
import { 
    showLoginScreen, 
    showDashboardScreen, 
    updateDashboardUI, 
    showToast,
    initTheme,
    toggleTheme,
    openModal,
    closeModal,
    filterAndRenderTransactions
} from './ui.js';

// ==========================================
// 1. INICIALIZAÇÃO E MONITORAMENTO
// ==========================================

// Inicializa o tema (claro/escuro) baseado na preferência salva[cite: 3]
initTheme();

// Observa mudanças de autenticação no Supabase
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showDashboardScreen(session.user, false);
        loadDashboardData();
    } else {
        showLoginScreen();
        setupLoginListeners(); // Garante que o Enter funcione ao voltar para o login
    }
});

// Atualiza a tela quando uma transação é excluída (evento vindo do ui.js)
window.addEventListener('transactions-updated', loadDashboardData);


// ==========================================
// 2. FUNÇÕES DE AUTENTICAÇÃO
// ==========================================

window.tentarLogin = async (tipo) => {
    if (tipo === 'Visitante') {
        showDashboardScreen({ user_metadata: { full_name: "Visitante" }, email: "demo@demo.com" }, true);
        updateDashboardUI([]); 
    } else {
        const email = "filipesoares.cunha@gmail.com";
        const campoSenha = document.getElementById('admin-pass');
        
        if (!campoSenha || !campoSenha.value) {
            showToast("Por favor, digite a senha.", "error");
            return;
        }

        try {
            await loginComEmail(email, campoSenha.value);
        } catch (err) {
            showToast("Senha incorreta ou erro de conexão.", "error");
        }
    }
};

// Função para configurar o "Enter" no campo de senha
function setupLoginListeners() {
    const inputSenha = document.getElementById('admin-pass');
    inputSenha?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            window.tentarLogin('Filipe');
        }
    });
}


// ==========================================
// 3. EVENTOS DA INTERFACE (DASHBOARD)
// ==========================================

// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
});

// Alternar Tema (Dark Mode)
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    toggleTheme();
});

// Controle do Modal de Adicionar Transação
document.getElementById('open-add-modal-btn')?.addEventListener('click', openModal);
document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
document.getElementById('cancel-modal-btn')?.addEventListener('click', closeModal);

// Seleção de Tipo no Modal (Receita / Despesa)
const btnExpense = document.getElementById('btn-type-expense');
const btnIncome = document.getElementById('btn-type-income');
const transTypeInput = document.getElementById('trans-type');

btnExpense?.addEventListener('click', () => {
    btnExpense.classList.add('active');
    btnIncome?.classList.remove('active');
    if (transTypeInput) transTypeInput.value = 'expense';
});

btnIncome?.addEventListener('click', () => {
    btnIncome.classList.add('active');
    btnExpense?.classList.remove('active');
    if (transTypeInput) transTypeInput.value = 'income';
});

// Envio do Formulário de Transação
document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        description: document.getElementById('trans-desc').value,
        amount: document.getElementById('trans-amount').value,
        category: document.getElementById('trans-category').value,
        date: document.getElementById('trans-date').value,
        type: transTypeInput ? transTypeInput.value : 'expense'
    };

    try {
        await insertTransaction(data);
        showToast("Lançamento realizado!", "success");
        closeModal();
        loadDashboardData();
    } catch (err) {
        showToast("Erro ao salvar.", "error");
    }
});

// Filtros de busca em tempo real
document.getElementById('search-input')?.addEventListener('input', filterAndRenderTransactions);
document.getElementById('filter-select')?.addEventListener('change', filterAndRenderTransactions);


// ==========================================
// 4. CARREGAMENTO DE DADOS
// ==========================================

async function loadDashboardData() {
    try {
        const transactions = await fetchTransactions();
        updateDashboardUI(transactions);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}