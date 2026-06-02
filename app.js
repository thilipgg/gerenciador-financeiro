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

supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showDashboardScreen(session.user, false);
        loadDashboardData();
    } else {
        showLoginScreen();
    }
});

window.addEventListener('transactions-updated', loadDashboardData);

// ==========================================
// 2. AUTENTICAÇÃO
// ==========================================
window.tentarLogin = async (tipo) => {
    if (tipo === 'Visitante') {
        showDashboardScreen({ user_metadata: { full_name: "Visitante" }, email: "demo@demo.com" }, true);
        updateDashboardUI([]); 
    } else {
        const emailInput = document.getElementById('user-email').value;
        const passInput = document.getElementById('user-pass').value;
        
        if (!emailInput || !passInput) {
            showToast("Por favor, preencha e-mail e senha.", "error");
            return;
        }

        try {
            await loginComEmail(emailInput, passInput);
        } catch (err) {
            showToast("E-mail ou senha incorretos.", "error");
        }
    }
};

// ==========================================
// 3. EVENTOS DA INTERFACE (DASHBOARD)
// ==========================================
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
});

document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

document.getElementById('open-add-modal-btn')?.addEventListener('click', () => openModal(false));
document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
document.getElementById('cancel-modal-btn')?.addEventListener('click', closeModal);

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

document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const editId = form.dataset.editId;

    const rawAmount = document.getElementById('trans-amount').value;
    const cleanAmount = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, '')) || 0;

    const fallbackType = document.getElementById('btn-type-income')?.classList.contains('active') ? 'income' : 'expense';
    const finalType = transTypeInput ? transTypeInput.value : fallbackType;

    const data = {
        description: document.getElementById('trans-desc').value,
        amount: cleanAmount,
        category: document.getElementById('trans-category').value,
        date: document.getElementById('trans-date').value,
        type: finalType
    };

    try {
        if (editId) {
            const { error } = await supabase.from('transactions').update(data).eq('id', editId);
            if (error) throw error;
            showToast("Transação atualizada!", "success");
        } else {
            await insertTransaction(data);
            showToast("Lançamento realizado!", "success");
        }
        
        closeModal();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast("Erro ao processar: " + err.message, "error");
    }
});

document.getElementById('search-input')?.addEventListener('input', filterAndRenderTransactions);
document.getElementById('filter-select')?.addEventListener('change', filterAndRenderTransactions);

async function loadDashboardData() {
    try {
        const transactions = await fetchTransactions();
        updateDashboardUI(transactions);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}