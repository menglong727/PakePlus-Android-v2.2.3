/**
 * 数据库模块 - 使用IndexedDB和localStorage双重存储
 * IndexedDB存储主要数据，localStorage存储设置和缓存
 */
const DBUtil = (() => {
    const DB_NAME = 'SalaryManagerDB';
    const DB_VERSION = 3;  // 升级版本号以支持笔记功能
    const STORE_RECORDS = 'salaryRecords';
    const STORE_COMMISSIONS = 'commissionRules';
    const STORE_COMPANIES = 'companies';      // 公司信息存储
    const STORE_POSITIONS = 'positions';      // 职位信息存储
    const STORE_NOTES = 'notes';             // 笔记记录存储
    
    let db = null;
    
    /**
     * 打开数据库连接
     * @returns {Promise<IDBDatabase>}
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }
            
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => {
                console.error('数据库打开失败');
                reject(new Error('无法打开数据库'));
            };
            
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // 创建工资记录表
                if (!database.objectStoreNames.contains(STORE_RECORDS)) {
                    const recordStore = database.createObjectStore(STORE_RECORDS, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    recordStore.createIndex('date', 'date', { unique: false });
                    recordStore.createIndex('month', 'month', { unique: false });
                    recordStore.createIndex('year', 'year', { unique: false });
                    recordStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
                
                // 创建提成规则表
                if (!database.objectStoreNames.contains(STORE_COMMISSIONS)) {
                    database.createObjectStore(STORE_COMMISSIONS, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                }
                
                // 创建公司信息表
                if (!database.objectStoreNames.contains(STORE_COMPANIES)) {
                    const companyStore = database.createObjectStore(STORE_COMPANIES, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    companyStore.createIndex('name', 'name', { unique: true });
                    companyStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
                
                // 创建职位信息表
                if (!database.objectStoreNames.contains(STORE_POSITIONS)) {
                    const positionStore = database.createObjectStore(STORE_POSITIONS, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    positionStore.createIndex('name', 'name', { unique: true });
                    positionStore.createIndex('companyId', 'companyId', { unique: false });
                    positionStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
                
                // 创建笔记记录表
                if (!database.objectStoreNames.contains(STORE_NOTES)) {
                    const noteStore = database.createObjectStore(STORE_NOTES, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    noteStore.createIndex('createdAt', 'createdAt', { unique: false });
                    noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
        });
    }
    
    /**
     * 添加工资记录
     * @param {Object} record - 工资记录对象
     * @returns {Promise<string>} 记录ID
     */
    async function addRecord(record) {
        await openDB();
        
        // 生成ID
        if (!record.id) {
            record.id = generateId();
        }
        
        // 添加时间戳
        record.createdAt = new Date().toISOString();
        record.updatedAt = new Date().toISOString();
        
        // 提取月份和年份用于索引
        if (record.date) {
            const dateObj = new Date(record.date);
            record.month = dateObj.getMonth() + 1;
            record.year = dateObj.getFullYear();
        }
        
        // 确保images字段存在
        if (!record.images) {
            record.images = [];
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RECORDS], 'readwrite');
            const store = transaction.objectStore(STORE_RECORDS);
            
            const request = store.add(record);
            
            request.onsuccess = () => {
                // 同时保存到localStorage作为备份
                saveToLocalBackup(record);
                resolve(record.id);
            };
            
            request.onerror = () => {
                reject(new Error('添加记录失败'));
            };
        });
    }
    
    /**
     * 更新工资记录
     * @param {Object} record - 要更新的记录
     * @returns {Promise<boolean>}
     */
    async function updateRecord(record) {
        await openDB();
        
        record.updatedAt = new Date().toISOString();
        
        // 确保images字段存在
        if (!record.images) {
            record.images = [];
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RECORDS], 'readwrite');
            const store = transaction.objectStore(STORE_RECORDS);
            
            const request = store.put(record);
            
            request.onsuccess = () => {
                // 更新本地备份
                updateLocalBackup(record);
                resolve(true);
            };
            
            request.onerror = () => {
                reject(new Error('更新记录失败'));
            };
        });
    }
    
    /**
     * 删除工资记录
     * @param {string} id - 记录ID
     * @returns {Promise<boolean>}
     */
    async function deleteRecord(id) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RECORDS], 'readwrite');
            const store = transaction.objectStore(STORE_RECORDS);
            
            const request = store.delete(id);
            
            request.onsuccess = () => {
                // 从本地备份中删除
                removeFromLocalBackup(id);
                resolve(true);
            };
            
            request.onerror = () => {
                reject(new Error('删除记录失败'));
            };
        });
    }
    
    /**
     * 获取单条记录
     * @param {string} id - 记录ID
     * @returns {Promise<Object|null>}
     */
    async function getRecord(id) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RECORDS], 'readonly');
            const store = transaction.objectStore(STORE_RECORDS);
            
            const request = store.get(id);
            
            request.onsuccess = (event) => {
                resolve(event.target.result || null);
            };
            
            request.onerror = () => {
                reject(new Error('获取记录失败'));
            };
        });
    }
    
    /**
     * 获取所有记录
     * @param {Object} filters - 过滤条件
     * @returns {Promise<Array>}
     */
    async function getAllRecords(filters = {}) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RECORDS], 'readonly');
            const store = transaction.objectStore(STORE_RECORDS);
            
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                let records = event.target.result || [];
                
                // 应用过滤器
                if (filters.year) {
                    records = records.filter(r => r.year === filters.year);
                }
                if (filters.month) {
                    records = records.filter(r => r.month === filters.month);
                }
                if (filters.search) {
                    const searchLower = filters.search.toLowerCase();
                    records = records.filter(r => 
                        (r.company && r.company.toLowerCase().includes(searchLower)) ||
                        (r.position && r.position.toLowerCase().includes(searchLower)) ||
                        (r.note && r.note.toLowerCase().includes(searchLower))
                    );
                }
                
                // 按日期排序（最新的在前面）- 使用可靠的时间比较
                records.sort((a, b) => {
                    // 优先使用 createdAt 时间戳（更精确）
                    if (a.createdAt && b.createdAt) {
                        return new Date(b.createdAt) - new Date(a.createdAt);
                    }
                    // 否则使用 date 字段（格式：YYYY-MM-DD）
                    // 使用字符串比较，避免时区问题
                    const dateCompare = b.date.localeCompare(a.date);
                    if (dateCompare !== 0) return dateCompare;
                    // 如果日期相同，使用 ID 降序（ID 包含时间戳）
                    return b.id.localeCompare(a.id);
                });
                
                resolve(records);
            };
            
            request.onerror = () => {
                // 如果IndexedDB失败，尝试从localStorage恢复
                const backup = getLocalBackup();
                resolve(backup);
            };
        });
    }
    
    /**
     * 保存提成规则
     * @param {Object} rule - 提成规则
     * @returns {Promise<string>}
     */
    async function saveCommissionRule(rule) {
        await openDB();
        
        if (!rule.id) {
            rule.id = generateId();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_COMMISSIONS], 'readwrite');
            const store = transaction.objectStore(STORE_COMMISSIONS);
            
            const request = store.put(rule);
            
            request.onsuccess = () => {
                resolve(rule.id);
            };
            
            request.onerror = () => {
                reject(new Error('保存提成规则失败'));
            };
        });
    }
    
    /**
     * 获取所有提成规则
     * @returns {Promise<Array>}
     */
    async function getCommissionRules() {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_COMMISSIONS], 'readonly');
            const store = transaction.objectStore(STORE_COMMISSIONS);
            
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                resolve(event.target.result || []);
            };
            
            request.onerror = () => {
                resolve([]);
            };
        });
    }
    
    /**
     * 删除提成规则
     * @param {string} id - 规则ID
     * @returns {Promise<boolean>}
     */
    async function deleteCommissionRule(id) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_COMMISSIONS], 'readwrite');
            const store = transaction.objectStore(STORE_COMMISSIONS);
            
            const request = store.delete(id);
            
            request.onsuccess = () => {
                resolve(true);
            };
            
            request.onerror = () => {
                reject(new Error('删除提成规则失败'));
            };
        });
    }
    
    // ========== localStorage备份方法 ==========
    
    /**
     * 保存到本地备份
     * @param {Object} record 
     */
    function saveToLocalBackup(record) {
        const backup = getLocalBackup();
        backup.push(record);
        localStorage.setItem('salary_backup', JSON.stringify(backup));
    }
    
    /**
     * 更新本地备份
     * @param {Object} record 
     */
    function updateLocalBackup(record) {
        const backup = getLocalBackup();
        const index = backup.findIndex(r => r.id === record.id);
        if (index !== -1) {
            backup[index] = record;
            localStorage.setItem('salary_backup', JSON.stringify(backup));
        }
    }
    
    /**
     * 从本地备份删除
     * @param {string} id 
     */
    function removeFromLocalBackup(id) {
        const backup = getLocalBackup();
        const filtered = backup.filter(r => r.id !== id);
        localStorage.setItem('salary_backup', JSON.stringify(filtered));
    }
    
    /**
     * 获取本地备份
     * @returns {Array}
     */
    function getLocalBackup() {
        try {
            const data = localStorage.getItem('salary_backup');
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }
    
    /**
     * 清除所有数据
     * @returns {Promise<boolean>}
     */
    async function clearAllData() {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RECORDS, STORE_COMMISSIONS], 'readwrite');
            
            transaction.objectStore(STORE_RECORDS).clear();
            transaction.objectStore(STORE_COMMISSIONS).clear();
            
            transaction.oncomplete = () => {
                localStorage.removeItem('salary_backup');
                resolve(true);
            };
            
            transaction.onerror = () => {
                reject(new Error('清除数据失败'));
            };
        });
    }
    
    /**
     * 获取统计数据
     * @returns {Promise<Object>}
     */
    async function getStatistics() {
        const records = await getAllRecords();
        
        const stats = {
            totalRecords: records.length,
            totalIncome: 0,
            averageIncome: 0,
            highestIncome: 0,
            lowestIncome: Infinity,
            byMonth: {},
            byYear: {},
            recentRecords: records.slice(0, 5)
        };
        
        records.forEach(record => {
            const income = parseFloat(record.actualSalary) || 0;
            
            // 兼容旧数据：如果缺少year/month字段，从date中提取
            const year = record.year || parseInt((record.date || '').split('-')[0]) || new Date().getFullYear();
            const month = record.month || parseInt((record.date || '').split('-')[1]) || (new Date().getMonth() + 1);
            
            stats.totalIncome += income;
            stats.highestIncome = Math.max(stats.highestIncome, income);
            stats.lowestIncome = Math.min(stats.lowestIncome, income);
            
            // 按月份统计
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            if (!stats.byMonth[monthKey]) {
                stats.byMonth[monthKey] = { income: 0, count: 0 };
            }
            stats.byMonth[monthKey].income += income;
            stats.byMonth[monthKey].count += 1;
            
            // 按年份统计
            if (!stats.byYear[year]) {
                stats.byYear[year] = { income: 0, count: 0 };
            }
            stats.byYear[year].income += income;
            stats.byYear[year].count += 1;
        });
        
        stats.averageIncome = stats.totalRecords > 0 
            ? stats.totalIncome / stats.totalRecords 
            : 0;
            
        if (stats.lowestIncome === Infinity) {
            stats.lowestIncome = 0;
        }
        
        return stats;
    }
    
    /**
     * 生成唯一ID
     * @returns {string}
     */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }
    
    /**
     * 导出所有数据为JSON
     * @returns {Promise<Object>}
     */
    async function exportAllData() {
        const records = await getAllRecords();
        const rules = await getCommissionRules();
        
        return {
            version: 1,
            exportDate: new Date().toISOString(),
            records: records,
            commissionRules: rules
        };
    }
    
    /**
     * 从JSON导入数据
     * @param {Object} data - 导入的数据
     * @param {boolean} overwrite - 是否覆盖现有数据
     * @returns {Promise<number>} 导入的记录数
     */
    async function importData(data, overwrite = false) {
        await openDB();
        
        if (overwrite) {
            await clearAllData();
            await openDB(); // 重新打开连接
        }
        
        let importedCount = 0;
        
        // 导入记录
        if (data.records && Array.isArray(data.records)) {
            for (const record of data.records) {
                try {
                    await addRecord(record);
                    importedCount++;
                } catch (error) {
                    console.warn('导入记录失败:', record.id, error);
                }
            }
        }
        
        // 导入提成规则
        if (data.commissionRules && Array.isArray(data.commissionRules)) {
            for (const rule of data.commissionRules) {
                try {
                    await saveCommissionRule(rule);
                } catch (error) {
                    console.warn('导入提成规则失败:', rule.id, error);
                }
            }
        }
        
        // 导入公司信息
        if (data.companies && Array.isArray(data.companies)) {
            for (const company of data.companies) {
                try {
                    await addCompany(company);
                } catch (error) {
                    console.warn('导入公司信息失败:', company.id, error);
                }
            }
        }
        
        // 导入职位信息
        if (data.positions && Array.isArray(data.positions)) {
            for (const position of data.positions) {
                try {
                    await addPosition(position);
                } catch (error) {
                    console.warn('导入职位信息失败:', position.id, error);
                }
            }
        }
        
        // 导入笔记数据
        if (data.notes && Array.isArray(data.notes)) {
            for (const note of data.notes) {
                try {
                    await addNote(note);
                } catch (error) {
                    console.warn('导入笔记失败:', note.id, error);
                }
            }
        }
        
        return importedCount;
    }
    
    // ========== 公司管理 ==========
    
    /**
     * 添加公司
     * @param {Object} company - 公司信息
     * @returns {Promise<string>}
     */
    async function addCompany(company) {
        await openDB();
        
        if (!company.id) {
            company.id = generateId();
        }
        company.createdAt = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_COMPANIES], 'readwrite');
            const store = transaction.objectStore(STORE_COMPANIES);
            
            const request = store.add(company);
            
            request.onsuccess = () => resolve(company.id);
            request.onerror = () => reject(new Error('添加公司失败'));
        });
    }
    
    /**
     * 更新公司
     * @param {Object} company - 公司信息
     * @returns {Promise<boolean>}
     */
    async function updateCompany(company) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_COMPANIES], 'readwrite');
            const store = transaction.objectStore(STORE_COMPANIES);
            
            const request = store.put(company);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error('更新公司失败'));
        });
    }
    
    /**
     * 删除公司
     * @param {string} id - 公司ID
     * @returns {Promise<boolean>}
     */
    async function deleteCompany(id) {
        await openDB();
        
        // 同时删除该公司下的所有职位
        const positions = await getPositionsByCompany(id);
        for (const pos of positions) {
            await deletePosition(pos.id);
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_COMPANIES], 'readwrite');
            const store = transaction.objectStore(STORE_COMPANIES);
            
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error('删除公司失败'));
        });
    }
    
    /**
     * 获取所有公司
     * @returns {Promise<Array>}
     */
    async function getAllCompanies() {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_COMPANIES], 'readonly');
            const store = transaction.objectStore(STORE_COMPANIES);
            
            const request = store.getAll();
            
            request.onsuccess = (event) => resolve(event.target.result || []);
            request.onerror = () => resolve([]);
        });
    }
    
    // ========== 职位管理 ==========
    
    /**
     * 添加职位
     * @param {Object} position - 职位信息
     * @returns {Promise<string>}
     */
    async function addPosition(position) {
        await openDB();
        
        if (!position.id) {
            position.id = generateId();
        }
        position.createdAt = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_POSITIONS], 'readwrite');
            const store = transaction.objectStore(STORE_POSITIONS);
            
            const request = store.add(position);
            
            request.onsuccess = () => resolve(position.id);
            request.onerror = () => reject(new Error('添加职位失败'));
        });
    }
    
    /**
     * 更新职位
     * @param {Object} position - 职位信息
     * @returns {Promise<boolean>}
     */
    async function updatePosition(position) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_POSITIONS], 'readwrite');
            const store = transaction.objectStore(STORE_POSITIONS);
            
            const request = store.put(position);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error('更新职位失败'));
        });
    }
    
    /**
     * 删除职位
     * @param {string} id - 职位ID
     * @returns {Promise<boolean>}
     */
    async function deletePosition(id) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_POSITIONS], 'readwrite');
            const store = transaction.objectStore(STORE_POSITIONS);
            
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error('删除职位失败'));
        });
    }
    
    /**
     * 根据公司ID获取职位
     * @param {string} companyId - 公司ID
     * @returns {Promise<Array>}
     */
    async function getPositionsByCompany(companyId) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_POSITIONS], 'readonly');
            const store = transaction.objectStore(STORE_POSITIONS);
            const index = store.index('companyId');
            
            const request = index.getAll(companyId);
            
            request.onsuccess = (event) => resolve(event.target.result || []);
            request.onerror = () => resolve([]);
        });
    }
    
    /**
     * 获取所有职位
     * @returns {Promise<Array>}
     */
    async function getAllPositions() {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_POSITIONS], 'readonly');
            const store = transaction.objectStore(STORE_POSITIONS);
            
            const request = store.getAll();
            
            request.onsuccess = (event) => resolve(event.target.result || []);
            request.onerror = () => resolve([]);
        });
    }
    
    // ========== 笔记管理 ==========
    
    /**
     * 添加笔记
     * @param {Object} note - 笔记对象
     * @returns {Promise<string>} 笔记ID
     */
    async function addNote(note) {
        await openDB();
        
        // 生成ID
        if (!note.id) {
            note.id = generateId();
        }
        
        // 添加时间戳
        note.createdAt = new Date().toISOString();
        note.updatedAt = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NOTES], 'readwrite');
            const store = transaction.objectStore(STORE_NOTES);
            
            const request = store.add(note);
            
            request.onsuccess = () => {
                resolve(note.id);
            };
            
            request.onerror = () => {
                reject(new Error('添加笔记失败'));
            };
        });
    }
    
    /**
     * 更新笔记
     * @param {Object} note - 要更新的笔记
     * @returns {Promise<boolean>}
     */
    async function updateNote(note) {
        await openDB();
        
        note.updatedAt = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NOTES], 'readwrite');
            const store = transaction.objectStore(STORE_NOTES);
            
            const request = store.put(note);
            
            request.onsuccess = () => {
                resolve(true);
            };
            
            request.onerror = () => {
                reject(new Error('更新笔记失败'));
            };
        });
    }
    
    /**
     * 删除笔记
     * @param {string} id - 笔记ID
     * @returns {Promise<boolean>}
     */
    async function deleteNote(id) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NOTES], 'readwrite');
            const store = transaction.objectStore(STORE_NOTES);
            
            const request = store.delete(id);
            
            request.onsuccess = () => {
                resolve(true);
            };
            
            request.onerror = () => {
                reject(new Error('删除笔记失败'));
            };
        });
    }
    
    /**
     * 获取单条笔记
     * @param {string} id - 笔记ID
     * @returns {Promise<Object|null>}
     */
    async function getNote(id) {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NOTES], 'readonly');
            const store = transaction.objectStore(STORE_NOTES);
            
            const request = store.get(id);
            
            request.onsuccess = (event) => {
                resolve(event.target.result || null);
            };
            
            request.onerror = () => {
                reject(new Error('获取笔记失败'));
            };
        });
    }
    
    /**
     * 获取所有笔记
     * @returns {Promise<Array>}
     */
    async function getAllNotes() {
        await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NOTES], 'readonly');
            const store = transaction.objectStore(STORE_NOTES);
            const index = store.index('createdAt');
            
            const request = index.getAll();
            
            request.onsuccess = (event) => {
                let notes = event.target.result || [];
                // 按更新时间倒序排列（最新的在前面）
                notes.sort((a, b) => {
                    const aTime = new Date(a.updatedAt || a.createdAt);
                    const bTime = new Date(b.updatedAt || b.createdAt);
                    return bTime - aTime;
                });
                resolve(notes);
            };
            
            request.onerror = () => {
                resolve([]);
            };
        });
    }
    
    // ========== 数据导出时包含公司和职位 ==========
    
    /**
     * 导出所有数据为JSON（重写以包含公司、职位和笔记）
     * @returns {Promise<Object>}
     */
    async function exportAllData() {
        const records = await getAllRecords();
        const rules = await getCommissionRules();
        const companies = await getAllCompanies();
        const positions = await getAllPositions();
        const notes = await getAllNotes();
        
        return {
            version: 3,
            exportDate: new Date().toISOString(),
            records: records,
            commissionRules: rules,
            companies: companies,
            positions: positions,
            notes: notes
        };
    }
    
    // 公开API
    return {
        addRecord,
        updateRecord,
        deleteRecord,
        getRecord,
        getAllRecords,
        saveCommissionRule,
        getCommissionRules,
        deleteCommissionRule,
        clearAllData,
        getStatistics,
        exportAllData,
        importData,
        generateId,
        // 公司管理
        addCompany,
        updateCompany,
        deleteCompany,
        getAllCompanies,
        // 职位管理
        addPosition,
        updatePosition,
        deletePosition,
        getPositionsByCompany,
        getAllPositions,
        // 笔记管理
        addNote,
        updateNote,
        deleteNote,
        getNote,
        getAllNotes
    };
})();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DBUtil;
}
