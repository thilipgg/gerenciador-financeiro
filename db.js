import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://yetdstodxkkukwzckopy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldGRzdG9keGtrdWt3emNrb3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTI5MzYsImV4cCI6MjA5NTU4ODkzNn0.xpI8H3YaGGCXtPDnhwR9L2uGxzS8UrAGNOktoFyal3I";

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
    global: { fetch: fetchWithLocalRestProxy }
});

// Funções de Auth
export async function loginComEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // signInWithPassword já persiste a sessão no cliente. Reaplicá-la com
    // setSession faz uma segunda requisição a /auth/v1/user e pode transformar
    // um login válido em erro de rede.
    return data;
}

export async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}

export async function getCurrentUser() {
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

// Funções de Dados
export async function fetchTransactions() {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

    if (error) throw error;
    return data;
}

export async function insertTransaction(transaction) {
    const user = await getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado");

    const payload = {
        user_id: user.id,
        description: transaction.description,
        amount: parseFloat(String(transaction.amount).replace(',', '.')),
        type: transaction.type,
        category: transaction.category,
        date: transaction.date,
        paid_status: transaction.paid_status || 'pending',
        due_date: transaction.due_date || null,
        recurrence: transaction.recurrence || null,
        recurrence_end: transaction.recurrence_end || null,
        parent_id: transaction.parent_id || null
    };

    const { data, error } = await supabase.from('transactions').insert([payload]).select();
    if (error) throw error;
    return data[0];
}

export async function fetchNotes() {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

export async function insertNote(note) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const payload = {
        user_id: user.id,
        content: note.content,
    };

    const { data, error } = await supabase.from('notes').insert([payload]).select();
    if (error) throw error;
    return data[0];
}

export async function removeNote(id) {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) throw error;
    return true;
}

export async function removeTransaction(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
    return true;
}

export async function updateTransaction(id, updates) {
    const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id);

    if (error) throw error;
    return data;
}

export async function replicarTransacoesParaProximoMes(transacoes) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const payloads = transacoes.map(t => ({
        user_id: user.id,
        description: t.description,
        amount: t.amount,
        category: t.category,
        type: t.type || 'expense',
        paid_status: 'pending', 
        due_date: t.due_date,
        created_at: t.created_at, // <-- Diz para o Supabase gravar a data que calculamos acima
        date: t.date             // <-- Garante se a coluna da tabela se chamar 'date'
    }));

    const { data, error } = await supabase
        .from('transactions')
        .insert(payloads)
        .select();

    if (error) throw error;
    return data;
}

// =====================================================================
// RECORRÊNCIA — materializa templates para um mês alvo
// =====================================================================

/**
 * Garante que todas as transações recorrentes (parent_id = null, recurrence != null)
 * estejam materializadas para o mês/ano alvo. Retorna os registros novos criados.
 */
/**
 * Materializa recorrências do primeiro mês APÓS `sinceDate` até o mês alvo (inclusive).
 * Passar sinceDate = null significa "materializar apenas o mês alvo".
 */
