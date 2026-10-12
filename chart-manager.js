// Gerenciador de Gráficos (Chart.js)
let monthlyChartInstance = null;
let categoryChartInstance = null;
let fiiChartInstance = null;

// Rastreia o tema atual dos gráficos principais para redesenhar apenas quando mudar
let chartsTheme = null;

// Paleta de cores premium para os gráficos
const CATEGORY_COLORS = {
    'Alimentação': 'hsl(15, 85%, 60%)',
    'Moradia': 'hsl(210, 85%, 55%)',
    'Transporte': 'hsl(45, 95%, 50%)',
    'Lazer': 'hsl(280, 75%, 60%)',
    'Salário': 'hsl(145, 65%, 45%)',
    'Outros': 'hsl(190, 70%, 50%)'
};

const COLOR_PALETTE = [
    '#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#a855f7',
    '#ec4899', '#3b82f6', '#10b981', '#f97316', '#6b7280'
];

function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

// ----------------------------------------------------
// PROCESSAMENTO DE DADOS
// ----------------------------------------------------

function processMonthlyExpenses(transactions) {
    const expenses = transactions.filter(t => {
        const normalizedType = String(t.type).toLowerCase().trim();
        return normalizedType !== 'income' && normalizedType !== 'receita';
    });

    const dataByMonth = {};

    expenses.forEach(t => {
        if (!t.date) return;
        const yearMonth = t.date.substring(0, 7);
        const amt = parseFloat(t.amount) || 0;
        dataByMonth[yearMonth] = (dataByMonth[yearMonth] || 0) + amt;
    });

    const sortedMonths = Object.keys(dataByMonth).sort();

    if (sortedMonths.length === 0) {
        const hoje = new Date();
        const mesAtualStr = hoje.toISOString().substring(0, 7);
        sortedMonths.push(mesAtualStr);
        dataByMonth[mesAtualStr] = 0;
    }

    const nomeMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    const labels = [];
    const data = [];

    sortedMonths.forEach(ym => {
        const [year, month] = ym.split('-');
        const idx = parseInt(month, 10) - 1;
        labels.push(`${nomeMeses[idx]}/${year.substring(2)}`);
        data.push(dataByMonth[ym]);
    });

    return { labels, data };
}

function processCategoryExpenses(transactions) {
    const categoriesMap = {};

    const expenses = transactions.filter(t => t.type === 'expense');

    expenses.forEach(t => {
        const category = t.category || 'Outros';
        categoriesMap[category] = (categoriesMap[category] || 0) + parseFloat(t.amount);
    });

    const labels = Object.keys(categoriesMap);
    const data = Object.values(categoriesMap);
    const backgroundColors = labels.map(c => getCategoryColor(c));

    return { labels, data, backgroundColors };
}

// ----------------------------------------------------
// INICIALIZAÇÃO E ATUALIZAÇÃO (REUTILIZA INSTÂNCIAS)
// ----------------------------------------------------

