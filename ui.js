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

const DYNAMIC_CATEGORIES = {
    income: [
        { value: 'Salário', label: '💼 Salário' },
        { value: 'Outros', label: '🏷️ Outros' }
    ],
    expense: [
        { value: 'Alimentação', label: '🍔 Alimentação' },
        { value: 'Moradia', label: '🏠 Moradia' },
        { value: 'Transporte', label: '🚗 Transporte' },
        { value: 'Lazer', label: '🎉 Lazer' },
        { value: 'Outros', label: '🏷️ Outros' }
    ]
};

let currentTransactionsList = [];
window.allTransactions = [];
// Ordenação atual do grid
let currentSort = { key: null, dir: 'asc' };

export function setSort(key) {
    if (!key) return;
    if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.dir = 'asc';
    }

    // Atualiza indicadores visuais nos headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.key === currentSort.key) {
            th.classList.add(currentSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });

    filterAndRenderTransactions();
}

function applySorting(arr) {
    if (!currentSort.key) return arr;
    const key = currentSort.key;
    const dir = currentSort.dir === 'asc' ? 1 : -1;

    return arr.slice().sort((a, b) => {
        const va = (a[key] !== undefined && a[key] !== null) ? a[key] : '';
        const vb = (b[key] !== undefined && b[key] !== null) ? b[key] : '';

        if (key === 'amount') {
            const na = parseFloat(va) || 0;
            const nb = parseFloat(vb) || 0;
            return (na - nb) * dir;
        }

        if (key === 'date') {
            const da = va ? new Date(String(va)) : new Date(0);
            const db = vb ? new Date(String(vb)) : new Date(0);
            return (da - db) * dir;
        }

        if (key === 'due_date') {
            const da = va ? new Date(String(va)) : new Date(9999, 11, 31);
            const db = vb ? new Date(String(vb)) : new Date(9999, 11, 31);
            return (da - db) * dir;
        }

        // string compare for description and category
        return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' }) * dir;
    });
}

export function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('dashboard-screen').style.display = 'none';
}

export function showDashboardScreen(user, isDemo) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'flex';
    
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const badgeEl = document.getElementById('demo-badge');
    
    if (avatarEl) avatarEl.src = user.user_metadata?.avatar_url || 'https://api.dicebear.com/7.x/adventurer/svg?seed=user';
    if (nameEl) nameEl.textContent = user.user_metadata?.full_name || user.email;
    if (badgeEl) badgeEl.style.display = isDemo ? 'inline-block' : 'none';
}

export function updateDashboardUI(transactions) {
    currentTransactionsList = transactions;
    window.allTransactions = transactions; 
    
    calculateSummary(transactions);
    filterAndRenderTransactions();
}

function calculateSummary(transactions) {
    let income = 0;
    let expense = 0;
    let pendingExpense = 0;
    let overdueExpense = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    transactions.forEach(t => {
        const amount = Math.abs(parseFloat(t.amount)) || 0;
        const normalizedType = String(t.type).toLowerCase().trim();
        const status = String(t.paid_status || 'paid').toLowerCase().trim();

        if (normalizedType === 'income' || normalizedType === 'receita') {
            income += amount;
        } else {
            expense += amount;
            if (status === 'pending') {
                pendingExpense += amount;
                // Verifica se está vencida
                if (t.due_date) {
                    const dueDate = new Date(t.due_date + 'T00:00:00');
                    if (dueDate < today) {
                        overdueExpense += amount;
                    }
                }
            }
        }
    });

    const balance = income - expense;
    const available = balance + pendingExpense;

    const balanceEl = document.getElementById('val-balance') || document.getElementById('total-balance') || document.querySelector('.widget-balance .widget-value');
    const incomeEl = document.getElementById('val-income') || document.getElementById('total-income') || document.querySelector('.widget-income .widget-value');
    const expenseEl = document.getElementById('val-expense') || document.getElementById('total-expense') || document.querySelector('.widget-expense .widget-value');
    const pendingEl = document.getElementById('val-pending');
    const overdueEl = document.getElementById('val-overdue');
    const availableEl = document.getElementById('val-available');

    if (balanceEl) balanceEl.textContent = formatCurrency(balance);
    if (incomeEl) incomeEl.textContent = formatCurrency(income);
    if (expenseEl) expenseEl.textContent = formatCurrency(expense);
    if (pendingEl) pendingEl.textContent = formatCurrency(pendingExpense);
    if (overdueEl) overdueEl.textContent = formatCurrency(overdueExpense);
    if (availableEl) availableEl.textContent = formatCurrency(available);
}

