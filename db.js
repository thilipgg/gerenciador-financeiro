import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://yetdstodxkkukwzckopy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldGRzdG9keGtrdWt3emNrb3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTI5MzYsImV4cCI6MjA5NTU4ODkzNn0.xpI8H3YaGGCXtPDnhwR9L2uGxzS8UrAGNOktoFyal3I";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variável de controle de estado
let currentAuthType = null; // 'Filipe' ou 'Visitante'

export function setAuthType(type) {
    currentAuthType = type;
    localStorage.setItem('auth_type', type);
}

export function getAuthType() {
    return currentAuthType || localStorage.getItem('auth_type');
}

export function isDemoMode() {
    return getAuthType() === 'Visitante';
}

// ----------------------------------------------------
// FUNÇÕES DE DADOS
// ----------------------------------------------------

export async function fetchTransactions() {
    if (isDemoMode()) {
        const data = localStorage.getItem('finances_demo_transactions');
        return data ? JSON.parse(data) : [];
    }

    // Acesso direto para o Filipe
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

    if (error) throw error;
    return data;
}

export async function insertTransaction(transaction) {
    if (isDemoMode()) {
        const data = localStorage.getItem('finances_demo_transactions');
        const transactions = data ? JSON.parse(data) : [];
        
        const newTransaction = {
            ...transaction,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString()
        };
        
        transactions.push(newTransaction);
        localStorage.setItem('finances_demo_transactions', JSON.stringify(transactions));
        return newTransaction;
    }

    // Acesso direto para o Filipe
    const { data, error } = await supabase
        .from('transactions')
        .insert([transaction])
        .select();

    if (error) throw error;
    return data[0];
}

export async function removeTransaction(id) {
    if (isDemoMode()) {
        const data = localStorage.getItem('finances_demo_transactions');
        let transactions = data ? JSON.parse(data) : [];
        transactions = transactions.filter(t => t.id !== id);
        localStorage.setItem('finances_demo_transactions', JSON.stringify(transactions));
        return true;
    }

    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}