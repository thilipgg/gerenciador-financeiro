import {
    fetchAccounts,
    fetchBudgets,
    fetchGoalContributions,
    fetchGoals,
    fetchNotes,
    fetchTransactions,
    insertGoal,
    insertGoalContribution,
    insertNote,
    insertTransaction,
    isDemoMode,
    loginComEmail,
    logout,
    materializeRecurrences,
    recalculateGoalTotal,
    removeBudget,
    removeGoal,
    removeGoalContribution,
    removeNote,
    replicarTransacoesParaProximoMes,
    saveAccounts,
    setDemoMode,
    supabase,
    updateGoalContribution,
    updateNote,
    updateTransaction,
    upsertBudget,
} from './db.js';

import {
    bindMonthlyAccountsDelegation,
    bindTransactionDelegation,
    changeSelectedMonth,
    closeModal,
    debounce,
    filterAndRenderTransactions,
    getAllTransactions,
    getCurrentSelection,
    getFilteredTransactionsForSelectedMonth,
    getMonthlyAccounts,
    initTheme,
    isSoundEnabled,
    openModal,
    playDeleteSound,
    playSuccessSound,
    playUiSelectionSound,
    playUiUnselectionSound,
    refreshMonthlyBudgetDashboard,
    renderBudgets,
    renderGoals,
    renderProjection,
    setDashboardLoading,
    setMonthlyAccounts,
    setSoundEnabled,
    setSort,
    showConfirmToast,
    showDashboardScreen,
    showLoginScreen,
    showToast,
    toggleTheme,
    updateCategoryDropdown,
    updateDashboardUI,
    updateInsights,
    updateMonthDisplay,
} from './ui.js';

import {
    checkDueDates,
    getNotificationPermission,
    requestNotificationPermission,
} from './notifications.js';
import { exportNotesCSV, exportTransactionsCSV } from './export.js';
import {
    escapeHTML,
    formatCurrency,
    formatDateISO,
    getMonthKey,
    getNextMonthDateString,
    isTransactionInMonth,
    parseAmount,
} from './utils.js';

// Estado da aplicação
let currentAppUser = null;
let currentBudgets = [];
let currentGoals = [];
let currentNotesCache = [];
let editingNoteId = null;
let notesSearchTerm = '';

// =====================================================================
// PROTEÇÃO CONTRA DOUBLE-SUBMIT
// =====================================================================

