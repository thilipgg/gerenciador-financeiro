// Gerenciador de Gráficos (Chart.js)
let monthlyChartInstance = null;
let categoryChartInstance = null;

// Paleta de cores premium para os gráficos
const CATEGORY_COLORS = {
    'Alimentação': 'hsl(15, 85%, 60%)',    // Coral
    'Moradia': 'hsl(210, 85%, 55%)',     // Azul
    'Transporte': 'hsl(45, 95%, 50%)',   // Amarelo/Dourado
    'Lazer': 'hsl(280, 75%, 60%)',        // Roxo
    'Salário': 'hsl(145, 65%, 45%)',      // Verde (Receita)
    'Outros': 'hsl(190, 70%, 50%)'        // Turquesa
};

// Cores de fallback para categorias desconhecidas
const COLOR_PALETTE = [
    '#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#a855f7',
    '#ec4899', '#3b82f6', '#10b981', '#f97316', '#6b7280'
];

function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

// Retorna os últimos 6 meses formatados (Ex: "Jan", "Fev"...)
function getLastSixMonths() {
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const labels = [];
    const dates = [];
    const d = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
        labels.push(months[m.getMonth()] + '/' + String(m.getFullYear()).slice(-2));
        dates.push({ year: m.getFullYear(), month: m.getMonth() });
    }
    return { labels, dates };
}

// ----------------------------------------------------
// PROCESSAMENTO DE DADOS
// ----------------------------------------------------

function processMonthlyExpenses(transactions) {
    const expenses = transactions.filter(t => {
        const normalizedType = String(t.type).toLowerCase().trim();
        return normalizedType !== 'income' && normalizedType !== 'receita';
    });

    // Objeto para acumular os valores por chave "ANO-MES" (ex: "2026-06")
    const dataByMonth = {};

    expenses.forEach(t => {
        if (!t.date) return;
        // Corta a string "YYYY-MM-DD" para pegar apenas "YYYY-MM"
        const yearMonth = t.date.substring(0, 7); 
        const amt = parseFloat(t.amount) || 0;
        
        dataByMonth[yearMonth] = (dataByMonth[yearMonth] || 0) + amt;
    });

    // Captura todos os meses que possuem lançamentos e ordena cronologicamente
    const sortedMonths = Object.keys(dataByMonth).sort();

    // Se o banco estiver vazio, coloca pelo menos o mês atual para o gráfico não quebrar
    if (sortedMonths.length === 0) {
        const hoje = new Date();
        const mesAtualStr = hoje.toISOString().substring(0, 7);
        sortedMonths.push(mesAtualStr);
        dataByMonth[mesAtualStr] = 0;
    }

    // Nomes dos meses para exibição amigável nas labels do gráfico
    const nomeMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    const labels = [];
    const data = [];

    // Monta o array final que o Chart.js vai ler
    sortedMonths.forEach(ym => {
        const [year, month] = ym.split('-');
        const idx = parseInt(month, 10) - 1;
        
        // Exemplo de label resultante: "Jun/26", "Jul/26"
        labels.push(`${nomeMeses[idx]}/${year.substring(2)}`);
        data.push(dataByMonth[ym]);
    });

    return { labels, data };
}

