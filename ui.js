import {
    fetchTransactions,
    removeTransaction,
    removeTransactionAndFuture,
    updateTransaction,
} from './db.js';
import { renderCharts, renderProjectionChart } from './chart-manager.js';
import {
    calculatePaydayAllowance,
    compareTransactionsMonthOverMonth,
    generateBudgetStatus,
    generateInsights,
    projectCashFlow,
} from './insights.js';
import { RECURRENCE_ICONS, RECURRENCE_LABELS } from './recurrence.js';
import {
    addMonthsSafe,
    debounce,
    escapeHTML,
    formatCurrency,
    formatDateBR,
    formatDateISO,
    formatSignedCurrency,
    isOverdueTransaction,
    isTransactionInMonth,
    normalizeStatus,
    normalizeTransactionType,
    parseAmount,
} from './utils.js';

export { debounce };

const CATEGORY_ICONS = {
    Alimentação: '🍔',
    Moradia: '🏠',
    Transporte: '🚗',
    Lazer: '🎉',
    Salário: '💼',
    Outros: '🏷️',
};

const DYNAMIC_CATEGORIES = {
    income: [
        { value: 'Salário', label: '💼 Salário' },
        { value: 'Outros', label: '🏷️ Outros' },
    ],
    expense: [
        { value: 'Alimentação', label: '🍔 Alimentação' },
        { value: 'Moradia', label: '🏠 Moradia' },
        { value: 'Transporte', label: '🚗 Transporte' },
        { value: 'Lazer', label: '🎉 Lazer' },
        { value: 'Outros', label: '🏷️ Outros' },
    ],
};

let allTransactions = [];
let currentAccounts = [];
let currentSort = { key: 'due_date', dir: 'asc' };
let currentDateSelection = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let lastRenderedKey = '';
let onAccountsChangedCallback = null;

export function getAllTransactions() {
    return allTransactions;
}

export function setAllTransactions(list) {
    allTransactions = Array.isArray(list) ? list : [];
    window.allTransactions = allTransactions;
}

export function getFilteredTransactionsForSelectedMonth() {
    const { year, month } = getCurrentSelection();
    return allTransactions.filter((t) => isTransactionInMonth(t, year, month));
}

export function getTotalBankBalance() {
    return currentAccounts.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);
}

export function setDashboardLoading(isLoading) {
    const bar = document.getElementById('dashboard-loading-bar');
    if (bar) bar.classList.toggle('active', Boolean(isLoading));
}

// =====================================================================
// ORDENAÇÃO
// =====================================================================

export function setSort(key) {
    if (!key) return;
    if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.dir = 'asc';
    }

    document.querySelectorAll('th.sortable').forEach((th) => {
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
        const va = a[key] !== undefined && a[key] !== null ? a[key] : '';
        const vb = b[key] !== undefined && b[key] !== null ? b[key] : '';

        if (key === 'amount') {
            return ((parseFloat(va) || 0) - (parseFloat(vb) || 0)) * dir;
        }

        if (key === 'date') {
            const da = va ? new Date(`${String(va).slice(0, 10)}T00:00:00`) : new Date(0);
            const db = vb ? new Date(`${String(vb).slice(0, 10)}T00:00:00`) : new Date(0);
            return (da - db) * dir;
        }

        if (key === 'due_date') {
            const da = va ? new Date(`${String(va).slice(0, 10)}T00:00:00`) : new Date(9999, 11, 31);
            const db = vb ? new Date(`${String(vb).slice(0, 10)}T00:00:00`) : new Date(9999, 11, 31);
            if (da.getTime() !== db.getTime()) return (da - db) * dir;
            const fa = a.date ? new Date(`${String(a.date).slice(0, 10)}T00:00:00`) : new Date(0);
            const fb = b.date ? new Date(`${String(b.date).slice(0, 10)}T00:00:00`) : new Date(0);
            return (fa - fb) * dir;
        }

        return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' }) * dir;
    });
}

// =====================================================================
// TELAS
// =====================================================================

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

    const avatarUrl = String(user?.user_metadata?.avatar_url || '');
    if (avatarEl) {
        avatarEl.src = /^https?:\/\//i.test(avatarUrl)
            ? avatarUrl
            : 'https://api.dicebear.com/7.x/adventurer/svg?seed=vaulta';
    }
    if (nameEl) nameEl.textContent = user?.user_metadata?.full_name || user?.email || 'Usuário';
    if (badgeEl) badgeEl.style.display = isDemo ? 'inline-block' : 'none';
}

// =====================================================================
// DASHBOARD
// =====================================================================

export function updateDashboardUI(transactions) {
    if (Array.isArray(transactions)) {
        setAllTransactions(transactions);
    }

    const { year, month } = getCurrentSelection();
    const transactionsForSelectedMonth = allTransactions.filter((t) =>
        isTransactionInMonth(t, year, month)
    );

    filterAndRenderTransactions();
    refreshMonthlyBudgetDashboard();

    let totalIncome = 0;
    let totalExpense = 0;
    let pendingExpenses = 0;
    let overdueExpenses = 0;

    transactionsForSelectedMonth.forEach((t) => {
        const amt = parseFloat(t.amount) || 0;
        const isIncome = normalizeTransactionType(t.type) === 'income';
        const status = normalizeStatus(t.paid_status);

        if (isIncome) {
            totalIncome += amt;
        } else {
            totalExpense += amt;
            if (status === 'pending') {
                pendingExpenses += amt;
                if (isOverdueTransaction(t)) {
                    overdueExpenses += amt;
                }
            }
        }
    });

    const balance = totalIncome - totalExpense;
    const availableBalance = totalIncome - (totalExpense - pendingExpenses);

    const balEl = document.getElementById('val-balance');
    if (balEl) {
        balEl.textContent = formatSignedCurrency(balance);
        balEl.className = balance >= 0 ? 'widget-value text-success' : 'widget-value text-danger';
    }

    const incEl = document.getElementById('val-income');
    if (incEl) incEl.textContent = formatCurrency(totalIncome);

    const expEl = document.getElementById('val-expense');
    if (expEl) expEl.textContent = formatCurrency(totalExpense);

    const pendingEl = document.getElementById('val-pending');
    if (pendingEl) pendingEl.textContent = formatCurrency(pendingExpenses);

    const overdueEl = document.getElementById('val-overdue');
    if (overdueEl) overdueEl.textContent = formatCurrency(overdueExpenses);

    const availEl = document.getElementById('val-available');
    if (availEl) {
        availEl.textContent = formatSignedCurrency(availableBalance);
        availEl.className = availableBalance >= 0 ? 'widget-value text-success' : 'widget-value text-danger';
    }

    updateInsights(allTransactions, currentDateSelection);
    renderProjection(allTransactions, currentDateSelection);
}

// =====================================================================
// CONTROLE MENSAL (contas dinâmicas sincronizadas)
// =====================================================================

const debouncedNotifyAccountsSave = debounce(() => {
    if (typeof onAccountsChangedCallback === 'function') {
        onAccountsChangedCallback(currentAccounts);
    }
    renderProjection(allTransactions, currentDateSelection);
}, 500);

