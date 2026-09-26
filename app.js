import {
    fetchTransactions,
    insertTransaction,
    fetchNotes,
    insertNote,
    removeNote,
    loginComEmail,
    logout,
    supabase,
    replicarTransacoesParaProximoMes,
} from './db.js';

import {
    showLoginScreen,
    showDashboardScreen,
    updateDashboardUI,
    showToast,
    showConfirmToast,
    playSuccessSound,
    playUiSelectionSound,
    playUiUnselectionSound,
    playDeleteSound,
    isSoundEnabled,
    setSoundEnabled,
    initTheme,
    toggleTheme,
    openModal,
    closeModal,
    filterAndRenderTransactions,
    updateCategoryDropdown,
    setSort,
    changeSelectedMonth,
    updateMonthDisplay,
} from './ui.js';
import {
    renderFiiAllocationChart,
    updateFiiAllocationChartTheme,
} from './chart-manager.js';


// Estado do usuário atual, usado para persistir FIIs por perfil
let currentAppUser = null;

const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const AVATAR_MAX_SAVED_BYTES = 100 * 1024;
const avatarEditorState = { image: null, sourceUrl: null };

function getAvatarStorageKey(user = currentAppUser) {
    return user?.id ? `vaulta-avatar-${user.id}` : 'vaulta-avatar-guest';
}

function applySavedAvatar(user = currentAppUser) {
    const avatar = localStorage.getItem(getAvatarStorageKey(user));
    if (avatar) document.getElementById('user-avatar').src = avatar;
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
        if (avatarEditorState.sourceUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarEditorState.sourceUrl);
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
    if (avatarEditorState.sourceUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarEditorState.sourceUrl);
    avatarEditorState.image = null;
    avatarEditorState.sourceUrl = null;
    const preview = document.getElementById('avatar-crop-preview');
    if (preview) preview.style.backgroundImage = '';
    document.getElementById('avatar-url-input').value = '';
    document.getElementById('avatar-file-input').value = '';
    document.getElementById('avatar-zoom').value = '1';
    document.getElementById('avatar-x').value = '50';
    document.getElementById('avatar-y').value = '50';
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

// Remove versões antigas do Service Worker. A versão anterior interceptava
// chamadas ao Supabase e podia impedir a autenticação com ERR_FAILED.
// O app não usa cache offline, portanto não deve manter um Service Worker ativo.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (registrations.length) {
      console.info('Service Worker antigo removido.');
    }
  });
}

