import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { generateOccurrencesForMonth } from './recurrence.js';
import { formatDateISO, getDaysInMonth, getMonthKey, parseAmount } from './utils.js';

const SUPABASE_URL = 'https://yetdstodxkkukwzckopy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldGRzdG9keGtrdWt3emNrb3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTI5MzYsImV4cCI6MjA5NTU4ODkzNn0.xpI8H3YaGGCXtPDnhwR9L2uGxzS8UrAGNOktoFyal3I';

// O proxy local é usado apenas quando o app é servido por server.js (porta
// 3000). Ele contorna falhas HTTP/2 que alguns navegadores exibem ao chamar
// diretamente a API REST do Supabase.
function fetchWithLocalRestProxy(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isLocalServer = window.location.port === '3000';
    const isRestRequest = url.startsWith(`${SUPABASE_URL}/rest/v1/`);

    if (isLocalServer && isRestRequest) {
        return fetch(`${window.location.origin}/api/supabase${url.slice(SUPABASE_URL.length)}`, init);
    }

    return fetch(input, init);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { fetch: fetchWithLocalRestProxy },
});

// =====================================================================
// MODO VISITANTE (DEMO) — persistência 100% local no navegador
// =====================================================================

const DEMO_STORAGE_KEY = 'vaulta-demo-store-v1';
const ACCOUNTS_STORAGE_PREFIX = 'vaulta-accounts-v2:';
let demoModeActive = false;

export const DEFAULT_ACCOUNTS = [
    { id: 'carteira', name: 'CARTEIRA', icon: 'ri-wallet-3-line', balance: 0 },
    { id: 'itau', name: 'ITAU', icon: 'ri-bank-line', balance: 0 },
    { id: 'nubank', name: 'NUBANK', icon: 'ri-bank-line', balance: 0 },
    { id: 'merc-pg', name: 'MERC. PG', icon: 'ri-smartphone-line', balance: 0 },
    { id: 'inter', name: 'INTER', icon: 'ri-bank-line', balance: 0 },
    { id: 'bradesco', name: 'BRADESCO', icon: 'ri-bank-line', balance: 0 },
];

export function isDemoMode() {
    return demoModeActive;
}

export function setDemoMode(enabled) {
    demoModeActive = Boolean(enabled);
}

function generateLocalId(prefix = 'demo') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createInitialDemoStore() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const prevDate = new Date(y, m - 1, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth();

    const curMK = getMonthKey(y, m);
    const prevMK = getMonthKey(py, pm);
    const clampCur = (d) => `${curMK}-${String(Math.min(d, getDaysInMonth(y, m))).padStart(2, '0')}`;
    const clampPrev = (d) => `${prevMK}-${String(Math.min(d, getDaysInMonth(py, pm))).padStart(2, '0')}`;

    const deadlineDate = new Date(y, m + 6, 15);
    const goalId = generateLocalId('goal');

    return {
        transactions: [
            {
                id: generateLocalId('tx'),
                description: 'Salário Mensal',
                amount: 6500,
                type: 'income',
                category: 'Salário',
                date: clampPrev(5),
                due_date: clampPrev(5),
                paid_status: 'paid',
                recurrence: 'monthly',
                recurrence_end: null,
                parent_id: null,
            },
            {
                id: generateLocalId('tx'),
                description: 'Aluguel',
                amount: 1950,
                type: 'expense',
                category: 'Moradia',
                date: clampPrev(10),
                due_date: clampPrev(10),
                paid_status: 'paid',
                recurrence: 'monthly',
                recurrence_end: null,
                parent_id: null,
            },
            {
                id: generateLocalId('tx'),
                description: 'Supermercado do Mês',
                amount: 820.5,
                type: 'expense',
                category: 'Alimentação',
                date: clampCur(8),
                due_date: clampCur(8),
                paid_status: 'paid',
                recurrence: null,
                recurrence_end: null,
                parent_id: null,
            },
            {
                id: generateLocalId('tx'),
                description: 'Conta de Energia',
                amount: 245.9,
                type: 'expense',
                category: 'Moradia',
                date: clampCur(22),
                due_date: clampCur(22),
                paid_status: 'pending',
                recurrence: null,
                recurrence_end: null,
                parent_id: null,
            },
            {
                id: generateLocalId('tx'),
                description: 'Transporte e Combustível',
                amount: 380,
                type: 'expense',
                category: 'Transporte',
                date: clampCur(12),
                due_date: clampCur(12),
                paid_status: 'paid',
                recurrence: null,
                recurrence_end: null,
                parent_id: null,
            },
            {
                id: generateLocalId('tx'),
                description: 'Cinema e Jantar',
                amount: 210,
                type: 'expense',
                category: 'Lazer',
                date: clampCur(15),
                due_date: clampCur(15),
                paid_status: 'paid',
                recurrence: null,
                recurrence_end: null,
                parent_id: null,
            },
        ],
        notes: [
            {
                id: generateLocalId('note'),
                content: 'Modo visitante ativo: suas alterações ficam salvas neste navegador para você testar todos os recursos.',
                created_at: new Date().toISOString(),
            },
        ],
        budgets: [
            { id: generateLocalId('bgt'), category: 'Alimentação', amount: 1200, month: curMK },
            { id: generateLocalId('bgt'), category: 'Moradia', amount: 2500, month: curMK },
            { id: generateLocalId('bgt'), category: 'Lazer', amount: 400, month: curMK },
        ],
        goals: [
            {
                id: goalId,
                name: 'Reserva de Emergência',
                target_amount: 15000,
                current_amount: 5500,
                deadline: formatDateISO(deadlineDate),
                created_at: new Date().toISOString(),
            },
        ],
        goal_contributions: [
            {
                id: generateLocalId('ctr'),
                goal_id: goalId,
                amount: 3500,
                date: clampPrev(15),
            },
            {
                id: generateLocalId('ctr'),
                goal_id: goalId,
                amount: 2000,
                date: clampCur(5),
            },
        ],
        accounts: DEFAULT_ACCOUNTS.map((acc) => {
            if (acc.id === 'nubank') return { ...acc, balance: 2850 };
            if (acc.id === 'itau') return { ...acc, balance: 1420 };
            if (acc.id === 'carteira') return { ...acc, balance: 230 };
            return { ...acc };
        }),
    };
}

