// Módulo de Gerenciamento da Interface (UI)
import { removeTransaction } from './db.js';
import { renderCharts, updateChartsTheme } from './chart-manager.js';

const CATEGORY_ICONS = {
    'Alimentação': '🍔',
    'Moradia': '🏠',
    'Transporte': '🚗',
    'Lazer': '🎉',
    'Salário': '💼',
    'Outros': '🏷️'
};

// Referências globais de transações para filtros e edições
let currentTransactionsList = [];

// Expõe a lista globalmente para o app.js e ações inline no HTML terem acesso
window.allTransactions = [];

// ----------------------------------------------------\n// TELA E VISIBILIDADE\n// ----------------------------------------------------\n
export function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('dashboard-screen').style.display = 'none';
}

export function showDashboardScreen(user, isDemo) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'flex';
    
    // Atualiza dados do usuário no header
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const badgeEl = document.getElementById('demo-badge');
    
    if (avatarEl) avatarEl.src = user.user_metadata?.avatar_url || 'https://api.dicebear.com/7.x/adventurer/svg?seed=user';
    if (nameEl) nameEl.textContent = user.user_metadata?.full_name || user.email;
    if (badgeEl) badgeEl.style.display = isDemo ? 'inline-block' : 'none';
}

// ----------------------------------------------------\n// ATUALIZAÇÃO DO DASHBOARD (DADOS E UI)\n// ----------------------------------------------------\n
export function updateDashboardUI(transactions) {
    currentTransactionsList = transactions;
    window.allTransactions = transactions; // Alimenta a referência global
    
    calculateSummary(transactions);
    filterAndRenderTransactions();
    renderCharts(transactions);
}

function calculateSummary(transactions) {
    let income = 0;
    let expense = 0;

    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        if (t.type === 'income') {
            income += amount;
        } else {
            expense += amount;
        }
    });

    const balance = income - expense;

    // Atualiza os elementos na tela
    const balanceEl = document.getElementById('total-balance');
    const incomeEl = document.getElementById('total-income');
    const expenseEl = document.getElementById('total-expense');

    if (balanceEl) balanceEl.textContent = formatCurrency(balance);
    if (incomeEl) incomeEl.textContent = formatCurrency(income);
    if (expenseEl) expenseEl.textContent = formatCurrency(expense);
}

export function filterAndRenderTransactions() {
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const filterType = filterSelect ? filterSelect.value : 'all';

    const filtered = currentTransactionsList.filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(searchTerm) || 
                              t.category.toLowerCase().includes(searchTerm);
        
        const matchesType = filterType === 'all' || 
                            (filterType === 'income' && t.type === 'income') || 
                            (filterType === 'expense' && t.type === 'expense');

        return matchesSearch && matchesType;
    });

    renderTable(filtered);
}

function renderTable(transactions) {
    const tbody = document.getElementById('transactions-tbody');
    if (!tbody) return;

    if (transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
                    Nenhuma transação encontrada.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transactions.map(t => {
        const icon = CATEGORY_ICONS[t.category] || '🏷️';
        const isIncome = t.type === 'income';
        const amountClass = isIncome ? 'amount-income' : 'amount-expense';
        const amountPrefix = isIncome ? '+' : '-';

        return `
            <tr class="animate-fade">
                <td class="td-description">${escapeHTML(t.description)}</td>
                <td>
                    <span class="td-category">${icon} ${escapeHTML(t.category)}</span>
                </td>
                <td style="color: var(--text-muted);">${formatDate(t.date)}</td>
                <td class="${amountClass}" style="font-variant-numeric: tabular-nums;">
                    ${amountPrefix}${formatCurrency(t.amount)}
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-edit" title="Editar item" onclick="window.prepararEdicao('${t.id}')">
                            <i class="ri-pencil-line"></i>
                        </button>
                        <button class="btn-delete" title="Excluir item" data-id="${t.id}" style="color: var(--danger);">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    setupDeleteListeners();
}

// ----------------------------------------------------\n// PREPARAÇÃO PARA EDIÇÃO DO ITEM\n// ----------------------------------------------------\n
window.prepararEdicao = (id) => {
    // Procura a transação correta dentro da lista global
    const transacao = window.allTransactions.find(t => String(t.id) === String(id));
    if (!transacao) return;

    // Vincula o ID à propriedade dataset do formulário para o app.js capturar no submit
    const form = document.getElementById('transaction-form');
    if (form) form.dataset.editId = id;

    // Preenche os campos do modal com as informações do banco
    const descInput = document.getElementById('trans-desc');
    const amountInput = document.getElementById('trans-amount');
    const categoryInput = document.getElementById('trans-category');
    const dateInput = document.getElementById('trans-date');
    const typeInput = document.getElementById('trans-type');

    if (descInput) descInput.value = transacao.description;
    if (amountInput) amountInput.value = transacao.amount;
    if (categoryInput) categoryInput.value = transacao.category;
    if (dateInput) dateInput.value = transacao.date;
    if (typeInput) typeInput.value = transacao.type;

    // Atualiza as classes visuais ativas dos botões de Tipo (Receita / Despesa)
    const btnExpense = document.getElementById('btn-type-expense');
    const btnIncome = document.getElementById('btn-type-income');

    if (transacao.type === 'income') {
        btnIncome?.classList.add('active');
        btnExpense?.classList.remove('active');
    } else {
        btnExpense?.classList.add('active');
        btnIncome?.classList.remove('active');
    }

    // Altera o título do Modal para melhor legibilidade
    const modalTitle = document.querySelector('.modal-header h3');
    if (modalTitle) modalTitle.textContent = "Editar Transação";

    openModal();
};

// ----------------------------------------------------\n// CONTROLE DE MODAL\n// ----------------------------------------------------\n
export function openModal() {
    const modal = document.getElementById('transaction-modal');
    if (modal) modal.classList.add('active');
}

export function closeModal() {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    
    if (modal) modal.classList.remove('active');
    
    if (form) {
        form.reset();
        delete form.dataset.editId; // Remove identificador de edição se houver
    }

    // Restaura o título padrão do Modal
    const modalTitle = document.querySelector('.modal-header h3');
    if (modalTitle) modalTitle.textContent = "Nova Transação";

    // Reseta botões de tipo para o padrão (Despesa ativo)
    document.getElementById('btn-type-expense')?.classList.add('active');
    document.getElementById('btn-type-income')?.classList.remove('active');
    const typeInput = document.getElementById('trans-type');
    if (typeInput) typeInput.value = 'expense';
}

// ----------------------------------------------------\n// GERENCIAMENTO DE TEMAS (DARK / LIGHT)\n// ----------------------------------------------------\n
export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateChartsTheme(isDark);
}

// ----------------------------------------------------\n// EVENT LISTENERS INTERNOS\n// ----------------------------------------------------\n
function setupDeleteListeners() {
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (!id) return;

            if (confirm("Tem certeza que deseja excluir esta transação de forma permanente?")) {
                try {
                    await removeTransaction(id);
                    showToast("Transação excluída com sucesso!");
                    
                    // Dispara evento global para o app.js recarregar os dados do banco
                    window.dispatchEvent(new Event('transactions-updated'));
                } catch (err) {
                    showToast("Erro ao excluir transação.", "error");
                }
            }
        });
    });
}

// ----------------------------------------------------\n// UTILS E NOTIFICAÇÕES (TOAST)\n// ----------------------------------------------------\n
export function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '✅' : '❌';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function formatCurrency(value) {
    return Math.abs(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'\"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}