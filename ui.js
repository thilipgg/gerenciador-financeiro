// import { removeTransaction, insertTransaction } from "./db.js";
import { removeTransaction, removeTransactionAndFuture } from './db.js';
import { renderCharts, renderProjectionChart } from "./chart-manager.js";
import {
  generateInsights,
  generateBudgetStatus,
  projectCashFlow,
} from "./insights.js";
import { RECURRENCE_ICONS, RECURRENCE_LABELS } from "./recurrence.js";

const CATEGORY_ICONS = {
  Alimentação: "🍔",
  Moradia: "🏠",
  Transporte: "🚗",
  Lazer: "🎉",
  Salário: "💼",
  Outros: "🏷️",
};

const DYNAMIC_CATEGORIES = {
  income: [
    { value: "Salário", label: "💼 Salário" },
    { value: "Outros", label: "🏷️ Outros" },
  ],
  expense: [
    { value: "Alimentação", label: "🍔 Alimentação" },
    { value: "Moradia", label: "🏠 Moradia" },
    { value: "Transporte", label: "🚗 Transporte" },
    { value: "Lazer", label: "🎉 Lazer" },
    { value: "Outros", label: "🏷️ Outros" },
  ],
};

let currentTransactionsList = [];
window.allTransactions = [];
let currentSort = { key: null, dir: "asc" };
let currentDateSelection = new Date();

// Chave usada para evitar redesenhar os gráficos quando nada mudou
let lastRenderedKey = "";

// =====================================================================
// HELPERS
// =====================================================================

export function debounce(fn, wait = 160) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function getComparisonDate(transaction) {
  return transaction?.due_date || transaction?.date || null;
}

