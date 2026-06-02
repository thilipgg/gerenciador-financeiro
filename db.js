import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://yetdstodxkkukwzckopy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldGRzdG9keGtrdWt3emNrb3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTI5MzYsImV4cCI6MjA5NTU4ODkzNn0.xpI8H3YaGGCXtPDnhwR9L2uGxzS8UrAGNOktoFyal3I";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
});

// Funções de Auth
export async function loginComEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
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
        date: transaction.date
    };

    const { data, error } = await supabase.from('transactions').insert([payload]).select();
    if (error) throw error;
    return data[0];
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