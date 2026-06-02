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
// 1. INICIALIZAÇÃO DO APP E CONFIGURAÇÕES
// ==========================================

// Inicializa o tema salvo (claro ou escuro)
initTheme();

// Escuta mudanças no estado de autenticação do Supabase
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showDashboardScreen(session.user, false);
        loadDashboardData();
    } else {
        showLoginScreen();
    }
});

// Escuta o evento de exclusão disparado pelo ui.js para recarregar a tela
window.addEventListener('transactions-updated', loadDashboardData);


// ==========================================
// 2. FUNÇÃO DE LOGIN (ESCOPO GLOBAL)
// ==========================================

window.tentarLogin = async (tipo) => {
    if (tipo === 'Visitante') {
        showDashboardScreen({ user_metadata: { full_name: "Visitante" }, email: "demo@demo.com" }, true);
        updateDashboardUI([]); // Inicializa painel do visitante vazio ou com dados mockados
    } else {
        const email = "filipesoares.cunha@gmail.com";
        const campoSenha = document.getElementById('admin-pass');
        
        if (!campoSenha || !campoSenha.value) {
            showToast("Digite a senha!", "error");
            return;
        }

        try {
            await loginComEmail(email, campoSenha.value);
        } catch (err) {
            showToast("Erro no login: " + err.message, "error");
        }
    }
};


// ==========================================
// 3. MAPEAMENTO DE EVENTOS DA INTERFACE (LISTENERS)
// ==========================================

// Botão de Encerrar Sessão (Logout)
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await logout();
    } catch (err) {
        showToast("Erro ao sair do sistema.", "error");
    }
});

// Botão de Alternar Tema (Light / Dark Mode)
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    toggleTheme();
});

// Controle de Abertura e Fechamento do Modal
document.getElementById('open-add-modal-btn')?.addEventListener('click', openModal);
document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
document.getElementById('cancel-modal-btn')?.addEventListener('click', closeModal);

// Seletores de Tipo dentro do Modal (Despesa / Receita)
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

// Submissão do Formulário de Nova Transação (Adicionar)
document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const description = document.getElementById('trans-desc').value;
    const amount = document.getElementById('trans-amount').value;
    const category = document.getElementById('trans-category').value;
    const date = document.getElementById('trans-date').value;
    const type = transTypeInput ? transTypeInput.value : 'expense';

    try {
        await insertTransaction({ description, amount, category, date, type });
        showToast("Transação adicionada com sucesso!", "success");
        closeModal();
        loadDashboardData(); // Recarrega os dados e atualiza gráficos na hora
    } catch (err) {
        showToast("Erro ao salvar transação: " + err.message, "error");
    }
});

// Filtros de Busca e Filtro de Tipo por Select (Tempo Real)
document.getElementById('search-input')?.addEventListener('input', filterAndRenderTransactions);
document.getElementById('filter-select')?.addEventListener('change', filterAndRenderTransactions);


// ==========================================
// 4. CONTROLE DE FLUXO DE DADOS
// ==========================================

async function loadDashboardData() {
    try {
        const transactions = await fetchTransactions();
        updateDashboardUI(transactions);
    } catch (err) {
        showToast("Erro ao buscar dados no Supabase.", "error");
        console.error(err);
    }
}