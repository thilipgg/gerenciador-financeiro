import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://yetdstodxkkukwzckopy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldGRzdG9keGtrdWt3emNrb3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTI5MzYsImV4cCI6MjA5NTU4ODkzNn0.xpI8H3YaGGCXtPDnhwR9L2uGxzS8UrAGNOktoFyal3I";

// 1. CORREÇÃO CRÍTICA: Isolamento de sessão para não conflitar PC vs Celular
export let supabase = null;
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storageKey: 'financas_premium_session_v1', // Nome único para evitar conflito
            persistSession: true,
            autoRefreshToken: true
        }
    });
} catch (e) {
    console.error("Falha ao inicializar o cliente Supabase:", e);
}

// ----------------------------------------------------
// FUNÇÕES DE AUTENTICAÇÃO
// ----------------------------------------------------

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
}

export async function logout() {
    // Escopo local para não deslogar o PC se sair no celular
    await supabase.auth.signOut({ scope: 'local' });
    localStorage.removeItem('financas_demo_transactions');
    window.location.reload();
}

// ----------------------------------------------------
// FUNÇÕES DE DADOS (TRANSAÇÕES)
// ----------------------------------------------------

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

    // Correção: Garantir que o valor seja tratado como número com ponto, tratando vírgulas
    const valorNumerico = parseFloat(String(transaction.amount).replace(',', '.'));

    const payload = {
        user_id: user.id,
        description: transaction.description,
        amount: valorNumerico,
        type: transaction.type,
        category: transaction.category,
        date: transaction.date
    };

    const { data, error } = await supabase
        .from('transactions')
        .insert([payload])
        .select();

    if (error) throw error;
    return data[0];
}

export async function removeTransaction(id) {
    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}

// Helpers
export function isDemoMode() { return false; }