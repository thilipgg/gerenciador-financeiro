import { 
    fetchTransactions, 
    insertTransaction, 
    isDemoMode, 
    setAuthType,
    supabase
} from './db.js';

import { 
    showLoginScreen, 
    showDashboardScreen, 
    initTheme, 
    updateDashboardUI, 
    showToast 
} from './ui.js';

// ----------------------------------------------------
// CARREGAMENTO DE DADOS
// ----------------------------------------------------

async function loadDashboardData() {
    try {
        const transactions = await fetchTransactions();
        updateDashboardUI(transactions);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        showToast("Erro ao carregar dados financeiros.", "error");
    }
}

// ----------------------------------------------------
// CONTROLE DE LOGIN (FILIPE VS VISITANTE)
// ----------------------------------------------------

// Esta função será chamada pelo seu HTML (botões do Filipe e Visitante)
window.tentarLogin = async (tipo) => {
    if (tipo === 'Visitante') {
        setAuthType('Visitante');
        showDashboardScreen({ full_name: "Visitante", email: "demo@demo.com" }, true);
        await loadDashboardData();
    } else {
        const senha = document.getElementById('admin-pass')?.value;
        // Coloque a sua senha definida aqui
        if (senha === "1234") { 
            setAuthType('Filipe');
            showDashboardScreen({ full_name: "Filipe", email: "filipe@admin.com" }, false);
            await loadDashboardData();
        } else {
            showToast("Senha incorreta!", "error");
        }
    }
};

// Logout limpo
window.fazerLogout = () => {
    localStorage.removeItem('auth_type');
    window.location.reload();
};

// ----------------------------------------------------
// BOOTSTRAP DA APLICACAO
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Verifica se já existe um tipo de login salvo
    const authSalvo = localStorage.getItem('auth_type');
    if (authSalvo) {
        // Recria o estado de login automaticamente ao abrir o app
        if (authSalvo === 'Visitante') {
            showDashboardScreen({ full_name: "Visitante", email: "demo@demo.com" }, true);
        } else {
            showDashboardScreen({ full_name: "Filipe", email: "filipe@admin.com" }, false);
        }
        loadDashboardData();
    } else {
        showLoginScreen();
    }
});