export function renderCharts(transactions, isDarkTheme) {
    if (typeof isDarkTheme !== 'boolean') {
        isDarkTheme = document.documentElement.classList.contains('dark');
    }
    const themeChanged = chartsTheme !== isDarkTheme;
    chartsTheme = isDarkTheme;

    const textColor = isDarkTheme ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
    const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

    const allTx = window.allTransactions || transactions || [];
    const monthlyData = processMonthlyExpenses(allTx);
    const categoryData = processCategoryExpenses(transactions);

    // -------- Gráfico de Evolução de Despesas Mensais (Barras) --------
    const ctxMonthly = document.getElementById('monthlyExpensesChart');
    if (ctxMonthly) {
        if (!monthlyChartInstance) {
            const ctx = ctxMonthly.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, isDarkTheme ? 'rgba(91, 175, 255, 0.96)' : 'rgba(55, 134, 229, 0.92)');
            gradient.addColorStop(1, isDarkTheme ? 'rgba(24, 73, 133, 0.42)' : 'rgba(185, 220, 255, 0.28)');

            monthlyChartInstance = new Chart(ctxMonthly, {
                type: 'bar',
                data: {
                    labels: monthlyData.labels,
                    datasets: [{
                        label: 'Despesas Mensais (R$)',
                        data: monthlyData.data,
                        backgroundColor: gradient,
                        borderColor: isDarkTheme ? 'rgba(141, 204, 255, 0.95)' : 'rgba(39, 121, 216, 0.9)',
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false,
                        barPercentage: 0.55
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 450 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            padding: 12,
                            backgroundColor: isDarkTheme ? 'hsl(220, 25%, 15%)' : 'hsl(0, 0%, 100%)',
                            titleColor: isDarkTheme ? 'hsl(0, 0%, 100%)' : 'hsl(220, 35%, 15%)',
                            bodyColor: isDarkTheme ? 'hsl(220, 10%, 80%)' : 'hsl(220, 15%, 45%)',
                            borderColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            borderWidth: 1,
                            callbacks: {
                                label: function (context) {
                                    return ` Despesas: R$ ${context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: textColor, font: { family: 'Inter', size: 12 } }
                        },
                        y: {
                            grid: { color: gridColor },
                            border: { dash: [5, 5] },
                            ticks: {
                                color: textColor,
                                font: { family: 'Inter', size: 12 },
                                callback: function (value) { return 'R$ ' + value; }
                            }
                        }
                    }
                }
            });
        } else {
            // Atualiza somente os dados (e o tema, se mudou) — sem recriar a instância
            monthlyChartInstance.data.labels = monthlyData.labels;
            monthlyChartInstance.data.datasets[0].data = monthlyData.data;

            if (themeChanged) {
                monthlyChartInstance.options.scales.x.ticks.color = textColor;
                monthlyChartInstance.options.scales.y.ticks.color = textColor;
                monthlyChartInstance.options.scales.y.grid.color = gridColor;

                const ctx = ctxMonthly.getContext('2d');
                const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                gradient.addColorStop(0, isDarkTheme ? 'rgba(91, 175, 255, 0.96)' : 'rgba(55, 134, 229, 0.92)');
                gradient.addColorStop(1, isDarkTheme ? 'rgba(24, 73, 133, 0.42)' : 'rgba(185, 220, 255, 0.28)');
                monthlyChartInstance.data.datasets[0].backgroundColor = gradient;
                monthlyChartInstance.data.datasets[0].borderColor = isDarkTheme
                    ? 'rgba(141, 204, 255, 0.95)'
                    : 'rgba(39, 121, 216, 0.9)';
            }

            monthlyChartInstance.update('none');
        }
    }

    // -------- Gráfico de Categorias (Doughnut) --------
    const ctxCategory = document.getElementById('categoryExpensesChart');
    if (ctxCategory) {
        const hasData = categoryData.data.length > 0;
        const labels = hasData ? categoryData.labels : ['Sem Despesas'];
        const data = hasData ? categoryData.data : [1];
        const colors = hasData
            ? categoryData.backgroundColors
            : [isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'];

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
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    animation: { duration: 450 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: textColor,
                                padding: 14,
                                font: { family: 'Inter', size: 12, weight: 500 },
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            padding: 12,
                            backgroundColor: isDarkTheme ? 'hsl(220, 25%, 15%)' : 'hsl(0, 0%, 100%)',
                            titleColor: isDarkTheme ? 'hsl(0, 0%, 100%)' : 'hsl(220, 35%, 15%)',
                            bodyColor: isDarkTheme ? 'hsl(220, 10%, 80%)' : 'hsl(220, 15%, 45%)',
                            borderColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            borderWidth: 1,
                            callbacks: {
                                label: function (context) {
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total ? ((value / total) * 100).toFixed(1) : '0.0';
                                    return ` R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            categoryChartInstance.data.labels = labels;
            categoryChartInstance.data.datasets[0].data = data;
            categoryChartInstance.data.datasets[0].backgroundColor = colors;

            if (themeChanged) {
                categoryChartInstance.options.plugins.legend.labels.color = textColor;
                categoryChartInstance.data.datasets[0].borderColor = isDarkTheme ? 'hsl(220, 25%, 11%)' : '#ffffff';
                categoryChartInstance.data.datasets[0].borderWidth = isDarkTheme ? 2 : 1;
            }

            categoryChartInstance.update('none');
        }
    }
}

// ----------------------------------------------------
// GRÁFICO DE FIIs (permanece separado)
// ----------------------------------------------------

export function renderFiiAllocationChart(holdings) {
    const ctx = document.getElementById('fiiAllocationChart');
    if (!ctx) return;

    const isDarkTheme = document.documentElement.classList.contains('dark');
    const textColor = isDarkTheme ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.75)';

    const categories = holdings.reduce((acc, item) => {
        const key = `${item.name} (${item.ticker})`;
        acc[key] = (acc[key] || 0) + Number(item.currentPrice || 0) * Number(item.quantity || 0);
        return acc;
    }, {});

    const labels = Object.keys(categories);
    const data = Object.values(categories);
    const backgroundColors = labels.map((label, index) => COLOR_PALETTE[index % COLOR_PALETTE.length]);

    if (fiiChartInstance) {
        fiiChartInstance.destroy();
    }

    fiiChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length ? labels : ['Sem FIIs'],
            datasets: [{
                data: labels.length ? data : [1],
                backgroundColor: labels.length ? backgroundColors : [isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'],
                borderColor: isDarkTheme ? '#1f2937' : '#ffffff',
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: { family: 'Inter', size: 12, weight: 500 },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: isDarkTheme ? 'hsl(220, 25%, 15%)' : '#ffffff',
                    titleColor: isDarkTheme ? '#ffffff' : '#111827',
                    bodyColor: isDarkTheme ? '#e5e7eb' : '#374151',
                    borderColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed;
                            const formattedValue = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            return `R$ ${formattedValue}`;
                        }
                    }
                }
            }
        }
    });
}

export function updateFiiAllocationChartTheme(isDarkTheme) {
    if (!fiiChartInstance) return;
    const textColor = isDarkTheme ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.75)';
    const borderColor = isDarkTheme ? '#1f2937' : '#ffffff';

    if (fiiChartInstance.options.plugins?.legend?.labels) {
        fiiChartInstance.options.plugins.legend.labels.color = textColor;
    }

    fiiChartInstance.data.datasets[0].borderColor = borderColor;
    fiiChartInstance.update();
}