function processCategoryExpenses(transactions) {
    const categoriesMap = {};
    
    // Filtra apenas despesas
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
// INICIALIZAÇÃO E ATUALIZAÇÃO
// ----------------------------------------------------

export function renderCharts(transactions, isDarkTheme) {
    if (typeof isDarkTheme !== 'boolean') {
        isDarkTheme = document.documentElement.classList.contains('dark');
    }
    const textColor = isDarkTheme ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
    const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    
    // --- CORREÇÃO DE ESCOPO DOS DADOS ---
    // 1. O gráfico de barras (Evolução) DEVE olhar todo o histórico (window.allTransactions)
    const allTx = window.allTransactions || transactions || [];
    const monthlyData = processMonthlyExpenses(allTx);
    
    // 2. O gráfico de rosca (Categorias) DEVE olhar apenas o mês que você está visualizando na tela
    const categoryData = processCategoryExpenses(transactions);
    // ------------------------------------
    
    // 1. Gráfico de Evolução de Despesas Mensais (Barras com Gradiente)
    const ctxMonthly = document.getElementById('monthlyExpensesChart');
    if (ctxMonthly) {
        if (monthlyChartInstance) {
            monthlyChartInstance.destroy();
        }
        
        const ctx = ctxMonthly.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, isDarkTheme ? 'hsla(250, 72%, 60%, 0.9)' : 'hsla(250, 72%, 56%, 0.85)');
        gradient.addColorStop(1, isDarkTheme ? 'hsla(250, 72%, 20%, 0.15)' : 'hsla(250, 72%, 94%, 0.1)');

        monthlyChartInstance = new Chart(ctxMonthly, {
            type: 'bar',
            data: {
                labels: monthlyData.labels,
                datasets: [{
                    label: 'Despesas Mensais (R$)',
                    data: monthlyData.data,
                    backgroundColor: gradient,
                    borderColor: isDarkTheme ? 'hsl(250, 72%, 65%)' : 'hsl(250, 72%, 56%)',
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false,
                    barPercentage: 0.55
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
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
                            label: function(context) {
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
                            callback: function(value) { return 'R$ ' + value; }
                        }
                    }
                }
            }
        });
    }

    // 2. Gráfico de Categorias (Doughnut)
    const ctxCategory = document.getElementById('categoryExpensesChart');
    if (ctxCategory) {
        if (categoryChartInstance) {
            categoryChartInstance.destroy();
        }

        if (categoryData.data.length === 0) {
            categoryChartInstance = new Chart(ctxCategory, {
                type: 'doughnut',
                data: {
                    labels: ['Sem Despesas'],
                    datasets: [{
                        data: [1],
                        backgroundColor: [isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    }
                }
            });
        } else {
            categoryChartInstance = new Chart(ctxCategory, {
                type: 'doughnut',
                data: {
                    labels: categoryData.labels,
                    datasets: [{
                        data: categoryData.data,
                        backgroundColor: categoryData.backgroundColors,
                        borderWidth: isDarkTheme ? 2 : 1,
                        borderColor: isDarkTheme ? 'hsl(220, 25%, 11%)' : '#ffffff',
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
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
                                label: function(context) {
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return ` R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}

// Atualiza o tema dos gráficos sem recarregar os dados inteiramente
export function updateChartsTheme(isDarkTheme) {
    const textColor = isDarkTheme ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
    const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    
    if (monthlyChartInstance) {
        monthlyChartInstance.options.scales.x.ticks.color = textColor;
        monthlyChartInstance.options.scales.y.ticks.color = textColor;
        monthlyChartInstance.options.scales.y.grid.color = gridColor;
        
        // Atualiza gradiente de cor do dataset
        const ctx = document.getElementById('monthlyExpensesChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, isDarkTheme ? 'hsla(250, 72%, 60%, 0.9)' : 'hsla(250, 72%, 56%, 0.85)');
        gradient.addColorStop(1, isDarkTheme ? 'hsla(250, 72%, 20%, 0.15)' : 'hsla(250, 72%, 94%, 0.1)');
        
        monthlyChartInstance.data.datasets[0].backgroundColor = gradient;
        monthlyChartInstance.data.datasets[0].borderColor = isDarkTheme ? 'hsl(250, 72%, 65%)' : 'hsl(250, 72%, 56%)';
        monthlyChartInstance.update();
    }
    
    if (categoryChartInstance) {
        if (categoryChartInstance.options.plugins.legend) {
            categoryChartInstance.options.plugins.legend.labels.color = textColor;
        }
        if (categoryChartInstance.data.datasets[0].borderColor) {
            categoryChartInstance.data.datasets[0].borderColor = isDarkTheme ? 'hsl(220, 25%, 11%)' : '#ffffff';
            categoryChartInstance.data.datasets[0].borderWidth = isDarkTheme ? 2 : 1;
        }
        categoryChartInstance.update();
    }
}