export function setMonthlyAccounts(accounts, onChanged = null) {
    currentAccounts = Array.isArray(accounts) ? accounts.map((a) => ({ ...a })) : [];
    if (onChanged) onAccountsChangedCallback = onChanged;
    renderMonthlyAccountsDOM();
    refreshMonthlyBudgetDashboard();
}

export function getMonthlyAccounts() {
    return currentAccounts.map((a) => ({ ...a }));
}

export function renderMonthlyAccountsDOM() {
    const container = document.getElementById('div-saldo');
    if (!container) return;

    const canRemove = currentAccounts.length > 1;

    container.innerHTML = currentAccounts
        .map((acc) => {
            const safeId = escapeHTML(acc.id);
            const safeName = escapeHTML(acc.name);
            const safeIcon = escapeHTML(acc.icon || 'ri-bank-line');
            const valStr = Number(acc.balance) > 0 ? String(acc.balance) : '';

            return `
                <div class="monthly-account-card" data-account-id="${safeId}">
                    <div class="monthly-account-top">
                        <label class="monthly-account-name" for="acc-input-${safeId}">
                            <i class="${safeIcon}"></i>${safeName}
                        </label>
                        ${canRemove ? `
                            <button type="button" class="account-remove-btn" data-account-id="${safeId}" title="Remover conta" aria-label="Remover conta ${safeName}">
                                <i class="ri-close-line"></i>
                            </button>
                        ` : ''}
                    </div>
                    <input
                        class="monthly-account-input form-input"
                        id="acc-input-${safeId}"
                        data-account-id="${safeId}"
                        type="text"
                        inputmode="decimal"
                        placeholder="R$ 0,00"
                        value="${escapeHTML(valStr)}"
                    />
                </div>
            `;
        })
        .join('');
}

let accountsDelegationBound = false;
export function bindMonthlyAccountsDelegation(onRemoveAccount) {
    if (accountsDelegationBound) return;
    accountsDelegationBound = true;

    const container = document.getElementById('div-saldo');
    if (!container) return;

    container.addEventListener('focusin', (e) => {
        const input = e.target.closest('.monthly-account-input');
        if (!input) return;
        const val = String(input.value).trim().replace(',', '.');
        if (val !== '' && Number.parseFloat(val) === 0) {
            input.value = '';
        }
    });

    container.addEventListener('input', (e) => {
        const input = e.target.closest('.monthly-account-input');
        if (!input) return;

        const raw = String(input.value || '');
        const sanitized = raw.trim() === '' ? '' : raw.replace(/[^\d,.-]/g, '').replace(',', '.');
        if (sanitized !== raw) input.value = sanitized;

        const id = input.dataset.accountId;
        const account = currentAccounts.find((a) => String(a.id) === String(id));
        if (account) {
            account.balance = parseAmount(sanitized);
        }

        refreshMonthlyBudgetDashboard();
        debouncedNotifyAccountsSave();
    });

    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('.account-remove-btn');
        if (!btn) return;
        const id = btn.dataset.accountId;
        if (!id || typeof onRemoveAccount !== 'function') return;
        await onRemoveAccount(id);
    });

    bindPaydayAllowanceControls();
}

const PAYDAY_DAY_KEY = 'vaulta-payday-day';
const PAYDAY_MODE_KEY = 'vaulta-payday-mode';

function getPaydayPreferences() {
    const savedDay = parseInt(localStorage.getItem(PAYDAY_DAY_KEY) || '5', 10);
    const payday = Number.isFinite(savedDay) ? Math.min(28, Math.max(1, savedDay)) : 5;
    const mode = localStorage.getItem(PAYDAY_MODE_KEY) === 'after-pending' ? 'after-pending' : 'accounts';
    return { payday, mode };
}

let paydayControlsBound = false;
function bindPaydayAllowanceControls() {
    if (paydayControlsBound) return;
    paydayControlsBound = true;

    const dayInput = document.getElementById('payday-day-input');
    const modeSwitch = document.querySelector('.payday-mode-switch');
    const { payday, mode } = getPaydayPreferences();

    if (dayInput) {
        dayInput.value = String(payday);
        dayInput.addEventListener('change', () => {
            const parsed = Math.min(28, Math.max(1, parseInt(dayInput.value, 10) || 5));
            dayInput.value = String(parsed);
            localStorage.setItem(PAYDAY_DAY_KEY, String(parsed));
            refreshMonthlyBudgetDashboard();
        });
    }

    if (modeSwitch) {
        modeSwitch.querySelectorAll('.payday-mode-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        modeSwitch.addEventListener('click', (e) => {
            const btn = e.target.closest('.payday-mode-btn');
            if (!btn) return;
            const nextMode = btn.dataset.mode === 'after-pending' ? 'after-pending' : 'accounts';
            localStorage.setItem(PAYDAY_MODE_KEY, nextMode);
            modeSwitch.querySelectorAll('.payday-mode-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.mode === nextMode);
            });
            playUiSelectionSound();
            refreshMonthlyBudgetDashboard();
        });
    }
}