// ----------------------------------------------------
// GRÁFICO DE PROJEÇÃO DE SALDO (linha)
// ----------------------------------------------------

let projectionChartInstance = null;

export function renderProjectionChart(projection) {
    const canvas = document.getElementById('projectionChart');
    if (!canvas) return;

    const isDarkTheme = document.documentElement.classList.contains('dark');
    const textColor = isDarkTheme ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
    const gridColor = isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

    if (projectionChartInstance) {
        projectionChartInstance.data.labels = projection.labels;
        projectionChartInstance.data.datasets[0].data = projection.data;
        projectionChartInstance.options.scales.x.ticks.color = textColor;
        projectionChartInstance.options.scales.y.ticks.color = textColor;
        projectionChartInstance.options.scales.y.grid.color = gridColor;
        projectionChartInstance.data.datasets[0].borderColor = isDarkTheme
            ? 'rgba(141, 204, 255, 0.95)' : 'rgba(55, 134, 229, 0.95)';
        projectionChartInstance.update('none');
        return;
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, isDarkTheme ? 'rgba(91, 175, 255, 0.32)' : 'rgba(55, 134, 229, 0.28)');
    gradient.addColorStop(1, isDarkTheme ? 'rgba(91, 175, 255, 0.02)' : 'rgba(55, 134, 229, 0.02)');

    projectionChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: projection.labels,
            datasets: [{
                label: 'Saldo projetado (R$)',
                data: projection.data,
                borderColor: isDarkTheme ? 'rgba(141, 204, 255, 0.95)' : 'rgba(55, 134, 229, 0.95)',
                backgroundColor: gradient,
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: isDarkTheme ? '#78b8ff' : '#3786e5',
                pointBorderColor: isDarkTheme ? '#0a2048' : '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 12,
                    backgroundColor: isDarkTheme ? 'hsl(220, 25%, 15%)' : '#ffffff',
                    titleColor: isDarkTheme ? '#ffffff' : '#132a4f',
                    bodyColor: isDarkTheme ? '#e5e7eb' : '#374151',
                    borderColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    borderWidth: 1,
                    callbacks: {
                        label: (c) => ` Projeção: R$ ${c.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { family: 'Inter', size: 12 } }
                },
                y: {
                    grid: { color: gridColor },
                    border: { dash: [5, 5] },
                    ticks: {
                        color: textColor,
                        font: { family: 'Inter', size: 12 },
                        callback: (v) => 'R$ ' + v
                    }
                }
            }
        }
    });
}