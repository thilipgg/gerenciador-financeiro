// export.js — exportação de transações e notas para CSV (Excel-friendly + proteção contra formula injection)
import { normalizeStatus, normalizeTransactionType } from './utils.js';

export function escapeCSV(value) {
    let s = String(value ?? '');
    // Previne CSV Formula Injection em planilhas (Excel/Sheets), preservando números negativos simples
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?$/.test(s))) {
        s = `'${s}`;
    }
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildTransactionsCSV(transactions) {
    const header = ['Data', 'Vencimento', 'Descrição', 'Categoria', 'Tipo', 'Status', 'Valor'];

    const rows = transactions.map((t) => {
        const isIncome = normalizeTransactionType(t.type) === 'income';
        const status = normalizeStatus(t.paid_status) === 'paid' ? 'Pago' : 'Pendente';

        return [
            t.date || '',
            t.due_date || '',
            t.description || '',
            t.category || '',
            isIncome ? 'Receita' : 'Despesa',
            status,
            String(Number(t.amount || 0).toFixed(2)).replace('.', ','),
        ];
    });

    return [header, ...rows]
        .map((row) => row.map(escapeCSV).join(';'))
        .join('\r\n');
}

function triggerCSVDownload(csvContent, filename) {
    // BOM UTF-8 para o Excel abrir com acentuação correta
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);
}

export function exportTransactionsCSV(transactions, filename) {
    if (!transactions || transactions.length === 0) return false;

    const csv = buildTransactionsCSV(transactions);
    const defaultName = `fs-ltda-transacoes-${new Date().toISOString().slice(0, 10)}.csv`;
    triggerCSVDownload(csv, filename || defaultName);
    return true;
}

export function exportNotesCSV(notes, filename) {
    if (!notes || notes.length === 0) return false;
    const header = ['Criada em', 'Conteúdo'];
    const rows = notes.map((n) => [
        n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : '',
        n.content || '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCSV).join(';')).join('\r\n');
    triggerCSVDownload(csv, filename || 'fs-ltda-notas.csv');
    return true;
}
