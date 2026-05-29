import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://yetdstodxkkukwzckopy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldGRzdG9keGtrdWt3emNrb3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTI5MzYsImV4cCI6MjA5NTU4ODkzNn0.xpI8H3YaGGCXtPDnhwR9L2uGxzS8UrAGNOktoFyal3I";

export let supabase = null;
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Falha ao inicializar o cliente Supabase:", e);
}

// Configuração do Modo Demo (Sandbox)
const DEMO_USER = {
    id: "demo-user-12345",
    email: "demo@financaspremium.com",
    user_metadata: {
        full_name: "Visitante Premium",
        avatar_url: "https://api.dicebear.com/7.x/adventurer/svg?seed=premium"
    }
};

const SAMPLE_TRANSACTIONS = [
    { id: "1", description: "Salário Mensal", amount: 8500.00, type: "income", category: "Salário", date: getOffsetDate(0) },
    { id: "2", description: "Aluguel Apartamento", amount: 2200.00, type: "expense", category: "Moradia", date: getOffsetDate(-2) },
    { id: "3", description: "Supermercado Semanal", amount: 450.80, type: "expense", category: "Alimentação", date: getOffsetDate(-4) },
    { id: "4", description: "Freelance Desenvolvimento", amount: 1800.00, type: "income", category: "Outros", date: getOffsetDate(-5) },
    { id: "5", description: "Combustível Carro", amount: 180.00, type: "expense", category: "Transporte", date: getOffsetDate(-7) },
    { id: "6", description: "Jantar com Amigos", amount: 150.00, type: "expense", category: "Lazer", date: getOffsetDate(-10) },
    { id: "7", description: "Cinema e Pipoca", amount: 65.00, type: "expense", category: "Lazer", date: getOffsetDate(-12) },
    { id: "8", description: "Conta de Energia", amount: 280.50, type: "expense", category: "Moradia", date: getOffsetDate(-15) },
    { id: "9", description: "Curso de Inglês", amount: 350.00, type: "expense", category: "Outros", date: getOffsetDate(-20) },
    // Transações dos meses anteriores para popular o gráfico mensal
    { id: "t1", description: "Salário Anterior", amount: 8500.00, type: "income", category: "Salário", date: getOffsetDate(-30) },
    { id: "t2", description: "Supermercado Mês Passado", amount: 620.00, type: "expense", category: "Alimentação", date: getOffsetDate(-32) },
    { id: "t3", description: "Academia Mês Passado", amount: 120.00, type: "expense", category: "Outros", date: getOffsetDate(-35) },
    { id: "t4", description: "Manutenção Carro", amount: 950.00, type: "expense", category: "Transporte", date: getOffsetDate(-40) },
    { id: "t5", description: "Assinaturas Streaming", amount: 89.90, type: "expense", category: "Lazer", date: getOffsetDate(-42) },
    { id: "t6", description: "Salário Anterior 2", amount: 8500.00, type: "income", category: "Salário", date: getOffsetDate(-60) },
    { id: "t7", description: "Viagem de Fim de Semana", amount: 1200.00, type: "expense", category: "Lazer", date: getOffsetDate(-65) },
    { id: "t8", description: "Supermercado Mês -2", amount: 530.00, type: "expense", category: "Alimentação", date: getOffsetDate(-68) },
    { id: "t9", description: "Salário Anterior 3", amount: 8500.00, type: "income", category: "Salário", date: getOffsetDate(-90) },
    { id: "t10", description: "Consulta Médica", amount: 400.00, type: "expense", category: "Outros", date: getOffsetDate(-95) },
    { id: "t11", description: "Supermercado Mês -3", amount: 480.00, type: "expense", category: "Alimentação", date: getOffsetDate(-98) }
];

function getOffsetDate(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().split('T')[0];
}

// Inicializa dados do Demo se vazios
if (!localStorage.getItem('finances_demo_transactions')) {
    localStorage.setItem('finances_demo_transactions', JSON.stringify(SAMPLE_TRANSACTIONS));
}

export function isDemoMode() {
    return localStorage.getItem('finances_demo_active') === 'true';
}

export function setDemoActive(active) {
    localStorage.setItem('finances_demo_active', active ? 'true' : 'false');
    if (active) {
        localStorage.setItem('finances_demo_user', JSON.stringify(DEMO_USER));
    } else {
        localStorage.removeItem('finances_demo_user');
    }
}

// ----------------------------------------------------
// AUTENTICAÇÃO
// ----------------------------------------------------

export async function loginWithGoogle() {
    if (isDemoMode()) return DEMO_USER;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    
    if (error) throw error;
    return data;
}

export async function logout() {
    if (isDemoMode()) {
        setDemoActive(false);
        return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentUser() {
    if (isDemoMode()) {
        const u = localStorage.getItem('finances_demo_user');
        return u ? JSON.parse(u) : null;
    }
    
    if (!supabase) return null;
    
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user;
}

// ----------------------------------------------------
// OPERAÇÕES COM TRANSAÇÕES
// ----------------------------------------------------

export async function fetchTransactions() {
    if (isDemoMode()) {
        const data = localStorage.getItem('finances_demo_transactions');
        const transactions = data ? JSON.parse(data) : [];
        // Ordena por data decrescente
        return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        console.error("Erro ao buscar transações no Supabase:", error);
        throw error;
    }
    return data;
}

export async function insertTransaction(transaction) {
    if (isDemoMode()) {
        const data = localStorage.getItem('finances_demo_transactions');
        const transactions = data ? JSON.parse(data) : [];
        
        const newTransaction = {
            id: 'demo-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            user_id: DEMO_USER.id,
            description: transaction.description,
            amount: parseFloat(transaction.amount),
            type: transaction.type,
            category: transaction.category,
            date: transaction.date || getOffsetDate(0),
            created_at: new Date().toISOString()
        };
        
        transactions.push(newTransaction);
        localStorage.setItem('finances_demo_transactions', JSON.stringify(transactions));
        return newTransaction;
    }

    const user = await getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado");

    const payload = {
        user_id: user.id,
        description: transaction.description,
        amount: parseFloat(transaction.amount),
        type: transaction.type,
        category: transaction.category,
        date: transaction.date || getOffsetDate(0)
    };

    const { data, error } = await supabase
        .from('transactions')
        .insert([payload])
        .select();

    if (error) {
        console.error("Erro ao inserir transação no Supabase:", error);
        throw error;
    }
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

    if (error) {
        console.error("Erro ao deletar transação no Supabase:", error);
        throw error;
    }
    return true;
}
