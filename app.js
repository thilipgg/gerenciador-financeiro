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

initTheme();

// Observa mudanças de autenticação no Supabase
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showDashboardScreen(session.user, false);
        loadDashboardData();
    } else {
        showLoginScreen();
        setupLoginListeners();
    }
});

// Atualiza a tela quando uma transação é excluída ou alterada via evento global
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

document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
});

document.getElementById('theme-toggle')?.addEventListener('click', () => {
    toggleTheme();
});

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

// SUBMISSÃO E CORREÇÃO DA DUPLICAÇÃO (Criação vs Edição)
document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const editId = form.dataset.editId; // Captura o ID caso seja edição

    // Limpa o valor numérico removendo máscaras visuais desnecessárias
    const rawAmount = document.getElementById('trans-amount').value;
    const cleanAmount = parseFloat(String(rawAmount).replace(',', '.'));

    const data = {
        description: document.getElementById('trans-desc').value,
        amount: cleanAmount,
        category: document.getElementById('trans-category').value,
        date: document.getElementById('trans-date').value,
        type: transTypeInput ? transTypeInput.value : 'expense'
    };

    try {
        if (editId) {
            // EXECUTA ATUALIZAÇÃO NO SUPABASE EM VEZ DE CRIAR NOVO
            const { error } = await supabase
                .from('transactions')
                .update(data)
                .eq('id', editId);

            if (error) throw error;
            showToast("Transação atualizada com sucesso!", "success");
        } else {
            // EXECUTA NOVA INSERÇÃO
            await insertTransaction(data);
            showToast("Lançamento realizado!", "success");
        }
        
        closeModal();
        loadDashboardData(); // Recarrega a tabela e recalcula o sumário
    } catch (err) {
        console.error(err);
        showToast("Erro ao salvar operação: " + err.message, "error");
    }
});

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
        showToast("Erro ao conectar com o banco de dados.", "error");
    }
}