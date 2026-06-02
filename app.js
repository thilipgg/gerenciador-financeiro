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
import { loginComEmail, setAuthType, loadDashboardData } from './db.js';
import { showDashboardScreen, showToast } from './ui.js';

window.tentarLogin = async (tipo) => {
    if (tipo === 'Visitante') {
        setAuthType('Visitante');
        showDashboardScreen({ full_name: "Visitante", email: "demo@demo.com" }, true);
        await loadDashboardData();
    } else {
        const email = "filipesoares.cunha@gmail.com"; // Seu e-mail fixo
        const senhaInput = document.getElementById('admin-pass');
        
        if (!senhaInput || !senhaInput.value) {
            showToast("Por favor, insira a senha.", "error");
            return;
        }

        try {
            // Chama a função real do Supabase que valida e-mail e senha
            await loginComEmail(email, senhaInput.value);
            
            setAuthType('Filipe');
            showDashboardScreen({ full_name: "Filipe", email: email }, false);
            await loadDashboardData();
        } catch (err) {
            console.error("Erro no login:", err);
            showToast("E-mail ou senha incorretos!", "error");
        }
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