function renderPaydayAllowance(bankTotal, pendingThisMonth) {
    const panel = document.getElementById('payday-allowance-panel');
    if (!panel) return;

    const { payday, mode } = getPaydayPreferences();
    const useAfterPending = mode === 'after-pending';

    const info = calculatePaydayAllowance({
        totalBankBalance: bankTotal,
        pendingExpenses: pendingThisMonth,
        payday,
        useAfterPending,
    });

    const badgeEl = document.getElementById('payday-countdown-badge');
    const captionEl = document.getElementById('payday-base-caption');
    const dailyEl = document.getElementById('val-daily-allowance');
    const dailyHintEl = document.getElementById('hint-daily-allowance');
    const weeklyEl = document.getElementById('val-weekly-allowance');
    const weeklyHintEl = document.getElementById('hint-weekly-allowance');
    const cycleRangeEl = document.getElementById('payday-cycle-range');
    const cyclePctEl = document.getElementById('payday-cycle-pct');
    const cycleFillEl = document.getElementById('payday-cycle-fill');
    const weeksGridEl = document.getElementById('payday-weeks-breakdown');

    const daysLabel = info.daysUntilPayday === 1 ? 'Falta 1 dia' : `Faltam ${info.daysUntilPayday} dias`;
    if (badgeEl) badgeEl.textContent = `${daysLabel} • ${info.nextPaydayShort}`;

    if (captionEl) {
        if (info.isDeficit) {
            captionEl.innerHTML = `<span class="payday-alert-text">Saldo insuficiente (${formatSignedCurrency(info.baseAmount)}). Evite novos gastos até o próximo pagamento.</span>`;
        } else if (useAfterPending) {
            captionEl.textContent = `Base: ${formatSignedCurrency(info.baseAmount)} (total em contas menos ${formatCurrency(pendingThisMonth)} pendentes).`;
        } else {
            captionEl.textContent = `Base: ${formatSignedCurrency(info.baseAmount)} somados nas suas contas até ${info.nextPaydayFull}.`;
        }
    }

    if (dailyEl) {
        dailyEl.textContent = formatCurrency(info.dailyAllowance);
        dailyEl.classList.toggle('is-deficit', info.isDeficit || info.safeBase === 0);
    }
    if (dailyHintEl) {
        dailyHintEl.textContent = `para cada um dos próximos ${info.daysUntilPayday} ${info.daysUntilPayday === 1 ? 'dia' : 'dias'}`;
    }

    if (weeklyEl) {
        weeklyEl.textContent = formatCurrency(info.weeklyAllowance);
        weeklyEl.classList.toggle('is-deficit', info.isDeficit || info.safeBase === 0);
    }
    if (weeklyHintEl) {
        weeklyHintEl.textContent = info.daysUntilPayday <= 7
            ? `limite total para os últimos ${info.daysUntilPayday} ${info.daysUntilPayday === 1 ? 'dia' : 'dias'}`
            : `ritmo de 7 dias (${info.weeksRemaining.toFixed(1).replace('.', ',')} semanas restantes)`;
    }

    if (cycleRangeEl) {
        cycleRangeEl.textContent = `Ciclo do pagamento: ${info.prevPaydayShort} → ${info.nextPaydayShort}`;
    }
    if (cyclePctEl) {
        cyclePctEl.textContent = `${info.cycleElapsedPct}% percorrido`;
    }
    if (cycleFillEl) {
        cycleFillEl.style.width = `${info.cycleElapsedPct}%`;
    }

    if (weeksGridEl) {
        weeksGridEl.innerHTML = info.weeklySlices
            .map(
                (s) => `
                    <div class="payday-week-pill">
                        <div class="payday-week-top">
                            <span class="payday-week-title">${escapeHTML(s.label)}</span>
                            <span class="payday-week-days">${s.days} ${s.days === 1 ? 'dia' : 'dias'}</span>
                        </div>
                        <span class="payday-week-range">${escapeHTML(s.rangeLabel)}</span>
                        <strong class="payday-week-amount">${formatCurrency(s.amount)}</strong>
                    </div>
                `
            )
            .join('');
    }
}

export function refreshMonthlyBudgetDashboard() {
    const pendingValueEl = document.querySelector('#card-pendencias .span-valor');
    const banksValueEl = document.querySelector('#card-total-bancos .span-valor');
    const finalValueEl = document.querySelector('#card-resultado .span-valor');

    if (!pendingValueEl || !banksValueEl || !finalValueEl) return;

    const { year, month } = getCurrentSelection();
    const monthTransactions = allTransactions.filter((t) => isTransactionInMonth(t, year, month));

    const pendingThisMonth = monthTransactions.reduce((sum, t) => {
        const amount = Number(t.amount) || 0;
        const isExpense = normalizeTransactionType(t.type) === 'expense';
        const status = normalizeStatus(t.paid_status);
        return isExpense && status === 'pending' ? sum + amount : sum;
    }, 0);

    const bankTotal = getTotalBankBalance();
    const finalBalance = bankTotal - pendingThisMonth;

    pendingValueEl.textContent = formatCurrency(pendingThisMonth);
    pendingValueEl.classList.toggle('valor-negativo', pendingThisMonth > 0);
    pendingValueEl.classList.toggle('valor-positivo', pendingThisMonth === 0);

    banksValueEl.textContent = formatSignedCurrency(bankTotal);
    banksValueEl.classList.toggle('valor-positivo', bankTotal >= 0);
    banksValueEl.classList.toggle('valor-negativo', bankTotal < 0);

    finalValueEl.textContent = formatSignedCurrency(finalBalance);
    finalValueEl.classList.toggle('valor-negativo', finalBalance < 0);
    finalValueEl.classList.toggle('valor-positivo', finalBalance >= 0);

    renderPaydayAllowance(bankTotal, pendingThisMonth);
}

// =====================================================================
// LISTA / TABELA DE TRANSAÇÕES
// =====================================================================

export function filterAndRenderTransactions() {
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    const statusFilter = document.getElementById('status-filter');

    const rawSearch = searchInput ? searchInput.value.trim() : '';
    const searchTerm = rawSearch.toLowerCase();
    const filterType = filterSelect ? filterSelect.value : 'all';
    const filterStatus = statusFilter ? statusFilter.value : 'pending';

    const { year, month } = getCurrentSelection();

    const monthTransactions = allTransactions.filter((t) => isTransactionInMonth(t, year, month));

    const filtered = monthTransactions.filter((t) => {
        const matchesSearch =
            !searchTerm ||
            (t.description || '').toLowerCase().includes(searchTerm) ||
            (t.category || '').toLowerCase().includes(searchTerm);

        const isIncome = normalizeTransactionType(t.type) === 'income';
        const matchesType =
            filterType === 'all' ||
            (filterType === 'income' && isIncome) ||
            (filterType === 'expense' && !isIncome);

        const status = normalizeStatus(t.paid_status);
        const matchesStatus =
            filterStatus === 'all' ||
            (filterStatus === 'paid' && status === 'paid') ||
            (filterStatus === 'pending' && status === 'pending');

        return matchesSearch && matchesType && matchesStatus;
    });

    updateActiveFiltersUI({
        rawSearch,
        filterType,
        filterStatus,
        shownCount: filtered.length,
        totalCount: monthTransactions.length,
    });

    const sorted = applySorting(filtered);
    renderTable(sorted);

    // Chave considera mês, volume e soma dos valores para garantir redraw quando valores/categorias mudam
    const checksum = allTransactions.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0).toFixed(2);
    const chartKey = `${month}-${year}-${allTransactions.length}-${checksum}`;
    if (chartKey !== lastRenderedKey) {
        lastRenderedKey = chartKey;
        const isDarkTheme = document.documentElement.classList.contains('dark');
        requestAnimationFrame(() => {
            renderCharts(allTransactions, isDarkTheme, { year, month });
        });
    }
}