function readDemoStore() {
    try {
        const raw = localStorage.getItem(DEMO_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return {
                    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
                    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
                    budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
                    goals: Array.isArray(parsed.goals) ? parsed.goals : [],
                    goal_contributions: Array.isArray(parsed.goal_contributions) ? parsed.goal_contributions : [],
                    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
                };
            }
        }
    } catch (err) {
        console.warn('Falha ao ler dados do modo visitante:', err);
    }
    const seed = createInitialDemoStore();
    writeDemoStore(seed);
    return seed;
}

function writeDemoStore(store) {
    try {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
        console.error('Erro ao salvar dados do modo visitante:', err);
    }
}

// =====================================================================
// AUTENTICAÇÃO
// =====================================================================

export async function loginComEmail(email, password) {
    setDemoMode(false);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function logout() {
    if (isDemoMode()) {
        setDemoMode(false);
        window.location.reload();
        return;
    }
    await supabase.auth.signOut();
    window.location.reload();
}

export async function getCurrentUser() {
    if (isDemoMode()) {
        return {
            id: 'demo-user',
            email: 'demo@demo.com',
            user_metadata: { full_name: 'Visitante' },
        };
    }

    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (session?.user) return session.user;

        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
            const msg = String(error.message || '').toLowerCase();
            if (msg.includes('session') || msg.includes('not authenticated') || msg.includes('user not authenticated')) {
                return null;
            }
            throw error;
        }

        return user ?? null;
    } catch (error) {
        console.error('Erro ao recuperar usuário autenticado:', error);
        return null;
    }
}

// =====================================================================
// TRANSAÇÕES
// =====================================================================