// Adiciona os ouvintes de evento assim que a página carregar
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const btnVisitante = document.getElementById('btn-login-visitante');

    // Listener único e centralizado para o Formulário de Login
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('user-email')?.value.trim();
        const password = document.getElementById('user-pass')?.value;

        if (!email || !password) {
            showToast("Por favor, preencha e-mail e senha.", "error");
            return;
        }

        try {
            await loginComEmail(email, password);
            // A troca de tela e o carregamento acontecem uma única vez no
            // onAuthStateChange, quando o Supabase confirma a sessão.
        } catch (err) {
            console.error(err);
            const message = String(err?.message || '').toLowerCase();
            const isNetworkError = message.includes('failed to fetch') || message.includes('network');
            showToast(
                isNetworkError
                    ? "Não foi possível conectar ao Supabase. Verifique sua internet ou bloqueadores de conteúdo."
                    : "E-mail ou senha incorretos.",
                "error"
            );
        }
    });

    // Listener para o botão Visitante (Modo Demo)
    btnVisitante?.addEventListener('click', () => {
        currentAppUser = { email: "demo@demo.com", user_metadata: { full_name: "Visitante" } };
        showDashboardScreen(currentAppUser, true);
        applySavedAvatar(currentAppUser);
        updateDashboardUI([]);
        loadFiiData();
    });

    const soundToggleBtn = document.getElementById('sound-toggle');
    soundToggleBtn?.addEventListener('click', () => {
        const nextEnabled = !isSoundEnabled();
        setSoundEnabled(nextEnabled);
    });
    setSoundEnabled(isSoundEnabled());

    const savedBankBalances = JSON.parse(localStorage.getItem('monthly-bank-balances') || '[]');
    const monthlyBankInputs = [...document.querySelectorAll('.monthly-account-input')];

    monthlyBankInputs.forEach((input, index) => {
        const value = Number.parseFloat(String(savedBankBalances[index] ?? '0').replace(',', '.'));
        input.value = Number.isFinite(value) && value >= 0 ? String(value) : '';
        input.addEventListener('focus', () => {
            const currentValue = String(input.value).trim().replace(',', '.');
            if (currentValue !== '' && Number.parseFloat(currentValue) === 0) {
                input.value = '';
            }
        });
        input.addEventListener('input', async () => {
            const isEmpty = String(input.value).trim() === '';
            input.value = isEmpty ? '' : String(input.value).replace(/[^\d,.-]/g, '').replace(',', '.');
            const { refreshMonthlyBudgetDashboard } = await import('./ui.js');
            refreshMonthlyBudgetDashboard();
        });
    });

    // --- LÓGICA CENTRALIZADA DOS SELETORES DE MÊS ---
    // Inicializa o texto da barra de meses (Ex: "Junho de 2026")
    updateMonthDisplay();

    // Listeners da aba Visão Geral
    document.getElementById('btn-prev-month')?.addEventListener('click', () => {
        changeSelectedMonth(-1);
    });

    document.getElementById('btn-next-month')?.addEventListener('click', () => {
        changeSelectedMonth(1);
    });

    // CORREÇÃO: Listeners da aba Lançamentos agora protegidos dentro do DOMContentLoaded
    document.getElementById('btn-prev-month-list')?.addEventListener('click', () => {
        changeSelectedMonth(-1);
    });

    document.getElementById('btn-next-month-list')?.addEventListener('click', () => {
        changeSelectedMonth(1);
    });
    // -------------------------------------

    // Escuta alterações nos inputs de data manuais (se preenchidos, eles sobrescrevem o seletor de mês)
    const startInput = document.getElementById('filter-start-date');
    const endInput = document.getElementById('filter-end-date');
    if (startInput && endInput) {
        startInput.addEventListener('change', filterAndRenderTransactions);
        endInput.addEventListener('change', filterAndRenderTransactions);
    }

    // Adiciona listeners para ordenação nas colunas do grid
    document.querySelectorAll('th.sortable').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const key = th.dataset.key;
            try {
                setSort(key);
            } catch (err) {
                console.error('Erro ao ordenar:', err);
            }
        });
    });

    // Ouvinte para replicar lançamentos de forma blindada
    const btnReplicar = document.getElementById('btn-copy-next-month');
    
    btnReplicar?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation(); // Evita que o evento rode 2 vezes no mesmo clique!

        const { getCurrentSelection, updateDashboardUI, showToast, showConfirmToast } = await import('./ui.js');
        const { fetchTransactions, replicarTransacoesParaProximoMes } = await import('./db.js');
        
        // 1. Pegamos a seleção da aba VISUAL da tela (Ex: Junho retorna month: 5)
        const { month, year } = getCurrentSelection(); 

        if (!window.allTransactions || window.allTransactions.length === 0) {
            showToast("Nenhum lançamento carregado para copiar.", "error");
            return;
        }

        // 2. Filtramos apenas o que pertence estritamente a este mês/ano que você está vendo
        const transacoesDoMes = window.allTransactions.filter(t => {
            if (!t.due_date) return false;
            const [y, m] = t.due_date.split('-');
            return parseInt(m, 10) - 1 === month && parseInt(y, 10) === year;
        });

        if (transacoesDoMes.length === 0) {
            showToast("Não há lançamentos nesta aba para replicar.", "error");
            return;
        }

        // 3. Calculamos rigidamente o próximo mês humano (1 a 12)
        let proximoMesHumano = month + 2; 
        let anoAlvo = year;

        if (proximoMesHumano > 12) {
            proximoMesHumano = 1; // Janeiro
            anoAlvo += 1;
        }

        const nomesMeses = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];

        // Mês alvo em texto para a mensagem
        const mesAlvoNome = nomesMeses[proximoMesHumano - 1];

        const confirmacao = await showConfirmToast(
            `Deseja replicar ${transacoesDoMes.length} lançamento(s) de ${nomesMeses[month]} para ${mesAlvoNome} de ${anoAlvo}?`,
            { confirmLabel: 'Replicar', iconClass: 'ri-file-copy-2-line' }
        );
        if (!confirmacao) return;

        // 4. Forçamos as strings de texto puras para o vencimento E para a data de lançamento
        const transacoesReplicadas = transacoesDoMes.map(t => {
            const parts = t.due_date.split('-');
            const diaOriginal = parts[2] ? parts[2].padStart(2, '0') : "10"; 

            const mesString = String(proximoMesHumano).padStart(2, '0');
            const anoString = String(anoAlvo);
            
            const novaDataFinal = `${anoString}-${mesString}-${diaOriginal}`;

            return {
                description: t.description,
                amount: t.amount,
                category: t.category,
                type: t.type || 'expense',
                paid_status: 'pending', // Sempre entra como pendente
                due_date: novaDataFinal, // Coluna de Vencimento
                created_at: `${novaDataFinal}T12:00:00.000Z`, 
                date: novaDataFinal 
            };
        });

        try {
            btnReplicar.disabled = true;
            btnReplicar.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Replicando...`;

            await replicarTransacoesParaProximoMes(transacoesReplicadas);

            showToast(`Sucesso! Lançamentos replicados em ${mesAlvoNome}.`, "success");

            window.allTransactions = await fetchTransactions();
            updateDashboardUI(window.allTransactions);

        } catch (err) {
            console.error(err);
            showToast("Erro ao replicar transações.", "error");
        } finally {
            btnReplicar.disabled = false;
            btnReplicar.innerHTML = `<i class="ri-file-copy-2-line"></i> Replicar no Próx. Mês`;
        }
    });

    // --- CONFIGURAÇÃO DA INTERFACE (MANDATÓRIO DENTRO DO DOM) ---
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await logout();
    });

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        toggleTheme();
        const isDark = document.documentElement.classList.contains('dark');
        updateFiiAllocationChartTheme(isDark);
    });
    document.getElementById('open-add-modal-btn')?.addEventListener('click', () => {
        playUiSelectionSound();
        openModal(false);
    });
    const closeTransactionModalWithSound = () => {
        playUiUnselectionSound();
        closeModal();
    };

    document.getElementById('close-modal-btn')?.addEventListener('click', closeTransactionModalWithSound);
    document.getElementById('cancel-modal-btn')?.addEventListener('click', closeModal);
    document.getElementById('transaction-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closeTransactionModalWithSound();
        }
    });

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

    const tabButtons = document.querySelectorAll('.sidebar-tab');
    tabButtons.forEach(tab => {
        tab.addEventListener('click', () => {
            const selectedTab = tab.dataset.tab;
            if (selectedTab) {
                playUiSelectionSound();
                activateDashboardTab(selectedTab);
            }
        });
    });

    document.getElementById('search-input')?.addEventListener('input', filterAndRenderTransactions);
    document.getElementById('filter-select')?.addEventListener('change', filterAndRenderTransactions);
    document.getElementById('status-filter')?.addEventListener('change', filterAndRenderTransactions);
    document.getElementById('sort-by-mobile')?.addEventListener('change', (e) => {
        setSort(e.target.value);
    });

    // Bloco de Notas
    document.getElementById('note-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contentEl = document.getElementById('note-content');
        const content = contentEl?.value.trim();
        if (!content) {
            showToast('Digite uma anotação antes de salvar.', 'error');
            return;
        }

        try {
            await insertNote({ content });
            if (contentEl) contentEl.value = '';
            showToast('Anotação salva!', 'success');
            playSuccessSound();
            await loadDashboardData();
        } catch (err) {
            console.error(err);
            showToast('Erro ao salvar nota: ' + err.message, 'error');
        }
    });

    document.getElementById('notes-list')?.addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('.note-delete-btn');
        if (!deleteButton) return;

        const noteId = deleteButton.dataset.id;
        if (!noteId) return;

        const confirmacao = await showConfirmToast(
            'Deseja excluir esta anotação?',
            { confirmLabel: 'Excluir', iconClass: 'ri-delete-bin-line' }
        );
        if (!confirmacao) return;

        try {
            await removeNote(noteId);
            playDeleteSound();
            showToast('Anotação excluída.', 'success');
            await loadDashboardData();
        } catch (err) {
            console.error(err);
            showToast('Erro ao excluir a anotação.', 'error');
        }
    });

    const fiiForm = document.getElementById('fii-form');
    fiiForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const ticker = normalizeFiiTicker(document.getElementById('fii-ticker')?.value);
        const name = document.getElementById('fii-name')?.value.trim();
        const quantity = parseInt(document.getElementById('fii-quantity')?.value, 10) || 0;
        const averagePrice = parseFloat(document.getElementById('fii-average-price')?.value) || 0;
        const currentPrice = parseFloat(document.getElementById('fii-current-price')?.value) || 0;
        const dividends = parseFloat(document.getElementById('fii-dividends')?.value) || 0;

        if (!ticker || !name || quantity < 0 || averagePrice < 0 || currentPrice < 0 || dividends < 0) {
            showToast('Preencha corretamente todos os campos do FII.', 'error');
            return;
        }

        const holdings = loadFiiHoldings(currentAppUser);
        const existingIndex = holdings.findIndex(item => normalizeFiiTicker(item.ticker) === ticker);
        const newHolding = {
            ticker,
            name,
            quantity,
            averagePrice,
            currentPrice,
            dividends
        };

        if (existingIndex >= 0) {
            holdings[existingIndex] = newHolding;
            showToast('FII atualizado com sucesso!', 'success');
        } else {
            holdings.push(newHolding);
            showToast('FII salvo com sucesso!', 'success');
        }

        playSuccessSound();
        saveFiiHoldings(currentAppUser, holdings);
        updateFiiUI(holdings);
        resetFiiForm();
    });

    // Alternância Receita/Despesa e Categorias Dinâmicas
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

    // Mostrar/Ocultar campo de Categoria Customizada ("Outros")
    document.getElementById('trans-category')?.addEventListener('change', (e) => {
        const customInput = document.getElementById('trans-custom-category');
        if (!customInput) return;

        if (e.target.value === 'Outros') {
            customInput.style.display = 'block';
            customInput.required = true;
        } else {
            customInput.style.display = 'none';
            customInput.required = false;
            customInput.value = '';
        }
    });

    // SUBMIT DO FORMULÁRIO (Criação ou Edição)
    document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const editId = form.dataset.editId;

        const rawAmount = document.getElementById('trans-amount').value;
        const cleanAmount = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, '')) || 0;

        const fallbackType = document.getElementById('btn-type-income')?.classList.contains('active') ? 'income' : 'expense';
        const finalType = transTypeInput ? transTypeInput.value : fallbackType;

        let finalCategory = document.getElementById('trans-category').value;
        if (finalCategory === 'Outros') {
            const customValue = document.getElementById('trans-custom-category').value.trim();
            if (customValue) finalCategory = customValue;
        }

        const transactionData = {
            description: document.getElementById('trans-desc').value,
            amount: cleanAmount,
            category: finalCategory,
            date: document.getElementById('trans-date').value,
            type: finalType,
            paid_status: document.getElementById('trans-paid-status').value,
            due_date: document.getElementById('trans-due-date').value || null
        };

        try {
            if (editId) {
                const { error } = await supabase.from('transactions').update(transactionData).eq('id', editId);
                if (error) throw error;
                showToast("Transação updated!", "success");
            } else {
                await insertTransaction(transactionData);
                showToast("Lançamento realizado!", "success");
            }

            playSuccessSound();
            closeModal();
            await loadDashboardData();
        } catch (err) {
            console.error(err);
            showToast("Erro ao processar: " + err.message, "error");
        }
    });
});

// Garante que o display visual do mês se atualize quando novos dados forem salvos ou excluídos
window.addEventListener('transactions-updated', () => {
    updateMonthDisplay();
});

// INICIALIZAÇÃO E MONITORAMENTO
initTheme();

supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        currentAppUser = session.user;
        showDashboardScreen(session.user, false);
        applySavedAvatar(session.user);
        loadDashboardData();
        loadFiiData();
    } else {
        showLoginScreen();
    }
});

window.addEventListener('transactions-updated', loadDashboardData);

// ATUALIZAÇÃO DE AVATAR (Perfil)
document.getElementById('user-avatar')?.addEventListener('click', () => {
    playUiSelectionSound();
    openAvatarEditor();
});

function activateDashboardTab(tabId) {
    document.querySelectorAll('.tab-page').forEach(page => {
        page.classList.toggle('active', page.id === `tab-${tabId}`);
    });

    document.querySelectorAll('.sidebar-tab').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tabId);
    });

    if (tabId === 'overview' || tabId === 'monthly') {
        filterAndRenderTransactions();
    }

    if (tabId === 'monthly') {
        import('./ui.js').then(({ refreshMonthlyBudgetDashboard }) => refreshMonthlyBudgetDashboard());
    }
}

activateDashboardTab('overview');

// Shortcuts
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const modal = document.getElementById('transaction-modal');
        if (modal?.classList.contains('active')) {
            closeModal();
        }
        return;
    }

    if (event.key === 'F1') {
        event.preventDefault();
        if (!document.getElementById('transaction-modal')?.classList.contains('active')) {
            playUiSelectionSound();
            openModal(false);
        }
    }
});

async function loadDashboardData() {
    try {
        const [transactions, notes] = await Promise.all([fetchTransactions(), fetchNotes()]);
        updateDashboardUI(transactions);
        renderNotes(notes);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        const message = String(err?.message || '').toLowerCase();
        showToast(
            message.includes('failed to fetch') || message.includes('network')
                ? "Conectado, mas os dados não puderam ser carregados. Verifique sua internet ou bloqueadores de conteúdo."
                : "Não foi possível carregar os dados do painel.",
            "error"
        );
    }
}

function renderNotes(notes) {
    const notesList = document.getElementById('notes-list');
    if (!notesList) return;

    if (!notes || notes.length === 0) {
        notesList.innerHTML = `<div class="notes-empty">Nenhuma anotação registrada. Use o formulário ao lado para salvar uma nota.</div>`;
        return;
    }

    notesList.innerHTML = notes.map(note => {
        const createdAt = note.created_at ? new Date(note.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
        return `
            <div class="note-card glass">
                <div class="note-card-content">${sanitizeText(note.content)}</div>
                <div class="note-card-footer">
                    <span class="note-meta">${createdAt}</span>
                    <button type="button" class="btn-secondary note-delete-btn" data-id="${note.id}"><i class="ri-delete-bin-line"></i> Excluir</button>
                </div>
            </div>
        `;
    }).join('');
}

function normalizeFiiTicker(value) {
    return String(value || '').trim().toUpperCase();
}

function loadFiiHoldings(user) {
    try {
        const storageKey = user?.email ? `fii-holdings:${user.email}` : 'fii-holdings:anon';
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const holdings = JSON.parse(raw);
        return Array.isArray(holdings) ? holdings : [];
    } catch (err) {
        console.error('Erro ao carregar holdings de FIIs:', err);
        return [];
    }
}

function saveFiiHoldings(user, holdings) {
    try {
        const storageKey = user?.email ? `fii-holdings:${user.email}` : 'fii-holdings:anon';
        localStorage.setItem(storageKey, JSON.stringify(holdings));
    } catch (err) {
        console.error('Erro ao salvar holdings de FIIs:', err);
    }
}

function formatFiiCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateFiiUI(holdings) {
    const totalValue = holdings.reduce((sum, item) => sum + (Number(item.currentPrice || 0) * Number(item.quantity || 0)), 0);
    const totalDividends = holdings.reduce((sum, item) => sum + Number(item.dividends || 0), 0);
    const averageYield = totalValue > 0 ? (totalDividends / totalValue) * 100 : 0;

    const totalValueEl = document.getElementById('fii-total-value');
    const monthlyDividendsEl = document.getElementById('fii-monthly-dividends');
    const averageYieldEl = document.getElementById('fii-average-yield');
    const countEl = document.getElementById('fii-count');
    const tbody = document.getElementById('fii-holdings-tbody');
    const emptyState = document.getElementById('fii-empty-state');

    if (totalValueEl) totalValueEl.textContent = `R$ ${formatFiiCurrency(totalValue)}`;
    if (monthlyDividendsEl) monthlyDividendsEl.textContent = `R$ ${formatFiiCurrency(totalDividends)}`;
    if (averageYieldEl) averageYieldEl.textContent = `${averageYield.toFixed(2)}%`;
    if (countEl) countEl.textContent = String(holdings.length);

    if (!tbody) return;

    if (holdings.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        renderFiiAllocationChart([]);
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = holdings.map(item => {
        const totalItem = Number(item.currentPrice || 0) * Number(item.quantity || 0);
        return `
            <tr class="animate-fade">
                <td>${sanitizeText(item.name)} (${sanitizeText(item.ticker)})</td>
                <td>${Number(item.quantity || 0).toLocaleString('pt-BR')}</td>
                <td>R$ ${formatFiiCurrency(item.averagePrice)}</td>
                <td>R$ ${formatFiiCurrency(item.currentPrice)}</td>
                <td>R$ ${formatFiiCurrency(totalItem)}</td>
                <td>R$ ${formatFiiCurrency(item.dividends)}</td>
                <td><button type="button" class="btn-secondary btn-edit-fii" data-ticker="${sanitizeText(item.ticker)}">Editar</button></td>
            </tr>
        `;
    }).join('');

    setupFiiEditButtons();
    renderFiiAllocationChart(holdings);
}

function setupFiiEditButtons() {
    document.querySelectorAll('.btn-edit-fii').forEach(btn => {
        btn.removeEventListener('click', handleFiiEditClick);
        btn.addEventListener('click', handleFiiEditClick);
    });
}

function handleFiiEditClick(event) {
    const ticker = normalizeFiiTicker(event.currentTarget.dataset.ticker);
    const holdings = loadFiiHoldings(currentAppUser);
    const holding = holdings.find(item => normalizeFiiTicker(item.ticker) === ticker);
    if (!holding) return;

    document.getElementById('fii-ticker').value = holding.ticker;
    document.getElementById('fii-name').value = holding.name;
    document.getElementById('fii-quantity').value = holding.quantity;
    document.getElementById('fii-average-price').value = holding.averagePrice;
    document.getElementById('fii-current-price').value = holding.currentPrice;
    document.getElementById('fii-dividends').value = holding.dividends;
}

function resetFiiForm() {
    const fiiForm = document.getElementById('fii-form');
    if (fiiForm) fiiForm.reset();
}

function loadFiiData() {
    const holdings = loadFiiHoldings(currentAppUser);
    updateFiiUI(holdings);
}

function sanitizeText(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char];
    });
}