export function filterAndRenderTransactions() {
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    const statusFilter = document.getElementById('status-filter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const filterType = filterSelect ? filterSelect.value : 'all';
    const filterStatus = statusFilter ? statusFilter.value : 'all';

    const startVal = document.getElementById('filter-start-date')?.value;
    const endVal = document.getElementById('filter-end-date')?.value;
    const startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    const endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    const filtered = currentTransactionsList.filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(searchTerm) || 
                              t.category.toLowerCase().includes(searchTerm);
        
        const normalizedType = String(t.type).toLowerCase().trim();
        const isIncome = (normalizedType === 'income' || normalizedType === 'receita');

        const matchesType = filterType === 'all' || 
                            (filterType === 'income' && isIncome) || 
                            (filterType === 'expense' && !isIncome);

        const status = String(t.paid_status || 'paid').toLowerCase().trim();
        const matchesStatus = filterStatus === 'all' ||
                              (filterStatus === 'paid' && status === 'paid') ||
                              (filterStatus === 'pending' && status === 'pending');

        // Filtra por intervalo de datas, se fornecido
        if (startDate || endDate) {
            if (!t.date) return false;
            const txDate = new Date(t.date + 'T12:00:00');
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
        }

        return matchesSearch && matchesType && matchesStatus;
    });

    const sorted = applySorting(filtered);
    renderTable(sorted);
    const isDarkTheme = document.documentElement.classList.contains('dark');
    renderCharts(sorted, isDarkTheme);
}

