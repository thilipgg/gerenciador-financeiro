// utils.js — utilitários puros de formatação, datas, validação e sanitização

export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

export function debounce(fn, wait = 160) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

export function normalizeTransactionType(type) {
    const normalized = String(type || '').toLowerCase().trim();
    return (normalized === 'income' || normalized === 'receita') ? 'income' : 'expense';
}

export function normalizeStatus(status) {
    const normalized = String(status || 'paid').toLowerCase().trim();
    return normalized === 'pending' ? 'pending' : 'paid';
}

export function parseAmount(raw) {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : 0;
    }
    const str = String(raw ?? '').trim();
    if (!str) return 0;

    // Se contém vírgula e ponto (ex: "1.234,56"), remove separador de milhar
    let cleaned = str.replace(/[^\d,.-]/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.');
    }

    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value) {
    return Math.abs(Number(value) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function formatSignedCurrency(value) {
    return (Number(value) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatDateBR(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).slice(0, 10).split('-');
    if (parts.length !== 3) return String(isoDate);
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
}

export function getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

export function clampDayToMonth(year, monthIndex, day) {
    const maxDay = getDaysInMonth(year, monthIndex);
    const parsedDay = Math.max(1, parseInt(day, 10) || 1);
    return Math.min(parsedDay, maxDay);
}

/**
 * Soma meses sempre ancorado no dia 1, evitando o bug clássico de
 * `Date.prototype.setMonth` em dias 29/30/31 (ex.: 31/03 - 1 mês -> 03/03).
 */
export function addMonthsSafe(date, offset) {
    const base = date instanceof Date ? date : new Date();
    return new Date(base.getFullYear(), base.getMonth() + offset, 1);
}

/**
 * Calcula uma data ISO válida (`YYYY-MM-DD`) no mês alvo preservando o dia original,
 * ajustado ao último dia válido do mês (ex.: 31/01 -> 28/02 ou 29/02).
 */
export function getNextMonthDateString(isoDate, targetYear, targetMonthIndex) {
    const parts = String(isoDate || '').slice(0, 10).split('-');
    const originalDay = parts[2] ? parseInt(parts[2], 10) : 1;
    const clampedDay = clampDayToMonth(targetYear, targetMonthIndex, originalDay);
    const mm = String(targetMonthIndex + 1).padStart(2, '0');
    const dd = String(clampedDay).padStart(2, '0');
    return `${targetYear}-${mm}-${dd}`;
}

export function isTransactionInMonth(transaction, year, monthIndex) {
    const rawDate = transaction?.date;
    if (!rawDate) return false;
    const [y, m] = String(rawDate).slice(0, 10).split('-').map(Number);
    return y === year && (m - 1) === monthIndex;
}

export function getMonthKey(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function isOverdueTransaction(transaction, referenceNow = new Date()) {
    const comparisonDate = transaction?.due_date || transaction?.date || null;
    if (!comparisonDate) return false;

    const dueDate = new Date(`${String(comparisonDate).slice(0, 10)}T00:00:00`);
    const today = new Date(referenceNow);
    today.setHours(0, 0, 0, 0);

    return dueDate < today;
}
