// insights.js — motor de insights, orçamentos, metas e projeção (100% client-side)
import { isTransactionInMonth, normalizeTransactionType } from './utils.js';
import { generateOccurrencesForMonth } from './recurrence.js';

function normalizeRefDate(ref) {
    if (!ref) return new Date();
    if (ref instanceof Date) return ref;
    if (typeof ref === 'object' && 'month' in ref && 'year' in ref) {
        return new Date(ref.year, ref.month, 1);
    }
    return new Date();
}

function sum(arr, key = 'amount') {
    return arr.reduce((s, t) => s + (parseFloat(t[key]) || 0), 0);
}

// ---------------------------------------------------------------
// INSIGHTS
// ---------------------------------------------------------------
export function generateInsights(transactions, refDate = new Date()) {
    const ref = normalizeRefDate(refDate);
    const insights = [];
    const year = ref.getFullYear();
    const month = ref.getMonth();

    const prev = new Date(year, month - 1, 1);

    const curExp = transactions.filter((t) =>
        normalizeTransactionType(t.type) === 'expense' && isTransactionInMonth(t, year, month)
    );
    const prevExp = transactions.filter((t) =>
        normalizeTransactionType(t.type) === 'expense' &&
        isTransactionInMonth(t, prev.getFullYear(), prev.getMonth())
    );

    const curTotal = sum(curExp);
    const prevTotal = sum(prevExp);

    // 1. Comparativo com mês anterior
    if (prevTotal > 0 && curTotal > 0) {
        const diff = ((curTotal - prevTotal) / prevTotal) * 100;
        if (Math.abs(diff) >= 10) {
            insights.push({
                type: diff > 0 ? 'warning' : 'success',
                icon: diff > 0 ? 'ri-arrow-up-line' : 'ri-arrow-down-line',
                title: diff > 0 ? 'Gastos aumentaram' : 'Gastos diminuíram',
                message: `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'a mais' : 'a menos'} que no mês anterior.`,
            });
        }
    }

    // 2. Maior categoria
    const byCat = {};
    curExp.forEach((t) => {
        const c = t.category || 'Outros';
        byCat[c] = (byCat[c] || 0) + (parseFloat(t.amount) || 0);
    });
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    if (topCat) {
        insights.push({
            type: 'info',
            icon: 'ri-pie-chart-line',
            title: 'Maior categoria',
            message: `${topCat[0]}: R$ ${topCat[1].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        });
    }

    // 3. Maior despesa individual
    const biggest = curExp.reduce(
        (max, t) => ((parseFloat(t.amount) || 0) > (parseFloat(max?.amount) || 0) ? t : max),
        null
    );
    if (biggest) {
        insights.push({
            type: 'warning',
            icon: 'ri-alert-line',
            title: 'Maior despesa',
            message: `${biggest.description} — R$ ${(parseFloat(biggest.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        });
    }

    // 4. Taxa de poupança
    const incomeThisMonth = transactions.filter(
        (t) => normalizeTransactionType(t.type) === 'income' && isTransactionInMonth(t, year, month)
    );
    const income = sum(incomeThisMonth);

    if (income > 0) {
        const rate = ((income - curTotal) / income) * 100;
        insights.push({
            type: rate >= 20 ? 'success' : rate >= 0 ? 'info' : 'warning',
            icon: 'ri-wallet-line',
            title: 'Taxa de poupança',
            message: rate >= 0
                ? `${rate.toFixed(0)}% da renda sobrou este mês.`
                : `Despesas superaram a renda em ${Math.abs(rate).toFixed(0)}% este mês.`,
        });
    }

    return insights;
}

// ---------------------------------------------------------------
// COMPARATIVO MÊS A MÊS POR CONTA / LANÇAMENTO
// ---------------------------------------------------------------
const SHORT_MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function normalizeBillKey(description) {
    return String(description || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

export function compareTransactionsMonthOverMonth(transactions, refDate = new Date()) {
    const ref = normalizeRefDate(refDate);
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const prev = new Date(year, month - 1, 1);
    const prevYear = prev.getFullYear();
    const prevMonth = prev.getMonth();

    const list = Array.isArray(transactions) ? transactions : [];
    const curMap = new Map();
    const prevMap = new Map();

    for (const t of list) {
        if (normalizeTransactionType(t.type) !== 'expense') continue;
        const amount = parseFloat(t.amount) || 0;
        if (amount <= 0) continue;

        const key = normalizeBillKey(t.description);
        if (!key) continue;

        if (isTransactionInMonth(t, year, month)) {
            const existing = curMap.get(key) || {
                description: String(t.description || '').trim(),
                category: t.category || 'Outros',
                amount: 0,
                count: 0,
            };
            existing.amount += amount;
            existing.count += 1;
            curMap.set(key, existing);
        } else if (isTransactionInMonth(t, prevYear, prevMonth)) {
            const existing = prevMap.get(key) || {
                description: String(t.description || '').trim(),
                category: t.category || 'Outros',
                amount: 0,
                count: 0,
            };
            existing.amount += amount;
            existing.count += 1;
            prevMap.set(key, existing);
        }
    }

    const items = [];
    let increasesCount = 0;
    let decreasesCount = 0;
    let sameCount = 0;
    let prevTotalComparable = 0;
    let curTotalComparable = 0;

    for (const [key, cur] of curMap.entries()) {
        const prevItem = prevMap.get(key);
        if (!prevItem || prevItem.amount <= 0) continue;

        const diff = cur.amount - prevItem.amount;
        const pct = (diff / prevItem.amount) * 100;
        const direction = diff > 0.005 ? 'up' : diff < -0.005 ? 'down' : 'same';

        if (direction === 'up') increasesCount += 1;
        else if (direction === 'down') decreasesCount += 1;
        else sameCount += 1;

        prevTotalComparable += prevItem.amount;
        curTotalComparable += cur.amount;

        items.push({
            key,
            description: cur.description || prevItem.description,
            category: cur.category || prevItem.category || 'Outros',
            prevAmount: prevItem.amount,
            curAmount: cur.amount,
            diff,
            pct,
            direction,
        });
    }

    const orderWeight = { up: 0, down: 1, same: 2 };
    items.sort((a, b) => {
        if (orderWeight[a.direction] !== orderWeight[b.direction]) {
            return orderWeight[a.direction] - orderWeight[b.direction];
        }
        if (a.direction === 'up') return b.pct - a.pct || b.diff - a.diff;
        if (a.direction === 'down') return a.pct - b.pct || a.diff - b.diff;
        return b.curAmount - a.curAmount;
    });

    const netDiff = curTotalComparable - prevTotalComparable;
    const netPct = prevTotalComparable > 0 ? (netDiff / prevTotalComparable) * 100 : 0;

    return {
        prevLabel: `${SHORT_MONTHS_PT[prevMonth]}/${String(prevYear).slice(-2)}`,
        curLabel: `${SHORT_MONTHS_PT[month]}/${String(year).slice(-2)}`,
        items,
        increasesCount,
        decreasesCount,
        sameCount,
        prevTotalComparable,
        curTotalComparable,
        netDiff,
        netPct,
    };
}

// ---------------------------------------------------------------
// ORÇAMENTOS — status de cada categoria no mês
// ---------------------------------------------------------------
export function generateBudgetStatus(budgets, transactions, refDate = new Date()) {
    const ref = normalizeRefDate(refDate);
    const year = ref.getFullYear();
    const month = ref.getMonth();

    const spending = {};
    transactions.forEach((t) => {
        if (normalizeTransactionType(t.type) !== 'expense') return;
        if (!isTransactionInMonth(t, year, month)) return;
        const c = t.category || 'Outros';
        spending[c] = (spending[c] || 0) + (parseFloat(t.amount) || 0);
    });

    return budgets
        .map((b) => {
            const spent = spending[b.category] || 0;
            const amount = Number(b.amount) || 0;
            const pct = amount > 0 ? (spent / amount) * 100 : (spent > 0 ? 100 : 0);
            const status = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok';
            return { ...b, spent, percentage: pct, status };
        })
        .sort((a, b) => b.percentage - a.percentage);
}

// ---------------------------------------------------------------
// PROJEÇÃO — fluxo de caixa dos próximos N meses
// ---------------------------------------------------------------
/**
 * Projeta o saldo dos próximos `monthsAhead` meses levando em conta:
 * - Média histórica considerando APENAS meses que tiveram movimentação (até 3 meses anteriores + mês atual se não houver anteriores)
 * - Saldo inicial real das contas bancárias (se informado e > 0), ou saldo líquido acumulado até o mês de referência
 * - Lançamentos já agendados e recorrências programadas para os meses futuros (evitando dupla contagem)
 */
export function projectCashFlow(transactions, monthsAhead = 3, refDate = new Date(), options = {}) {
    const ref = normalizeRefDate(refDate);
    const list = Array.isArray(transactions) ? transactions : [];

    // Avalia os últimos 3 meses (e inclui o mês atual se não houver histórico anterior)
    const candidateMonths = [];
    for (let i = 1; i <= 3; i++) {
        candidateMonths.push(new Date(ref.getFullYear(), ref.getMonth() - i, 1));
    }

    const activeMonthTotals = candidateMonths
        .map((d) => {
            const inM = list.filter((t) => isTransactionInMonth(t, d.getFullYear(), d.getMonth()));
            if (inM.length === 0) return null;
            return {
                inc: sum(inM.filter((t) => normalizeTransactionType(t.type) === 'income')),
                exp: sum(inM.filter((t) => normalizeTransactionType(t.type) === 'expense')),
            };
        })
        .filter(Boolean);

    // Fallback: se não há dados nos 3 meses anteriores, usa o próprio mês de referência
    if (activeMonthTotals.length === 0) {
        const curMonthTx = list.filter((t) => isTransactionInMonth(t, ref.getFullYear(), ref.getMonth()));
        if (curMonthTx.length > 0) {
            activeMonthTotals.push({
                inc: sum(curMonthTx.filter((t) => normalizeTransactionType(t.type) === 'income')),
                exp: sum(curMonthTx.filter((t) => normalizeTransactionType(t.type) === 'expense')),
            });
        }
    }

    const avgInc = activeMonthTotals.length
        ? activeMonthTotals.reduce((s, m) => s + m.inc, 0) / activeMonthTotals.length
        : 0;
    const avgExp = activeMonthTotals.length
        ? activeMonthTotals.reduce((s, m) => s + m.exp, 0) / activeMonthTotals.length
        : 0;

    // Saldo inicial: prefere saldo informado nas contas bancárias quando disponível
    const refEndKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-31`;
    const txUpToRef = list.filter((t) => t.date && String(t.date).slice(0, 10) <= refEndKey);
    const historicalBalance =
        sum(txUpToRef.filter((t) => normalizeTransactionType(t.type) === 'income')) -
        sum(txUpToRef.filter((t) => normalizeTransactionType(t.type) === 'expense'));

    const hasRealBankBalance =
        typeof options.currentBankBalance === 'number' &&
        Number.isFinite(options.currentBankBalance) &&
        options.currentBankBalance > 0;

    let balance = hasRealBankBalance ? options.currentBankBalance : historicalBalance;

    const recurringTemplates = list.filter((t) => t.recurrence && !t.parent_id);

    const labels = [];
    const data = [];
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    for (let i = 1; i <= monthsAhead; i++) {
        const d = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        labels.push(`${meses[m]}/${String(y).slice(-2)}`);

        // Transações já registradas no mês futuro
        const existingFuture = list.filter((t) => isTransactionInMonth(t, y, m));
        const existingKeys = new Set(
            existingFuture.filter((t) => t.parent_id).map((t) => `${t.parent_id}:${String(t.date).slice(0, 10)}`)
        );

        let scheduledInc = sum(existingFuture.filter((t) => normalizeTransactionType(t.type) === 'income'));
        let scheduledExp = sum(existingFuture.filter((t) => normalizeTransactionType(t.type) === 'expense'));

        // Soma ocorrências recorrentes previstas ainda não materializadas
        for (const tpl of recurringTemplates) {
            const occurrences = generateOccurrencesForMonth(tpl, y, m);
            for (const occ of occurrences) {
                if (existingKeys.has(`${tpl.id}:${occ.date}`)) continue;
                const amt = parseFloat(tpl.amount) || 0;
                if (normalizeTransactionType(tpl.type) === 'income') {
                    scheduledInc += amt;
                } else {
                    scheduledExp += amt;
                }
            }
        }

        // Usa o maior entre previsto agendado e média histórica para não subestimar gastos variáveis
        const projectedInc = Math.max(scheduledInc, avgInc);
        const projectedExp = Math.max(scheduledExp, avgExp);

        balance += projectedInc - projectedExp;
        data.push(Math.round(balance * 100) / 100);
    }

    return {
        labels,
        data,
        avgIncome: avgInc,
        avgExpense: avgExp,
        usedRealAccounts: hasRealBankBalance,
    };
}

// ---------------------------------------------------------------
// LIMITE DIÁRIO E SEMANAL ATÉ O PRÓXIMO PAGAMENTO
// ---------------------------------------------------------------
function formatShortDayMonth(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}`;
}

export function calculatePaydayAllowance({
    totalBankBalance = 0,
    pendingExpenses = 0,
    payday = 5,
    useAfterPending = false,
    referenceDate = new Date(),
} = {}) {
    const safePayday = Math.min(28, Math.max(1, parseInt(payday, 10) || 5));
    const ref = referenceDate instanceof Date ? referenceDate : new Date();
    const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

    let nextPayday;
    let prevPayday;
    if (today.getDate() < safePayday) {
        nextPayday = new Date(today.getFullYear(), today.getMonth(), safePayday);
        prevPayday = new Date(today.getFullYear(), today.getMonth() - 1, safePayday);
    } else {
        nextPayday = new Date(today.getFullYear(), today.getMonth() + 1, safePayday);
        prevPayday = new Date(today.getFullYear(), today.getMonth(), safePayday);
    }

    const MS_PER_DAY = 86400000;
    const daysUntilPayday = Math.max(1, Math.round((nextPayday.getTime() - today.getTime()) / MS_PER_DAY));
    const cycleTotalDays = Math.max(1, Math.round((nextPayday.getTime() - prevPayday.getTime()) / MS_PER_DAY));
    const cycleElapsedDays = Math.max(0, Math.min(cycleTotalDays, cycleTotalDays - daysUntilPayday));
    const cycleElapsedPct = Math.round((cycleElapsedDays / cycleTotalDays) * 100);

    const bank = Number(totalBankBalance) || 0;
    const pending = Math.max(0, Number(pendingExpenses) || 0);
    const baseAmount = useAfterPending ? bank - pending : bank;
    const safeBase = Math.max(0, baseAmount);
    const isDeficit = baseAmount < 0;

    const dailyAllowance = safeBase / daysUntilPayday;
    const weeklyAllowance = daysUntilPayday <= 7 ? safeBase : dailyAllowance * 7;
    const weeksRemaining = daysUntilPayday / 7;

    // Distribui os dias restantes em blocos de até 7 dias até a véspera do pagamento
    const weeklySlices = [];
    let offset = 0;
    let sliceIndex = 1;
    while (offset < daysUntilPayday) {
        const chunkDays = Math.min(7, daysUntilPayday - offset);
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset + chunkDays - 1);
        const amount = (safeBase / daysUntilPayday) * chunkDays;

        weeklySlices.push({
            index: sliceIndex,
            label: chunkDays === 7 ? `Semana ${sliceIndex}` : (sliceIndex === 1 ? 'Período atual' : `Reta final`),
            rangeLabel: chunkDays === 1
                ? formatShortDayMonth(start)
                : `${formatShortDayMonth(start)} a ${formatShortDayMonth(end)}`,
            days: chunkDays,
            amount,
        });

        offset += chunkDays;
        sliceIndex++;
    }

    return {
        payday: safePayday,
        nextPayday,
        nextPaydayShort: formatShortDayMonth(nextPayday),
        nextPaydayFull: nextPayday.toLocaleDateString('pt-BR'),
        prevPaydayShort: formatShortDayMonth(prevPayday),
        daysUntilPayday,
        cycleTotalDays,
        cycleElapsedPct,
        baseAmount,
        safeBase,
        isDeficit,
        dailyAllowance,
        weeklyAllowance,
        weeksRemaining,
        weeklySlices,
    };
}
