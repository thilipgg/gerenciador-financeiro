// recurrence.js — vocabulário e formatadores de recorrência

export const RECURRENCE_OPTIONS = [
    { value: '',        label: 'Não repetir'  },
    { value: 'daily',   label: 'Diariamente'  },
    { value: 'weekly',  label: 'Semanalmente' },
    { value: 'monthly', label: 'Mensalmente'  },
    { value: 'yearly',  label: 'Anualmente'   }
];

export const RECURRENCE_LABELS = {
    daily:   'Diária',
    weekly:  'Semanal',
    monthly: 'Mensal',
    yearly:  'Anual'
};

export const RECURRENCE_ICONS = {
    daily:   'ri-refresh-line',
    weekly:  'ri-calendar-2-line',
    monthly: 'ri-calendar-line',
    yearly:  'ri-calendar-event-line'
};

export function describeRecurrence(recurrence, endDate) {
    if (!recurrence) return '';
    const label = RECURRENCE_LABELS[recurrence] || recurrence;
    if (!endDate) return label;
    const d = new Date(endDate + 'T12:00:00');
    return `${label} até ${d.toLocaleDateString('pt-BR')}`;
}