function updateActiveFiltersUI({ rawSearch, filterType, filterStatus, shownCount, totalCount }) {
    const searchWrapper = document.querySelector('.search-input-wrapper');
    const filterSelect = document.getElementById('filter-select');
    const statusFilter = document.getElementById('status-filter');
    const card = document.getElementById('transactions-card');
    const bar = document.getElementById('active-filters-bar');

    const hasSearch = Boolean(rawSearch);
    const hasType = filterType && filterType !== 'all';
    const hasStatus = filterStatus && filterStatus !== 'all';
    const hasAnyFilter = hasSearch || hasType || hasStatus;

    searchWrapper?.classList.toggle('filter-active', hasSearch);
    filterSelect?.classList.toggle('filter-active', hasType);
    statusFilter?.classList.toggle('filter-active', hasStatus);
    card?.classList.toggle('is-filtered', hasAnyFilter);

    if (!bar) return;

    if (!hasAnyFilter) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        return;
    }

    const chips = [];
    if (hasSearch) {
        chips.push({ key: 'search', label: `Busca: "${rawSearch}"` });
    }
    if (hasType) {
        chips.push({ key: 'type', label: `Tipo: ${filterType === 'income' ? 'Receitas' : 'Despesas'}` });
    }
    if (hasStatus) {
        chips.push({ key: 'status', label: `Status: ${filterStatus === 'pending' ? 'Pendentes' : 'Pagas'}` });
    }

    bar.style.display = 'flex';
    bar.innerHTML = `
        <div class="active-filters-left">
            <span class="active-filters-badge">
                <i class="ri-filter-3-fill"></i>
                Filtro ativo
            </span>
            <div class="active-filters-chips">
                ${chips
                    .map(
                        (c) => `
                            <span class="filter-chip">
                                ${escapeHTML(c.label)}
                                <button
                                    type="button"
                                    class="filter-chip-remove"
                                    data-filter="${escapeHTML(c.key)}"
                                    title="Remover filtro"
                                    aria-label="Remover ${escapeHTML(c.label)}"
                                >
                                    <i class="ri-close-line"></i>
                                </button>
                            </span>
                        `
                    )
                    .join('')}
            </div>
        </div>
        <div class="active-filters-right">
            <span class="active-filters-count">Exibindo <strong>${shownCount}</strong> de <strong>${totalCount}</strong></span>
            <button type="button" id="clear-filters-btn" class="clear-filters-btn">
                <i class="ri-filter-off-line"></i> Limpar filtros
            </button>
        </div>
    `;
}