function renderTable(transactions) {
    const tbody = document.getElementById('transactions-tbody');
    if (!tbody) return;

    if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 20px;">Nenhuma transação encontrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = transactions.map(t => {
        // Se a categoria for customizada, usa a tag de Outros como ícone padrão
        const icon = CATEGORY_ICONS[t.category] || '🏷️';
        const normalizedType = String(t.type).toLowerCase().trim();
        const isIncome = (normalizedType === 'income' || normalizedType === 'receita');
        
        const amountClass = isIncome ? 'amount-income' : 'amount-expense';
        const amountPrefix = isIncome ? '+ ' : '- ';

        const statusValue = String(t.paid_status || 'paid').toLowerCase().trim();
        const dueDate = t.due_date ? formatDate(t.due_date) : '-';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isOverdue = t.due_date && new Date(t.due_date + 'T00:00:00') < today && statusValue === 'pending';
        const dueDateClass = isOverdue ? 'overdue' : '';
        
        return `
            <tr class="animate-fade">
                <td class="td-description">${escapeHTML(t.description)}</td>
                <td class="${amountClass}" style="font-variant-numeric: tabular-nums;">
                    ${amountPrefix}${formatCurrency(t.amount)}
                </td>
                <td><span class="td-category">${icon} ${escapeHTML(t.category)}</span></td>
                <td><span class="tx-status ${statusValue === 'paid' ? 'status-paid' : 'status-pending'}">${statusValue === 'paid' ? 'Pago' : 'Pendente'}</span></td>
                <td style="color: var(--text-muted);">${formatDate(t.date)}</td>
                <td class="${dueDateClass}" style="font-weight: ${isOverdue ? '700' : '400'}; color: ${isOverdue ? 'var(--danger)' : 'var(--text-muted)'};">${dueDate}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-edit" title="Editar item" onclick="window.prepararEdicao('${t.id}')" style="background:none; border:none; cursor:pointer;">
                            <i class="ri-pencil-line"></i>
                        </button>
                        <button class="btn-delete" title="Excluir item" data-id="${t.id}" style="color: var(--danger); background:none; border:none; cursor:pointer;">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    setupDeleteListeners();
}

// ATUALIZA O DROPDOWN DEPENDENDO DO TIPO (Receita/Despesa)
export function updateCategoryDropdown(type) {
    const categorySelect = document.getElementById('trans-category');
    if (!categorySelect) return;

    const options = DYNAMIC_CATEGORIES[type] || DYNAMIC_CATEGORIES['expense'];
    
    categorySelect.innerHTML = options.map(opt => 
        `<option value="${opt.value}">${opt.label}</option>`
    ).join('');

    // Sempre oculta o input customizado ao mudar de tipo
    const customInput = document.getElementById('trans-custom-category');
    if (customInput) {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }

    // Define a opção padrão quando for nova transação do tipo despesa
    // Queremos que 'Moradia' venha selecionada por padrão
    try {
        if (type === 'expense') {
            const defaultOption = 'Moradia';
            const hasDefault = Array.from(categorySelect.options).some(o => o.value === defaultOption);
            if (hasDefault) {
                categorySelect.value = defaultOption;
            } else {
                categorySelect.selectedIndex = 0;
            }
        } else {
            // Para receitas, mantém a primeira opção padrão
            categorySelect.selectedIndex = 0;
        }
    } catch (err) {
        // silencioso em caso de problema com o DOM
        categorySelect.selectedIndex = 0;
    }
}

window.prepararEdicao = (id) => {
    const transacao = window.allTransactions.find(t => String(t.id) === String(id));
    if (!transacao) return;

    const form = document.getElementById('transaction-form');
    if (form) form.dataset.editId = id; 

    const normalizedType = String(transacao.type).toLowerCase().trim();
    const isIncome = (normalizedType === 'income' || normalizedType === 'receita');
    const transactionType = isIncome ? 'income' : 'expense';

    document.getElementById('trans-desc').value = transacao.description;
    document.getElementById('trans-amount').value = transacao.amount;
    document.getElementById('trans-date').value = transacao.date;
    document.getElementById('trans-due-date').value = transacao.due_date || '';
    
    const typeInput = document.getElementById('trans-type');
    if (typeInput) typeInput.value = transactionType;

    const btnExpense = document.getElementById('btn-type-expense');
    const btnIncome = document.getElementById('btn-type-income');

    if (isIncome) {
        btnIncome?.classList.add('active');
        btnExpense?.classList.remove('active');
    } else {
        btnExpense?.classList.add('active');
        btnIncome?.classList.remove('active');
    }

    // Atualiza as categorias antes de setar o valor
    updateCategoryDropdown(transactionType);

    const categorySelect = document.getElementById('trans-category');
    const customInput = document.getElementById('trans-custom-category');
    
    // Verifica se a categoria do banco existe nas opções padrões. Se não existir, é porque é "Outros/Customizada"
    const defaultOptions = DYNAMIC_CATEGORIES[transactionType].map(opt => opt.value);
    
    if (defaultOptions.includes(transacao.category)) {
        categorySelect.value = transacao.category;
    } else {
        categorySelect.value = 'Outros';
        customInput.style.display = 'block';
        customInput.required = true;
        customInput.value = transacao.category;
    }

    const statusSelect = document.getElementById('trans-paid-status');
    if (statusSelect) statusSelect.value = transacao.paid_status || 'paid';

    const modalTitle = document.querySelector('.modal-header h3');
    if (modalTitle) modalTitle.textContent = "Editar Transação";

    openModal(true); 
};

export function openModal(isEditing = false) {
    const modal = document.getElementById('transaction-modal');
    if (modal) modal.classList.add('active');

    if (!isEditing) {
        const dateInput = document.getElementById('trans-date');
        if (dateInput) {
            const hoje = new Date();
            const offset = hoje.getTimezoneOffset() * 60000;
            const dataLocal = new Date(hoje.getTime() - offset);
            dateInput.value = dataLocal.toISOString().split('T')[0];
        }
        // Foque no campo de descrição para inserções rápidas
        const desc = document.getElementById('trans-desc');
        if (desc) desc.focus();
        // Ao abrir para nova inserção, garante que a aba inicial seja Despesa
        updateCategoryDropdown('expense');
        const statusSelect = document.getElementById('trans-paid-status');
        if (statusSelect) statusSelect.value = 'pending';
    }
}

export function closeModal() {
    document.getElementById('transaction-modal')?.classList.remove('active');
    const form = document.getElementById('transaction-form');
    if (form) { 
        form.reset(); 
        delete form.dataset.editId; 
    }
    document.getElementById('btn-type-expense')?.classList.add('active');
    document.getElementById('btn-type-income')?.classList.remove('active');
    
    const typeInput = document.getElementById('trans-type');
    if (typeInput) typeInput.value = 'expense';

    const customInput = document.getElementById('trans-custom-category');
    if (customInput) {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }

    const dueInput = document.getElementById('trans-due-date');
    if (dueInput) dueInput.value = '';

    const modalTitle = document.querySelector('.modal-header h3');
    if (modalTitle) modalTitle.textContent = "Nova Transação";
}

export function initTheme() {
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateChartsTheme(isDark);
}

function setupDeleteListeners() {
    document.querySelectorAll('.btn-delete').forEach(b => {
        b.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (id && confirm("Deseja excluir essa transação?")) {
                await removeTransaction(id);
                window.dispatchEvent(new Event('transactions-updated'));
            }
        });
    });
}

export function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatCurrency(v) { 
    return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); 
}

function formatDate(d) { 
    if(!d) return ''; 
    const [y, m, day] = d.split('-'); 
    return `${day}/${m}/${y}`; 
}

function escapeHTML(s) { 
    return s ? s.replace(/[&<>'\"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":"&#39;",'"':'&quot;'}[t]||t)) : ''; 
}