export async function fetchTransactions() {
    if (isDemoMode()) {
        const store = readDemoStore();
        return store.transactions.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function insertTransaction(transaction) {
    const cleanPayload = {
        description: String(transaction.description || '').trim(),
        amount: parseAmount(transaction.amount),
        type: transaction.type || 'expense',
        category: transaction.category || 'Outros',
        date: transaction.date,
        paid_status: transaction.paid_status || 'pending',
        due_date: transaction.due_date || null,
        recurrence: transaction.recurrence || null,
        recurrence_end: transaction.recurrence_end || null,
        parent_id: transaction.parent_id || null,
    };

    if (isDemoMode()) {
        const store = readDemoStore();
        const record = { id: generateLocalId('tx'), ...cleanPayload, created_at: new Date().toISOString() };
        store.transactions.unshift(record);
        writeDemoStore(store);
        return record;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data, error } = await supabase
        .from('transactions')
        .insert([{ user_id: user.id, ...cleanPayload }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateTransaction(id, updates) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const idx = store.transactions.findIndex((t) => String(t.id) === String(id));
        if (idx === -1) throw new Error('Transação não encontrada');
        store.transactions[idx] = { ...store.transactions[idx], ...updates };
        writeDemoStore(store);
        return store.transactions[idx];
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select();

    if (error) throw error;
    return data?.[0] ?? null;
}

export async function removeTransaction(id) {
    if (isDemoMode()) {
        const store = readDemoStore();
        store.transactions = store.transactions.filter((t) => String(t.id) !== String(id));
        writeDemoStore(store);
        return true;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
    if (error) throw error;
    return true;
}

export async function replicarTransacoesParaProximoMes(transacoes) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const created = transacoes.map((t) => ({
            id: generateLocalId('tx'),
            description: t.description,
            amount: parseAmount(t.amount),
            category: t.category,
            type: t.type || 'expense',
            paid_status: 'pending',
            due_date: t.due_date || null,
            date: t.date,
            recurrence: null,
            recurrence_end: null,
            parent_id: null,
            created_at: t.created_at || new Date().toISOString(),
        }));
        store.transactions.unshift(...created);
        writeDemoStore(store);
        return created;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const payloads = transacoes.map((t) => ({
        user_id: user.id,
        description: t.description,
        amount: parseAmount(t.amount),
        category: t.category,
        type: t.type || 'expense',
        paid_status: 'pending',
        due_date: t.due_date || null,
        created_at: t.created_at,
        date: t.date,
    }));

    const { data, error } = await supabase
        .from('transactions')
        .insert(payloads)
        .select();

    if (error) throw error;
    return data || [];
}

// =====================================================================
// RECORRÊNCIA — materializa templates (diária, semanal, mensal, anual)
// =====================================================================

export async function materializeRecurrences(targetYear, targetMonth, sinceDate = null) {
    const months = [];
    if (sinceDate) {
        let y = sinceDate.getFullYear();
        let m = sinceDate.getMonth() + 1;
        if (m > 11) { m = 0; y++; }
        while (y < targetYear || (y === targetYear && m <= targetMonth)) {
            months.push({ year: y, month: m });
            m++;
            if (m > 11) { m = 0; y++; }
        }
        // Garante que o mês alvo sempre seja avaliado (ex.: quando o usuário acabou de criar recorrência neste mês)
        if (!months.some((item) => item.year === targetYear && item.month === targetMonth)) {
            months.push({ year: targetYear, month: targetMonth });
        }
    } else {
        months.push({ year: targetYear, month: targetMonth });
    }

    if (isDemoMode()) {
        const store = readDemoStore();
        const templates = store.transactions.filter((t) => t.recurrence && !t.parent_id);
        if (templates.length === 0) return [];

        const existingKeys = new Set(
            store.transactions
                .filter((t) => t.parent_id && t.date)
                .map((t) => `${t.parent_id}:${String(t.date).slice(0, 10)}`)
        );

        const allCreated = [];
        for (const { year, month } of months) {
            for (const tpl of templates) {
                const occurrences = generateOccurrencesForMonth(tpl, year, month);
                for (const occ of occurrences) {
                    const key = `${tpl.id}:${occ.date}`;
                    if (existingKeys.has(key)) continue;
                    existingKeys.add(key);

                    const record = {
                        id: generateLocalId('tx'),
                        description: tpl.description,
                        amount: tpl.amount,
                        type: tpl.type,
                        category: tpl.category,
                        paid_status: 'pending',
                        date: occ.date,
                        due_date: occ.due_date,
                        recurrence: null,
                        recurrence_end: null,
                        parent_id: tpl.id,
                        created_at: new Date().toISOString(),
                    };
                    store.transactions.unshift(record);
                    allCreated.push(record);
                }
            }
        }

        if (allCreated.length > 0) writeDemoStore(store);
        return allCreated;
    }

    const user = await getCurrentUser();
    if (!user) return [];

    const { data: templates, error: errT } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .not('recurrence', 'is', null)
        .is('parent_id', null);
    if (errT) throw errT;
    if (!templates || templates.length === 0) return [];

    const allCreated = [];

    for (const { year, month } of months) {
        const monthKey = getMonthKey(year, month);
        const firstDay = `${monthKey}-01`;
        const lastDay = `${monthKey}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`;

        const { data: existing, error: errE } = await supabase
            .from('transactions')
            .select('parent_id, date')
            .eq('user_id', user.id)
            .not('parent_id', 'is', null)
            .gte('date', firstDay)
            .lte('date', lastDay);
        if (errE) throw errE;

        // Deduplicação por (parent_id, date) para suportar recorrências diárias e semanais
        const existingKeys = new Set(
            (existing || []).map((e) => `${e.parent_id}:${String(e.date || '').slice(0, 10)}`)
        );

        const payloads = [];
        for (const tpl of templates) {
            const occurrences = generateOccurrencesForMonth(tpl, year, month);
            for (const occ of occurrences) {
                const key = `${tpl.id}:${occ.date}`;
                if (existingKeys.has(key)) continue;
                existingKeys.add(key);

                payloads.push({
                    user_id: user.id,
                    description: tpl.description,
                    amount: tpl.amount,
                    type: tpl.type,
                    category: tpl.category,
                    paid_status: 'pending',
                    date: occ.date,
                    due_date: occ.due_date,
                    recurrence: null,
                    parent_id: tpl.id,
                });
            }
        }

        if (payloads.length > 0) {
            const { data, error } = await supabase.from('transactions').insert(payloads).select();
            if (error) throw error;
            allCreated.push(...(data || []));
        }
    }

    return allCreated;
}

export async function removeTransactionAndFuture(id) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const target = store.transactions.find((t) => String(t.id) === String(id));
        if (!target) return { removed: 'none' };

        if (target.recurrence && !target.parent_id) {
            store.transactions = store.transactions.filter(
                (t) => String(t.id) !== String(target.id) && !(String(t.parent_id) === String(target.id) && String(t.date) >= String(target.date))
            );
            writeDemoStore(store);
            return { removed: 'template' };
        }

        if (target.parent_id) {
            const parentId = target.parent_id;
            const targetDate = String(target.date);
            store.transactions = store.transactions.filter(
                (t) => !(String(t.parent_id) === String(parentId) && String(t.date) >= targetDate)
            );

            const stop = new Date(`${targetDate.slice(0, 10)}T00:00:00`);
            stop.setDate(stop.getDate() - 1);
            const stopStr = formatDateISO(stop);

            const tplIdx = store.transactions.findIndex((t) => String(t.id) === String(parentId));
            if (tplIdx !== -1) {
                if (stopStr >= String(store.transactions[tplIdx].date)) {
                    store.transactions[tplIdx].recurrence_end = stopStr;
                } else {
                    store.transactions.splice(tplIdx, 1);
                }
            }
            writeDemoStore(store);
            return { removed: 'child' };
        }

        store.transactions = store.transactions.filter((t) => String(t.id) !== String(target.id));
        writeDemoStore(store);
        return { removed: 'normal' };
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: target, error: errTarget } = await supabase
        .from('transactions')
        .select('id, date, parent_id, recurrence')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

    if (errTarget) throw errTarget;
    if (!target) return { removed: 'none' };

    if (target.recurrence && !target.parent_id) {
        const { error: errFuture } = await supabase
            .from('transactions')
            .delete()
            .eq('user_id', user.id)
            .eq('parent_id', target.id)
            .gte('date', target.date);
        if (errFuture) throw errFuture;

        const { error: errTemplate } = await supabase
            .from('transactions')
            .delete()
            .eq('id', target.id)
            .eq('user_id', user.id);
        if (errTemplate) throw errTemplate;

        return { removed: 'template' };
    }

    if (target.parent_id) {
        const { data: template, error: errTemplate } = await supabase
            .from('transactions')
            .select('id, date')
            .eq('id', target.parent_id)
            .eq('user_id', user.id)
            .maybeSingle();
        if (errTemplate) throw errTemplate;

        const { error: errFuture } = await supabase
            .from('transactions')
            .delete()
            .eq('user_id', user.id)
            .eq('parent_id', target.parent_id)
            .gte('date', target.date);
        if (errFuture) throw errFuture;

        if (template) {
            const stop = new Date(`${String(target.date).slice(0, 10)}T00:00:00`);
            stop.setDate(stop.getDate() - 1);
            const stopStr = formatDateISO(stop);

            if (stopStr >= template.date) {
                const { error: errUpdate } = await supabase
                    .from('transactions')
                    .update({ recurrence_end: stopStr })
                    .eq('id', template.id)
                    .eq('user_id', user.id);
                if (errUpdate) throw errUpdate;
            } else {
                const { error: errDel } = await supabase
                    .from('transactions')
                    .delete()
                    .eq('id', template.id)
                    .eq('user_id', user.id);
                if (errDel) throw errDel;
            }
        }

        return { removed: 'child' };
    }

    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', target.id)
        .eq('user_id', user.id);
    if (error) throw error;
    return { removed: 'normal' };
}

// =====================================================================
// NOTAS
// =====================================================================

export async function fetchNotes() {
    if (isDemoMode()) {
        return readDemoStore().notes.slice();
    }

    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function insertNote(note) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const record = {
            id: generateLocalId('note'),
            content: note.content,
            created_at: new Date().toISOString(),
        };
        store.notes.unshift(record);
        writeDemoStore(store);
        return record;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data, error } = await supabase
        .from('notes')
        .insert([{ user_id: user.id, content: note.content }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function removeNote(id) {
    if (isDemoMode()) {
        const store = readDemoStore();
        store.notes = store.notes.filter((n) => String(n.id) !== String(id));
        writeDemoStore(store);
        return true;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
    if (error) throw error;
    return true;
}

// =====================================================================
// ORÇAMENTOS
// =====================================================================

export async function fetchBudgets(month) {
    if (isDemoMode()) {
        return readDemoStore().budgets.filter((b) => b.month === month);
    }

    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', month);
    if (error) throw error;
    return data || [];
}

export async function upsertBudget(category, amount, month) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const existing = store.budgets.find((b) => b.category === category && b.month === month);
        if (existing) {
            existing.amount = amount;
            writeDemoStore(store);
            return existing;
        }
        const record = { id: generateLocalId('bgt'), category, amount, month };
        store.budgets.push(record);
        writeDemoStore(store);
        return record;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');
    const { data, error } = await supabase
        .from('budgets')
        .upsert(
            { user_id: user.id, category, amount, month },
            { onConflict: 'user_id,category,month' }
        )
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function removeBudget(id) {
    if (isDemoMode()) {
        const store = readDemoStore();
        store.budgets = store.budgets.filter((b) => String(b.id) !== String(id));
        writeDemoStore(store);
        return true;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
    if (error) throw error;
    return true;
}

// =====================================================================
// METAS E APORTES
// =====================================================================

export async function fetchGoals() {
    if (isDemoMode()) {
        return readDemoStore().goals.slice();
    }

    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function insertGoal(goal) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const record = {
            id: generateLocalId('goal'),
            name: goal.name,
            target_amount: goal.target_amount,
            current_amount: goal.current_amount || 0,
            deadline: goal.deadline || null,
            created_at: new Date().toISOString(),
        };
        store.goals.unshift(record);
        writeDemoStore(store);
        return record;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');
    const { data, error } = await supabase
        .from('goals')
        .insert([{
            user_id: user.id,
            name: goal.name,
            target_amount: goal.target_amount,
            current_amount: goal.current_amount || 0,
            deadline: goal.deadline || null,
        }])
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function updateGoal(id, updates) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const goal = store.goals.find((g) => String(g.id) === String(id));
        if (!goal) throw new Error('Meta não encontrada');
        Object.assign(goal, updates);
        writeDemoStore(store);
        return goal;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data, error } = await supabase
        .from('goals')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function removeGoal(id) {
    if (isDemoMode()) {
        const store = readDemoStore();
        store.goals = store.goals.filter((g) => String(g.id) !== String(id));
        store.goal_contributions = store.goal_contributions.filter((c) => String(c.goal_id) !== String(id));
        writeDemoStore(store);
        return true;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
    if (error) throw error;
    return true;
}

export async function fetchGoalContributions(goalId) {
    if (isDemoMode()) {
        return readDemoStore()
            .goal_contributions
            .filter((c) => String(c.goal_id) === String(goalId))
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase
        .from('goal_contributions')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function insertGoalContribution(goalId, amount, date) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const record = { id: generateLocalId('ctr'), goal_id: goalId, amount, date };
        store.goal_contributions.unshift(record);
        writeDemoStore(store);
        return record;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');
    const { data, error } = await supabase
        .from('goal_contributions')
        .insert([{ user_id: user.id, goal_id: goalId, amount, date }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateGoalContribution(id, amount, date) {
    if (isDemoMode()) {
        const store = readDemoStore();
        const item = store.goal_contributions.find((c) => String(c.id) === String(id));
        if (!item) throw new Error('Aporte não encontrado');
        item.amount = amount;
        item.date = date;
        writeDemoStore(store);
        return item;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data, error } = await supabase
        .from('goal_contributions')
        .update({ amount, date })
        .eq('id', id)
        .eq('user_id', user.id)
        .select();
    if (error) throw error;
    return data[0];
}

export async function removeGoalContribution(id) {
    if (isDemoMode()) {
        const store = readDemoStore();
        store.goal_contributions = store.goal_contributions.filter((c) => String(c.id) !== String(id));
        writeDemoStore(store);
        return true;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
        .from('goal_contributions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
    if (error) throw error;
    return true;
}

export async function recalculateGoalTotal(goalId) {
    const contributions = await fetchGoalContributions(goalId);
    const total = contributions.reduce((sum, c) => sum + Number(c.amount || 0), 0);

    if (isDemoMode()) {
        const store = readDemoStore();
        const goal = store.goals.find((g) => String(g.id) === String(goalId));
        if (goal) {
            goal.current_amount = total;
            writeDemoStore(store);
        }
        return total;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
        .from('goals')
        .update({ current_amount: total })
        .eq('id', goalId)
        .eq('user_id', user.id);

    if (error) throw error;
    return total;
}

// =====================================================================
// CONTAS BANCÁRIAS (Controle Mensal — sincronizado com Supabase user_metadata + localStorage)
// =====================================================================

function sanitizeAccountsList(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
    }
    return list
        .filter((a) => a && typeof a.name === 'string' && a.name.trim())
        .map((a, idx) => ({
            id: String(a.id || `acc-${idx}-${Date.now()}`),
            name: a.name.trim().slice(0, 32),
            icon: typeof a.icon === 'string' && a.icon.startsWith('ri-') ? a.icon : 'ri-bank-line',
            balance: Number.isFinite(Number(a.balance)) ? Number(a.balance) : 0,
        }));
}

function migrateLegacyBankBalances() {
    try {
        const raw = localStorage.getItem('monthly-bank-balances');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return DEFAULT_ACCOUNTS.map((acc, idx) => ({
            ...acc,
            balance: parseAmount(parsed[idx] ?? 0),
        }));
    } catch {
        return null;
    }
}

export async function fetchAccounts() {
    if (isDemoMode()) {
        return sanitizeAccountsList(readDemoStore().accounts);
    }

    const user = await getCurrentUser();
    const userKey = user?.id ? `${ACCOUNTS_STORAGE_PREFIX}${user.id}` : `${ACCOUNTS_STORAGE_PREFIX}anon`;

    // 1. Tenta carregar do user_metadata do Supabase (sincronizado entre dispositivos)
    const remoteAccounts = user?.user_metadata?.monthly_accounts;
    if (Array.isArray(remoteAccounts) && remoteAccounts.length > 0) {
        const normalized = sanitizeAccountsList(remoteAccounts);
        try {
            localStorage.setItem(userKey, JSON.stringify(normalized));
        } catch {}
        return normalized;
    }

    // 2. Fallback para localStorage da conta ou migração do formato legado
    try {
        const localRaw = localStorage.getItem(userKey);
        if (localRaw) {
            return sanitizeAccountsList(JSON.parse(localRaw));
        }
    } catch {}

    const migrated = migrateLegacyBankBalances();
    if (migrated) return migrated;

    return DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
}

export async function saveAccounts(accounts) {
    const normalized = sanitizeAccountsList(accounts);

    if (isDemoMode()) {
        const store = readDemoStore();
        store.accounts = normalized;
        writeDemoStore(store);
        return normalized;
    }

    const user = await getCurrentUser();
    const userKey = user?.id ? `${ACCOUNTS_STORAGE_PREFIX}${user.id}` : `${ACCOUNTS_STORAGE_PREFIX}anon`;

    try {
        localStorage.setItem(userKey, JSON.stringify(normalized));
    } catch (err) {
        console.error('Erro ao salvar contas localmente:', err);
    }

    // Sincroniza na nuvem via user_metadata do Supabase (não exige tabela adicional)
    if (user?.id) {
        try {
            await supabase.auth.updateUser({
                data: { monthly_accounts: normalized },
            });
        } catch (err) {
            console.warn('Falha ao sincronizar contas com Supabase (mantido localmente):', err);
        }
    }

    return normalized;
}
