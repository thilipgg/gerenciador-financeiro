import { 
    fetchTransactions, 
    insertTransaction, 
    fetchNotes, 
    insertNote, 
    removeNote, 
    loginComEmail, 
    logout, 
    supabase 
} from './db.js';

import { 
    showLoginScreen, 
    showDashboardScreen, 
    updateDashboardUI, 
    showToast,
    initTheme,
    toggleTheme,
    openModal,
    closeModal,
    filterAndRenderTransactions,
    updateCategoryDropdown,
    setSort,
    changeSelectedMonth, 
    updateMonthDisplay   
} from './ui.js';

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
        } catch (err) {
            console.error(err);
            showToast("E-mail ou senha incorretos.", "error");
        }
    });

    // Listener para o botão Visitante (Modo Demo)
    btnVisitante?.addEventListener('click', () => {
        showDashboardScreen({ user_metadata: { full_name: "Visitante" }, email: "demo@demo.com" }, true);
        updateDashboardUI([]); 
    });

    // --- NOVA LÓGICA DO SELETOR DE MÊS ---
    // Inicializa o texto da barra de meses (Ex: "Junho de 2026")
    updateMonthDisplay();

    // Listener para voltar o mês
    document.getElementById('btn-prev-month')?.addEventListener('click', () => {
        changeSelectedMonth(-1);
    });

    // Listener para avançar o mês
    document.getElementById('btn-next-month')?.addEventListener('click', () => {
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
});

// Garante que o display visual do mês se atualize quando novos dados forem salvos ou excluídos
window.addEventListener('transactions-updated', () => {
    updateMonthDisplay();
});

// ==========================================
// 1. INICIALIZAÇÃO E MONITORAMENTO
// ==========================================
initTheme();

supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        showDashboardScreen(session.user, false);
        loadDashboardData();
    } else {
        showLoginScreen();
    }
});

window.addEventListener('transactions-updated', loadDashboardData);

// ==========================================
// 2. ATUALIZAÇÃO DE AVATAR (Perfil)
// ==========================================
document.getElementById('user-avatar')?.addEventListener('click', async () => {
    const novaUrl = prompt("Cole aqui o link (URL) da nova imagem para o seu perfil:");
    if (novaUrl && novaUrl.startsWith('http')) {
        try {
            const { error } = await supabase.auth.updateUser({
                data: { avatar_url: novaUrl }
            });
            if (error) throw error;
            document.getElementById('user-avatar').src = novaUrl;
            showToast("Avatar updated successfully!", "success");
        } catch (err) {
            showToast("Erro ao atualizar o avatar.", "error");
        }
    } else if (novaUrl) {
        showToast("Por favor, insira um link válido começando com http.", "error");
    }
});

// ==========================================
// 3. EVENTOS DA INTERFACE
// ==========================================
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
});

document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
document.getElementById('open-add-modal-btn')?.addEventListener('click', () => openModal(false));
document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
document.getElementById('cancel-modal-btn')?.addEventListener('click', closeModal);

const tabButtons = document.querySelectorAll('.sidebar-tab');
tabButtons.forEach(tab => {
    tab.addEventListener('click', () => {
        const selectedTab = tab.dataset.tab;
        if (selectedTab) {
            activateDashboardTab(selectedTab);
        }
    });
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
}

activateDashboardTab('overview');

// Atalhos de teclado
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
            openModal(false);
        }
    }
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
            // Atualizando dados via Supabase
            const { error } = await supabase.from('transactions').update(transactionData).eq('id', editId);
            if (error) throw error;
            showToast("Transação atualizada!", "success");
        } else {
            await insertTransaction(transactionData);
            showToast("Lançamento realizado!", "success");
        }
        
        closeModal();
        await loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast("Erro ao processar: " + err.message, "error");
    }
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

    if (!confirm('Deseja excluir esta anotação?')) return;

    try {
        await removeNote(noteId);
        showToast('Anotação excluída.', 'success');
        await loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('Erro ao excluir a anotação.', 'error');
    }
});

async function loadDashboardData() {
    try {
        const [transactions, notes] = await Promise.all([fetchTransactions(), fetchNotes()]);
        updateDashboardUI(transactions);
        renderNotes(notes);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        showToast("Não foi possível carregar os dados do painel.", "error");
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
                    <button type="button" class="btn-secondary note-delete-btn" data-id="${note.id}"><i class=\"ri-delete-bin-line\"></i> Excluir</button>
                </div>
            </div>
        `;
    }).join('');
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