// export.js — exportação de transações para CSV (Excel-friendly)

function escapeCSV(value) {
    const s = String(value ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportTransactionsCSV(transactions, filename) {
    if (!transactions || transactions.length === 0) return false;

    const header = ['Data', 'Vencimento', 'Descrição', 'Categoria', 'Tipo', 'Status', 'Valor'];

    const rows = transactions.map(t => {
        const type = String(t.type || '').toLowerCase().trim();
        const isIncome = type === 'income' || type === 'receita';
        const status = String(t.paid_status || '').toLowerCase() === 'paid' ? 'Pago' : 'Pendente';

        return [
            t.date || '',
            t.due_date || '',
            t.description || '',
            t.category || '',
            isIncome ? 'Receita' : 'Despesa',
            status,
            String(t.amount || 0).replace('.', ',')
        ];
    });

    const csv = [header, ...rows]
        .map(row => row.map(escapeCSV).join(';'))
        .join('\r\n');

    // BOM para o Excel abrir com acentuação correta
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `vaulta-transacoes-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);

    return true;
}

export function exportNotesCSV(notes, filename) {
    if (!notes || notes.length === 0) return false;
    const header = ['Criada em', 'Conteúdo'];
    const rows = notes.map(n => [
        n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : '',
        n.content || ''
    ]);
    const csv = [header, ...rows].map(r => r.map(escapeCSV).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'vaulta-notas.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    return true;
}