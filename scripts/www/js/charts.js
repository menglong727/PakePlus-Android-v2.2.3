/**
 * 图表模块 - 使用Chart.js绘制统计图表
 */
const ChartUtil = (() => {
    // 图表实例存储
    const chartInstances = {};
    
    // 默认图表配置
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    padding: 20,
                    usePointStyle: true,
                    font: {
                        size: 12
                    }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: {
                    size: 14
                },
                bodyFont: {
                    size: 13
                },
                cornerRadius: 8,
                displayColors: true
            }
        }
    };
    
    // 颜色方案
    const colors = {
        primary: '#667eea',
        secondary: '#764ba2',
        success: '#48bb78',
        warning: '#f6ad55',
        danger: '#f56565',
        info: '#4299e1',
        gradient: ['#667eea', '#764ba2', '#48bb78', '#f6ad55', '#f56565', '#4299e1', '#ed8936', '#9f7aea']
    };
    
    /**
     * 创建饼图
     * @param {string} canvasId - Canvas元素ID
     * @param {Object} data - 图表数据
     * @returns {Chart}
     */
    function createPieChart(canvasId, data) {
        destroyChart(canvasId);
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: colors.gradient.slice(0, data.labels.length),
                    borderWidth: 2,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim()
                }]
            },
            options: {
                ...defaultOptions,
                cutout: '60%',
                plugins: {
                    ...defaultOptions.plugins,
                    legend: {
                        ...defaultOptions.plugins.legend,
                        position: 'bottom'
                    }
                }
            }
        });
        
        chartInstances[canvasId] = chart;
        return chart;
    }
    
    /**
     * 创建柱状图
     * @param {string} canvasId - Canvas元素ID
     * @param {Object} data - 图表数据
     * @param {Object} options - 额外配置
     * @returns {Chart}
     */
    function createBarChart(canvasId, data, options = {}) {
        destroyChart(canvasId);
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: data.datasets.map((dataset, index) => ({
                    label: dataset.label,
                    data: dataset.values,
                    backgroundColor: dataset.color || colors.gradient[index % colors.gradient.length],
                    borderRadius: 6,
                    borderSkipped: false
                }))
            },
            options: {
                ...defaultOptions,
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '¥' + formatNumber(value);
                            }
                        }
                    }
                },
                ...options
            }
        });
        
        chartInstances[canvasId] = chart;
        return chart;
    }
    
    /**
     * 创建折线图
     * @param {string} canvasId - Canvas元素ID
     * @param {Object} data - 图表数据
     * @param {Object} options - 额外配置
     * @returns {Chart}
     */
    function createLineChart(canvasId, data, options = {}) {
        destroyChart(canvasId);
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: data.datasets.map((dataset, index) => ({
                    label: dataset.label,
                    data: dataset.values,
                    borderColor: dataset.color || colors.gradient[index % colors.gradient.length],
                    backgroundColor: (dataset.fillColor || colors.gradient[index % colors.gradient.length]) + '20',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: dataset.color || colors.gradient[index % colors.gradient.length],
                    pointBorderWidth: 2
                }))
            },
            options: {
                ...defaultOptions,
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '¥' + formatNumber(value);
                            }
                        }
                    }
                },
                ...options
            }
        });
        
        chartInstances[canvasId] = chart;
        return chart;
    }
    
    /**
     * 创建月度收入趋势图
     * @param {string} canvasId - Canvas元素ID
     * @param {Array} records - 工资记录
     */
    function createMonthlyTrendChart(canvasId, records) {
        // 按月份汇总
        const monthlyData = {};
        
        records.forEach(record => {
            // 兼容旧数据：从date中提取year和month
            const year = record.year || parseInt((record.date || '').split('-')[0]) || new Date().getFullYear();
            const month = record.month || parseInt((record.date || '').split('-')[1]) || (new Date().getMonth() + 1);
            const key = `${year}-${String(month).padStart(2, '0')}`;
            if (!monthlyData[key]) {
                monthlyData[key] = {
                    income: 0,
                    count: 0
                };
            }
            monthlyData[key].income += parseFloat(record.actualSalary) || 0;
            monthlyData[key].count += 1;
        });
        
        // 排序并提取数据
        const sortedKeys = Object.keys(monthlyData).sort();
        const labels = sortedKeys.map(key => {
            const [year, month] = key.split('-');
            return `${month}月`;
        });
        const values = sortedKeys.map(key => monthlyData[key].income);
        
        return createLineChart(canvasId, {
            labels: labels,
            datasets: [{
                label: '月度收入',
                values: values,
                color: colors.primary
            }]
        });
    }
    
    /**
     * 创建收入构成饼图
     * @param {string} canvasId - Canvas元素ID
     * @param {Array} records - 工资记录
     */
    function createIncomeCompositionChart(canvasId, records) {
        // 计算各类收入总和
        const totals = records.reduce((acc, record) => {
            acc.baseSalary += parseFloat(record.baseSalary) || 0;
            acc.commission += parseFloat(record.commission) || 0;
            acc.bonus += parseFloat(record.bonus) || 0;
            acc.allowance += parseFloat(record.allowance) || 0;
            return acc;
        }, { baseSalary: 0, commission: 0, bonus: 0, allowance: 0 });
        
        // 过滤掉为0的项
        const labels = [];
        const values = [];
        
        if (totals.baseSalary > 0) {
            labels.push('基本工资');
            values.push(totals.baseSalary);
        }
        if (totals.commission > 0) {
            labels.push('提成');
            values.push(totals.commission);
        }
        if (totals.bonus > 0) {
            labels.push('奖金');
            values.push(totals.bonus);
        }
        if (totals.allowance > 0) {
            labels.push('补贴');
            values.push(totals.allowance);
        }
        
        return createPieChart(canvasId, { labels, values });
    }
    
    /**
     * 创建年度对比柱状图
     * @param {string} canvasId - Canvas元素ID
     * @param {Array} records - 工资记录
     */
    function createYearlyComparisonChart(canvasId, records) {
        // 按年份汇总
        const yearlyData = {};
        
        records.forEach(record => {
            // 兼容旧数据：从date中提取year
            const year = record.year || parseInt((record.date || '').split('-')[0]) || new Date().getFullYear();
            if (!yearlyData[year]) {
                yearlyData[year] = {
                    income: 0,
                    count: 0
                };
            }
            yearlyData[year].income += parseFloat(record.actualSalary) || 0;
            yearlyData[year].count += 1;
        });
        
        // 提取数据
        const years = Object.keys(yearlyData).sort();
        const labels = years.map(y => `${y}年`);
        const incomeValues = years.map(y => yearlyData[y].income);
        const avgValues = years.map(y => yearlyData[y].income / yearlyData[y].count);
        
        return createBarChart(canvasId, {
            labels: labels,
            datasets: [
                {
                    label: '年收入',
                    values: incomeValues,
                    color: colors.primary
                },
                {
                    label: '月均收入',
                    values: avgValues,
                    color: colors.success
                }
            ]
        });
    }
    
    /**
     * 创建年度收入趋势图（折线图）
     * @param {string} canvasId - Canvas元素ID
     * @param {Array} records - 工资记录
     */
    function createYearlyTrendChart(canvasId, records) {
        // 按年份汇总
        const yearlyData = {};
        
        records.forEach(record => {
            // 兼容旧数据：从date中提取year
            const year = record.year || parseInt((record.date || '').split('-')[0]) || new Date().getFullYear();
            if (!yearlyData[year]) {
                yearlyData[year] = {
                    income: 0,
                    count: 0
                };
            }
            yearlyData[year].income += parseFloat(record.actualSalary) || 0;
            yearlyData[year].count += 1;
        });
        
        // 排序并提取数据
        const years = Object.keys(yearlyData).sort();
        const labels = years.map(y => `${y}年`);
        
        // 年度总收入
        const incomeValues = years.map(y => yearlyData[y].income);
        
        // 年度月均收入
        const avgValues = years.map(y => {
            const data = yearlyData[y];
            return data.count > 0 ? data.income / data.count : 0;
        });
        
        return createLineChart(canvasId, {
            labels: labels,
            datasets: [
                {
                    label: '年度总收入',
                    values: incomeValues,
                    color: colors.primary
                },
                {
                    label: '月均收入',
                    values: avgValues,
                    color: colors.success
                }
            ]
        });
    }
    
    /**
     * 销毁指定图表的实例
     * @param {string} canvasId 
     */
    function destroyChart(canvasId) {
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
            delete chartInstances[canvasId];
        }
    }
    
    /**
     * 销毁所有图表实例
     */
    function destroyAllCharts() {
        Object.keys(chartInstances).forEach(key => {
            chartInstances[key].destroy();
            delete chartInstances[key];
        });
    }
    
    /**
     * 格式化数字（添加千分位）
     * @param {number} num 
     * @returns {string}
     */
    function formatNumber(num) {
        const absNum = Math.abs(num);
        if (absNum >= 10000) {
            return (num / 10000).toFixed(1) + '万';
        }
        return num.toLocaleString('zh-CN');
    }
    
    // 公开API
    return {
        createPieChart,
        createBarChart,
        createLineChart,
        createMonthlyTrendChart,
        createIncomeCompositionChart,
        createYearlyComparisonChart,
        createYearlyTrendChart,
        destroyChart,
        destroyAllCharts,
        colors
    };
})();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartUtil;
}
