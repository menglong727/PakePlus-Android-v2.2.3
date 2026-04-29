/**
 * 数据导出导入模块 - 支持JSON和Excel格式
 */
const ExportUtil = (() => {
    
    /**
     * 导出为JSON文件
     * @param {Object} data - 要导出的数据
     * @param {string} filename - 文件名
     */
    function exportJSON(data, filename = '工资记录备份') {
        try {
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}_${formatDate(new Date())}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            return true;
        } catch (error) {
            console.error('JSON导出失败:', error);
            return false;
        }
    }
    
    /**
     * 导出为Excel文件
     * @param {Array} records - 工资记录数组
     * @param {string} filename - 文件名
     */
    function exportExcel(records, filename = '工资记录') {
        try {
            // 准备数据
            const worksheetData = [
                // 表头
                ['日期', '公司', '职位', '销售额', '基本工资', '提成', '奖金', '补贴', '扣款', '实发工资', '备注']
            ];
            
            // 数据行
            records.forEach(record => {
                worksheetData.push([
                    record.date || '',
                    record.company || '',
                    record.position || '',
                    parseFloat(record.salesAmount) || 0,
                    parseFloat(record.baseSalary) || 0,
                    parseFloat(record.commission) || 0,
                    parseFloat(record.bonus) || 0,
                    parseFloat(record.allowance) || 0,
                    parseFloat(record.deduction) || 0,
                    parseFloat(record.actualSalary) || 0,
                    record.note || ''
                ]);
            });
            
            // 添加汇总行
            const totals = records.reduce((acc, record) => {
                acc.salesAmount += parseFloat(record.salesAmount) || 0;
                acc.baseSalary += parseFloat(record.baseSalary) || 0;
                acc.commission += parseFloat(record.commission) || 0;
                acc.bonus += parseFloat(record.bonus) || 0;
                acc.allowance += parseFloat(record.allowance) || 0;
                acc.deduction += parseFloat(record.deduction) || 0;
                acc.actualSalary += parseFloat(record.actualSalary) || 0;
                return acc;
            }, { salesAmount: 0, baseSalary: 0, commission: 0, bonus: 0, allowance: 0, deduction: 0, actualSalary: 0 });
            
            worksheetData.push([
                '汇总', '', '',
                totals.salesAmount,
                totals.baseSalary,
                totals.commission,
                totals.bonus,
                totals.allowance,
                totals.deduction,
                totals.actualSalary,
                `共${records.length}条记录`
            ]);
            
            // 创建工作簿
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(worksheetData);
            
            // 设置列宽
            ws['!cols'] = [
                { wch: 12 }, // 日期
                { wch: 20 }, // 公司
                { wch: 15 }, // 职位
                { wch: 12 }, // 销售额
                { wch: 12 }, // 基本工资
                { wch: 12 }, // 提成
                { wch: 12 }, // 奖金
                { wch: 12 }, // 补贴
                { wch: 12 }, // 扣款
                { wch: 12 }, // 实发工资
                { wch: 30 }  // 备注
            ];
            
            XLSX.utils.book_append_sheet(wb, ws, '工资记录');
            XLSX.writeFile(wb, `${filename}_${formatDate(new Date())}.xlsx`);
            
            return true;
        } catch (error) {
            console.error('Excel导出失败:', error);
            return false;
        }
    }
    
    /**
     * 从JSON文件导入
     * @param {File} file - JSON文件
     * @returns {Promise<Object>} 导入的数据
     */
    function importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('JSON文件格式错误'));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsText(file);
        });
    }
    
    /**
     * 从Excel文件导入
     * @param {File} file - Excel文件
     * @returns {Promise<Array>} 导入的记录数组
     */
    function importExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // 获取第一个工作表
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    
                    // 检查表头，确定文件格式（是否包含"销售额"列）
                    const header = jsonData[0] || [];
                    const hasSalesAmount = header.some(h => h && String(h).includes('销售额'));
                    
                    // 转换数据格式
                    const records = [];
                    
                    // 跳过表头，从第二行开始
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        
                        // 跳过汇总行
                        if (row[0] === '汇总') continue;
                        
                        // 跳过空行
                        if (!row[0] && !row[1]) continue;
                        
                        let record;
                        
                        if (hasSalesAmount) {
                            // 新格式：包含销售额列
                            record = {
                                id: DBUtil.generateId(),
                                date: formatDateFromString(row[0]) || new Date().toISOString().split('T')[0],
                                company: row[1] || '',
                                position: row[2] || '',
                                salesAmount: parseFloat(row[3]) || 0,
                                baseSalary: parseFloat(row[4]) || 0,
                                commission: parseFloat(row[5]) || 0,
                                bonus: parseFloat(row[6]) || 0,
                                allowance: parseFloat(row[7]) || 0,
                                deduction: parseFloat(row[8]) || 0,
                                actualSalary: parseFloat(row[9]) || 0,
                                note: row[10] || '',
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                        } else {
                            // 旧格式：不包含销售额列
                            record = {
                                id: DBUtil.generateId(),
                                date: formatDateFromString(row[0]) || new Date().toISOString().split('T')[0],
                                company: row[1] || '',
                                position: row[2] || '',
                                baseSalary: parseFloat(row[3]) || 0,
                                commission: parseFloat(row[4]) || 0,
                                bonus: parseFloat(row[5]) || 0,
                                allowance: parseFloat(row[6]) || 0,
                                deduction: parseFloat(row[7]) || 0,
                                actualSalary: parseFloat(row[8]) || 0,
                                note: row[9] || '',
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                        }
                        
                        // 提取月份和年份
                        if (record.date) {
                            const dateObj = new Date(record.date);
                            record.month = dateObj.getMonth() + 1;
                            record.year = dateObj.getFullYear();
                        }
                        
                        records.push(record);
                    }
                    
                    resolve(records);
                } catch (error) {
                    reject(new Error('Excel文件格式错误: ' + error.message));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }
    
    /**
     * 格式化日期为YYYY-MM-DD
     * @param {Date|string} date 
     * @returns {string}
     */
    function formatDate(date) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
    
    /**
     * 从各种日期格式字符串中提取日期
     * @param {any} value 
     * @returns {string|null}
     */
    function formatDateFromString(value) {
        if (!value) return null;
        
        // 如果是数字（Excel日期序列号）
        if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
        }
        
        // 如果是日期对象
        if (value instanceof Date) {
            return value.toISOString().split('T')[0];
        }
        
        // 如果是字符串，尝试解析
        const str = String(value).trim();
        
        // 尝试直接解析
        const date = new Date(str);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
        
        return null;
    }
    
    // 公开API
    return {
        exportJSON,
        exportExcel,
        importJSON,
        importExcel
    };
})();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportUtil;
}
