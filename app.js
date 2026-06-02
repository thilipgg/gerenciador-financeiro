import { fetchTransactions, loginComEmail, logout, supabase } from './db.js';
import { showLoginScreen, showDashboardScreen, updateDashboardUI, showToast } from './ui.js';

// 1. Escuta mudanças no Login (O "coração" da app)
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showDashboardScreen(session.user);
        loadDashboardData();
    } else {
        showLoginScreen();
    }
});

// 2. Função chamada pelo formulário de Login
window.tentarLogin = async () => {
    const email = document.getElementById('email-input').value;
    const senha = document.getElementById('senha-input').value;

    try {
        await loginComEmail(email, senha);
    } catch (err) {
        showToast("Erro: " + err.message, "error");
    }
};

// 3. Carregamento de dados
async function loadDashboardData() {
    try {
        const transactions = await fetchTransactions();
        updateDashboardUI(transactions);
    } catch (err) {
        showToast("Erro ao carregar dados.", "error");
    }
}

// 4. Logout global
window.fazerLogout = async () => {
    await logout();
};