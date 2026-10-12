// notifications.js — notificações locais de vencimento (sem backend)

const STORAGE_KEY = 'vaulta-last-notification-date';

export async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return await Notification.requestPermission();
}

export function getNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
}

export function checkDueDates(transactions) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayKey = today.toISOString().slice(0, 10);
    if (localStorage.getItem(STORAGE_KEY) === todayKey) return;

    const isUnpaid = t => String(t.paid_status || '').toLowerCase() !== 'paid';

    const dueToday = transactions.filter(t => {
        if (!isUnpaid(t) || !t.due_date) return false;
        const d = new Date(t.due_date + 'T00:00:00');
        return d.getTime() === today.getTime();
    });

    const dueTomorrow = transactions.filter(t => {
        if (!isUnpaid(t) || !t.due_date) return false;
        const d = new Date(t.due_date + 'T00:00:00');
        return d.getTime() === tomorrow.getTime();
    });

    if (!dueToday.length && !dueTomorrow.length) return;

    const parts = [];
    if (dueToday.length) {
        parts.push(`Vencem hoje: ${dueToday.map(t => t.description).join(', ')}.`);
    }
    if (dueTomorrow.length) {
        parts.push(`Vencem amanhã: ${dueTomorrow.map(t => t.description).join(', ')}.`);
    }

    localStorage.setItem(STORAGE_KEY, todayKey);

    try {
        new Notification('Vaulta — Contas a vencer', {
            body: parts.join(' '),
            icon: 'android-icon.png',
            badge: 'android-icon.png',
            tag: 'due-dates'
        });
    } catch (err) {
        console.warn('Falha ao emitir notificação:', err);
    }
}