function renderTable(transactions) {
    const tbody = document.getElementById('transactions-tbody');
    if (!tbody) return;

    if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 20px;">Nenhuma transação encontrada neste mês.</td></tr>`;
        const mobileListEmpty = document.getElementById('mobile-transactions-list');
        if (mobileListEmpty) {
            mobileListEmpty.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">Nenhuma transação encontrada neste mês.</div>`;
        }
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tbody.innerHTML = transactions
        .map((t) => {
            const safeId = escapeHTML(t.id);
            const icon = CATEGORY_ICONS[t.category] || '🏷️';
            const isIncome = normalizeTransactionType(t.type) === 'income';
            const amountClass = isIncome ? 'amount-income' : 'amount-expense';
            const amountPrefix = isIncome ? '+ ' : '- ';
            const statusValue = normalizeStatus(t.paid_status);
            const isPaid = statusValue === 'paid';

            const dueDate = t.due_date ? formatDateBR(t.due_date) : '-';
            const isOverdue = !isPaid && t.due_date && new Date(`${String(t.due_date).slice(0, 10)}T00:00:00`) < today;
            const dueDateClass = isOverdue ? 'overdue' : '';

            return `
                <tr class="animate-fade">
                    <td class="td-description">${escapeHTML(t.description)}${recurrenceBadgeHTML(t)}</td>
                    <td class="${amountClass}" style="font-variant-numeric: tabular-nums;">
                        ${amountPrefix}${formatCurrency(t.amount)}
                    </td>
                    <td><span class="td-category">${icon} ${escapeHTML(t.category)}</span></td>
                    <td>
                        <button
                            type="button"
                            class="tx-status btn-toggle-status ${isPaid ? 'status-paid' : 'status-pending'}"
                            data-id="${safeId}"
                            title="Clique para marcar como ${isPaid ? 'Pendente' : 'Pago'}"
                            aria-label="Alternar status para ${isPaid ? 'Pendente' : 'Pago'}"
                        >
                            <i class="${isPaid ? 'ri-checkbox-circle-line' : 'ri-time-line'}"></i>
                            ${isPaid ? 'Pago' : 'Pendente'}
                        </button>
                    </td>
                    <td style="color: var(--text-muted);">${formatDateBR(t.date)}</td>
                    <td class="${dueDateClass}" style="font-weight: ${isOverdue ? '700' : '400'}; color: ${isOverdue ? 'var(--danger)' : 'var(--text-muted)'};">${dueDate}</td>
                    <td>
                        <div class="actions-cell">
                            <button type="button" class="btn-edit" title="Editar item" data-id="${safeId}" style="background:none; border:none; cursor:pointer;">
                                <i class="ri-pencil-line"></i>
                            </button>
                            <button type="button" class="btn-delete" title="Excluir item" data-id="${safeId}" style="color: var(--danger); background:none; border:none; cursor:pointer;">
                                <i class="ri-delete-bin-line"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');

    const mobileList = document.getElementById('mobile-transactions-list');
    if (mobileList) {
        mobileList.innerHTML = transactions
            .map((t) => {
                const safeId = escapeHTML(t.id);
                const icon = CATEGORY_ICONS[t.category] || '🏷️';
                const isIncome = normalizeTransactionType(t.type) === 'income';
                const amountClass = isIncome ? 'amount-income' : 'amount-expense';
                const amountPrefix = isIncome ? '+ ' : '- ';
                const isPaid = normalizeStatus(t.paid_status) === 'paid';
                const displayDate = t.due_date ? formatDateBR(t.due_date) : formatDateBR(t.date);

                return `
                    <div class="mobile-transaction-card glass animate-fade" data-id="${safeId}">
                        <div class="mobile-top">
                            <div class="mobile-desc">${escapeHTML(t.description)}${recurrenceBadgeHTML(t)}</div>
                            <div class="mobile-amount ${amountClass}">${amountPrefix}${formatCurrency(t.amount)}</div>
                        </div>
                        <div class="mobile-bottom">
                            <div class="mobile-meta">
                                <span class="mobile-category">${icon} ${escapeHTML(t.category)}</span>
                                <button
                                    type="button"
                                    class="tx-status btn-toggle-status ${isPaid ? 'status-paid' : 'status-pending'}"
                                    data-id="${safeId}"
                                    title="Alternar status"
                                >
                                    <i class="${isPaid ? 'ri-checkbox-circle-line' : 'ri-time-line'}"></i>
                                    ${isPaid ? 'Pago' : 'Pendente'}
                                </button>
                                <span class="mobile-date">${displayDate}</span>
                            </div>
                            <div class="mobile-actions">
                                <button type="button" class="btn-edit" data-id="${safeId}" aria-label="Editar"><i class="ri-pencil-line"></i></button>
                                <button type="button" class="btn-delete" data-id="${safeId}" aria-label="Excluir"><i class="ri-delete-bin-line"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');
    }
}

// =====================================================================
// DELEGAÇÃO DE EVENTOS NA TABELA / CARDS (Editar, Toggle Status, Excluir)
// =====================================================================

let transactionDelegationBound = false;

export function bindTransactionDelegation() {
    if (transactionDelegationBound) return;
    transactionDelegationBound = true;

    const pendingDeletes = new Map();

    const handler = async (e) => {
        // 1. Toggle rápido Pago/Pendente em 1 clique
        const statusBtn = e.target.closest('.btn-toggle-status');
        if (statusBtn) {
            const id = statusBtn.dataset.id;
            const tx = allTransactions.find((t) => String(t.id) === String(id));
            if (!tx) return;

            const previousStatus = normalizeStatus(tx.paid_status);
            const nextStatus = previousStatus === 'paid' ? 'pending' : 'paid';

            // Atualização otimista
            tx.paid_status = nextStatus;
            updateDashboardUI(allTransactions);
            playUiSelectionSound();

            try {
                await updateTransaction(id, { paid_status: nextStatus });
                window.dispatchEvent(new Event('transactions-updated'));
                showToast(
                    nextStatus === 'paid' ? 'Marcado como Pago.' : 'Marcado como Pendente.',
                    'success',
                    { duration: 2000 }
                );
            } catch (err) {
                console.error('Erro ao alternar status:', err);
                tx.paid_status = previousStatus;
                updateDashboardUI(allTransactions);
                showToast('Não foi possível alterar o status.', 'error');
            }
            return;
        }

        // 2. Editar transação
        const editBtn = e.target.closest('.btn-edit');
        if (editBtn) {
            const id = editBtn.dataset.id;
            if (id) prepareTransactionEdit(id);
            return;
        }

        // 3. Excluir transação (recorrente ou otimista com Desfazer)
        const deleteBtn = e.target.closest('.btn-delete');
        if (!deleteBtn) return;

        const id = deleteBtn.dataset.id;
        if (!id || pendingDeletes.has(String(id))) return;

        const original = allTransactions.find((t) => String(t.id) === String(id));
        if (!original) return;

        const isRecurring = Boolean(original.recurrence || original.parent_id);

        if (isRecurring) {
            const scope = await askRecurrenceDeleteScope();
            if (scope === null) return;

            if (scope === 'future') {
                try {
                    await removeTransactionAndFuture(id);
                    playDeleteSound();
                    showToast('Transação e futuras excluídas.', 'success');

                    const fresh = await fetchTransactions();
                    updateDashboardUI(fresh);
                    window.dispatchEvent(new Event('transactions-updated'));
                } catch (err) {
                    console.error(err);
                    showToast('Erro ao excluir transações.', 'error');
                }
                return;
            }
        }

        // Delete otimista com undo (6s)
        setAllTransactions(allTransactions.filter((t) => String(t.id) !== String(id)));
        updateDashboardUI(allTransactions);
        playDeleteSound();

        const timerId = setTimeout(async () => {
            pendingDeletes.delete(String(id));
            try {
                await removeTransaction(id);
                window.dispatchEvent(new Event('transactions-updated'));
            } catch (err) {
                console.error('Erro ao excluir definitivamente:', err);
                setAllTransactions([original, ...allTransactions]);
                updateDashboardUI(allTransactions);
                showToast('Não foi possível excluir. Transação restaurada.', 'error');
            }
        }, 6000);

        pendingDeletes.set(String(id), timerId);

        showToast('Transação excluída.', 'success', {
            duration: 6000,
            onUndo: () => {
                const pending = pendingDeletes.get(String(id));
                if (pending) {
                    clearTimeout(pending);
                    pendingDeletes.delete(String(id));
                }
                setAllTransactions([original, ...allTransactions]);
                updateDashboardUI(allTransactions);
                window.dispatchEvent(new Event('transactions-updated'));
                showToast('Ação desfeita.', 'success');
            },
        });
    };

    document.getElementById('transactions-tbody')?.addEventListener('click', handler);
    document.getElementById('mobile-transactions-list')?.addEventListener('click', handler);

    // Delegação para remover filtros individuais ou limpar todos na barra de filtros ativos
    document.getElementById('active-filters-bar')?.addEventListener('click', (e) => {
        const removeChipBtn = e.target.closest('.filter-chip-remove');
        if (removeChipBtn) {
            const key = removeChipBtn.dataset.filter;
            if (key === 'search') {
                const el = document.getElementById('search-input');
                if (el) el.value = '';
            } else if (key === 'type') {
                const el = document.getElementById('filter-select');
                if (el) el.value = 'all';
            } else if (key === 'status') {
                const el = document.getElementById('status-filter');
                if (el) el.value = 'all';
            }
            playUiSelectionSound();
            filterAndRenderTransactions();
            return;
        }

        if (e.target.closest('#clear-filters-btn')) {
            const searchEl = document.getElementById('search-input');
            const typeEl = document.getElementById('filter-select');
            const statusEl = document.getElementById('status-filter');
            if (searchEl) searchEl.value = '';
            if (typeEl) typeEl.value = 'all';
            if (statusEl) statusEl.value = 'all';
            playUiSelectionSound();
            filterAndRenderTransactions();
        }
    });
}

// Mantém alias retrocompatível caso algum código externo importe o nome antigo
export const bindDeleteDelegation = bindTransactionDelegation;

function askRecurrenceDeleteScope() {
    return new Promise((resolve) => {
        const modal = document.getElementById('recurrence-delete-modal');
        if (!modal) {
            resolve('single');
            return;
        }

        const confirmBtn = document.getElementById('confirm-recurrence-delete');
        const cancelBtn = document.getElementById('cancel-recurrence-delete');
        const radios = modal.querySelectorAll('input[name="recurrence-delete-scope"]');

        radios.forEach((r) => {
            r.checked = r.value === 'single';
        });

        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            modal.classList.remove('active');
            confirmBtn?.removeEventListener('click', onConfirm);
            cancelBtn?.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onEsc);
            resolve(value);
        };

        const onConfirm = () => {
            const checked = [...radios].find((r) => r.checked);
            finish(checked ? checked.value : 'single');
        };
        const onCancel = () => finish(null);
        const onBackdrop = (ev) => {
            if (ev.target === ev.currentTarget) finish(null);
        };
        const onEsc = (ev) => {
            if (ev.key === 'Escape') finish(null);
        };

        confirmBtn?.addEventListener('click', onConfirm);
        cancelBtn?.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onEsc);

        playUiSelectionSound();
        modal.classList.add('active');
    });
}

// =====================================================================
// CATEGORIAS DINÂMICAS
// =====================================================================