export async function materializeRecurrences(targetYear, targetMonth, sinceDate = null) {
    const user = await getCurrentUser();
    if (!user) return [];

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
    } else {
        months.push({ year: targetYear, month: targetMonth });
    }

    const allCreated = [];

    for (const { year, month } of months) {
        const monthStr = String(month + 1).padStart(2, '0');
        const monthKey = `${year}-${monthStr}`;
        const firstDay = `${monthKey}-01`;
        const lastDayNum = new Date(year, month + 1, 0).getDate();
        const lastDay = `${monthKey}-${String(lastDayNum).padStart(2, '0')}`;

        const { data: templates, error: errT } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .not('recurrence', 'is', null)
            .is('parent_id', null);
        if (errT) throw errT;
        if (!templates || templates.length === 0) continue;

        const { data: existing, error: errE } = await supabase
            .from('transactions')
            .select('parent_id')
            .eq('user_id', user.id)
            .not('parent_id', 'is', null)
            .gte('date', firstDay)
            .lte('date', lastDay);
        if (errE) throw errE;

        const alreadyCreated = new Set((existing || []).map(e => e.parent_id));
        const payloads = [];

        for (const t of templates) {
            if (alreadyCreated.has(t.id)) continue;
            if (t.recurrence_end && t.recurrence_end < firstDay) continue;

            // ✅ CORREÇÃO: se o template já pertence a este mês,
            // ele próprio já é a ocorrência do mês — não gera cópia.
            const templateDate = String(t.date || '');
            if (templateDate >= firstDay && templateDate <= lastDay) continue;

            const originalDay = parseInt(String(t.date).split('-')[2], 10) || 1;
            const day = Math.min(originalDay, lastDayNum);
            const newDate = `${monthKey}-${String(day).padStart(2, '0')}`;

            payloads.push({
                user_id: user.id,
                description: t.description,
                amount: t.amount,
                type: t.type,
                category: t.category,
                paid_status: 'pending',
                date: newDate,
                due_date: newDate,
                recurrence: null,
                parent_id: t.id
            });
        }

        if (payloads.length) {
            const { data, error } = await supabase.from('transactions').insert(payloads).select();
            if (error) throw error;
            allCreated.push(...(data || []));
        }
    }

    return allCreated;
}

// =====================================================================
// ORÇAMENTOS
// =====================================================================

export async function fetchBudgets(month) {
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
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (error) throw error;
    return true;
}

// =====================================================================
// METAS
// =====================================================================

export async function fetchGoals() {
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
    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');
    const { data, error } = await supabase
        .from('goals')
        .insert([{
            user_id: user.id,
            name: goal.name,
            target_amount: goal.target_amount,
            current_amount: goal.current_amount || 0,
            deadline: goal.deadline || null
        }])
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function updateGoal(id, updates) {
    const { data, error } = await supabase
        .from('goals')
        .update(updates)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function removeGoal(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) throw error;
    return true;
}

/**
 * Exclui uma transação recorrente E todas as ocorrências futuras dela.
 *
 * - Se for o template (recurrence != null, parent_id == null):
 *     apaga o template e todos os filhos com date >= data do template.
 *
 * - Se for um filho (parent_id != null):
 *     apaga este filho e todos os posteriores do mesmo parent,
 *     e encerra a recorrência do template (recurrence_end = dia anterior).
 */
export async function removeTransactionAndFuture(id) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: target, error: errTarget } = await supabase
        .from('transactions')
        .select('id, date, parent_id, recurrence')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (errTarget) throw errTarget;

    // ---- CASO 1: é o template ----
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
            .eq('id', target.id);
        if (errTemplate) throw errTemplate;

        return { removed: 'template' };
    }

    // ---- CASO 2: é um filho ----
    if (target.parent_id) {
        const { data: template, error: errTemplate } = await supabase
            .from('transactions')
            .select('id, date')
            .eq('id', target.parent_id)
            .single();
        if (errTemplate) throw errTemplate;

        const { error: errFuture } = await supabase
            .from('transactions')
            .delete()
            .eq('user_id', user.id)
            .eq('parent_id', target.parent_id)
            .gte('date', target.date);
        if (errFuture) throw errFuture;

        // Encerra a recorrência no dia anterior ao filho deletado
        const stop = new Date(target.date + 'T00:00:00');
        stop.setDate(stop.getDate() - 1);
        const stopStr = stop.toISOString().slice(0, 10);

        if (stopStr >= template.date) {
            const { error: errUpdate } = await supabase
                .from('transactions')
                .update({ recurrence_end: stopStr })
                .eq('id', template.id);
            if (errUpdate) throw errUpdate;
        } else {
            // A recorrência acaba antes de começar — remove o template também
            const { error: errDel } = await supabase
                .from('transactions')
                .delete()
                .eq('id', template.id);
            if (errDel) throw errDel;
        }

        return { removed: 'child' };
    }

    // ---- CASO 3: transação normal (fallback) ----
    const { error } = await supabase.from('transactions').delete().eq('id', target.id);
    if (error) throw error;
    return { removed: 'normal' };
}
