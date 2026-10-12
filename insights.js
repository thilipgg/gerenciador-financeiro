// insights.js — motor de insights, orçamentos, metas e projeção (100% client-side)

// ---------------------------------------------------------------
// NORMALIZAÇÃO: aceita Date OU { month, year } como refDate
// ---------------------------------------------------------------
function normalizeRefDate(ref) {
    if (!ref) return new Date();
    if (ref instanceof Date) return ref;
    if (typeof ref === 'object' && 'month' in ref && 'year' in ref) {
        return new Date(ref.year, ref.month, 1);
    }
    return new Date();
}

function normType(t) {
    const n = String(t.type || '').toLowerCase().trim();
    return (n === 'income' || n === 'receita') ? 'income' : 'expense';
}

function inMonth(dateStr, year, month) {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
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

    const curExp = transactions.filter(t =>
        normType(t) === 'expense' && inMonth(t.date, year, month)
    );
    const prevExp = transactions.filter(t =>
        normType(t) === 'expense' &&
        inMonth(t.date, prev.getFullYear(), prev.getMonth())
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
                message: `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'a mais' : 'a menos'} que no mês anterior.`
            });
        }
    }

    // 2. Maior categoria
    const byCat = {};
    curExp.forEach(t => {
        const c = t.category || 'Outros';
        byCat[c] = (byCat[c] || 0) + (parseFloat(t.amount) || 0);
    });
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    if (topCat) {
        insights.push({
            type: 'info',
            icon: 'ri-pie-chart-line',
            title: 'Maior categoria',
            message: `${topCat[0]}: R$ ${topCat[1].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        });
    }

    // 3. Maior despesa individual
    const biggest = curExp.reduce((max, t) =>
        (parseFloat(t.amount) || 0) > (parseFloat(max?.amount) || 0) ? t : max, null);
    if (biggest) {
        insights.push({
            type: 'warning',
            icon: 'ri-alert-line',
            title: 'Maior despesa',
            message: `${biggest.description} — R$ ${(parseFloat(biggest.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        });
    }

    // 4. Taxa de poupança
    const incomeThisMonth = transactions
        .filter(t => normType(t) === 'income' && inMonth(t.date, year, month));
    const income = sum(incomeThisMonth);

    if (income > 0) {
        const rate = ((income - curTotal) / income) * 100;
        insights.push({
            type: rate >= 20 ? 'success' : rate >= 0 ? 'info' : 'warning',
            icon: 'ri-wallet-line',
            title: 'Taxa de poupança',
            message: `${rate.toFixed(0)}% da renda sobrou este mês.`
        });
    }

    return insights;
}

// ---------------------------------------------------------------
// ORÇAMENTOS — status de cada categoria no mês
// ---------------------------------------------------------------
export function generateBudgetStatus(budgets, transactions, refDate = new Date()) {
    const ref = normalizeRefDate(refDate);
    const year = ref.getFullYear();
    const month = ref.getMonth();

    const spending = {};
    transactions.forEach(t => {
        if (normType(t) !== 'expense') return;
        if (!inMonth(t.date, year, month)) return;
        const c = t.category || 'Outros';
        spending[c] = (spending[c] || 0) + (parseFloat(t.amount) || 0);
    });

    return budgets
        .map(b => {
            const spent = spending[b.category] || 0;
            const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
            const status = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok';
            return { ...b, spent, percentage: pct, status };
        })
        .sort((a, b) => b.percentage - a.percentage);
}

// ---------------------------------------------------------------
// PROJEÇÃO — fluxo de caixa dos próximos N meses
// ---------------------------------------------------------------
export function projectCashFlow(transactions, monthsAhead = 3, refDate = new Date()) {
    const ref = normalizeRefDate(refDate);

    const baseMonths = [];
    for (let i = 1; i <= 3; i++) {
        baseMonths.push(new Date(ref.getFullYear(), ref.getMonth() - i, 1));
    }

    const monthTotals = baseMonths.map(d => {
        const inM = transactions.filter(t => inMonth(t.date, d.getFullYear(), d.getMonth()));
        return {
            inc: sum(inM.filter(t => normType(t) === 'income')),
            exp: sum(inM.filter(t => normType(t) === 'expense'))
        };
    });

    const avgInc = monthTotals.length
        ? monthTotals.reduce((s, m) => s + m.inc, 0) / monthTotals.length
        : 0;
    const avgExp = monthTotals.length
        ? monthTotals.reduce((s, m) => s + m.exp, 0) / monthTotals.length
        : 0;

    let balance = sum(transactions.filter(t => normType(t) === 'income'))
                - sum(transactions.filter(t => normType(t) === 'expense'));

    const labels = [];
    const data = [];
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    for (let i = 1; i <= monthsAhead; i++) {
        const d = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
        labels.push(`${meses[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`);
        balance += (avgInc - avgExp);
        data.push(balance);
    }

    return { labels, data, avgIncome: avgInc, avgExpense: avgExp };
}