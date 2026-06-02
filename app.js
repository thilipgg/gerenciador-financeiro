import { fetchTransactions, loginComEmail, logout, supabase } from './db.js';
import { showLoginScreen, showDashboardScreen, updateDashboardUI, showToast } from './ui.js';

// 1. Escuta mudanças na autenticação
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showDashboardScreen(session.user);
        loadDashboardData();
    } else {
        showLoginScreen();
    }
});

// 2. Função de login atribuída ao escopo global para o HTML reconhecer
window.tentarLogin = async (tipo) => {
    if (tipo === 'Visitante') {
        // Lógica de Visitante (assumindo que você manteve o modo demo no ui.js/db.js)
        showDashboardScreen({ full_name: "Visitante", email: "demo@demo.com" });
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

// 3. Logout global
window.fazerLogout = async () => {
    await logout();
};

// 4. Carregamento de dados
async function loadDashboardData() {
    try {
        const transactions = await fetchTransactions();
        updateDashboardUI(transactions);
    } catch (err) {
        showToast("Erro ao carregar dados.", "error");
    }
}