export function updateCategoryDropdown(type) {
    const budgetSelect = document.getElementById('budget-category');
    if (budgetSelect) {
        const opts = DYNAMIC_CATEGORIES.expense;
        budgetSelect.innerHTML = opts
            .map((o) => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`)
            .join('');
    }

    const categorySelect = document.getElementById('trans-category');
    if (!categorySelect) return;

    const options = DYNAMIC_CATEGORIES[type] || DYNAMIC_CATEGORIES.expense;
    categorySelect.innerHTML = options
        .map((opt) => `<option value="${escapeHTML(opt.value)}">${escapeHTML(opt.label)}</option>`)
        .join('');

    const customInput = document.getElementById('trans-custom-category');
    if (customInput) {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }

    try {
        if (type === 'expense') {
            const defaultOption = 'Moradia';
            const hasDefault = Array.from(categorySelect.options).some((o) => o.value === defaultOption);
            categorySelect.value = hasDefault ? defaultOption : categorySelect.options[0].value;
        } else {
            categorySelect.selectedIndex = 0;
        }
    } catch {
        categorySelect.selectedIndex = 0;
    }
}

// =====================================================================
// MODAL DE TRANSAÇÃO
// =====================================================================

function getDefaultDateForSelectedMonth() {
    const selected = new Date(currentDateSelection);
    const now = new Date();
    const lastDayOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();
    const day = Math.min(now.getDate(), lastDayOfMonth);
    return formatDateISO(new Date(selected.getFullYear(), selected.getMonth(), day));
}

function syncNewTransactionDateToSelectedMonth() {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    const dateInput = document.getElementById('trans-date');

    if (!modal || !dateInput || !modal.classList.contains('active')) return;
    if (form?.dataset.editId) return;

    const defaultDate = getDefaultDateForSelectedMonth();
    dateInput.value = defaultDate;

    const dueDateInput = document.getElementById('trans-due-date');
    if (dueDateInput && !dueDateInput.value) {
        dueDateInput.value = defaultDate;
    }
}

export function prepareTransactionEdit(id) {
    const transacao = allTransactions.find((t) => String(t.id) === String(id));
    if (!transacao) return;

    const form = document.getElementById('transaction-form');
    if (form) form.dataset.editId = String(id);

    const transactionType = normalizeTransactionType(transacao.type);
    const isIncome = transactionType === 'income';

    document.getElementById('trans-desc').value = transacao.description || '';
    document.getElementById('trans-amount').value = transacao.amount ?? '';
    document.getElementById('trans-date').value = String(transacao.date || '').slice(0, 10);
    document.getElementById('trans-due-date').value = transacao.due_date
        ? String(transacao.due_date).slice(0, 10)
        : '';

    const typeInput = document.getElementById('trans-type');
    if (typeInput) typeInput.value = transactionType;

    const btnExpense = document.getElementById('btn-type-expense');
    const btnIncome = document.getElementById('btn-type-income');

    btnIncome?.classList.toggle('active', isIncome);
    btnExpense?.classList.toggle('active', !isIncome);

    updateCategoryDropdown(transactionType);

    const categorySelect = document.getElementById('trans-category');
    const customInput = document.getElementById('trans-custom-category');
    const defaultOptions = DYNAMIC_CATEGORIES[transactionType].map((opt) => opt.value);

    if (defaultOptions.includes(transacao.category)) {
        categorySelect.value = transacao.category;
    } else {
        categorySelect.value = 'Outros';
        if (customInput) {
            customInput.style.display = 'block';
            customInput.required = true;
            customInput.value = transacao.category || '';
        }
    }

    const statusSelect = document.getElementById('trans-paid-status');
    if (statusSelect) statusSelect.value = normalizeStatus(transacao.paid_status);

    const modalTitle = document.getElementById('transaction-modal-title');
    if (modalTitle) modalTitle.textContent = 'Editar Transação';

    const recSelect = document.getElementById('trans-recurrence');
    if (recSelect) recSelect.value = transacao.recurrence || '';
    const recEnd = document.getElementById('trans-recurrence-end');
    if (recEnd) recEnd.value = transacao.recurrence_end ? String(transacao.recurrence_end).slice(0, 10) : '';
    const recEndGroup = document.getElementById('recurrence-end-group');
    if (recEndGroup) recEndGroup.style.display = transacao.recurrence ? 'grid' : 'none';

    playUiSelectionSound();
    openModal(true);
}

export function openModal(isEditing = false) {
    const modal = document.getElementById('transaction-modal');
    if (modal) modal.classList.add('active');

    if (!isEditing) {
        syncNewTransactionDateToSelectedMonth();

        const recSelect = document.getElementById('trans-recurrence');
        if (recSelect) recSelect.value = '';
        const recEndGroup = document.getElementById('recurrence-end-group');
        if (recEndGroup) recEndGroup.style.display = 'none';

        const desc = document.getElementById('trans-desc');
        if (desc) desc.focus();

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

    const modalTitle = document.getElementById('transaction-modal-title');
    if (modalTitle) modalTitle.textContent = 'Nova Transação';

    const recSelect = document.getElementById('trans-recurrence');
    if (recSelect) recSelect.value = '';
    const recEnd = document.getElementById('trans-recurrence-end');
    if (recEnd) recEnd.value = '';
    const recEndGroup = document.getElementById('recurrence-end-group');
    if (recEndGroup) recEndGroup.style.display = 'none';
}

// =====================================================================
// TEMA (corrige persistência do modo claro!)
// =====================================================================

const THEME_COLOR_DARK = '#07152d';
const THEME_COLOR_LIGHT = '#eaf1ff';

function syncThemeColorMeta(isDark) {
    const meta =
        document.getElementById('theme-color-meta') ||
        document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
    }
}

export function initTheme() {
    const saved = localStorage.getItem('theme');
    const shouldBeDark = saved !== 'light';
    document.documentElement.classList.toggle('dark', shouldBeDark);
    syncThemeColorMeta(shouldBeDark);
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    syncThemeColorMeta(isDark);

    lastRenderedKey = '';
    renderCharts(allTransactions, isDark, getCurrentSelection());
    renderProjection(allTransactions, currentDateSelection);
}

// =====================================================================
// SONS (com cache e fallback para arquivos existentes)
// =====================================================================

const audioCache = new Map();

export function isSoundEnabled() {
    return localStorage.getItem('vaulta-sound-enabled') !== 'false';
}

export function setSoundEnabled(enabled) {
    localStorage.setItem('vaulta-sound-enabled', String(enabled));
    const button = document.getElementById('sound-toggle');
    if (button) {
        button.classList.toggle('muted', !enabled);
        button.title = enabled ? 'Som ativado' : 'Som desativado';
        button.setAttribute('aria-label', enabled ? 'Desativar som' : 'Ativar som');
    }
}

function playAudio(path, volume = 0.7) {
    if (!isSoundEnabled()) return;

    let audio = audioCache.get(path);
    if (!audio) {
        audio = new Audio(path);
        audio.preload = 'auto';
        audioCache.set(path, audio);
    }
    audio.volume = volume;
    try {
        audio.currentTime = 0;
    } catch {}
    audio.play().catch(() => {});
}

export function playSuccessSound() {
    playAudio('./media/correct.mp3', 0.7);
}
export function playUiSelectionSound() {
    playAudio('./media/ui-selection.mp3', 0.65);
}
export function playUiUnselectionSound() {
    playAudio('./media/ui-selection.mp3', 0.35);
}
export function playDeleteSound() {
    playAudio('./media/exclusao.mp3', 0.8);
}

// =====================================================================
// TOASTS (com sanitização contra XSS)
// =====================================================================

export function showToast(message, type = 'success', options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const { onUndo, undoLabel = 'Desfazer', duration = 3000 } = options;

    if (onUndo) {
        const toast = document.createElement('div');
        toast.className = 'toast-undo';
        toast.innerHTML = `
            <i class="ri-check-line" style="font-size:18px;color:#78e5a1;"></i>
            <span class="toast-undo-text">${escapeHTML(message)}</span>
            <button type="button" class="toast-undo-btn">${escapeHTML(undoLabel)}</button>
        `;

        let resolved = false;
        const dismiss = (runUndo) => {
            if (resolved) return;
            resolved = true;
            if (runUndo && onUndo) {
                try {
                    onUndo();
                } catch (e) {
                    console.error(e);
                }
            }
            toast.classList.add('toast-leaving');
            setTimeout(() => toast.remove(), 220);
        };

        toast.querySelector('.toast-undo-btn').addEventListener('click', () => dismiss(true));
        container.appendChild(toast);
        setTimeout(() => dismiss(false), duration);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconSpan = document.createElement('span');
    iconSpan.textContent = type === 'success' ? '✅' : '❌';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = String(message ?? '');

    toast.append(iconSpan, ' ', msgSpan);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

export function showConfirmToast(
    message,
    { confirmLabel = 'Confirmar', iconClass = 'ri-question-line' } = {}
) {
    return new Promise((resolve) => {
        const container = document.getElementById('toast-container');
        if (!container) {
            resolve(false);
            return;
        }

        const toast = document.createElement('div');
        toast.className = 'toast toast-confirmation';

        const icon = document.createElement('span');
        icon.className = 'toast-confirmation-icon';
        const iEl = document.createElement('i');
        iEl.className = iconClass;
        icon.appendChild(iEl);

        const content = document.createElement('div');
        content.className = 'toast-confirmation-content';

        const text = document.createElement('p');
        text.textContent = message;

        const actions = document.createElement('div');
        actions.className = 'toast-confirmation-actions';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'toast-action toast-action-secondary';
        cancelButton.textContent = 'Cancelar';

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'toast-action toast-action-primary';
        confirmButton.textContent = confirmLabel;

        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            toast.classList.add('toast-leaving');
            setTimeout(() => toast.remove(), 220);
            resolve(value);
        };

        cancelButton.addEventListener('click', () => finish(false));
        confirmButton.addEventListener('click', () => finish(true));

        actions.append(cancelButton, confirmButton);
        content.append(text, actions);
        toast.append(icon, content);
        container.appendChild(toast);

        setTimeout(() => finish(false), 8000);
    });
}

// =====================================================================
// SELEÇÃO DE MÊS (sem overflow em dias 29-31)
// =====================================================================

export function getCurrentSelection() {
    return {
        month: currentDateSelection.getMonth(),
        year: currentDateSelection.getFullYear(),
    };
}

export function changeSelectedMonth(offset) {
    playUiSelectionSound();

    currentDateSelection = addMonthsSafe(currentDateSelection, offset);
    updateMonthDisplay();

    if (document.getElementById('transaction-modal')?.classList.contains('active')) {
        syncNewTransactionDateToSelectedMonth();
    }

    updateDashboardUI(allTransactions);

    const selection = getCurrentSelection();
    window.dispatchEvent(new CustomEvent('month-changed', { detail: selection }));
}

export function updateMonthDisplay() {
    if (!currentDateSelection) {
        const now = new Date();
        currentDateSelection = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];

    const textoFinal = `${meses[currentDateSelection.getMonth()]} de ${currentDateSelection.getFullYear()}`;

    const displayOverview = document.getElementById('current-month-display');
    if (displayOverview) displayOverview.textContent = textoFinal;

    const displayList = document.getElementById('current-month-display-list');
    if (displayList) displayList.textContent = textoFinal;

    const displayMonthly = document.getElementById('current-month-display-monthly');
    if (displayMonthly) displayMonthly.textContent = textoFinal;
}

// =====================================================================
// INSIGHTS (XSS-safe)
// =====================================================================

export function renderInsights(insights) {
    const section = document.getElementById('insights-section');
    const grid = document.getElementById('insights-grid');
    if (!section || !grid) return;

    if (!insights || insights.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    grid.innerHTML = insights
        .map(
            (i) => `
                <div class="insight-card insight-${escapeHTML(i.type)}">
                    <div class="insight-icon"><i class="${escapeHTML(i.icon)}"></i></div>
                    <div class="insight-info">
                        <div class="insight-title">${escapeHTML(i.title)}</div>
                        <div class="insight-message">${escapeHTML(i.message)}</div>
                    </div>
                </div>
            `
        )
        .join('');
}

export function updateVariationBadge(transactions, refDate = currentDateSelection) {
    const badge = document.getElementById('variation-badge');
    const btn = document.getElementById('variation-toggle');
    if (!badge || !btn) return;

    const report = compareTransactionsMonthOverMonth(transactions, refDate);
    if (report.increasesCount > 0) {
        badge.textContent = report.increasesCount > 9 ? '9+' : String(report.increasesCount);
        badge.style.display = 'inline-flex';
        btn.title = `${report.increasesCount} ${report.increasesCount === 1 ? 'conta aumentou' : 'contas aumentaram'} de ${report.prevLabel} para ${report.curLabel}`;
    } else {
        badge.style.display = 'none';
        btn.title = `Variação mensal (${report.prevLabel} → ${report.curLabel})`;
    }
}

export function renderVariationModal(transactions, refDate = currentDateSelection, options = {}) {
    const filter = options.filter || 'all';
    const search = String(options.search || '').trim().toLowerCase();

    const captionEl = document.getElementById('variation-period-caption');
    const summaryEl = document.getElementById('variation-summary-strip');
    const listEl = document.getElementById('variation-list');
    if (!listEl) return;

    const report = compareTransactionsMonthOverMonth(transactions, refDate);

    if (captionEl) {
        captionEl.textContent = `Comparando despesas recorrentes de ${report.prevLabel} → ${report.curLabel}`;
    }

    if (summaryEl) {
        const netSign = report.netDiff > 0 ? '+' : '';
        const netClass = report.netDiff > 0.005 ? 'is-up' : report.netDiff < -0.005 ? 'is-down' : 'is-same';
        summaryEl.innerHTML = `
            <div class="variation-stat-box is-up">
                <span class="variation-stat-label">Aumentaram</span>
                <strong class="variation-stat-val">${report.increasesCount}</strong>
            </div>
            <div class="variation-stat-box is-down">
                <span class="variation-stat-label">Diminuíram</span>
                <strong class="variation-stat-val">${report.decreasesCount}</strong>
            </div>
            <div class="variation-stat-box ${netClass}">
                <span class="variation-stat-label">Saldo comparável</span>
                <strong class="variation-stat-val">${netSign}${formatSignedCurrency(report.netDiff).replace(/^\+\+/, '+')}</strong>
            </div>
        `;
    }

    let items = report.items;
    if (filter === 'up') items = items.filter((i) => i.direction === 'up');
    else if (filter === 'down') items = items.filter((i) => i.direction === 'down');

    if (search) {
        items = items.filter(
            (i) =>
                i.description.toLowerCase().includes(search) ||
                i.category.toLowerCase().includes(search)
        );
    }

    if (items.length === 0) {
        const emptyMsg = report.items.length === 0
            ? `Nenhuma despesa com o mesmo nome encontrada em ${report.prevLabel} e ${report.curLabel}.`
            : 'Nenhuma conta corresponde ao filtro selecionado.';
        listEl.innerHTML = `<div class="notes-empty">${escapeHTML(emptyMsg)}</div>`;
        return;
    }

    listEl.innerHTML = items
        .map((item) => {
            const pctAbs = Math.abs(item.pct).toLocaleString('pt-BR', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            });
            const pctText =
                item.direction === 'up'
                    ? `+${pctAbs}%`
                    : item.direction === 'down'
                    ? `-${pctAbs}%`
                    : '0,0%';
            const diffText =
                item.direction === 'same'
                    ? 'Sem alteração'
                    : `${item.diff > 0 ? '+' : '-'}${formatCurrency(Math.abs(item.diff))}`;
            const arrowIcon =
                item.direction === 'up'
                    ? 'ri-arrow-up-line'
                    : item.direction === 'down'
                    ? 'ri-arrow-down-line'
                    : 'ri-subtract-line';

            return `
                <div class="variation-item is-${item.direction}">
                    <div class="variation-item-info">
                        <div class="variation-item-title-row">
                            <span class="variation-item-name">${escapeHTML(item.description)}</span>
                            <span class="variation-item-cat">${escapeHTML(item.category)}</span>
                        </div>
                        <div class="variation-item-values">
                            <span>${escapeHTML(report.prevLabel)}: <strong>${formatCurrency(item.prevAmount)}</strong></span>
                            <i class="ri-arrow-right-line"></i>
                            <span>${escapeHTML(report.curLabel)}: <strong>${formatCurrency(item.curAmount)}</strong></span>
                        </div>
                    </div>
                    <div class="variation-delta is-${item.direction}">
                        <span class="variation-delta-pct"><i class="${arrowIcon}"></i> ${pctText}</span>
                        <span class="variation-delta-diff">${diffText}</span>
                    </div>
                </div>
            `;
        })
        .join('');
}

export function updateInsights(transactions, refDate = currentDateSelection) {
    const insights = generateInsights(transactions, refDate);
    renderInsights(insights);
    updateVariationBadge(transactions, refDate);
}

// =====================================================================
// ORÇAMENTOS
// =====================================================================

export function renderBudgets(budgets, transactions, refDate = currentDateSelection) {
    const grid = document.getElementById('budgets-grid');
    if (!grid) return;

    const status = generateBudgetStatus(budgets, transactions, refDate);

    if (status.length === 0) {
        grid.innerHTML = `<div class="notes-empty">Nenhum orçamento definido para este mês.</div>`;
        return;
    }

    grid.innerHTML = status
        .map(
            (b) => `
                <div class="budget-card status-${escapeHTML(b.status)}" data-id="${escapeHTML(b.id)}">
                    <div class="budget-header">
                        <span class="budget-category">${escapeHTML(b.category)}</span>
                        <button type="button" class="budget-remove" data-id="${escapeHTML(b.id)}" title="Remover" aria-label="Remover orçamento">
                            <i class="ri-close-line"></i>
                        </button>
                    </div>
                    <div class="budget-values">
                        <span class="budget-spent">${formatCurrency(b.spent)}</span>
                        <span>de ${formatCurrency(b.amount)}</span>
                    </div>
                    <div class="budget-progress">
                        <div class="budget-progress-fill" style="width: ${Math.min(b.percentage, 100)}%"></div>
                    </div>
                    <div class="budget-pct">${b.percentage.toFixed(0)}%</div>
                </div>
            `
        )
        .join('');
}

// =====================================================================
// METAS
// =====================================================================

export function renderGoals(goals) {
    const grid = document.getElementById('goals-grid');
    if (!grid) return;

    if (!goals || goals.length === 0) {
        grid.innerHTML = `<div class="notes-empty">Nenhuma meta cadastrada.</div>`;
        return;
    }

    grid.innerHTML = goals
        .map((g) => {
            const safeId = escapeHTML(g.id);
            const current = Number(g.current_amount || 0);
            const target = Number(g.target_amount || 0);
            const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

            const deadlineDate = g.deadline ? new Date(`${String(g.deadline).slice(0, 10)}T12:00:00`) : null;
            const deadline = deadlineDate ? deadlineDate.toLocaleDateString('pt-BR') : 'Sem prazo';

            const remaining = target - current;
            let monthlyHint = '';

            if (remaining <= 0) {
                monthlyHint = `<div class="goal-monthly-hint success">Meta alcançada! 🎉</div>`;
            } else if (deadlineDate) {
                const today = new Date();
                const monthsDiff =
                    (deadlineDate.getFullYear() - today.getFullYear()) * 12 +
                    (deadlineDate.getMonth() - today.getMonth());

                if (monthsDiff <= 0) {
                    monthlyHint = `<div class="goal-monthly-hint warning">Prazo próximo ou esgotado. Faltam ${formatCurrency(remaining)}.</div>`;
                } else {
                    const monthsToSave = monthsDiff + 1;
                    const monthlyNeeded = remaining / monthsToSave;
                    monthlyHint = `<div class="goal-monthly-hint">Guarde <strong>${formatCurrency(monthlyNeeded)}</strong>/mês</div>`;
                }
            }

            return `
                <div class="goal-card" data-id="${safeId}">
                    <div class="goal-header">
                        <span class="goal-name">${escapeHTML(g.name)}</span>
                        <span class="goal-deadline">${escapeHTML(deadline)}</span>
                    </div>
                    <div class="goal-values">
                        <span class="goal-current">${formatCurrency(current)}</span>
                        <span class="goal-target">de ${formatCurrency(target)}</span>
                    </div>
                    <div class="goal-progress">
                        <div class="goal-progress-fill" style="width: ${pct}%"></div>
                    </div>
                    ${monthlyHint}
                    <div class="goal-actions" style="margin-top: ${monthlyHint ? '12px' : '0'};">
                        <button type="button" class="goal-add-btn" data-id="${safeId}">
                            <i class="ri-add-line"></i> Aportar
                        </button>
                        <button type="button" class="goal-remove-btn" data-id="${safeId}" aria-label="Excluir meta">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>
            `;
        })
        .join('');
}

// =====================================================================
// PROJEÇÃO
// =====================================================================

export function renderProjection(transactions, refDate = currentDateSelection) {
    const bankTotal = getTotalBankBalance();
    const projection = projectCashFlow(transactions, 3, refDate, {
        currentBankBalance: bankTotal,
    });

    const badge = document.getElementById('projection-source-badge');
    if (badge) {
        badge.textContent = projection.usedRealAccounts
            ? 'Base: contas + recorrências'
            : 'Base: histórico + recorrências';
    }

    renderProjectionChart(projection);
}

// =====================================================================
// BADGE DE RECORRÊNCIA NA TABELA
// =====================================================================

function recurrenceBadgeHTML(t) {
    if (!t.recurrence) return '';
    const icon = RECURRENCE_ICONS[t.recurrence] || 'ri-refresh-line';
    const label = RECURRENCE_LABELS[t.recurrence] || t.recurrence;
    return `<span class="recurrence-badge"><i class="${escapeHTML(icon)}"></i>${escapeHTML(label)}</span>`;
}
