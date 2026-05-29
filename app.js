import {
    getCurrentUser,
    loginWithGoogle,
    logout,
    fetchTransactions,
    insertTransaction,
    isDemoMode,
    setDemoActive,
    supabase
} from './db.js';

import {
    showLoginScreen,
    showDashboardScreen,
    initTheme,
    toggleTheme,
    openModal,
    closeModal,
    updateDashboardUI,
    filterAndRenderTransactions,
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
        console.error("Erro ao carregar dados do dashboard:", err);
        showToast("Erro ao carregar dados financeiros.", "error");
    }
}

// ----------------------------------------------------
// CONTROLE DE SESSÃO
// ----------------------------------------------------

async function checkSession() {
    const user = await getCurrentUser();
    if (user) {
        showDashboardScreen(user, isDemoMode());
        await loadDashboardData();
    } else {
        showLoginScreen();
    }
}

// ----------------------------------------------------
// INICIALIZAÇÃO DE EVENTOS
// ----------------------------------------------------

function setupEventListeners() {
    // 1. Botões de Login
    const googleLoginBtn = document.getElementById('google-login-btn');
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', async () => {
            try {
                setDemoActive(false); // Garante que não está no modo demo
                await loginWithGoogle();
            } catch (err) {
                console.error("Erro no login Google:", err);
                showToast("Erro ao conectar com Google. Tente o modo de teste!", "error");
            }
        });
    }

    const demoLoginBtn = document.getElementById('demo-login-btn');
    if (demoLoginBtn) {
        demoLoginBtn.addEventListener('click', async () => {
            setDemoActive(true);
            const user = await getCurrentUser();
            showDashboardScreen(user, true);
            await loadDashboardData();
            showToast("Logado com sucesso no Modo de Teste!", "success");
        });
    }

    // 2. Botão de Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await logout();
                showLoginScreen();
                showToast("Sessão encerrada.", "success");
            } catch (err) {
                showToast("Erro ao deslogar.", "error");
            }
        });
    }

    // 3. Alternar Tema (Claro/Escuro)
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            toggleTheme();
        });
    }

    // 4. Modal: Abrir e Fechar
    const openModalBtn = document.getElementById('open-add-modal-btn');
    if (openModalBtn) {
        openModalBtn.addEventListener('click', openModal);
    }

    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', closeModal);
    }

    // Fechar modal ao clicar fora dele
    const modalOverlay = document.getElementById('transaction-modal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    // Seletor de tipo de transação (Entrada/Saída) no modal
    const btnIncome = document.getElementById('btn-type-income');
    const btnExpense = document.getElementById('btn-type-expense');
    const typeInput = document.getElementById('trans-type');

    if (btnIncome && btnExpense && typeInput) {
        btnIncome.addEventListener('click', () => {
            btnIncome.classList.add('active');
            btnExpense.classList.remove('active');
            typeInput.value = 'income';
        });

        btnExpense.addEventListener('click', () => {
            btnExpense.classList.add('active');
            btnIncome.classList.remove('active');
            typeInput.value = 'expense';
        });
    }

    // 5. Envio do Formulário de Nova Transação
    const form = document.getElementById('transaction-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const description = document.getElementById('trans-desc').value.trim();
            const amount = parseFloat(document.getElementById('trans-amount').value);
            const type = document.getElementById('trans-type').value;
            const category = document.getElementById('trans-category').value;
            const date = document.getElementById('trans-date').value;

            // Validações simples
            if (!description) {
                showToast("Por favor, preencha a descrição.", "error");
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                showToast("Por favor, insira um valor válido maior que zero.", "error");
                return;
            }

            try {
                await insertTransaction({ description, amount, type, category, date });
                showToast("Transação adicionada com sucesso!", "success");
                closeModal();
                // Recarrega dados no dashboard
                await loadDashboardData();
            } catch (err) {
                showToast("Erro ao salvar transação.", "error");
            }
        });
    }

    // 6. Barra de Pesquisa e Filtros (Reativos)
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', filterAndRenderTransactions);
    }

    const filterSelect = document.getElementById('filter-select');
    if (filterSelect) {
        filterSelect.addEventListener('change', filterAndRenderTransactions);
    }

    // 7. Evento Customizado para recarregar dados (ex: após exclusão)
    window.addEventListener('transactions-updated', async () => {
        await loadDashboardData();
    });
}

// ----------------------------------------------------
// BOOTSTRAP DA APLICACAO
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa o Tema (Claro/Escuro) salvo
    initTheme();

    // 2. Configura todos os Event Listeners
    setupEventListeners();

    // 3. Monitora autenticação real no Supabase (se disponível)
    // No seu app.js, dentro do DOMContentLoaded
    if (supabase) {
        // 1. Verifica se já existe uma sessão ativa ao abrir a página
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                showDashboardScreen(session.user, false);
                loadDashboardData();
            }
        });

        // 2. Escuta mudanças (incluindo o retorno do Google)
        supabase.auth.onAuthStateChange((event, session) => {
            console.log("Evento Auth detectado:", event);
            if (event === 'SIGNED_IN' && session) {
                showDashboardScreen(session.user, false);
                loadDashboardData();
            } else if (event === 'SIGNED_OUT') {
                showLoginScreen();
            }
        });
    }

    // 4. Checagem inicial de sessão (Demo ou Supabase)
    checkSession();
});
