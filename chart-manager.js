// Gerenciador de Gráficos (Chart.js)
import { isTransactionInMonth, normalizeTransactionType } from './utils.js';

let monthlyChartInstance = null;
let categoryChartInstance = null;
let projectionChartInstance = null;

// Rastreia o tema atual dos gráficos principais para redesenhar apenas quando mudar
let chartsTheme = null;
let projectionTheme = null;

// Paleta de cores consistente para os gráficos
const CATEGORY_COLORS = {
    'Alimentação': 'hsl(15, 85%, 60%)',
    'Moradia': 'hsl(210, 85%, 55%)',
    'Transporte': 'hsl(45, 95%, 50%)',
    'Lazer': 'hsl(280, 75%, 60%)',
    'Salário': 'hsl(145, 65%, 45%)',
    'Outros': 'hsl(190, 70%, 50%)',
};

const COLOR_PALETTE = [
    '#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#a855f7',
    '#ec4899', '#3b82f6', '#10b981', '#f97316', '#06b6d4',
];

function getCategoryColor(category) {
    if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
    // Hash determinístico para evitar cores aleatórias piscando a cada renderização
    let hash = 0;
    const str = String(category || 'Outros');
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function getThemeColors(isDarkTheme) {
    return {
        textColor: isDarkTheme ? 'rgba(255, 255, 255, 0.72)' : 'rgba(16, 32, 63, 0.65)',
        gridColor: isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(16, 32, 63, 0.06)',
        tooltipBg: isDarkTheme ? 'hsl(220, 25%, 15%)' : '#ffffff',
        tooltipTitle: isDarkTheme ? '#ffffff' : '#132a4f',
        tooltipBody: isDarkTheme ? '#e5e7eb' : '#374151',
        tooltipBorder: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    };
}

// ----------------------------------------------------
// PROCESSAMENTO DE DADOS
// ----------------------------------------------------

function processMonthlyCashFlow(transactions) {
    const dataByMonth = {};

    (transactions || []).forEach((t) => {
        if (!t.date) return;
        const yearMonth = String(t.date).substring(0, 7);
        const amt = parseFloat(t.amount) || 0;
        if (!dataByMonth[yearMonth]) {
            dataByMonth[yearMonth] = { income: 0, expense: 0 };
        }
        if (normalizeTransactionType(t.type) === 'income') {
            dataByMonth[yearMonth].income += amt;
        } else {
            dataByMonth[yearMonth].expense += amt;
        }
    });

    const sortedMonths = Object.keys(dataByMonth).sort().slice(-12);

    if (sortedMonths.length === 0) {
        const hoje = new Date();
        const mesAtualStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        sortedMonths.push(mesAtualStr);
        dataByMonth[mesAtualStr] = { income: 0, expense: 0 };
    }

    const nomeMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const labels = [];
    const incomes = [];
    const expenses = [];

    sortedMonths.forEach((ym) => {
        const [year, month] = ym.split('-');
        const idx = parseInt(month, 10) - 1;
        labels.push(`${nomeMeses[idx] || month}/${String(year).substring(2)}`);
        incomes.push(Math.round(dataByMonth[ym].income * 100) / 100);
        expenses.push(Math.round(dataByMonth[ym].expense * 100) / 100);
    });

    return { labels, incomes, expenses };
}

function processCategoryExpenses(transactions, selection) {
    const categoriesMap = {};

    const filtered = (transactions || []).filter((t) => {
        if (normalizeTransactionType(t.type) !== 'expense') return false;
        if (selection && typeof selection.year === 'number' && typeof selection.month === 'number') {
            return isTransactionInMonth(t, selection.year, selection.month);
        }
        return true;
    });

    filtered.forEach((t) => {
        const category = t.category || 'Outros';
        categoriesMap[category] = (categoriesMap[category] || 0) + (parseFloat(t.amount) || 0);
    });

    const entries = Object.entries(categoriesMap).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(([cat]) => cat);
    const data = entries.map(([, total]) => Math.round(total * 100) / 100);
    const backgroundColors = labels.map((c) => getCategoryColor(c));

    return { labels, data, backgroundColors };
}

// ----------------------------------------------------
// INICIALIZAÇÃO E ATUALIZAÇÃO (REUTILIZA INSTÂNCIAS)
// ----------------------------------------------------

export function renderCharts(transactions, isDarkTheme, selection = null) {
    if (typeof Chart === 'undefined') return;
    if (typeof isDarkTheme !== 'boolean') {
        isDarkTheme = document.documentElement.classList.contains('dark');
    }

    const themeChanged = chartsTheme !== isDarkTheme;
    chartsTheme = isDarkTheme;
    const theme = getThemeColors(isDarkTheme);

    const allTx = Array.isArray(transactions) ? transactions : [];
    const monthlyData = processMonthlyCashFlow(allTx);
    const categoryData = processCategoryExpenses(allTx, selection);

    // -------- Gráfico de Receitas vs. Despesas Mensais (Barras agrupadas) --------
    const ctxMonthly = document.getElementById('monthlyExpensesChart');
    if (ctxMonthly) {
        const ctx = ctxMonthly.getContext('2d');
        const buildExpenseGradient = () => {
            const g = ctx.createLinearGradient(0, 0, 0, 260);
            g.addColorStop(0, isDarkTheme ? 'rgba(91, 175, 255, 0.96)' : 'rgba(55, 134, 229, 0.92)');
            g.addColorStop(1, isDarkTheme ? 'rgba(24, 73, 133, 0.45)' : 'rgba(185, 220, 255, 0.35)');
            return g;
        };
        const buildIncomeGradient = () => {
            const g = ctx.createLinearGradient(0, 0, 0, 260);
            g.addColorStop(0, isDarkTheme ? 'rgba(78, 229, 142, 0.92)' : 'rgba(31, 174, 102, 0.9)');
            g.addColorStop(1, isDarkTheme ? 'rgba(22, 118, 72, 0.35)' : 'rgba(167, 243, 208, 0.35)');
            return g;
        };

        if (!monthlyChartInstance) {
            monthlyChartInstance = new Chart(ctxMonthly, {
                type: 'bar',
                data: {
                    labels: monthlyData.labels,
                    datasets: [
                        {
                            label: 'Receitas',
                            data: monthlyData.incomes,
                            backgroundColor: buildIncomeGradient(),
                            borderColor: isDarkTheme ? 'rgba(110, 242, 168, 0.95)' : 'rgba(31, 174, 102, 0.95)',
                            borderWidth: 1.5,
                            borderRadius: 7,
                            borderSkipped: false,
                            barPercentage: 0.72,
                            categoryPercentage: 0.7,
                        },
                        {
                            label: 'Despesas',
                            data: monthlyData.expenses,
                            backgroundColor: buildExpenseGradient(),
                            borderColor: isDarkTheme ? 'rgba(141, 204, 255, 0.95)' : 'rgba(39, 121, 216, 0.95)',
                            borderWidth: 1.5,
                            borderRadius: 7,
                            borderSkipped: false,
                            barPercentage: 0.72,
                            categoryPercentage: 0.7,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 400 },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                color: theme.textColor,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                boxWidth: 8,
                                padding: 14,
                                font: { family: 'Inter', size: 12, weight: 500 },
                            },
                        },
                        tooltip: {
                            padding: 12,
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipTitle,
                            bodyColor: theme.tooltipBody,
                            borderColor: theme.tooltipBorder,
                            borderWidth: 1,
                            callbacks: {
                                label: (context) =>
                                    ` ${context.dataset.label}: R$ ${context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: theme.textColor, font: { family: 'Inter', size: 12 } },
                        },
                        y: {
                            grid: { color: theme.gridColor },
                            border: { dash: [5, 5] },
                            ticks: {
                                color: theme.textColor,
                                font: { family: 'Inter', size: 12 },
                                callback: (value) => 'R$ ' + Number(value).toLocaleString('pt-BR'),
                            },
                        },
                    },
                },
            });
        } else {
            monthlyChartInstance.data.labels = monthlyData.labels;
            monthlyChartInstance.data.datasets[0].data = monthlyData.incomes;
            monthlyChartInstance.data.datasets[1].data = monthlyData.expenses;

            if (themeChanged) {
                monthlyChartInstance.options.scales.x.ticks.color = theme.textColor;
                monthlyChartInstance.options.scales.y.ticks.color = theme.textColor;
                monthlyChartInstance.options.scales.y.grid.color = theme.gridColor;
                monthlyChartInstance.options.plugins.legend.labels.color = theme.textColor;
                monthlyChartInstance.options.plugins.tooltip.backgroundColor = theme.tooltipBg;
                monthlyChartInstance.options.plugins.tooltip.titleColor = theme.tooltipTitle;
                monthlyChartInstance.options.plugins.tooltip.bodyColor = theme.tooltipBody;
                monthlyChartInstance.options.plugins.tooltip.borderColor = theme.tooltipBorder;

                monthlyChartInstance.data.datasets[0].backgroundColor = buildIncomeGradient();
                monthlyChartInstance.data.datasets[0].borderColor = isDarkTheme
                    ? 'rgba(110, 242, 168, 0.95)'
                    : 'rgba(31, 174, 102, 0.95)';
                monthlyChartInstance.data.datasets[1].backgroundColor = buildExpenseGradient();
                monthlyChartInstance.data.datasets[1].borderColor = isDarkTheme
                    ? 'rgba(141, 204, 255, 0.95)'
                    : 'rgba(39, 121, 216, 0.95)';
            }

            monthlyChartInstance.update('none');
        }
    }

    // -------- Gráfico de Despesas por Categoria do Mês (Doughnut) --------
    const ctxCategory = document.getElementById('categoryExpensesChart');
    if (ctxCategory) {
        const hasData = categoryData.data.length > 0;
        const labels = hasData ? categoryData.labels : ['Sem Despesas no Mês'];
        const data = hasData ? categoryData.data : [1];
        const colors = hasData
            ? categoryData.backgroundColors
            : [isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(16,32,63,0.08)'];

        if (!categoryChartInstance) {
            categoryChartInstance = new Chart(ctxCategory, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors,
                        borderWidth: isDarkTheme ? 2 : 1,
                        borderColor: isDarkTheme ? 'hsl(220, 25%, 11%)' : '#ffffff',
                        hoverOffset: 6,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    animation: { duration: 400 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: theme.textColor,
                                padding: 12,
                                font: { family: 'Inter', size: 12, weight: 500 },
                                usePointStyle: true,
                                pointStyle: 'circle',
                            },
                        },
                        tooltip: {
                            padding: 12,
                            backgroundColor: theme.tooltipBg,
                            titleColor: theme.tooltipTitle,
                            bodyColor: theme.tooltipBody,
                            borderColor: theme.tooltipBorder,
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => {
                                    if (context.label === 'Sem Despesas no Mês') return ' Nenhuma despesa registrada';
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total ? ((value / total) * 100).toFixed(1) : '0.0';
                                    return ` R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percentage}%)`;
                                },
                            },
                        },
                    },
                },
            });
        } else {
            categoryChartInstance.data.labels = labels;
            categoryChartInstance.data.datasets[0].data = data;
            categoryChartInstance.data.datasets[0].backgroundColor = colors;

            if (themeChanged) {
                categoryChartInstance.options.plugins.legend.labels.color = theme.textColor;
                categoryChartInstance.options.plugins.tooltip.backgroundColor = theme.tooltipBg;
                categoryChartInstance.options.plugins.tooltip.titleColor = theme.tooltipTitle;
                categoryChartInstance.options.plugins.tooltip.bodyColor = theme.tooltipBody;
                categoryChartInstance.options.plugins.tooltip.borderColor = theme.tooltipBorder;
                categoryChartInstance.data.datasets[0].borderColor = isDarkTheme ? 'hsl(220, 25%, 11%)' : '#ffffff';
                categoryChartInstance.data.datasets[0].borderWidth = isDarkTheme ? 2 : 1;
            }

            categoryChartInstance.update('none');
        }
    }
}

// ----------------------------------------------------
// GRÁFICO DE PROJEÇÃO DE SALDO (linha)
// ----------------------------------------------------

export function renderProjectionChart(projection) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('projectionChart');
    if (!canvas) return;

    const isDarkTheme = document.documentElement.classList.contains('dark');
    const themeChanged = projectionTheme !== isDarkTheme;
    projectionTheme = isDarkTheme;
    const theme = getThemeColors(isDarkTheme);

    const ctx = canvas.getContext('2d');
    const buildGradient = () => {
        const g = ctx.createLinearGradient(0, 0, 0, 240);
        g.addColorStop(0, isDarkTheme ? 'rgba(91, 175, 255, 0.34)' : 'rgba(55, 134, 229, 0.28)');
        g.addColorStop(1, isDarkTheme ? 'rgba(91, 175, 255, 0.02)' : 'rgba(55, 134, 229, 0.02)');
        return g;
    };

    if (projectionChartInstance) {
        projectionChartInstance.data.labels = projection.labels;
        projectionChartInstance.data.datasets[0].data = projection.data;

        if (themeChanged) {
            projectionChartInstance.options.scales.x.ticks.color = theme.textColor;
            projectionChartInstance.options.scales.y.ticks.color = theme.textColor;
            projectionChartInstance.options.scales.y.grid.color = theme.gridColor;
            projectionChartInstance.options.plugins.tooltip.backgroundColor = theme.tooltipBg;
            projectionChartInstance.options.plugins.tooltip.titleColor = theme.tooltipTitle;
            projectionChartInstance.options.plugins.tooltip.bodyColor = theme.tooltipBody;
            projectionChartInstance.options.plugins.tooltip.borderColor = theme.tooltipBorder;

            const ds = projectionChartInstance.data.datasets[0];
            ds.borderColor = isDarkTheme ? 'rgba(141, 204, 255, 0.95)' : 'rgba(55, 134, 229, 0.95)';
            ds.backgroundColor = buildGradient();
            ds.pointBackgroundColor = isDarkTheme ? '#78b8ff' : '#3786e5';
            ds.pointBorderColor = isDarkTheme ? '#0a2048' : '#ffffff';
        }

        projectionChartInstance.update('none');
        return;
    }

    projectionChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: projection.labels,
            datasets: [{
                label: 'Saldo projetado (R$)',
                data: projection.data,
                borderColor: isDarkTheme ? 'rgba(141, 204, 255, 0.95)' : 'rgba(55, 134, 229, 0.95)',
                backgroundColor: buildGradient(),
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: isDarkTheme ? '#78b8ff' : '#3786e5',
                pointBorderColor: isDarkTheme ? '#0a2048' : '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 450 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 12,
                    backgroundColor: theme.tooltipBg,
                    titleColor: theme.tooltipTitle,
                    bodyColor: theme.tooltipBody,
                    borderColor: theme.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (c) =>
                            ` Projeção: R$ ${c.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: theme.textColor, font: { family: 'Inter', size: 12 } },
                },
                y: {
                    grid: { color: theme.gridColor },
                    border: { dash: [5, 5] },
                    ticks: {
                        color: theme.textColor,
                        font: { family: 'Inter', size: 12 },
                        callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR'),
                    },
                },
            },
        },
    });
}