async function withSubmitLock(button, fn, loadingText = 'Salvando...') {
    if (!button) return await fn();
    if (button.dataset.submitting === 'true') return;

    const originalHTML = button.innerHTML;
    button.dataset.submitting = 'true';
    button.disabled = true;
    button.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> ${escapeHTML(loadingText)}`;

    try {
        return await fn();
    } finally {
        button.dataset.submitting = 'false';
        button.disabled = false;
        button.innerHTML = originalHTML;
    }
}

// =====================================================================
// AVATAR EDITOR
// =====================================================================

const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const AVATAR_MAX_SAVED_BYTES = 100 * 1024;
const avatarEditorState = { image: null, sourceUrl: null };

function getAvatarStorageKey(user = currentAppUser) {
    return user?.id ? `vaulta-avatar-${user.id}` : 'vaulta-avatar-guest';
}

function applySavedAvatar(user = currentAppUser) {
    const avatar = localStorage.getItem(getAvatarStorageKey(user));
    const el = document.getElementById('user-avatar');
    if (avatar && el) el.src = avatar;
}

function setAvatarEditorStatus(message, isError = false) {
    const status = document.getElementById('avatar-editor-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
}

function updateAvatarPreview() {
    const preview = document.getElementById('avatar-crop-preview');
    const zoom = Number(document.getElementById('avatar-zoom')?.value || 1);
    const x = Number(document.getElementById('avatar-x')?.value || 50);
    const y = Number(document.getElementById('avatar-y')?.value || 50);
    const image = avatarEditorState.image;

    if (!preview || !image || !avatarEditorState.sourceUrl) return;

    const coverScale = Math.max(256 / image.naturalWidth, 256 / image.naturalHeight);
    const width = image.naturalWidth * coverScale * zoom;
    const height = image.naturalHeight * coverScale * zoom;
    preview.style.backgroundImage = `url("${avatarEditorState.sourceUrl}")`;
    preview.style.backgroundSize = `${(width / 256) * 100}% ${(height / 256) * 100}%`;
    preview.style.backgroundPosition = `${x}% ${y}%`;
}

function loadAvatarImage(sourceUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'));
        image.src = sourceUrl;
    });
}

async function setAvatarEditorImage(sourceUrl) {
    try {
        const image = await loadAvatarImage(sourceUrl);
        if (avatarEditorState.sourceUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(avatarEditorState.sourceUrl);
        }
        avatarEditorState.image = image;
        avatarEditorState.sourceUrl = sourceUrl;
        document.getElementById('avatar-zoom').value = '1';
        document.getElementById('avatar-x').value = '50';
        document.getElementById('avatar-y').value = '50';
        updateAvatarPreview();
        setAvatarEditorStatus('Imagem pronta. Ajuste o enquadramento antes de salvar.');
    } catch (error) {
        setAvatarEditorStatus(error.message, true);
    }
}

function cropAvatarToDataUrl() {
    const image = avatarEditorState.image;
    if (!image) throw new Error('Escolha uma imagem antes de salvar.');

    const zoom = Number(document.getElementById('avatar-zoom').value);
    const x = Number(document.getElementById('avatar-x').value) / 100;
    const y = Number(document.getElementById('avatar-y').value) / 100;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const coverScale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    const width = image.naturalWidth * coverScale;
    const height = image.naturalHeight * coverScale;
    context.drawImage(image, (size - width) * x, (size - height) * y, width, height);

    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > AVATAR_MAX_SAVED_BYTES && quality > 0.4) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    if (dataUrl.length > AVATAR_MAX_SAVED_BYTES) {
        throw new Error('A imagem continua grande demais. Escolha outra imagem.');
    }
    return dataUrl;
}

function resetAvatarEditor() {
    if (avatarEditorState.sourceUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarEditorState.sourceUrl);
    }
    avatarEditorState.image = null;
    avatarEditorState.sourceUrl = null;
    const preview = document.getElementById('avatar-crop-preview');
    if (preview) preview.style.backgroundImage = '';
    const urlInput = document.getElementById('avatar-url-input');
    if (urlInput) urlInput.value = '';
    const fileInput = document.getElementById('avatar-file-input');
    if (fileInput) fileInput.value = '';
    const zoom = document.getElementById('avatar-zoom');
    if (zoom) zoom.value = '1';
    const x = document.getElementById('avatar-x');
    if (x) x.value = '50';
    const y = document.getElementById('avatar-y');
    if (y) y.value = '50';
    setAvatarEditorStatus('Carregue uma imagem para começar. Arquivos de até 8 MB.');
}

function openAvatarEditor() {
    resetAvatarEditor();
    document.getElementById('avatar-crop-modal')?.classList.add('active');
}

function closeAvatarEditor() {
    document.getElementById('avatar-crop-modal')?.classList.remove('active');
    resetAvatarEditor();
}

// =====================================================================
// PWA — REGISTRO SEGURO DO SERVICE WORKER
// =====================================================================

if ('serviceWorker' in navigator && (window.isSecureContext || window.location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('Service Worker não pôde ser registrado:', err);
        });
    });
}

// =====================================================================
// MUDANÇA DE MÊS (substitui o antigo setInterval de 400ms)
// =====================================================================

window.addEventListener('month-changed', async (e) => {
    const { month, year } = e.detail;
    setDashboardLoading(true);
    try {
        const created = await materializeRecurrences(year, month, null);
        const transactions = created.length > 0 ? await fetchTransactions() : getAllTransactions();

        const monthKey = getMonthKey(year, month);
        currentBudgets = await fetchBudgets(monthKey);

        updateDashboardUI(transactions);
        renderBudgets(currentBudgets, transactions, { month, year });
    } catch (err) {
        console.error('Erro ao atualizar dados do mês:', err);
    } finally {
        setDashboardLoading(false);
    }
});

// =====================================================================
// INICIALIZAÇÃO DOM
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const btnVisitante = document.getElementById('btn-login-visitante');

    // ---- Login Real ----
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('user-email')?.value.trim();
        const password = document.getElementById('user-pass')?.value;

        if (!email || !password) {
            showToast('Por favor, preencha e-mail e senha.', 'error');
            return;
        }

        const btn = document.getElementById('btn-login-real');
        await withSubmitLock(btn, async () => {
            try {
                await loginComEmail(email, password);
            } catch (err) {
                console.error(err);
                const message = String(err?.message || '').toLowerCase();
                const isNetworkError = message.includes('failed to fetch') || message.includes('network');
                showToast(
                    isNetworkError
                        ? 'Não foi possível conectar ao Supabase. Verifique sua internet ou bloqueadores de conteúdo.'
                        : 'E-mail ou senha incorretos.',
                    'error'
                );
            }
        }, 'Entrando...');
    });

    // ---- Modo Visitante (100% funcional localmente!) ----
    btnVisitante?.addEventListener('click', async () => {
        setDemoMode(true);
        currentAppUser = {
            id: 'demo-user',
            email: 'demo@demo.com',
            user_metadata: { full_name: 'Visitante' },
        };
        showDashboardScreen(currentAppUser, true);
        applySavedAvatar(currentAppUser);
        await loadDashboardData();
        showToast('Modo Visitante ativado com dados locais.', 'success');
    });

    // ---- Recorrência no modal de transação ----
    document.getElementById('trans-recurrence')?.addEventListener('change', (e) => {
        const group = document.getElementById('recurrence-end-group');
        if (group) group.style.display = e.target.value ? 'grid' : 'none';
    });

    // ---- Exportação CSV (Modal com escolha de escopo) ----
    const exportModal = document.getElementById('export-modal');
    const closeExportModal = () => {
        exportModal?.classList.remove('active');
        playUiUnselectionSound();
    };

    document.getElementById('export-btn')?.addEventListener('click', () => {
        playUiSelectionSound();
        exportModal?.classList.add('active');
    });
    document.getElementById('cancel-export-btn')?.addEventListener('click', closeExportModal);
    exportModal?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeExportModal();
    });

    document.getElementById('btn-export-month')?.addEventListener('click', () => {
        const monthList = getFilteredTransactionsForSelectedMonth();
        if (!monthList.length) {
            showToast('Não há transações no mês selecionado.', 'error');
            return;
        }
        const { year, month } = getCurrentSelection();
        const filename = `fs-ltda-transacoes-${getMonthKey(year, month)}.csv`;
        if (exportTransactionsCSV(monthList, filename)) {
            playSuccessSound();
            showToast('CSV do mês exportado.', 'success');
            exportModal?.classList.remove('active');
        }
    });

    document.getElementById('btn-export-all')?.addEventListener('click', () => {
        const list = getAllTransactions();
        if (!list.length) {
            showToast('Nada para exportar.', 'error');
            return;
        }
        if (exportTransactionsCSV(list, `fs-ltda-transacoes-completo-${formatDateISO(new Date())}.csv`)) {
            playSuccessSound();
            showToast('CSV completo exportado.', 'success');
            exportModal?.classList.remove('active');
        }
    });

    document.getElementById('btn-export-notes')?.addEventListener('click', () => {
        if (!currentNotesCache.length) {
            showToast('Não há anotações para exportar.', 'error');
            return;
        }
        if (exportNotesCSV(currentNotesCache, `fs-ltda-notas-${formatDateISO(new Date())}.csv`)) {
            playSuccessSound();
            showToast('Anotações exportadas em CSV.', 'success');
            exportModal?.classList.remove('active');
        }
    });

    // ---- Notificações ----
    const notifyBtn = document.getElementById('notify-toggle');
    function refreshNotifyButton() {
        if (!notifyBtn) return;
        const perm = getNotificationPermission();
        notifyBtn.classList.toggle('active', perm === 'granted');
        notifyBtn.title = perm === 'granted' ? 'Notificações ativadas' : 'Ativar notificações de vencimento';
    }
    refreshNotifyButton();

    notifyBtn?.addEventListener('click', async () => {
        if (getNotificationPermission() === 'granted') {
            showToast('Notificações já estão ativas.', 'success');
            return;
        }
        const result = await requestNotificationPermission();
        refreshNotifyButton();
        if (result === 'granted') {
            showToast('Você será avisado sobre contas a vencer.', 'success');
            playSuccessSound();
            checkDueDates(getAllTransactions());
        } else {
            showToast('Permissão negada pelo navegador.', 'error');
        }
    });

    // ---- Orçamentos (inclui categoria personalizada) ----
    const budgetModal = document.getElementById('budget-modal');
    const budgetCategorySelect = document.getElementById('budget-category');
    const budgetCustomInput = document.getElementById('budget-custom-category');

    budgetCategorySelect?.addEventListener('change', (e) => {
        if (!budgetCustomInput) return;
        const isOther = e.target.value === 'Outros';
        budgetCustomInput.style.display = isOther ? 'block' : 'none';
        budgetCustomInput.required = isOther;
        if (!isOther) budgetCustomInput.value = '';
    });

    const closeBudgetModal = () => {
        budgetModal?.classList.remove('active');
        if (budgetCustomInput) {
            budgetCustomInput.style.display = 'none';
            budgetCustomInput.required = false;
            budgetCustomInput.value = '';
        }
        playUiUnselectionSound();
    };

    document.getElementById('open-budget-modal-btn')?.addEventListener('click', () => {
        updateCategoryDropdown('expense');
        if (budgetCustomInput) {
            budgetCustomInput.style.display = 'none';
            budgetCustomInput.required = false;
            budgetCustomInput.value = '';
        }
        budgetModal?.classList.add('active');
        playUiSelectionSound();
    });
    document.getElementById('cancel-budget-btn')?.addEventListener('click', closeBudgetModal);
    budgetModal?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeBudgetModal();
    });

    document.getElementById('budget-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        let category = budgetCategorySelect?.value || '';
        if (category === 'Outros') {
            const customVal = budgetCustomInput?.value.trim();
            if (customVal) category = customVal;
        }
        const amount = parseAmount(document.getElementById('budget-amount')?.value);
        if (!category || !Number.isFinite(amount) || amount <= 0) {
            showToast('Preencha uma categoria e um limite maior que zero.', 'error');
            return;
        }

        const { month, year } = getCurrentSelection();
        const monthKey = getMonthKey(year, month);
        const btn = document.getElementById('save-budget-btn');

        await withSubmitLock(btn, async () => {
            try {
                await upsertBudget(category, amount, monthKey);
                budgetModal?.classList.remove('active');
                document.getElementById('budget-form')?.reset();
                if (budgetCustomInput) {
                    budgetCustomInput.style.display = 'none';
                    budgetCustomInput.required = false;
                }
                showToast('Orçamento salvo.', 'success');
                playSuccessSound();
                currentBudgets = await fetchBudgets(monthKey);
                renderBudgets(currentBudgets, getAllTransactions(), { month, year });
            } catch (err) {
                console.error(err);
                showToast('Erro ao salvar orçamento.', 'error');
            }
        });
    });

    document.getElementById('budgets-grid')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.budget-remove');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        try {
            await removeBudget(id);
            currentBudgets = currentBudgets.filter((b) => String(b.id) !== String(id));
            const { month, year } = getCurrentSelection();
            renderBudgets(currentBudgets, getAllTransactions(), { month, year });
            playDeleteSound();
            showToast('Orçamento removido.', 'success');
        } catch (err) {
            console.error(err);
            showToast('Erro ao remover orçamento.', 'error');
        }
    });

    // ==========================================
    // METAS E APORTES
    // ==========================================
    const goalModal = document.getElementById('goal-modal');
    const goalDepositModal = document.getElementById('goal-deposit-modal');

    const renderContributionsList = (contributions) => {
        const listEl = document.getElementById('goal-contributions-list');
        if (!listEl) return;

        if (!contributions || contributions.length === 0) {
            listEl.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 10px;">Nenhum aporte registrado ainda.</div>`;
            return;
        }

        listEl.innerHTML = contributions
            .map((c) => `
                <div class="contribution-item">
                    <div class="contribution-info">
                        <span class="contribution-date">${new Date(`${String(c.date).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                        <strong class="contribution-amount">${formatCurrency(c.amount)}</strong>
                    </div>
                    <div class="contribution-actions">
                        <button type="button" class="btn-icon edit-contribution" data-id="${escapeHTML(c.id)}" data-amount="${escapeHTML(c.amount)}" data-date="${escapeHTML(String(c.date).slice(0, 10))}" title="Editar">
                            <i class="ri-pencil-line"></i>
                        </button>
                        <button type="button" class="btn-icon delete-contribution" data-id="${escapeHTML(c.id)}" title="Excluir">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>
            `)
            .join('');
    };

    const updateDepositInfoBanner = (goal) => {
        const infoEl = document.getElementById('goal-deposit-info');
        if (!infoEl || !goal) return;

        const target = Number(goal.target_amount || 0);
        const current = Number(goal.current_amount || 0);
        const remaining = target - current;

        if (remaining <= 0) {
            infoEl.innerHTML = `<span>Parabéns! Você já atingiu esta meta. 🎉</span>`;
            return;
        }

        if (goal.deadline) {
            const deadlineDate = new Date(`${String(goal.deadline).slice(0, 10)}T12:00:00`);
            const today = new Date();
            const monthsDiff =
                (deadlineDate.getFullYear() - today.getFullYear()) * 12 +
                (deadlineDate.getMonth() - today.getMonth());

            if (monthsDiff > 0) {
                const monthlyNeeded = remaining / (monthsDiff + 1);
                infoEl.innerHTML = `<span>Faltam <strong>${formatCurrency(remaining)}</strong>. Guarde <strong>${formatCurrency(monthlyNeeded)}</strong>/mês para chegar no prazo.</span>`;
                return monthlyNeeded;
            }
            infoEl.innerHTML = `<span>Prazo muito próximo. Faltam <strong>${formatCurrency(remaining)}</strong>.</span>`;
            return remaining;
        }

        infoEl.innerHTML = `<span>Sem prazo definido. Faltam <strong>${formatCurrency(remaining)}</strong>.</span>`;
        return null;
    };

    document.getElementById('open-goal-modal-btn')?.addEventListener('click', () => {
        goalModal?.classList.add('active');
        playUiSelectionSound();
    });

    document.getElementById('cancel-goal-btn')?.addEventListener('click', () => {
        goalModal?.classList.remove('active');
        playUiUnselectionSound();
    });

    goalModal?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) goalModal.classList.remove('active');
    });

    document.getElementById('goal-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('goal-name').value.trim();
        const target = parseAmount(document.getElementById('goal-target').value);
        const current = parseAmount(document.getElementById('goal-current').value);
        const deadline = document.getElementById('goal-deadline').value || null;

        if (!name || !Number.isFinite(target) || target <= 0) {
            showToast('Preencha nome e valor alvo.', 'error');
            return;
        }

        const btn = document.getElementById('save-goal-btn');
        await withSubmitLock(btn, async () => {
            try {
                const newGoal = await insertGoal({ name, target_amount: target, current_amount: 0, deadline });

                if (current > 0 && newGoal) {
                    await insertGoalContribution(newGoal.id, current, formatDateISO(new Date()));
                    await recalculateGoalTotal(newGoal.id);
                }

                goalModal?.classList.remove('active');
                document.getElementById('goal-form').reset();
                showToast('Meta criada.', 'success');
                playSuccessSound();
                currentGoals = await fetchGoals();
                renderGoals(currentGoals);
            } catch (err) {
                console.error(err);
                showToast('Erro ao criar meta.', 'error');
            }
        });
    });

    document.getElementById('goals-grid')?.addEventListener('click', async (e) => {
        const addBtn = e.target.closest('.goal-add-btn');
        const removeBtn = e.target.closest('.goal-remove-btn');

        if (addBtn) {
            const id = addBtn.dataset.id;
            const goal = currentGoals.find((g) => String(g.id) === String(id));
            if (!goal) return;

            document.getElementById('goal-deposit-form').reset();
            document.getElementById('deposit-goal-id').value = id;
            document.getElementById('deposit-contribution-id').value = '';
            document.getElementById('deposit-date').value = formatDateISO(new Date());
            document.getElementById('save-deposit-btn').textContent = 'Salvar Aporte';
            document.getElementById('cancel-deposit-edit-btn').style.display = 'none';
            document.getElementById('goal-deposit-title').textContent = `Aportar em "${goal.name}"`;

            const suggested = updateDepositInfoBanner(goal);
            if (typeof suggested === 'number' && suggested > 0) {
                document.getElementById('deposit-amount').value = suggested.toFixed(2);
            }

            try {
                const contributions = await fetchGoalContributions(id);
                renderContributionsList(contributions);
            } catch (err) {
                console.error(err);
            }

            goalDepositModal?.classList.add('active');
            playUiSelectionSound();
            setTimeout(() => document.getElementById('deposit-amount')?.select(), 100);
            return;
        }

        if (removeBtn) {
            const id = removeBtn.dataset.id;
            const ok = await showConfirmToast('Excluir esta meta e todo o seu histórico?', {
                confirmLabel: 'Excluir',
                iconClass: 'ri-delete-bin-line',
            });
            if (!ok) return;
            try {
                await removeGoal(id);
                playDeleteSound();
                currentGoals = await fetchGoals();
                renderGoals(currentGoals);
                showToast('Meta removida.', 'success');
            } catch (err) {
                console.error(err);
                showToast('Erro ao remover meta.', 'error');
            }
        }
    });

    const closeDepositModal = () => {
        goalDepositModal?.classList.remove('active');
        playUiUnselectionSound();
    };

    document.getElementById('cancel-deposit-btn')?.addEventListener('click', closeDepositModal);
    document.getElementById('cancel-deposit-edit-btn')?.addEventListener('click', () => {
        document.getElementById('goal-deposit-form').reset();
        document.getElementById('deposit-contribution-id').value = '';
        document.getElementById('deposit-date').value = formatDateISO(new Date());
        document.getElementById('save-deposit-btn').textContent = 'Salvar Aporte';
        document.getElementById('cancel-deposit-edit-btn').style.display = 'none';
    });

    goalDepositModal?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeDepositModal();
    });

    document.getElementById('goal-deposit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const goalId = document.getElementById('deposit-goal-id').value;
        const contributionId = document.getElementById('deposit-contribution-id').value;
        const amount = parseAmount(document.getElementById('deposit-amount').value);
        const date = document.getElementById('deposit-date').value;

        if (!goalId || !Number.isFinite(amount) || amount <= 0 || !date) {
            showToast('Informe um valor e data válidos.', 'error');
            return;
        }

        const btn = document.getElementById('save-deposit-btn');
        await withSubmitLock(btn, async () => {
            try {
                if (contributionId) {
                    await updateGoalContribution(contributionId, amount, date);
                    showToast('Aporte atualizado!', 'success');
                } else {
                    await insertGoalContribution(goalId, amount, date);
                    showToast('Aporte realizado com sucesso!', 'success');
                }

                playSuccessSound();
                await recalculateGoalTotal(goalId);
                currentGoals = await fetchGoals();
                renderGoals(currentGoals);

                const contributions = await fetchGoalContributions(goalId);
                renderContributionsList(contributions);

                document.getElementById('goal-deposit-form').reset();
                document.getElementById('deposit-contribution-id').value = '';
                document.getElementById('deposit-date').value = formatDateISO(new Date());
                document.getElementById('cancel-deposit-edit-btn').style.display = 'none';

                const updatedGoal = currentGoals.find((g) => String(g.id) === String(goalId));
                updateDepositInfoBanner(updatedGoal);
            } catch (err) {
                console.error(err);
                showToast('Erro ao salvar aporte.', 'error');
            }
        });
        // Restaura rótulo padrão após lock
        if (btn && !document.getElementById('deposit-contribution-id').value) {
            btn.textContent = 'Salvar Aporte';
        }
    });

    document.getElementById('goal-contributions-list')?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-contribution');
        const deleteBtn = e.target.closest('.delete-contribution');
        const goalId = document.getElementById('deposit-goal-id').value;

        if (editBtn) {
            const { id, amount, date } = editBtn.dataset;
            document.getElementById('deposit-contribution-id').value = id;
            document.getElementById('deposit-amount').value = amount;
            document.getElementById('deposit-date').value = date;
            document.getElementById('save-deposit-btn').textContent = 'Salvar Alteração';
            document.getElementById('cancel-deposit-edit-btn').style.display = 'flex';
            document.getElementById('deposit-amount').focus();
            return;
        }

        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const ok = await showConfirmToast('Excluir este aporte?', {
                confirmLabel: 'Excluir',
                iconClass: 'ri-delete-bin-line',
            });
            if (!ok) return;

            try {
                await removeGoalContribution(id);
                playDeleteSound();
                showToast('Aporte excluído.', 'success');

                await recalculateGoalTotal(goalId);
                currentGoals = await fetchGoals();
                renderGoals(currentGoals);

                const contributions = await fetchGoalContributions(goalId);
                renderContributionsList(contributions);

                const updatedGoal = currentGoals.find((g) => String(g.id) === String(goalId));
                updateDepositInfoBanner(updatedGoal);

                if (document.getElementById('deposit-contribution-id').value === id) {
                    document.getElementById('goal-deposit-form').reset();
                    document.getElementById('deposit-contribution-id').value = '';
                    document.getElementById('deposit-date').value = formatDateISO(new Date());
                    document.getElementById('save-deposit-btn').textContent = 'Salvar Aporte';
                    document.getElementById('cancel-deposit-edit-btn').style.display = 'none';
                }
            } catch (err) {
                console.error(err);
                showToast('Erro ao excluir aporte.', 'error');
            }
        }
    });

    // ---- Contas Bancárias (Controle Mensal dinâmico + sincronizado) ----
    const accountModal = document.getElementById('account-modal');
    const closeAccountModal = () => {
        accountModal?.classList.remove('active');
        playUiUnselectionSound();
    };

    document.getElementById('open-account-modal-btn')?.addEventListener('click', () => {
        document.getElementById('account-form')?.reset();
        accountModal?.classList.add('active');
        playUiSelectionSound();
        setTimeout(() => document.getElementById('account-name')?.focus(), 80);
    });
    document.getElementById('cancel-account-btn')?.addEventListener('click', closeAccountModal);
    accountModal?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAccountModal();
    });

    document.getElementById('account-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('account-name').value.trim().toUpperCase();
        const icon = document.getElementById('account-icon').value || 'ri-bank-line';
        const balance = parseAmount(document.getElementById('account-balance').value);

        if (!name) {
            showToast('Informe o nome da conta.', 'error');
            return;
        }

        const btn = document.getElementById('save-account-btn');
        await withSubmitLock(btn, async () => {
            const accounts = getMonthlyAccounts();
            accounts.push({
                id: `acc-${Date.now()}`,
                name,
                icon,
                balance,
            });
            const saved = await saveAccounts(accounts);
            setMonthlyAccounts(saved, persistAccounts);
            renderProjection(getAllTransactions());
            accountModal?.classList.remove('active');
            document.getElementById('account-form').reset();
            playSuccessSound();
            showToast(`Conta "${name}" adicionada.`, 'success');
        });
    });

    bindMonthlyAccountsDelegation(async (accountId) => {
        const accounts = getMonthlyAccounts();
        if (accounts.length <= 1) {
            showToast('Mantenha pelo menos uma conta cadastrada.', 'error');
            return;
        }
        const target = accounts.find((a) => String(a.id) === String(accountId));
        const ok = await showConfirmToast(`Remover a conta "${target?.name || ''}"?`, {
            confirmLabel: 'Remover',
            iconClass: 'ri-delete-bin-line',
        });
        if (!ok) return;

        const next = accounts.filter((a) => String(a.id) !== String(accountId));
        const saved = await saveAccounts(next);
        setMonthlyAccounts(saved, persistAccounts);
        renderProjection(getAllTransactions());
        playDeleteSound();
        showToast('Conta removida.', 'success');
    });

    // ---- Som ----
    document.getElementById('sound-toggle')?.addEventListener('click', () => {
        setSoundEnabled(!isSoundEnabled());
    });
    setSoundEnabled(isSoundEnabled());

    // ---- Seletor de mês ----
    updateMonthDisplay();
    document.getElementById('btn-prev-month')?.addEventListener('click', () => changeSelectedMonth(-1));
    document.getElementById('btn-next-month')?.addEventListener('click', () => changeSelectedMonth(1));
    document.getElementById('btn-prev-month-list')?.addEventListener('click', () => changeSelectedMonth(-1));
    document.getElementById('btn-next-month-list')?.addEventListener('click', () => changeSelectedMonth(1));
    document.getElementById('btn-prev-month-monthly')?.addEventListener('click', () => changeSelectedMonth(-1));
    document.getElementById('btn-next-month-monthly')?.addEventListener('click', () => changeSelectedMonth(1));

    // ---- Ordenação da tabela ----
    document.querySelectorAll('th.sortable').forEach((th) => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => setSort(th.dataset.key));
    });

    // ---- Delegação de eventos na tabela/cards (Editar, Toggle Status, Excluir) ----
    bindTransactionDelegation();

    // ---- Replicar no próximo mês (com datas seguras!) ----
    const btnReplicar = document.getElementById('btn-copy-next-month');
    btnReplicar?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();

        const { month, year } = getCurrentSelection();
        const allTx = getAllTransactions();

        if (!allTx.length) {
            showToast('Nenhum lançamento carregado para copiar.', 'error');
            return;
        }

        const transacoesDoMes = allTx.filter((t) => isTransactionInMonth(t, year, month));
        if (transacoesDoMes.length === 0) {
            showToast('Não há lançamentos neste mês para replicar.', 'error');
            return;
        }

        const nextDateObj = new Date(year, month + 1, 1);
        const anoAlvo = nextDateObj.getFullYear();
        const mesAlvoIdx = nextDateObj.getMonth();

        const nomesMeses = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
        ];
        const mesAlvoNome = nomesMeses[mesAlvoIdx];

        const confirmacao = await showConfirmToast(
            `Deseja replicar ${transacoesDoMes.length} lançamento(s) de ${nomesMeses[month]} para ${mesAlvoNome} de ${anoAlvo}?`,
            { confirmLabel: 'Replicar', iconClass: 'ri-file-copy-2-line' }
        );
        if (!confirmacao) return;

        const transacoesReplicadas = transacoesDoMes.map((t) => {
            const nextDate = getNextMonthDateString(t.date, anoAlvo, mesAlvoIdx);
            const nextDue = t.due_date ? getNextMonthDateString(t.due_date, anoAlvo, mesAlvoIdx) : null;

            return {
                description: t.description,
                amount: t.amount,
                category: t.category,
                type: t.type || 'expense',
                paid_status: 'pending',
                due_date: nextDue,
                created_at: `${nextDate}T12:00:00.000Z`,
                date: nextDate,
            };
        });

        await withSubmitLock(btnReplicar, async () => {
            try {
                await replicarTransacoesParaProximoMes(transacoesReplicadas);
                playSuccessSound();
                showToast(`Sucesso! Lançamentos replicados em ${mesAlvoNome}.`, 'success');
                const fresh = await fetchTransactions();
                updateDashboardUI(fresh);
            } catch (err) {
                console.error(err);
                showToast('Erro ao replicar transações.', 'error');
            }
        }, 'Replicando...');
    });

    // ---- Logout ----
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await logout();
    });

    // ---- Tema ----
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        toggleTheme();
    });

    // ---- Modal de transação ----
    document.getElementById('open-add-modal-btn')?.addEventListener('click', () => {
        playUiSelectionSound();
        openModal(false);
    });

    const closeTransactionModalWithSound = () => {
        playUiUnselectionSound();
        closeModal();
    };

    document.getElementById('cancel-modal-btn')?.addEventListener('click', closeTransactionModalWithSound);
    document.getElementById('transaction-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeTransactionModalWithSound();
    });

    // ---- Modal de avatar ----
    const avatarModal = document.getElementById('avatar-crop-modal');
    const closeAvatarModalWithSound = () => {
        playUiUnselectionSound();
        closeAvatarEditor();
    };
    document.getElementById('avatar-close-btn')?.addEventListener('click', closeAvatarModalWithSound);
    document.getElementById('avatar-cancel-btn')?.addEventListener('click', closeAvatarModalWithSound);
    avatarModal?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeAvatarModalWithSound();
    });

    document.getElementById('avatar-load-btn')?.addEventListener('click', async () => {
        const url = document.getElementById('avatar-url-input').value.trim();
        if (!/^https?:\/\//i.test(url)) {
            setAvatarEditorStatus('Use um link que comece com http:// ou https://.', true);
            return;
        }
        await setAvatarEditorImage(url);
    });

    document.getElementById('avatar-paste-btn')?.addEventListener('click', async () => {
        try {
            const url = await navigator.clipboard.readText();
            document.getElementById('avatar-url-input').value = url;
            setAvatarEditorStatus('Link colado. Clique em Carregar para continuar.');
        } catch {
            setAvatarEditorStatus('Não foi possível ler a área de transferência.', true);
        }
    });

    document.getElementById('avatar-file-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setAvatarEditorStatus('Escolha uma imagem PNG, JPEG ou WebP.', true);
            return;
        }
        if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
            setAvatarEditorStatus('A imagem ultrapassa o limite de 8 MB.', true);
            return;
        }
        await setAvatarEditorImage(URL.createObjectURL(file));
    });

    ['avatar-zoom', 'avatar-x', 'avatar-y'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', updateAvatarPreview);
    });

    document.getElementById('avatar-save-btn')?.addEventListener('click', () => {
        try {
            const avatar = cropAvatarToDataUrl();
            localStorage.setItem(getAvatarStorageKey(), avatar);
            applySavedAvatar();
            showToast('Foto atualizada neste dispositivo.', 'success');
            playSuccessSound();
            closeAvatarEditor();
        } catch (error) {
            setAvatarEditorStatus(error.message, true);
        }
    });

    // ---- Abas ----
    document.querySelectorAll('.sidebar-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const selectedTab = tab.dataset.tab;
            if (selectedTab) {
                playUiSelectionSound();
                activateDashboardTab(selectedTab);
            }
        });
    });

    // ---- Busca e filtros (com debounce) ----
    document.getElementById('search-input')?.addEventListener('input', debounce(filterAndRenderTransactions, 180));
    document.getElementById('filter-select')?.addEventListener('change', filterAndRenderTransactions);
    document.getElementById('status-filter')?.addEventListener('change', filterAndRenderTransactions);
    document.getElementById('sort-by-mobile')?.addEventListener('change', (e) => setSort(e.target.value));

    // ---- Notas ----
    document.getElementById('note-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contentEl = document.getElementById('note-content');
        const content = contentEl?.value.trim();
        if (!content) {
            showToast('Digite uma anotação antes de salvar.', 'error');
            return;
        }

        const btn = document.getElementById('save-note-btn');
        await withSubmitLock(btn, async () => {
            try {
                await insertNote({ content });
                if (contentEl) contentEl.value = '';
                showToast('Anotação salva!', 'success');
                playSuccessSound();
                currentNotesCache = await fetchNotes();
                renderNotes(currentNotesCache);
            } catch (err) {
                console.error(err);
                showToast('Erro ao salvar nota: ' + err.message, 'error');
            }
        });
    });

    document.getElementById('notes-search-input')?.addEventListener('input', (e) => {
        notesSearchTerm = e.target.value || '';
        renderNotes(currentNotesCache);
    });

    document.getElementById('notes-list')?.addEventListener('click', async (event) => {
        const editButton = event.target.closest('.note-edit-btn');
        if (editButton) {
            const noteId = editButton.dataset.id;
            if (!noteId) return;
            editingNoteId = noteId;
            renderNotes(currentNotesCache);
            const editTextarea = document.querySelector(`.note-edit-textarea[data-id="${CSS.escape(noteId)}"]`);
            if (editTextarea) {
                editTextarea.focus();
                editTextarea.setSelectionRange(editTextarea.value.length, editTextarea.value.length);
            }
            return;
        }

        const cancelEditButton = event.target.closest('.note-cancel-edit-btn');
        if (cancelEditButton) {
            editingNoteId = null;
            renderNotes(currentNotesCache);
            return;
        }

        const saveEditButton = event.target.closest('.note-save-edit-btn');
        if (saveEditButton) {
            const noteId = saveEditButton.dataset.id;
            if (!noteId) return;
            const editTextarea = document.querySelector(`.note-edit-textarea[data-id="${CSS.escape(noteId)}"]`);
            const newContent = editTextarea?.value.trim();
            if (!newContent) {
                showToast('A anotação não pode ficar vazia.', 'error');
                return;
            }

            await withSubmitLock(saveEditButton, async () => {
                try {
                    await updateNote(noteId, newContent);
                    editingNoteId = null;
                    showToast('Anotação atualizada!', 'success');
                    playSuccessSound();
                    currentNotesCache = await fetchNotes();
                    renderNotes(currentNotesCache);
                } catch (err) {
                    console.error(err);
                    showToast('Erro ao atualizar nota: ' + err.message, 'error');
                }
            });
            return;
        }

        const deleteButton = event.target.closest('.note-delete-btn');
        if (!deleteButton) return;

        const noteId = deleteButton.dataset.id;
        if (!noteId) return;

        const confirmacao = await showConfirmToast('Deseja excluir esta anotação?', {
            confirmLabel: 'Excluir',
            iconClass: 'ri-delete-bin-line',
        });
        if (!confirmacao) return;

        try {
            await removeNote(noteId);
            if (String(editingNoteId) === String(noteId)) editingNoteId = null;
            playDeleteSound();
            showToast('Anotação excluída.', 'success');
            currentNotesCache = await fetchNotes();
            renderNotes(currentNotesCache);
        } catch (err) {
            console.error(err);
            showToast('Erro ao excluir a anotação.', 'error');
        }
    });

    // ---- Alternância Receita/Despesa ----
    const btnExpense = document.getElementById('btn-type-expense');
    const btnIncome = document.getElementById('btn-type-income');
    const transTypeInput = document.getElementById('trans-type');

    btnExpense?.addEventListener('click', () => {
        btnExpense.classList.add('active');
        btnIncome.classList.remove('active');
        if (transTypeInput) transTypeInput.value = 'expense';
        updateCategoryDropdown('expense');
    });

    btnIncome?.addEventListener('click', () => {
        btnIncome.classList.add('active');
        btnExpense.classList.remove('active');
        if (transTypeInput) transTypeInput.value = 'income';
        updateCategoryDropdown('income');
    });

    document.getElementById('trans-category')?.addEventListener('change', (e) => {
        const customInput = document.getElementById('trans-custom-category');
        if (!customInput) return;

        const isOther = e.target.value === 'Outros';
        customInput.style.display = isOther ? 'block' : 'none';
        customInput.required = isOther;
        if (!isOther) customInput.value = '';
    });

    // ---- Submit do form de transação (criação/edição com lock) ----
    document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const editId = form.dataset.editId;

        const cleanAmount = parseAmount(document.getElementById('trans-amount').value);
        if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
            showToast('Informe um valor maior que zero.', 'error');
            return;
        }

        const fallbackType = document.getElementById('btn-type-income')?.classList.contains('active')
            ? 'income'
            : 'expense';
        const finalType = transTypeInput ? transTypeInput.value : fallbackType;

        let finalCategory = document.getElementById('trans-category').value;
        if (finalCategory === 'Outros') {
            const customValue = document.getElementById('trans-custom-category').value.trim();
            if (customValue) finalCategory = customValue;
        }

        const transactionData = {
            description: document.getElementById('trans-desc').value.trim(),
            amount: cleanAmount,
            category: finalCategory,
            date: document.getElementById('trans-date').value,
            type: finalType,
            paid_status: document.getElementById('trans-paid-status').value,
            due_date: document.getElementById('trans-due-date').value || null,
            recurrence: document.getElementById('trans-recurrence').value || null,
            recurrence_end: document.getElementById('trans-recurrence-end').value || null,
        };

        const btn = document.getElementById('save-transaction-btn');
        await withSubmitLock(btn, async () => {
            try {
                if (editId) {
                    await updateTransaction(editId, transactionData);
                    showToast('Transação atualizada!', 'success');
                } else {
                    await insertTransaction(transactionData);
                    showToast('Lançamento realizado!', 'success');
                }

                playSuccessSound();
                closeModal();
                await loadDashboardData();
            } catch (err) {
                console.error(err);
                showToast('Erro ao processar: ' + err.message, 'error');
            }
        });
    });
});

// =====================================================================
// SINCRONIZAÇÃO DE CONTAS
// =====================================================================

async function persistAccounts(accounts) {
    try {
        await saveAccounts(accounts);
    } catch (err) {
        console.error('Erro ao persistir contas:', err);
    }
}

// =====================================================================
// EVENTOS GLOBAIS
// =====================================================================

window.addEventListener('transactions-updated', () => {
    updateMonthDisplay();
    const tx = getAllTransactions();
    updateDashboardUI(tx);
    refreshMonthlyBudgetDashboard();

    const { month, year } = getCurrentSelection();
    renderBudgets(currentBudgets, tx, { month, year });
});

initTheme();

supabase.auth.onAuthStateChange((event, session) => {
    if (isDemoMode()) return;

    if (session) {
        currentAppUser = session.user;
        showDashboardScreen(session.user, false);
        applySavedAvatar(session.user);
        loadDashboardData();
    } else {
        showLoginScreen();
    }
});

document.getElementById('user-avatar')?.addEventListener('click', () => {
    playUiSelectionSound();
    openAvatarEditor();
});

// =====================================================================
// ABAS
// =====================================================================

function activateDashboardTab(tabId) {
    document.querySelectorAll('.tab-page').forEach((page) => {
        page.classList.toggle('active', page.id === `tab-${tabId}`);
    });
    document.querySelectorAll('.sidebar-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tabId);
    });

    if (tabId === 'overview') {
        const tx = getAllTransactions();
        const selection = getCurrentSelection();
        filterAndRenderTransactions();
        renderBudgets(currentBudgets, tx, selection);
        renderGoals(currentGoals);
        updateInsights(tx, selection);
        renderProjection(tx, selection);
    }
    if (tabId === 'monthly') {
        refreshMonthlyBudgetDashboard();
    }
}

activateDashboardTab('overview');

// =====================================================================
// ATALHOS DE TECLADO (Escape fecha qualquer modal ativo; F1 abre novo lançamento)
// =====================================================================

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (document.getElementById('transaction-modal')?.classList.contains('active')) {
            closeModal();
            return;
        }
        if (document.getElementById('avatar-crop-modal')?.classList.contains('active')) {
            closeAvatarEditor();
            return;
        }
        // Fecha qualquer outro modal aberto (exceto o de recorrência, que tem seu próprio listener com Promise)
        const openModalEl = document.querySelector(
            '.modal-overlay.active:not(#recurrence-delete-modal)'
        );
        if (openModalEl) {
            openModalEl.classList.remove('active');
            playUiUnselectionSound();
        }
        return;
    }

    if (event.key === 'F1') {
        const dashboardVisible = document.getElementById('dashboard-screen')?.style.display !== 'none';
        if (!dashboardVisible) return;
        event.preventDefault();
        if (!document.getElementById('transaction-modal')?.classList.contains('active')) {
            playUiSelectionSound();
            openModal(false);
        }
    }
});

// =====================================================================
// CARREGAMENTO DE DADOS DO DASHBOARD
// =====================================================================

async function loadDashboardData() {
    setDashboardLoading(true);
    try {
        const { month, year } = getCurrentSelection();

        const lastSeenKey = isDemoMode() ? 'vaulta-last-materialized-demo' : 'vaulta-last-materialized';
        const lastSeen = localStorage.getItem(lastSeenKey);
        let sinceDate;
        if (lastSeen) {
            const [ly, lm] = lastSeen.split('-').map(Number);
            sinceDate = new Date(ly, lm - 1, 1);
        } else {
            sinceDate = new Date(year, month - 1, 1);
        }

        await materializeRecurrences(year, month, sinceDate);

        const monthKey = getMonthKey(year, month);
        localStorage.setItem(lastSeenKey, monthKey);

        const [transactions, notes, budgets, goals, accounts] = await Promise.all([
            fetchTransactions(),
            fetchNotes(),
            fetchBudgets(monthKey),
            fetchGoals(),
            fetchAccounts(),
        ]);

        currentBudgets = budgets;
        currentGoals = goals;
        currentNotesCache = notes;

        setMonthlyAccounts(accounts, persistAccounts);
        updateDashboardUI(transactions);
        renderNotes(notes);
        renderBudgets(currentBudgets, transactions, { month, year });
        renderGoals(currentGoals);

        checkDueDates(transactions);
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
        const message = String(err?.message || '').toLowerCase();
        showToast(
            message.includes('failed to fetch') || message.includes('network')
                ? 'Conectado, mas os dados não puderam ser carregados.'
                : 'Não foi possível carregar os dados do painel.',
            'error'
        );
    } finally {
        setDashboardLoading(false);
    }
}

function renderNotes(notes) {
    const notesList = document.getElementById('notes-list');
    if (!notesList) return;

    const allNotes = Array.isArray(notes) ? notes : [];
    const badge = document.getElementById('notes-count-badge');
    if (badge) {
        badge.textContent = allNotes.length === 1 ? '1 salva' : `${allNotes.length} salvas`;
    }

    if (allNotes.length === 0) {
        notesList.innerHTML = `<div class="notes-empty">Nenhuma anotação registrada. Use o formulário acima para salvar uma nota.</div>`;
        return;
    }

    const query = notesSearchTerm.trim().toLowerCase();
    const filtered = query
        ? allNotes.filter((n) => String(n.content || '').toLowerCase().includes(query))
        : allNotes;

    if (filtered.length === 0) {
        notesList.innerHTML = `<div class="notes-empty">Nenhuma anotação encontrada para "${escapeHTML(notesSearchTerm.trim())}".</div>`;
        return;
    }

    notesList.innerHTML = filtered
        .map((note) => {
            const safeId = escapeHTML(note.id);
            const createdAt = note.created_at
                ? new Date(note.created_at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                })
                : '';

            if (String(editingNoteId) === String(note.id)) {
                return `
                    <div class="note-card glass is-editing">
                        <div class="note-edit-label"><i class="ri-edit-line"></i> Editando anotação</div>
                        <textarea class="note-textarea note-edit-textarea" data-id="${safeId}" rows="4">${escapeHTML(note.content)}</textarea>
                        <div class="note-edit-actions">
                            <button type="button" class="btn-secondary note-cancel-edit-btn">Cancelar</button>
                            <button type="button" class="btn-primary note-save-edit-btn" data-id="${safeId}"><i class="ri-check-line"></i> Salvar edição</button>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="note-card glass">
                    <div class="note-card-content">${escapeHTML(note.content)}</div>
                    <div class="note-card-footer">
                        <span class="note-meta">${escapeHTML(createdAt)}</span>
                        <div class="note-card-actions">
                            <button type="button" class="btn-secondary note-edit-btn" data-id="${safeId}" title="Editar anotação"><i class="ri-edit-line"></i> Editar</button>
                            <button type="button" class="btn-secondary note-delete-btn" data-id="${safeId}" title="Excluir anotação"><i class="ri-delete-bin-line"></i> Excluir</button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}
