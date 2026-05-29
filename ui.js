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

// Referências globais de transações
let currentTransactionsList = [];

// ----------------------------------------------------
// TELA E VISIBILIDADE
// ----------------------------------------------------

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

// ----------------------------------------------------
// GERENCIAMENTO DE MODO CLARO/ESCURO
// ----------------------------------------------------

export function initTheme() {
    const savedTheme = localStorage.getItem('finances_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('finances_theme', isDark ? 'dark' : 'light');
    updateChartsTheme(isDark);
}

export function isDarkActive() {
    return document.documentElement.classList.contains('dark');
}

// ----------------------------------------------------
// MODAL DE NOVA TRANSAÇÃO
// ----------------------------------------------------

export function openModal() {
    const modal = document.getElementById('transaction-modal');
    if (modal) {
        modal.classList.add('active');
        // Define a data padrão como hoje
        document.getElementById('trans-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('trans-desc').focus();
    }
}

export function closeModal() {
    const modal = document.getElementById('transaction-modal');
    if (modal) {
        modal.classList.remove('active');
        document.getElementById('transaction-form').reset();
        
        // Reseta botões do seletor de tipo
        document.getElementById('btn-type-income').classList.remove('active');
        document.getElementById('btn-type-expense').classList.add('active');
        document.getElementById('trans-type').value = 'expense';
    }
}

// ----------------------------------------------------
// RENDERIZAÇÃO DO RESUMO E TRANSAÇÕES
// ----------------------------------------------------

export function updateDashboardUI(transactions) {
    currentTransactionsList = transactions;
    
    // 1. Calcula Resumo Financeiro
    let totalIncome = 0;
    let totalExpense = 0;
    
    transactions.forEach(t => {
        const amount = parseFloat(t.amount);
        if (t.type === 'income') {
            totalIncome += amount;
        } else {
            totalExpense += amount;
        }
    });
    
    const totalBalance = totalIncome - totalExpense;
    
    // Atualiza DOM dos Widgets
    const balanceVal = document.getElementById('val-balance');
    const incomeVal = document.getElementById('val-income');
    const expenseVal = document.getElementById('val-expense');
    
    if (balanceVal) {
        balanceVal.textContent = formatCurrency(totalBalance);
        // Altera cor dependendo se saldo é negativo ou positivo
        if (totalBalance < 0) {
            balanceVal.style.color = 'var(--danger)';
        } else {
            balanceVal.style.color = 'var(--text-main)';
        }
    }
    if (incomeVal) incomeVal.textContent = formatCurrency(totalIncome);
    if (expenseVal) expenseVal.textContent = formatCurrency(totalExpense);
    
    // 2. Renderiza lista de transações (filtrada)
    filterAndRenderTransactions();
    
    // 3. Renderiza Gráficos
    renderCharts(transactions, isDarkActive());
}

export function filterAndRenderTransactions() {
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    const filterType = document.getElementById('filter-select')?.value || 'all';
    
    const filtered = currentTransactionsList.filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(searchTerm) || 
                              t.category.toLowerCase().includes(searchTerm);
        
        const matchesType = filterType === 'all' || t.type === filterType;
        
        return matchesSearch && matchesType;
    });
    
    renderTransactionsList(filtered);
}

function renderTransactionsList(transactions) {
    const tbody = document.getElementById('transactions-tbody');
    const mobileList = document.getElementById('mobile-transactions-list');
    
    if (!tbody || !mobileList) return;
    
    tbody.innerHTML = '';
    mobileList.innerHTML = '';
    
    if (transactions.length === 0) {
        const emptyHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <h3>Nenhuma transação encontrada</h3>
                <p>Cadastre uma nova transação ou limpe seus filtros de busca.</p>
            </div>
        `;
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; border-bottom: none;">${emptyHTML}</td></tr>`;
        mobileList.innerHTML = emptyHTML;
        return;
    }
    
    transactions.forEach(t => {
        const amountFormatted = formatCurrency(parseFloat(t.amount));
        const amountClass = t.type === 'income' ? 'amount-income' : 'amount-expense';
        const amountPrefix = t.type === 'income' ? '+' : '-';
        const dateFormatted = formatDate(t.date);
        const icon = CATEGORY_ICONS[t.category] || '🏷️';
        
        // 1. Tabela Desktop
        const tr = document.createElement('tr');
        tr.className = 'animate-fade';
        tr.innerHTML = `
            <td class="td-description">${escapeHTML(t.description)}</td>
            <td>
                <span class="td-category">
                    <span>${icon}</span>
                    <span>${escapeHTML(t.category)}</span>
                </span>
            </td>
            <td>${dateFormatted}</td>
            <td class="td-amount ${amountClass}">${amountPrefix} ${amountFormatted}</td>
            <td style="text-align: right; width: 60px;">
                <button class="btn-delete" data-id="${t.id}" title="Deletar Transação">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
        
        // 2. Lista Mobile
        const mDiv = document.createElement('div');
        mDiv.className = 'mobile-transaction-item animate-fade';
        mDiv.innerHTML = `
            <div class="mobile-item-left">
                <div class="mobile-item-title">${escapeHTML(t.description)}</div>
                <div class="mobile-item-meta">
                    <span class="td-category" style="padding: 2px 8px; font-size: 11px;">${icon} ${escapeHTML(t.category)}</span>
                    <span>${dateFormatted}</span>
                </div>
            </div>
            <div class="mobile-item-right">
                <div class="td-amount ${amountClass}" style="font-size: 16px;">${amountPrefix} ${amountFormatted}</div>
                <button class="btn-delete" data-id="${t.id}" title="Deletar Transação" style="margin-left: 8px;">🗑️</button>
            </div>
        `;
        mobileList.appendChild(mDiv);
    });
    
    // Adiciona event listeners para exclusão em todos os botões de lixeira recém-criados
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            if (confirm("Tem certeza que deseja excluir esta transação?")) {
                try {
                    await removeTransaction(id);
                    showToast("Transação excluída com sucesso!", "success");
                    // Dispara evento global de atualização de dados
                    window.dispatchEvent(new CustomEvent('transactions-updated'));
                } catch (err) {
                    showToast("Erro ao excluir transação.", "error");
                }
            }
        });
    });
}

// ----------------------------------------------------
// UTILS E NOTIFICAÇÕES (TOAST)
// ----------------------------------------------------

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
    // Corrige deslocamento de timezone na visualização da data
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