function isOverdueTransaction(transaction) {
  const comparisonDate = getComparisonDate(transaction);
  if (!comparisonDate) return false;

  const dueDate = new Date(`${comparisonDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return dueDate < today;
}

// =====================================================================
// ORDENAÇÃO
// =====================================================================

export function setSort(key) {
  if (!key) return;
  if (currentSort.key === key) {
    currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
  } else {
    currentSort.key = key;
    currentSort.dir = "asc";
  }

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.key === currentSort.key) {
      th.classList.add(
        currentSort.dir === "asc" ? "sorted-asc" : "sorted-desc",
      );
    }
  });

  filterAndRenderTransactions();
}

function applySorting(arr) {
  if (!currentSort.key) return arr;
  const key = currentSort.key;
  const dir = currentSort.dir === "asc" ? 1 : -1;

  return arr.slice().sort((a, b) => {
    const va = a[key] !== undefined && a[key] !== null ? a[key] : "";
    const vb = b[key] !== undefined && b[key] !== null ? b[key] : "";

    if (key === "amount") {
      const na = parseFloat(va) || 0;
      const nb = parseFloat(vb) || 0;
      return (na - nb) * dir;
    }

    if (key === "date") {
      const da = va ? new Date(String(va)) : new Date(0);
      const db = vb ? new Date(String(vb)) : new Date(0);
      return (da - db) * dir;
    }

    if (key === "due_date") {
      const da = va ? new Date(String(va)) : new Date(9999, 11, 31);
      const db = vb ? new Date(String(vb)) : new Date(9999, 11, 31);
      return (da - db) * dir;
    }

    return (
      String(va).localeCompare(String(vb), "pt-BR", { sensitivity: "base" }) *
      dir
    );
  });
}

// =====================================================================
// TELAS
// =====================================================================

export function showLoginScreen() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("dashboard-screen").style.display = "none";
}

export function showDashboardScreen(user, isDemo) {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("dashboard-screen").style.display = "flex";

  const avatarEl = document.getElementById("user-avatar");
  const nameEl = document.getElementById("user-name");
  const badgeEl = document.getElementById("demo-badge");

  const avatarUrl = String(user.user_metadata?.avatar_url || "");
  if (avatarEl)
    avatarEl.src = /^https?:\/\//i.test(avatarUrl)
      ? avatarUrl
      : "https://api.dicebear.com/7.x/adventurer/svg?seed=user";
  if (nameEl) nameEl.textContent = user.user_metadata?.full_name || user.email;
  if (badgeEl) badgeEl.style.display = isDemo ? "inline-block" : "none";
}

// =====================================================================
// DASHBOARD
// =====================================================================

export function updateDashboardUI(transactions) {
  const listToUse = transactions || window.allTransactions || [];

  if (transactions && transactions.length > 0) {
    window.allTransactions = transactions;
  }

  const transactionsForSelectedMonth = listToUse.filter((t) => {
    if (!t.date) return false;
    const txDate = new Date(t.date + "T12:00:00");
    return (
      txDate.getMonth() === currentDateSelection.getMonth() &&
      txDate.getFullYear() === currentDateSelection.getFullYear()
    );
  });

  currentTransactionsList = transactionsForSelectedMonth;
  filterAndRenderTransactions();
  refreshMonthlyBudgetDashboard();

  let totalIncome = 0;
  let totalExpense = 0;
  let pendingExpenses = 0;
  let overdueExpenses = 0;

  transactionsForSelectedMonth.forEach((t) => {
    const amt = parseFloat(t.amount) || 0;
    const normalizedType = String(t.type).toLowerCase().trim();
    const isIncome =
      normalizedType === "income" || normalizedType === "receita";
    const status = String(t.paid_status || "paid")
      .toLowerCase()
      .trim();

    if (isIncome) {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      if (status === "pending") {
        pendingExpenses += amt;
        if (isOverdueTransaction(t)) {
          overdueExpenses += amt;
        }
      }
    }
  });

  const balance = totalIncome - totalExpense;
  const availableBalance = totalIncome - (totalExpense - pendingExpenses);

  const balEl = document.getElementById("val-balance");
  if (balEl) {
    balEl.textContent = formatSignedCurrency(balance);
    balEl.className =
      balance >= 0 ? "widget-value text-success" : "widget-value text-danger";
  }

  const incEl = document.getElementById("val-income");
  if (incEl) incEl.textContent = formatCurrency(totalIncome);

  const expEl = document.getElementById("val-expense");
  if (expEl) expEl.textContent = formatCurrency(totalExpense);

  const pendingEl = document.getElementById("val-pending");
  if (pendingEl) pendingEl.textContent = formatCurrency(pendingExpenses);

  const overdueEl = document.getElementById("val-overdue");
  if (overdueEl) overdueEl.textContent = formatCurrency(overdueExpenses);

  const availEl = document.getElementById("val-available");
  if (availEl) {
    availEl.textContent = formatSignedCurrency(availableBalance);
    availEl.className =
      availableBalance >= 0
        ? "widget-value text-success"
        : "widget-value text-danger";
  }

  // Insights + projeção sempre recalculados com a base toda
  updateInsights(window.allTransactions || [], currentDateSelection);
  renderProjection(window.allTransactions || [], currentDateSelection);
}

// =====================================================================
// CONTROLE MENSAL (saldo das contas)
// =====================================================================

let saveBalanceTimer = null;
function scheduleBalanceSave(values) {
  clearTimeout(saveBalanceTimer);
  saveBalanceTimer = setTimeout(() => {
    try {
      localStorage.setItem("monthly-bank-balances", JSON.stringify(values));
    } catch (err) {
      console.error("Erro ao salvar saldos bancários:", err);
    }
  }, 400);
}

export function refreshMonthlyBudgetDashboard() {
  const pendingValueEl = document.querySelector("#card-pendencias .span-valor");
  const banksValueEl = document.querySelector("#card-total-bancos .span-valor");
  const finalValueEl = document.querySelector("#card-resultado .span-valor");

  if (!pendingValueEl || !banksValueEl || !finalValueEl) return;

  const selectedMonth = getCurrentSelection();
  const monthTransactions = (window.allTransactions || []).filter((t) => {
    if (!t.date) return false;
    const txDate = new Date(t.date + "T12:00:00");
    return (
      txDate.getMonth() === selectedMonth.month &&
      txDate.getFullYear() === selectedMonth.year
    );
  });

  const pendingThisMonth = monthTransactions.reduce((sum, t) => {
    const amount = Number(t.amount) || 0;
    const normalizedType = String(t.type || "")
      .toLowerCase()
      .trim();
    const isExpense =
      normalizedType !== "income" && normalizedType !== "receita";
    const status = String(t.paid_status || "paid")
      .toLowerCase()
      .trim();

    if (isExpense && status === "pending") {
      return sum + amount;
    }
    return sum;
  }, 0);

  const bankInputs = [...document.querySelectorAll(".monthly-account-input")];

  const bankTotal = bankInputs.reduce((sum, input) => {
    const parsed = parseFloat(String(input.value || "").replace(",", "."));
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

  const finalBalance = bankTotal - pendingThisMonth;

  pendingValueEl.textContent = formatCurrency(pendingThisMonth);
  pendingValueEl.classList.toggle("valor-negativo", pendingThisMonth > 0);
  pendingValueEl.classList.toggle("valor-positivo", pendingThisMonth === 0);

  banksValueEl.textContent = formatCurrency(bankTotal);
  banksValueEl.classList.toggle("valor-positivo", bankTotal >= 0);
  banksValueEl.classList.remove("valor-negativo");

  finalValueEl.textContent = formatCurrency(finalBalance);
  finalValueEl.classList.toggle("valor-negativo", finalBalance < 0);
  finalValueEl.classList.toggle("valor-positivo", finalBalance >= 0);

  const savedBalances = bankInputs.map((input) => input.value || "0");
  scheduleBalanceSave(savedBalances);
}

// =====================================================================
// LISTA / TABELA
// =====================================================================

export function filterAndRenderTransactions() {
  const searchInput = document.getElementById("search-input");
  const filterSelect = document.getElementById("filter-select");
  const statusFilter = document.getElementById("status-filter");

  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
  const filterType = filterSelect ? filterSelect.value : "all";
  const filterStatus = statusFilter ? statusFilter.value : "all";

  const startVal = document.getElementById("filter-start-date")?.value;
  const endVal = document.getElementById("filter-end-date")?.value;
  const startDate = startVal ? new Date(startVal + "T00:00:00") : null;
  const endDate = endVal ? new Date(endVal + "T23:59:59") : null;

  const baseList = window.allTransactions || [];

  const filtered = baseList.filter((t) => {
    const matchesSearch =
      (t.description || "").toLowerCase().includes(searchTerm) ||
      (t.category || "").toLowerCase().includes(searchTerm);

    const normalizedType = String(t.type).toLowerCase().trim();
    const isIncome =
      normalizedType === "income" || normalizedType === "receita";

    const matchesType =
      filterType === "all" ||
      (filterType === "income" && isIncome) ||
      (filterType === "expense" && !isIncome);

    const status = String(t.paid_status || "paid")
      .toLowerCase()
      .trim();
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "paid" && status === "paid") ||
      (filterStatus === "pending" && status === "pending");

    if (!startVal && !endVal) {
      if (!t.date) return false;
      const txDate = new Date(t.date + "T12:00:00");
      const matchesMonth =
        txDate.getMonth() === currentDateSelection.getMonth() &&
        txDate.getFullYear() === currentDateSelection.getFullYear();
      if (!matchesMonth) return false;
    } else {
      if (!t.date) return false;
      const txDate = new Date(t.date + "T12:00:00");
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;
    }

    return matchesSearch && matchesType && matchesStatus;
  });

  const sorted = applySorting(filtered);
  renderTable(sorted);

  // Só redesenha os gráficos se o contexto (mês + volume) mudou
  const chartKey = `${currentDateSelection.getMonth()}-${currentDateSelection.getFullYear()}-${baseList.length}-${sorted.length}`;
  if (chartKey !== lastRenderedKey) {
    lastRenderedKey = chartKey;
    const isDarkTheme = document.documentElement.classList.contains("dark");
    requestAnimationFrame(() => {
      renderCharts(baseList, isDarkTheme);
    });
  }
}

function renderTable(transactions) {
  const tbody = document.getElementById("transactions-tbody");
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 20px;">Nenhuma transação encontrada.</td></tr>`;
    const mobileListEmpty = document.getElementById("mobile-transactions-list");
    if (mobileListEmpty)
      mobileListEmpty.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">Nenhuma transação encontrada.</div>`;
    return;
  }

  tbody.innerHTML = transactions
    .map((t) => {
      const icon = CATEGORY_ICONS[t.category] || "🏷️";
      const normalizedType = String(t.type).toLowerCase().trim();
      const isIncome =
        normalizedType === "income" || normalizedType === "receita";

      const amountClass = isIncome ? "amount-income" : "amount-expense";
      const amountPrefix = isIncome ? "+ " : "- ";

      const statusValue = String(t.paid_status || "paid")
        .toLowerCase()
        .trim();
      const dueDate = t.due_date ? formatDate(t.due_date) : "-";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isOverdue =
        t.due_date &&
        new Date(t.due_date + "T00:00:00") < today &&
        statusValue === "pending";
      const dueDateClass = isOverdue ? "overdue" : "";

      return `
            <tr class="animate-fade">
                <td class="td-description">${escapeHTML(t.description)}${recurrenceBadgeHTML(t)}</td>
                <td class="${amountClass}" style="font-variant-numeric: tabular-nums;">
                    ${amountPrefix}${formatCurrency(t.amount)}
                </td>
                <td><span class="td-category">${icon} ${escapeHTML(t.category)}</span></td>
                <td><span class="tx-status ${statusValue === "paid" ? "status-paid" : "status-pending"}">${statusValue === "paid" ? "Pago" : "Pendente"}</span></td>
                <td style="color: var(--text-muted);">${formatDate(t.date)}</td>
                <td class="${dueDateClass}" style="font-weight: ${isOverdue ? "700" : "400"}; color: ${isOverdue ? "var(--danger)" : "var(--text-muted)"};">${dueDate}</td>
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
    })
    .join("");

  const mobileList = document.getElementById("mobile-transactions-list");
  if (mobileList) {
    mobileList.innerHTML = transactions
      .map((t) => {
        const icon = CATEGORY_ICONS[t.category] || "🏷️";
        const normalizedType = String(t.type).toLowerCase().trim();
        const isIncome =
          normalizedType === "income" || normalizedType === "receita";
        const amountClass = isIncome ? "amount-income" : "amount-expense";
        const amountPrefix = isIncome ? "+ " : "- ";
        const statusValue = String(t.paid_status || "paid")
          .toLowerCase()
          .trim();
        const displayDate = t.due_date
          ? formatDate(t.due_date)
          : formatDate(t.date);

        return `
                <div class="mobile-transaction-card glass animate-fade" data-id="${t.id}">
                    <div class="mobile-top">
                        <div class="mobile-desc">${escapeHTML(t.description)}${recurrenceBadgeHTML(t)}</div>
                        <div class="mobile-amount ${amountClass}">${amountPrefix}${formatCurrency(t.amount)}</div>
                    </div>
                    <div class="mobile-bottom">
                        <div class="mobile-meta">
                            <span class="mobile-category">${icon} ${escapeHTML(t.category)}</span>
                            <span class="tx-status ${statusValue === "paid" ? "status-paid" : "status-pending"}">${statusValue === "paid" ? "Pago" : "Pendente"}</span>
                            <span class="mobile-date">${displayDate}</span>
                        </div>
                        <div class="mobile-actions">
                            <button class="btn-edit" onclick="window.prepararEdicao('${t.id}')"><i class="ri-pencil-line"></i></button>
                            <button class="btn-delete" data-id="${t.id}"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    </div>
                </div>
            `;
      })
      .join("");
  }
}

// =====================================================================
// DELEGAÇÃO DE EVENTOS (listeners únicos nos containers)
// =====================================================================


let deleteDelegationBound = false;

export function bindDeleteDelegation() {
    if (deleteDelegationBound) return;
    deleteDelegationBound = true;

    const pendingDeletes = new Map();

    const handler = async (e) => {
        const btn = e.target.closest('.btn-delete');
        if (!btn) return;

        const id = btn.dataset.id;
        if (!id) return;

        if (pendingDeletes.has(String(id))) return;

        const original = (window.allTransactions || []).find(t => String(t.id) === String(id));
        if (!original) return;

        // Detecta se é recorrente (template OU filho)
        const isRecurring = !!(original.recurrence || original.parent_id);

        if (isRecurring) {
            const scope = await askRecurrenceDeleteScope();
            if (scope === null) return; // cancelou

            if (scope === 'future') {
                try {
                    await removeTransactionAndFuture(id);
                    playDeleteSound();
                    showToast('Transação e futuras excluídas.', 'success');

                    const { fetchTransactions } = await import('./db.js');
                    window.allTransactions = await fetchTransactions();
                    updateDashboardUI(window.allTransactions);
                    window.dispatchEvent(new Event('transactions-updated'));
                } catch (err) {
                    console.error(err);
                    showToast('Erro ao excluir transações.', 'error');
                }
                return;
            }
            // scope === 'single' → segue para o fluxo com undo abaixo
        }

        // ---- Fluxo normal: delete otimista com undo ----
        window.allTransactions = window.allTransactions.filter(t => String(t.id) !== String(id));
        updateDashboardUI(window.allTransactions);
        playDeleteSound();

        const timerId = setTimeout(async () => {
            pendingDeletes.delete(String(id));
            try {
                await removeTransaction(id);
                window.dispatchEvent(new Event('transactions-updated'));
            } catch (err) {
                console.error('Erro ao excluir definitivamente:', err);
                window.allTransactions = [original, ...window.allTransactions];
                updateDashboardUI(window.allTransactions);
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
                window.allTransactions = [original, ...window.allTransactions];
                updateDashboardUI(window.allTransactions);
                showToast('Ação desfeita.', 'success');
            }
        });
    };

    document.getElementById('transactions-tbody')?.addEventListener('click', handler);
    document.getElementById('mobile-transactions-list')?.addEventListener('click', handler);
}

// ---------------------------------------------------------------
// Modal auxiliar: pergunta o escopo da exclusão
// Retorna 'single' | 'future' | null (cancelado)
// ---------------------------------------------------------------
function askRecurrenceDeleteScope() {
    return new Promise((resolve) => {
        const modal = document.getElementById('recurrence-delete-modal');
        if (!modal) { resolve('single'); return; }

        const confirmBtn = document.getElementById('confirm-recurrence-delete');
        const cancelBtn = document.getElementById('cancel-recurrence-delete');
        const radios = modal.querySelectorAll('input[name="recurrence-delete-scope"]');

        // Reset visual
        radios.forEach(r => { r.checked = r.value === 'single'; });

        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onEsc);
            resolve(value);
        };

        const onConfirm = () => {
            const checked = [...radios].find(r => r.checked);
            finish(checked ? checked.value : 'single');
        };
        const onCancel = () => finish(null);
        const onBackdrop = (ev) => { if (ev.target === ev.currentTarget) finish(null); };
        const onEsc = (ev) => { if (ev.key === 'Escape') finish(null); };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
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
  const budgetSelect = document.getElementById("budget-category");
  if (budgetSelect) {
    const opts = DYNAMIC_CATEGORIES.expense.filter((o) => o.value !== "Outros");
    budgetSelect.innerHTML = opts
      .map((o) => `<option value="${o.value}">${o.label}</option>`)
      .join("");
  }
  const categorySelect = document.getElementById("trans-category");
  if (!categorySelect) return;

  const options = DYNAMIC_CATEGORIES[type] || DYNAMIC_CATEGORIES["expense"];

  categorySelect.innerHTML = options
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");

  const customInput = document.getElementById("trans-custom-category");
  if (customInput) {
    customInput.style.display = "none";
    customInput.required = false;
    customInput.value = "";
  }

  try {
    if (type === "expense") {
      const defaultOption = "Moradia";
      const hasDefault = Array.from(categorySelect.options).some(
        (o) => o.value === defaultOption,
      );
      categorySelect.value = hasDefault
        ? defaultOption
        : categorySelect.options[0].value;
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

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultDateForSelectedMonth() {
  const selected = new Date(currentDateSelection);
  const now = new Date();
  const lastDayOfMonth = new Date(
    selected.getFullYear(),
    selected.getMonth() + 1,
    0,
  ).getDate();
  const day = Math.min(now.getDate(), lastDayOfMonth);

  return formatDateInput(
    new Date(selected.getFullYear(), selected.getMonth(), day),
  );
}

function syncNewTransactionDateToSelectedMonth() {
  const modal = document.getElementById("transaction-modal");
  const form = document.getElementById("transaction-form");
  const dateInput = document.getElementById("trans-date");

  if (!modal || !dateInput || !modal.classList.contains("active")) return;
  if (form?.dataset.editId) return;

  dateInput.value = getDefaultDateForSelectedMonth();

  const dueDateInput = document.getElementById("trans-due-date");
  if (dueDateInput && !dueDateInput.value) {
    dueDateInput.value = getDefaultDateForSelectedMonth();
  }
}

window.prepararEdicao = (id) => {
  const transacao = window.allTransactions.find(
    (t) => String(t.id) === String(id),
  );
  if (!transacao) return;

  const form = document.getElementById("transaction-form");
  if (form) form.dataset.editId = id;

  const normalizedType = String(transacao.type).toLowerCase().trim();
  const isIncome = normalizedType === "income" || normalizedType === "receita";
  const transactionType = isIncome ? "income" : "expense";

  document.getElementById("trans-desc").value = transacao.description;
  document.getElementById("trans-amount").value = transacao.amount;
  document.getElementById("trans-date").value = transacao.date;
  document.getElementById("trans-due-date").value = transacao.due_date || "";

  const typeInput = document.getElementById("trans-type");
  if (typeInput) typeInput.value = transactionType;

  const btnExpense = document.getElementById("btn-type-expense");
  const btnIncome = document.getElementById("btn-type-income");

  if (isIncome) {
    btnIncome?.classList.add("active");
    btnExpense?.classList.remove("active");
  } else {
    btnExpense?.classList.add("active");
    btnIncome?.classList.remove("active");
  }

  updateCategoryDropdown(transactionType);

  const categorySelect = document.getElementById("trans-category");
  const customInput = document.getElementById("trans-custom-category");

  const defaultOptions = DYNAMIC_CATEGORIES[transactionType].map(
    (opt) => opt.value,
  );

  if (defaultOptions.includes(transacao.category)) {
    categorySelect.value = transacao.category;
  } else {
    categorySelect.value = "Outros";
    customInput.style.display = "block";
    customInput.required = true;
    customInput.value = transacao.category;
  }

  const statusSelect = document.getElementById("trans-paid-status");
  if (statusSelect) statusSelect.value = transacao.paid_status || "paid";

  const modalTitle = document.querySelector(".modal-header h3");
  if (modalTitle) modalTitle.textContent = "Editar Transação";

  const recSelect = document.getElementById("trans-recurrence");
  if (recSelect) recSelect.value = transacao.recurrence || "";
  const recEnd = document.getElementById("trans-recurrence-end");
  if (recEnd) recEnd.value = transacao.recurrence_end || "";
  const recEndGroup = document.getElementById("recurrence-end-group");
  if (recEndGroup)
    recEndGroup.style.display = transacao.recurrence ? "grid" : "none";

  openModal(true);
};

export function openModal(isEditing = false) {
  const modal = document.getElementById("transaction-modal");
  if (modal) modal.classList.add("active");

  if (!isEditing) {
    syncNewTransactionDateToSelectedMonth();

    const recSelect = document.getElementById("trans-recurrence");
    if (recSelect) recSelect.value = "";
    const recEndGroup = document.getElementById("recurrence-end-group");
    if (recEndGroup) recEndGroup.style.display = "none";

    const desc = document.getElementById("trans-desc");
    if (desc) desc.focus();

    updateCategoryDropdown("expense");
    const statusSelect = document.getElementById("trans-paid-status");
    if (statusSelect) statusSelect.value = "pending";
  }
}

export function closeModal() {
  document.getElementById("transaction-modal")?.classList.remove("active");
  const form = document.getElementById("transaction-form");
  if (form) {
    form.reset();
    delete form.dataset.editId;
  }
  document.getElementById("btn-type-expense")?.classList.add("active");
  document.getElementById("btn-type-income")?.classList.remove("active");

  const typeInput = document.getElementById("trans-type");
  if (typeInput) typeInput.value = "expense";

  const customInput = document.getElementById("trans-custom-category");
  if (customInput) {
    customInput.style.display = "none";
    customInput.required = false;
    customInput.value = "";
  }

  const dueInput = document.getElementById("trans-due-date");
  if (dueInput) dueInput.value = "";

  const modalTitle = document.querySelector(".modal-header h3");
  if (modalTitle) modalTitle.textContent = "Nova Transação";

  const recSelect = document.getElementById("trans-recurrence");
  if (recSelect) recSelect.value = "";
  const recEnd = document.getElementById("trans-recurrence-end");
  if (recEnd) recEnd.value = "";
  const recEndGroup = document.getElementById("recurrence-end-group");
  if (recEndGroup) recEndGroup.style.display = "none";
}

// =====================================================================
// TEMA
// =====================================================================

const THEME_COLOR_DARK = "#07152d";
const THEME_COLOR_LIGHT = "#eaf1ff";

function syncThemeColorMeta(isDark) {
  const meta =
    document.getElementById("theme-color-meta") ||
    document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute("content", isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

export function initTheme() {
  if (localStorage.getItem("theme") === "dark")
    document.documentElement.classList.add("dark");
  syncThemeColorMeta(document.documentElement.classList.contains("dark"));
}

export function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  syncThemeColorMeta(isDark);

  // Invalida a chave para forçar o próximo renderCharts a redesenhar com o novo tema
  lastRenderedKey = "";
  renderCharts(window.allTransactions || [], isDark);
}

// =====================================================================
// SONS (com cache de instâncias)
// =====================================================================

const audioCache = new Map();

export function isSoundEnabled() {
  return localStorage.getItem("vaulta-sound-enabled") !== "false";
}

export function setSoundEnabled(enabled) {
  localStorage.setItem("vaulta-sound-enabled", String(enabled));
  const button = document.getElementById("sound-toggle");
  if (button) {
    button.classList.toggle("muted", !enabled);
    button.title = enabled ? "Som ativado" : "Som desativado";
    button.setAttribute("aria-label", enabled ? "Desativar som" : "Ativar som");
  }
}

function playAudio(path, volume = 0.7) {
  if (!isSoundEnabled()) return;

  let audio = audioCache.get(path);
  if (!audio) {
    audio = new Audio(path);
    audio.preload = "auto";
    audioCache.set(path, audio);
  }
  audio.volume = volume;
  try {
    audio.currentTime = 0;
  } catch {}
  audio.play().catch(() => {
    // Silencia falhas de reprodução até que o usuário interaja com a página.
  });
}

export function playSuccessSound() {
  playAudio("./media/correct.mp3", 0.7);
}
export function playUiSelectionSound() {
  playAudio("./media/ui-selection.mp3", 0.7);
}
export function playUiUnselectionSound() {
  playAudio("./media/ui-unselection.mp3", 0.7);
}
export function playDeleteSound() {
  playAudio("./media/exclusao.mp3", 0.8);
}

// =====================================================================
// TOASTS
// =====================================================================

export function showToast(message, type = "success", options = {}) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const { onUndo, undoLabel = "Desfazer", duration = 3000 } = options;

      if (onUndo) {
        const toast = document.createElement('div');
        toast.className = 'toast-undo';
        toast.innerHTML = `
            <i class="ri-check-line" style="font-size:18px;color:#78e5a1;"></i>
            <span class="toast-undo-text">${message}</span>
            <button type="button" class="toast-undo-btn">${undoLabel}</button>
        `;

        let resolved = false;

        const dismiss = (runUndo) => {
            if (resolved) return;
            resolved = true;
            if (runUndo && onUndo) {
                try { onUndo(); } catch (e) { console.error(e); }
            }
            toast.classList.add('toast-leaving');
            setTimeout(() => toast.remove(), 220);
        };

        toast.querySelector('.toast-undo-btn').addEventListener('click', () => dismiss(true));
        container.appendChild(toast);
        setTimeout(() => dismiss(false), duration);
        return;
    }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === "success" ? "✅" : "❌"}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

export function showConfirmToast(
  message,
  { confirmLabel = "Confirmar", iconClass = "ri-question-line" } = {},
) {
  return new Promise((resolve) => {
    const container = document.getElementById("toast-container");
    if (!container) {
      resolve(false);
      return;
    }

    const toast = document.createElement("div");
    toast.className = "toast toast-confirmation";

    const icon = document.createElement("span");
    icon.className = "toast-confirmation-icon";
    icon.innerHTML = `<i class="${iconClass}"></i>`;

    const content = document.createElement("div");
    content.className = "toast-confirmation-content";

    const text = document.createElement("p");
    text.textContent = message;

    const actions = document.createElement("div");
    actions.className = "toast-confirmation-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "toast-action toast-action-secondary";
    cancelButton.textContent = "Cancelar";

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "toast-action toast-action-primary";
    confirmButton.textContent = confirmLabel;

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      toast.classList.add("toast-leaving");
      setTimeout(() => toast.remove(), 220);
      resolve(value);
    };

    cancelButton.addEventListener("click", () => finish(false));
    confirmButton.addEventListener("click", () => finish(true));

    actions.append(cancelButton, confirmButton);
    content.append(text, actions);
    toast.append(icon, content);
    container.appendChild(toast);

    setTimeout(() => finish(false), 8000);
  });
}

// =====================================================================
// FORMATAÇÃO E SANITIZAÇÃO
// =====================================================================

function formatSignedCurrency(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatCurrency(v) {
  return Math.abs(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function escapeHTML(s) {
  return s
    ? s.replace(
        /[&<>'\"]/g,
        (t) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
          })[t] || t,
      )
    : "";
}

// =====================================================================
// SELEÇÃO DE MÊS
// =====================================================================

export function getCurrentSelection() {
  return {
    month: currentDateSelection.getMonth(),
    year: currentDateSelection.getFullYear(),
  };
}

export function changeSelectedMonth(offset) {
    playUiSelectionSound();

    currentDateSelection.setMonth(currentDateSelection.getMonth() + offset);
    updateMonthDisplay();

    // Só sincroniza o input do modal se ele estiver aberto
    if (document.getElementById('transaction-modal')?.classList.contains('active')) {
        syncNewTransactionDateToSelectedMonth();
    }

    // Atualiza a UI local com o que já está em memória
    updateDashboardUI(window.allTransactions);

    // Avisa o app.js para materializar recorrências e refazer o fetch do mês
    const selection = getCurrentSelection();
    window.dispatchEvent(new CustomEvent('month-changed', {
        detail: selection
    }));
}

export function updateMonthDisplay() {
  if (!currentDateSelection) currentDateSelection = new Date();

  const meses = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const mesNome = meses[currentDateSelection.getMonth()];
  const ano = currentDateSelection.getFullYear();
  const textoFinal = `${mesNome} de ${ano}`;

  const displayOverview = document.getElementById("current-month-display");
  if (displayOverview) displayOverview.textContent = textoFinal;

  const displayList = document.getElementById("current-month-display-list");
  if (displayList) displayList.textContent = textoFinal;
}

// =====================================================================
// INSIGHTS
// =====================================================================
export function renderInsights(insights) {
  const section = document.getElementById("insights-section");
  const grid = document.getElementById("insights-grid");
  if (!section || !grid) return;

  if (!insights || insights.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  grid.innerHTML = insights
    .map(
      (i) => `
        <div class="insight-card insight-${i.type}">
            <div class="insight-icon"><i class="${i.icon}"></i></div>
            <div class="insight-info">
                <div class="insight-title">${i.title}</div>
                <div class="insight-message">${i.message}</div>
            </div>
        </div>
    `,
    )
    .join("");
}

export function updateInsights(transactions, refDate = currentDateSelection) {
  const insights = generateInsights(transactions, refDate);
  renderInsights(insights);
}

// =====================================================================
// ORÇAMENTOS
// =====================================================================
export function renderBudgets(
  budgets,
  transactions,
  refDate = currentDateSelection,
) {
  const grid = document.getElementById("budgets-grid");
  if (!grid) return;

  const status = generateBudgetStatus(budgets, transactions, refDate);

  if (status.length === 0) {
    grid.innerHTML = `<div class="notes-empty">Nenhum orçamento definido para este mês.</div>`;
    return;
  }

  grid.innerHTML = status
    .map(
      (b) => `
        <div class="budget-card status-${b.status}" data-id="${b.id}">
            <div class="budget-header">
                <span class="budget-category">${escapeHTML(b.category)}</span>
                <button type="button" class="budget-remove" data-id="${b.id}" title="Remover">
                    <i class="ri-close-line"></i>
                </button>
            </div>
            <div class="budget-values">
                <span class="budget-spent">R$ ${b.spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span>de R$ ${Number(b.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="budget-progress">
                <div class="budget-progress-fill" style="width: ${Math.min(b.percentage, 100)}%"></div>
            </div>
            <div class="budget-pct">${b.percentage.toFixed(0)}%</div>
        </div>
    `,
    )
    .join("");
}

// =====================================================================
// METAS
// =====================================================================
export function renderGoals(goals) {
  const grid = document.getElementById("goals-grid");
  if (!grid) return;

  if (!goals || goals.length === 0) {
    grid.innerHTML = `<div class="notes-empty">Nenhuma meta cadastrada.</div>`;
    return;
  }

  grid.innerHTML = goals
    .map((g) => {
      const current = Number(g.current_amount || 0);
      const target = Number(g.target_amount || 0);
      const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
      const deadline = g.deadline
        ? new Date(g.deadline + "T12:00:00").toLocaleDateString("pt-BR")
        : "Sem prazo";

      return `
            <div class="goal-card" data-id="${g.id}">
                <div class="goal-header">
                    <span class="goal-name">${escapeHTML(g.name)}</span>
                    <span class="goal-deadline">${deadline}</span>
                </div>
                <div class="goal-values">
                    <span class="goal-current">R$ ${current.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span class="goal-target">de R$ ${target.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="goal-progress">
                    <div class="goal-progress-fill" style="width: ${pct}%"></div>
                </div>
                <div class="goal-actions">
                    <button type="button" class="goal-add-btn" data-id="${g.id}">
                        <i class="ri-add-line"></i> Aportar
                    </button>
                    <button type="button" class="goal-remove-btn" data-id="${g.id}">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `;
    })
    .join("");
}

// =====================================================================
// PROJEÇÃO
// =====================================================================
export function renderProjection(transactions, refDate = currentDateSelection) {
  const projection = projectCashFlow(transactions, 3, refDate);
  renderProjectionChart(projection);
}

// =====================================================================
// BADGE DE RECORRÊNCIA NA TABELA
// =====================================================================
function recurrenceBadgeHTML(t) {
  if (!t.recurrence) return "";
  const icon = RECURRENCE_ICONS[t.recurrence] || "ri-refresh-line";
  const label = RECURRENCE_LABELS[t.recurrence] || t.recurrence;
  return `<span class="recurrence-badge"><i class="${icon}"></i>${label}</span>`;
}
