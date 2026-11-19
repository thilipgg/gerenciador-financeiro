// recurrence.js — vocabulário, formatadores e gerador de ocorrências recorrentes
import { clampDayToMonth, formatDateISO, getDaysInMonth } from './utils.js';

export const RECURRENCE_OPTIONS = [
    { value: '',        label: 'Não repetir'  },
    { value: 'daily',   label: 'Diariamente'  },
    { value: 'weekly',  label: 'Semanalmente' },
    { value: 'monthly', label: 'Mensalmente'  },
    { value: 'yearly',  label: 'Anualmente'   },
];

export const RECURRENCE_LABELS = {
    daily:   'Diária',
    weekly:  'Semanal',
    monthly: 'Mensal',
    yearly:  'Anual',
};

export const RECURRENCE_ICONS = {
    daily:   'ri-refresh-line',
    weekly:  'ri-calendar-2-line',
    monthly: 'ri-calendar-line',
    yearly:  'ri-calendar-event-line',
};

export function describeRecurrence(recurrence, endDate) {
    if (!recurrence) return '';
    const label = RECURRENCE_LABELS[recurrence] || recurrence;
    if (!endDate) return label;
    const d = new Date(`${String(endDate).slice(0, 10)}T12:00:00`);
    return `${label} até ${d.toLocaleDateString('pt-BR')}`;
}

function parseISODateUTC(isoDate) {
    const [y, m, d] = String(isoDate || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
}

function formatUTCDate(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getDueDateOffsetDays(template) {
    if (!template?.due_date || !template?.date) return 0;
    const base = parseISODateUTC(template.date);
    const due = parseISODateUTC(template.due_date);
    if (!base || !due) return 0;
    return Math.round((due.getTime() - base.getTime()) / 86400000);
}

function addDaysISO(isoDate, offsetDays) {
    if (!offsetDays) return isoDate;
    const base = parseISODateUTC(isoDate);
    if (!base) return isoDate;
    base.setUTCDate(base.getUTCDate() + offsetDays);
    return formatUTCDate(base);
}

/**
 * Gera todas as ocorrências (exceto a data original do próprio template) que caem
 * dentro de (targetYear, targetMonthIndex) para uma transação recorrente.
 * Suporta: 'daily', 'weekly', 'monthly' e 'yearly'.
 *
 * Retorna array de `{ date: 'YYYY-MM-DD', due_date: 'YYYY-MM-DD' }`.
 */
export function generateOccurrencesForMonth(template, targetYear, targetMonthIndex) {
    const freq = String(template?.recurrence || '').toLowerCase().trim();
    if (!freq || !template?.date) return [];

    const startStr = String(template.date).slice(0, 10);
    const startUTC = parseISODateUTC(startStr);
    if (!startUTC) return [];

    const endStr = template.recurrence_end ? String(template.recurrence_end).slice(0, 10) : null;
    const monthStr = String(targetMonthIndex + 1).padStart(2, '0');
    const firstDay = `${targetYear}-${monthStr}-01`;
    const lastDayNum = getDaysInMonth(targetYear, targetMonthIndex);
    const lastDay = `${targetYear}-${monthStr}-${String(lastDayNum).padStart(2, '0')}`;

    // Se a recorrência encerrou antes do mês alvo ou só começa depois do mês alvo
    if (endStr && endStr < firstDay) return [];
    if (startStr > lastDay) return [];

    const effectiveEnd = endStr && endStr < lastDay ? endStr : lastDay;
    const dueOffset = getDueDateOffsetDays(template);
    const dates = [];

    if (freq === 'daily') {
        const monthStartUTC = parseISODateUTC(firstDay);
        const endUTC = parseISODateUTC(effectiveEnd);
        const cursor = new Date(Math.max(startUTC.getTime(), monthStartUTC.getTime()));

        while (cursor <= endUTC) {
            const iso = formatUTCDate(cursor);
            if (iso !== startStr) {
                dates.push(iso);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    } else if (freq === 'weekly') {
        const monthStartUTC = parseISODateUTC(firstDay);
        const endUTC = parseISODateUTC(effectiveEnd);
        const cursor = new Date(startUTC.getTime());

        if (cursor < monthStartUTC) {
            const diffDays = Math.floor((monthStartUTC.getTime() - cursor.getTime()) / 86400000);
            const weeksToSkip = Math.ceil(diffDays / 7);
            cursor.setUTCDate(cursor.getUTCDate() + weeksToSkip * 7);
        }

        while (cursor <= endUTC) {
            const iso = formatUTCDate(cursor);
            if (iso >= firstDay && iso !== startStr) {
                dates.push(iso);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 7);
        }
    } else if (freq === 'monthly') {
        const startYear = startUTC.getUTCFullYear();
        const startMonth = startUTC.getUTCMonth();
        const isAfterStartMonth =
            targetYear > startYear || (targetYear === startYear && targetMonthIndex > startMonth);

        if (isAfterStartMonth) {
            const day = clampDayToMonth(targetYear, targetMonthIndex, startUTC.getUTCDate());
            const iso = `${targetYear}-${monthStr}-${String(day).padStart(2, '0')}`;
            if (iso <= effectiveEnd && iso !== startStr) {
                dates.push(iso);
            }
        }
    } else if (freq === 'yearly') {
        const startYear = startUTC.getUTCFullYear();
        const startMonth = startUTC.getUTCMonth();

        if (targetYear > startYear && targetMonthIndex === startMonth) {
            const day = clampDayToMonth(targetYear, targetMonthIndex, startUTC.getUTCDate());
            const iso = `${targetYear}-${monthStr}-${String(day).padStart(2, '0')}`;
            if (iso <= effectiveEnd && iso !== startStr) {
                dates.push(iso);
            }
        }
    }

    return dates.map((date) => ({
        date,
        due_date: addDaysISO(date, dueOffset),
    }));
}

export function getTodayISO() {
    return formatDateISO(new Date());
}
