/**
 * 主应用逻辑 - 工资管理系统核心控制器
 * 负责页面路由、用户交互、数据管理
 */
(function() {
    'use strict';
    
    // ========== 全局状态 ==========
    const state = {
        currentPage: 'home',
        previousPage: null,
        records: [],
        filteredRecords: [],
        notes: [],             // 笔记列表
        commissionRules: [],
        companies: [],        // 公司列表
        positions: [],         // 职位列表
        theme: localStorage.getItem('salary_theme') || 'light',
        searchActive: false,
        isLoading: false
    };
    
    // ========== 初始化 ==========
    document.addEventListener('DOMContentLoaded', async () => {
        // 显示加载骨架屏
        showSkeleton();
        
        // 应用主题
        applyTheme(state.theme);
        
        // 初始化加密模块
        initCrypto();
        
        // 加载数据
        await loadData();
        
        // 渲染当前页面
        renderPage(state.currentPage);
        
        // 绑定事件
        bindEvents();
        
        // 隐藏骨架屏
        hideSkeleton();
    });
    
    /**
     * 初始化加密
     */
    function initCrypto() {
        const encryptionEnabled = localStorage.getItem('salary_encryption') === 'true';
        if (encryptionEnabled) {
            const userKey = localStorage.getItem('salary_user_key');
            CryptoUtil.initKey(userKey);
        }
    }
    
    /**
     * 加载所有数据
     */
    async function loadData() {
        try {
            state.records = await DBUtil.getAllRecords();
            // 确保记录按日期倒序排列（最新的在前面）
            state.records = sortRecordsByDateDesc(state.records);
            state.filteredRecords = [...state.records];
            state.notes = await DBUtil.getAllNotes();
            // 确保笔记按更新时间倒序排列（最新的在前面）
            state.notes = sortNotesByTimeDesc(state.notes);
            state.commissionRules = await DBUtil.getCommissionRules();
            state.companies = await DBUtil.getAllCompanies();
            state.positions = await DBUtil.getAllPositions();
        } catch (error) {
            console.error('数据加载失败:', error);
            showToast('数据加载失败', 'error');
        }
    }

    /**
     * 记录按日期降序排序（最新的在前面）
     * @param {Array} records - 记录数组
     * @returns {Array} 排序后的记录数组
     */
    function sortRecordsByDateDesc(records) {
        return records.sort((a, b) => {
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
    }

    /**
     * 笔记按更新时间降序排序（最新的在前面）
     * @param {Array} notes - 笔记数组
     * @returns {Array} 排序后的笔记数组
     */
    function sortNotesByTimeDesc(notes) {
        return notes.sort((a, b) => {
            // 优先使用 updatedAt，如果相同则比较 createdAt
            const aTime = new Date(a.updatedAt || a.createdAt);
            const bTime = new Date(b.updatedAt || b.createdAt);
            return bTime - aTime;
        });
    }
    
    // ========== 事件绑定 ==========
    function bindEvents() {
        // 底部导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                navigateTo(page);
            });
        });
        
        // 事件委托：处理过滤栏按钮点击
        document.addEventListener('click', function(e) {
            // 检查点击目标是否是filter-chip或在其内部
            let target = e.target;
            while (target && !target.classList?.contains('filter-chip')) {
                target = target.parentElement;
            }
            
            if (!target) return;
            
            const filterType = target.dataset.filter;
            if (!filterType) return;
            
            // 根据filter类型调用不同的函数
            if (filterType === 'custom') {
                if (window.toggleCustomFilter) {
                    window.toggleCustomFilter();
                }
            } else {
                if (window.filterRecords) {
                    window.filterRecords(filterType, target);
                }
            }
        });
    }
    
    /**
     * 防抖函数
     * @param {Function} fn 
     * @param {number} delay 
     */
    function debounce(fn, delay) {
        let timer = null;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    
    // ========== 页面导航 ==========
    /**
     * 页面导航
     * @param {string} page - 目标页面
     */
    function navigateTo(page) {
        if (page === state.currentPage) return;
        
        state.previousPage = state.currentPage;
        state.currentPage = page;
        
        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        
        // 渲染页面
        renderPage(page);
        
        // 关闭搜索栏
        if (state.searchActive) {
            toggleSearch(false);
        }
    }
    
    // 暴露 navigateTo 为全局函数，供 HTML 中的 onclick 调用
    window.navigateTo = navigateTo;
    
    /**
     * 渲染页面
     * @param {string} page 
     */
    function renderPage(page) {
        const mainContent = document.getElementById('mainContent');
        
        // 添加页面退出动画
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'translateY(10px)';
        mainContent.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        
        // 移除旧的FAB按钮
        const oldFab = document.querySelector('.fab');
        if (oldFab) {
            oldFab.remove();
        }
        
        // 重置滚动位置，确保页面切换时从顶部开始
        if (mainContent) {
            mainContent.scrollTop = 0;
        }
        
        setTimeout(() => {
            // 清空内容并添加新内容
            switch (page) {
                case 'home':
                    renderHomePage(mainContent);
                    break;
                case 'records':
                    renderRecordsPage(mainContent);
                    break;
                case 'notes':
                    renderNotesPage(mainContent);
                    break;
                case 'statistics':
                    renderStatisticsPage(mainContent);
                    break;
                case 'profile':
                    renderProfilePage(mainContent);
                    break;
                default:
                    renderHomePage(mainContent);
            }
            
            // 添加页面进入动画
            mainContent.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
            mainContent.style.opacity = '1';
            mainContent.style.transform = 'translateY(0)';
            
            // 为笔记和记录页面添加FAB按钮
            if (page === 'notes' || page === 'records') {
                addFabButton(page);
            }
            
            // 为列表项添加入场动画
            setTimeout(() => {
                const listItems = mainContent.querySelectorAll('.list-item, .notes-list .card');
                listItems.forEach((item, index) => {
                    item.style.animationDelay = `${index * 0.05}s`;
                    item.classList.add('list-item-enter');
                });
            }, 100);
        }, 250);
    }
    
    /**
     * 添加FAB按钮到页面
     * @param {string} page - 当前页面
     */
    function addFabButton(page) {
        // 如果已经存在FAB按钮，不重复添加
        if (document.querySelector('.fab')) return;
        
        const fab = document.createElement('button');
        fab.className = 'fab';
        fab.setAttribute('aria-label', page === 'notes' ? '添加笔记' : '添加记录');
        
        const icon = document.createElement('i');
        icon.className = 'fas ' + (page === 'notes' ? 'fa-plus' : 'fa-plus');
        fab.appendChild(icon);
        
        fab.onclick = () => {
            if (page === 'notes') {
                showAddNoteModal();
            } else {
                showAddRecordModal();
            }
        };
        
        document.getElementById('app').appendChild(fab);
    }
    
    // ========== 首页（仪表盘） ==========
    /**
     * 渲染首页
     * @param {HTMLElement} container 
     */
    async function renderHomePage(container) {
        const stats = await DBUtil.getStatistics();
        // 确保最新记录按日期倒序排列（最新的在前面）
        const recentRecords = sortRecordsByDateDesc([...state.records])
            .slice(0, 3);
        
        // 计算今日/本周/本月收入
        const now = new Date();
        const todayStr = now.getFullYear() + '-' + 
                        String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(now.getDate()).padStart(2, '0');
        
        // 本周开始时间（周一）和结束时间（周日）- 使用字符串比较避免时区问题
        const dayOfWeek = now.getDay() || 7; // 周日为7
        const startOfWeekDate = new Date(now);
        startOfWeekDate.setDate(now.getDate() - dayOfWeek + 1);
        startOfWeekDate.setHours(0, 0, 0, 0);
        
        const endOfWeekDate = new Date(now);
        endOfWeekDate.setDate(now.getDate() - dayOfWeek + 7);
        endOfWeekDate.setHours(23, 59, 59, 999);
        
        const startOfWeekStr = startOfWeekDate.getFullYear() + '-' + 
                              String(startOfWeekDate.getMonth() + 1).padStart(2, '0') + '-' + 
                              String(startOfWeekDate.getDate()).padStart(2, '0');
        
        const endOfWeekStr = endOfWeekDate.getFullYear() + '-' + 
                            String(endOfWeekDate.getMonth() + 1).padStart(2, '0') + '-' + 
                            String(endOfWeekDate.getDate()).padStart(2, '0');
        
        const todayIncome = state.records
            .filter(r => r.date === todayStr)
            .reduce((sum, r) => sum + (parseFloat(r.actualSalary) || 0), 0);
            
        const weekIncome = state.records
            .filter(r => r.date >= startOfWeekStr && r.date <= endOfWeekStr)
            .reduce((sum, r) => sum + (parseFloat(r.actualSalary) || 0), 0);
            
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const monthIncome = state.records
            .filter(r => r.year === year && r.month === month)
            .reduce((sum, r) => sum + (parseFloat(r.actualSalary) || 0), 0);
        
        let html = '';
        
        // 顶部渐变卡片（总收入）
        html += `
            <div class="home-header fade-in">
                <div class="home-header-label">总收入</div>
                <div class="home-header-amount">¥${formatMoney(stats.totalIncome)}</div>
                <i class="fas fa-wallet home-header-icon"></i>
            </div>
        `;
        
        // 今日/本周/本月统计
        html += `
            <div class="home-stats-grid fade-in">
                <div class="home-stat-card">
                    <div class="home-stat-label">今日</div>
                    <div class="home-stat-value today">¥${formatMoney(todayIncome)}</div>
                </div>
                <div class="home-stat-card">
                    <div class="home-stat-label">本周</div>
                    <div class="home-stat-value week">¥${formatMoney(weekIncome)}</div>
                </div>
                <div class="home-stat-card">
                    <div class="home-stat-label">本月</div>
                    <div class="home-stat-value month">¥${formatMoney(monthIncome)}</div>
                </div>
            </div>
        `;
        
        // 最新记录
        html += `
            <div class="card fade-in">
                <div class="card-header">
                    <h3 class="card-title">最新记录</h3>
                    <button class="btn btn-secondary btn-sm" onclick="navigateTo('records')">查看全部</button>
                </div>
                ${recentRecords.length > 0 ? 
                    recentRecords.map(record => renderRecordItem(record)).join('') :
                    renderEmptyState('暂无工资记录', '点击下方的加号添加第一条记录', true)
                }
            </div>
        `;
        
        // 快捷操作
        html += `
            <div class="card fade-in">
                <h3 class="card-title mb-16">快捷操作</h3>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                    <button class="btn btn-primary" onclick="showAddRecordModal()">
                        <i class="fas fa-plus"></i> 添加记录
                    </button>
                    <button class="btn btn-secondary" onclick="navigateTo('statistics')">
                        <i class="fas fa-chart-line"></i> 查看统计
                    </button>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    // ========== 记录列表页 ==========
    /**
     * 渲染记录列表页
     * @param {HTMLElement} container 
     */
    function renderRecordsPage(container) {
        // 确保记录按日期倒序排列（最新的在顶部）
        const records = sortRecordsByDateDesc([...state.filteredRecords]);
        
        let html = '';
        
        // 获取可用的年份列表
        const years = [...new Set(state.records.map(r => r.year))].sort((a, b) => b - a);
        const currentYear = new Date().getFullYear();
        if (!years.includes(currentYear)) years.unshift(currentYear);
        
        // 外层容器 - 使用flex布局确保标题栏和筛选栏固定
        html += `<div class="records-page-wrapper">`;
        
        // 固定顶部包装器 - 包含标题和筛选栏，一起sticky定位
        html += `<div class="records-sticky-header">`;
        
        // 页面标题
        html += `
            <div class="records-page-header">
                <div class="records-header-content">
                    <div class="records-header-label">
                        <i class="fas fa-list-alt"></i> 工资记录
                    </div>
                    <div class="records-header-count">共 ${state.filteredRecords.length} 条记录</div>
                </div>
                <i class="fas fa-file-invoice-dollar records-header-icon"></i>
            </div>
        `;
        
        // 过滤栏 - 恢复onclick属性确保按钮点击正常工作
        html += `
            <div class="filter-bar fade-in">
                <button class="filter-chip" data-filter="all" onclick="window.filterRecords('all', this); event.stopPropagation();">全部</button>
                <button class="filter-chip" data-filter="today" onclick="window.filterRecords('today', this); event.stopPropagation();">今日</button>
                <button class="filter-chip" data-filter="month" onclick="window.filterRecords('month', this); event.stopPropagation();">本月</button>
                <button class="filter-chip" data-filter="year" onclick="window.filterRecords('year', this); event.stopPropagation();">今年</button>
                <button class="filter-chip" data-filter="custom" onclick="window.toggleCustomFilter(); event.stopPropagation();">
                    <i class="fas fa-calendar-alt"></i> 日期范围
                </button>
            </div>
            
            <!-- 自定义筛选面板 - 日期范围查询 -->
            <div class="custom-filter-panel" id="customFilterPanel" style="display: none;">
                <div class="custom-filter-header">
                    <span><i class="fas fa-calendar-alt"></i> 选择日期范围</span>
                    <button class="custom-filter-close" onclick="toggleCustomFilter()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="custom-filter-body">
                    <div class="date-range-container">
                        <div class="date-range-item">
                            <label><i class="fas fa-calendar-plus"></i> 开始日期</label>
                            <input type="date" id="filterStartDate" onchange="onCustomFilterChange()" onclick="this.showPicker()" onfocus="this.showPicker()">
                        </div>
                        <div class="date-range-separator">
                            <i class="fas fa-arrow-right"></i>
                        </div>
                        <div class="date-range-item">
                            <label><i class="fas fa-calendar-check"></i> 结束日期</label>
                            <input type="date" id="filterEndDate" onchange="onCustomFilterChange()" onclick="this.showPicker()" onfocus="this.showPicker()">
                        </div>
                    </div>
                    <div class="date-range-presets">
                        <button class="preset-btn" onclick="setDateRange('week')">本周</button>
                        <button class="preset-btn" onclick="setDateRange('month')">本月</button>
                        <button class="preset-btn" onclick="setDateRange('quarter')">本季度</button>
                        <button class="preset-btn" onclick="setDateRange('year')">本年</button>
                    </div>
                </div>
                <div class="custom-filter-footer">
                    <button class="btn btn-secondary btn-sm" onclick="clearCustomFilter()">清除</button>
                    <button class="btn btn-primary btn-sm" onclick="applyCustomFilter()">查询</button>
                </div>
            </div>
        `;
        
        // 关闭固定顶部包装器
        html += `</div>`;
        
        // 可滚动的记录列表容器
        html += `<div class="records-scroll-container">`;
        
        // 记录列表 - 始终保留 recordsList 容器，确保筛选功能正常工作
        if (records.length > 0) {
            html += `<div id="recordsList" class="fade-in">${records.map(record => renderRecordItem(record)).join('')}</div>`;
        } else {
            // 始终创建 recordsList 容器，即使为空也保留 id
            html += `<div id="recordsList" class="fade-in"></div>`;
            // 在容器后显示空状态提示
            const emptyTitle = state.searchActive ? '没有查询到数据' : '暂无记录';
            const emptyDesc = state.searchActive ? '请尝试调整筛选条件' : '点击下方的加号添加第一条工资记录';
            html += renderEmptyState(emptyTitle, emptyDesc);
        }
        
        html += `</div>`; // 关闭 records-scroll-container
        html += `</div>`; // 关闭 records-page-wrapper
        
        container.innerHTML = html;
    }
    
    /**
     * 渲染单条记录项
     * @param {Object} record 
     * @returns {string}
     */
    function renderRecordItem(record) {
        const company = record.company || '未设置公司';
        const date = formatDisplayDate(record.date);
        const amount = formatMoney(record.actualSalary);
        const hasImages = record.images && record.images.length > 0;
        const imageCount = hasImages ? record.images.length : 0;
        
        return `
            <div class="list-item" onclick="showRecordDetail('${record.id}')">
                <div class="list-item-icon gradient-primary">
                    <i class="fas fa-yen-sign" style="color: white;"></i>
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${escapeHtml(company)}</div>
                    <div class="list-item-desc">
                        ${date}
                        ${hasImages ? 
                            '<span class="image-count-badge"><i class="fas fa-image"></i> ' + imageCount + '张</span>' : 
                            '<span class="no-image-hint"><i class="fas fa-image"></i> 无图片</span>'}
                    </div>
                </div>
                <div class="list-item-amount">¥${amount}</div>
                <i class="fas fa-chevron-right list-item-arrow"></i>
            </div>
        `;
    }
    
    /**
     * 过滤记录
     * @param {string} type - 过滤类型
     * @param {HTMLElement} element - 点击的元素
     */
    window.filterRecords = function(type, element) {
        console.log('filterRecords被调用，type:', type, 'element:', element);
        try {
            // 更新过滤按钮状态
            document.querySelectorAll('.filter-chip').forEach(chip => {
                chip.classList.remove('active');
            });
            if (element) {
                element.classList.add('active');
                console.log('已设置active状态给:', element.textContent);
            }
            
            // 应用过滤
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();
            
            switch (type) {
                case 'all':
                    state.filteredRecords = [...state.records];
                    break;
                case 'today':
                    // 使用本地时间，避免时区问题
                    const today = now.getFullYear() + '-' + 
                                 String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                                 String(now.getDate()).padStart(2, '0');
                    state.filteredRecords = state.records.filter(r => 
                        r.date === today
                    );
                    break;
                case 'month':
                    state.filteredRecords = state.records.filter(r => 
                        r.month === currentMonth && r.year === currentYear
                    );
                    break;
                case 'year':
                    state.filteredRecords = state.records.filter(r => 
                        r.year === currentYear
                    );
                    break;
                case 'custom':
                    // 自定义筛选，不在这里处理，由applyCustomFilter处理
                    return;
            }
            
            // 确保过滤后的记录按日期倒序排列（最新的在顶部）
            state.filteredRecords = sortRecordsByDateDesc(state.filteredRecords);
            
            // 更新列表容器，如果不存在则重新渲染页面
            const listContainer = document.getElementById('recordsList');
            if (listContainer) {
                listContainer.outerHTML = `<div id="recordsList" class="fade-in">${state.filteredRecords.map(record => renderRecordItem(record)).join('')}</div>`;
            } else {
                // 如果容器不存在，重新渲染整个页面
                console.warn('recordsList容器未找到，重新渲染页面');
                renderPage(state.currentPage);
            }
        } catch (error) {
            console.error('filterRecords执行出错:', error);
            showToast('筛选失败，请刷新页面', 'error');
        }
    };
    
    /**
     * 切换自定义筛选面板的显示/隐藏
     */
    window.toggleCustomFilter = function() {
        let panel = document.getElementById('customFilterPanel');
        
        // 防御性检查：如果面板不存在，重新渲染页面
        if (!panel) {
            console.warn('自定义筛选面板未找到，重新渲染页面');
            renderPage(state.currentPage);
            
            // 等待DOM更新后再获取面板
            setTimeout(() => {
                panel = document.getElementById('customFilterPanel');
                if (!panel) {
                    console.error('重新渲染后仍未找到面板');
                    return;
                }
                toggleCustomFilterExecute(panel);
            }, 100);
            return;
        }
        
        toggleCustomFilterExecute(panel);
    };
    
    /**
     * 执行切换自定义筛选面板的显示/隐藏
     * @param {HTMLElement} panel - 面板元素
     */
    function toggleCustomFilterExecute(panel) {
        // 使用更健壮的判断逻辑：检查计算后的display样式
        const computedDisplay = window.getComputedStyle(panel).display;
        const isHidden = computedDisplay === 'none';
        
        if (isHidden) {
            // 显示面板
            panel.style.display = 'block';
            panel.classList.add('fade-in');
            
            // 更新按钮状态：移除其他按钮的active状态
            document.querySelectorAll('.filter-chip').forEach(chip => {
                chip.classList.remove('active');
            });
            const customChip = document.querySelector('[data-filter="custom"]');
            if (customChip) customChip.classList.add('active');
        } else {
            // 隐藏面板
            panel.style.display = 'none';
            panel.classList.remove('fade-in');
        }
    }
    
    /**
     * 自定义筛选条件变化时的处理
     */
    window.onCustomFilterChange = function() {
        // 可以在这里添加实时筛选的逻辑
        // 目前暂不实现实时筛选，等待用户点击"筛选"按钮
    };
    
    /**
     * 设置预设日期范围
     * @param {string} type - 预设类型：week, month, quarter, year
     */
    window.setDateRange = function(type) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let startDate, endDate;
        
        switch(type) {
            case 'week':
                // 本周（周一到周日）
                const dayOfWeek = now.getDay() || 7; // 将周日(0)转换为7
                startDate = new Date(now);
                startDate.setDate(now.getDate() - dayOfWeek + 1);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                break;
            case 'month':
                // 本月
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'quarter':
                // 本季度
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
                break;
            case 'year':
                // 本年
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
        }
        
        // 格式化日期为YYYY-MM-DD
        const formatDate = (date) => {
            return date.getFullYear() + '-' + 
                   String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(date.getDate()).padStart(2, '0');
        };
        
        document.getElementById('filterStartDate').value = formatDate(startDate);
        document.getElementById('filterEndDate').value = formatDate(endDate);
        
        // 显示提示
        const rangeNames = {week: '本周', month: '本月', quarter: '本季度', year: '本年'};
        showToast('已设置' + rangeNames[type] + '范围', 'success');
    };
    
    /**
     * 应用自定义筛选（日期范围查询）
     */
    window.applyCustomFilter = function() {
        const startDate = document.getElementById('filterStartDate')?.value;
        const endDate = document.getElementById('filterEndDate')?.value;
        
        // 验证日期
        if (startDate && endDate && startDate > endDate) {
            showToast('开始日期不能大于结束日期', 'error');
            return;
        }
        
        // 应用过滤
        let filtered = [...state.records];
        
        // 改进日期比较逻辑：将日期转换为时间戳再比较
        if (startDate) {
            const startTimestamp = new Date(startDate + 'T00:00:00').getTime();
            filtered = filtered.filter(r => {
                const recordDate = r.date.includes('T') ? r.date : r.date + 'T00:00:00';
                return new Date(recordDate).getTime() >= startTimestamp;
            });
        }
        
        if (endDate) {
            const endTimestamp = new Date(endDate + 'T23:59:59').getTime();
            filtered = filtered.filter(r => {
                const recordDate = r.date.includes('T') ? r.date : r.date + 'T23:59:59';
                return new Date(recordDate).getTime() <= endTimestamp;
            });
        }
        
        state.filteredRecords = filtered;
        state.searchActive = true;
        
        // 确保过滤后的记录按日期倒序排列（最新的在顶部）
        state.filteredRecords = sortRecordsByDateDesc(state.filteredRecords);
        
        // 更新筛选按钮状态
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.remove('active');
        });
        const customChip = document.querySelector('[data-filter="custom"]');
        if (customChip) customChip.classList.add('active');
        
        // 重新渲染页面
        renderPage(state.currentPage);
        
        // 隐藏面板（关键：不要调用toggleCustomFilter()）
        const panel = document.getElementById('customFilterPanel');
        if (panel) {
            panel.style.display = 'none';
        }
        
        // 显示结果（居中显示）
        if (startDate || endDate) {
            let desc = '';
            if (startDate && endDate) desc = startDate + ' 至 ' + endDate;
            else if (startDate) desc = startDate + ' 之后';
            else if (endDate) desc = endDate + ' 之前';
            showCenterToast('已筛选: ' + desc + ' (' + filtered.length + '条)', 'success');
        }
    };
    
    /**
     * 清除自定义筛选
     */
    window.clearCustomFilter = function() {
        document.getElementById('filterStartDate').value = '';
        document.getElementById('filterEndDate').value = '';
        
        // 重置搜索状态
        state.searchActive = false;
        
        // 隐藏面板
        const panel = document.getElementById('customFilterPanel');
        if (panel) {
            panel.style.display = 'none';
        }
        
        // 重置为全部，这会重新渲染页面
        filterRecords('all', document.querySelector('[data-filter="all"]'));
    };
    
    // ========== 记录详情 ==========
    /**
     * 显示记录详情
     * @param {string} id - 记录ID
     */
    window.showRecordDetail = async function(id) {
        const record = await DBUtil.getRecord(id);
        if (!record) {
            showToast('记录不存在', 'error');
            return;
        }
        
        // 修复：将图片数据存储到全局变量，避免HTML中序列化导致的问题
        window._tempRecordImages = record.images || [];
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">工资详情</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="card" style="border: 2px solid var(--primary);">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="font-size: 1rem; font-weight: 600; color: var(--primary);">¥${formatMoney(record.actualSalary)}</div>
                        <div style="color: var(--text-tertiary); margin-top: 4px;">${formatDisplayDate(record.date)}</div>
                    </div>
                </div>
                
                <div class="card">
                    <h4 style="margin-bottom: 16px; font-size: 1rem;">基本信息</h4>
                    <div class="settings-item">
                        <div class="settings-item-left">
                            <div class="settings-icon"><i class="fas fa-building"></i></div>
                            <div class="settings-text">
                                <div class="settings-label">公司</div>
                                <div class="settings-desc">${escapeHtml(record.company || '未设置')}</div>
                            </div>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-left">
                            <div class="settings-icon"><i class="fas fa-briefcase"></i></div>
                            <div class="settings-text">
                                <div class="settings-label">职位</div>
                                <div class="settings-desc">${escapeHtml(record.position || '未设置')}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <h4 style="margin-bottom: 16px; font-size: 1rem;">收入明细</h4>
                    ${record.salesAmount ? `
                    <div class="settings-item">
                        <span class="settings-label">销售额</span>
                        <span class="settings-label">¥${formatMoney(record.salesAmount)}</span>
                    </div>
                    ` : ''}
                    <div class="settings-item">
                        <span class="settings-label">基本工资</span>
                        <span class="settings-label">¥${formatMoney(record.baseSalary)}</span>
                    </div>
                    <div class="settings-item">
                        <span class="settings-label">提成（自动计算）</span>
                        <span class="settings-label">¥${formatMoney(record.commission)}</span>
                    </div>
                    <div class="settings-item">
                        <span class="settings-label">奖金</span>
                        <span class="settings-label">¥${formatMoney(record.bonus)}</span>
                    </div>
                    <div class="settings-item">
                        <span class="settings-label">补贴</span>
                        <span class="settings-label">¥${formatMoney(record.allowance)}</span>
                    </div>
                    <div class="settings-item">
                        <span class="settings-label">扣款</span>
                        <span class="settings-label" style="color: var(--danger);">-¥${formatMoney(record.deduction)}</span>
                    </div>
                    <div class="settings-item" style="border-top: 2px solid var(--border-color); padding-top: 16px; margin-top: 8px;">
                        <span class="settings-label" style="font-weight: 700;">实发工资</span>
                        <span class="settings-label" style="font-weight: 700; color: var(--success);">¥${formatMoney(record.actualSalary)}</span>
                    </div>
                </div>
                
                ${record.note ? `
                    <div class="card">
                        <h4 style="margin-bottom: 12px; font-size: 1rem;">备注</h4>
                        <p style="color: var(--text-secondary); line-height: 1.6;">${escapeHtml(record.note)}</p>
                    </div>
                ` : ''}
                
                ${record.images && record.images.length > 0 ? `
                    <div class="card">
                        <h4 style="margin-bottom: 12px; font-size: 1rem;">图片（${record.images.length}张）</h4>
                        <div class="record-images-preview">
                            ${record.images.map((img, idx) => `
                                <div class="record-image-item">
                                    <img src="${img}" alt="记录图片" onclick="openImageViewer(${idx}, 'record')">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <!-- 录入时间和更新时间 -->
                <div class="card" style="background: var(--bg-tertiary);">
                    <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 0.85rem; color: var(--text-tertiary);">
                        ${record.createdAt ? `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-clock"></i>
                                <span>录入时间：${formatDateTime(record.createdAt)}</span>
                            </div>
                        ` : ''}
                        ${record.updatedAt && record.updatedAt !== record.createdAt ? `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-edit"></i>
                                <span>更新时间：${formatDateTime(record.updatedAt)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="editRecord('${id}')">
                    <i class="fas fa-edit"></i> 编辑
                </button>
                <button class="btn btn-danger" onclick="confirmDeleteRecord('${id}')">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 编辑记录
     * @param {string} id 
     */
    window.editRecord = function(id) {
        closeModal();
        showAddRecordModal(id);
    };
    
    /**
     * 确认删除记录
     * @param {string} id 
     */
    window.confirmDeleteRecord = function(id) {
        closeModal();
        
        const confirmHtml = `
            <div class="modal-header">
                <h3 class="modal-title">确认删除</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 40px 24px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; color: var(--warning); margin-bottom: 16px;"></i>
                <h3 style="margin-bottom: 8px;">确定要删除这条记录吗？</h3>
                <p style="color: var(--text-tertiary);">此操作不可恢复</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-danger" onclick="deleteRecord('${id}')">
                    <i class="fas fa-trash"></i> 确认删除
                </button>
            </div>
        `;
        
        showModal(confirmHtml);
    };
    
    /**
     * 删除记录
     * @param {string} id 
     */
    window.deleteRecord = async function(id) {
        try {
            await DBUtil.deleteRecord(id);
            await loadData();
            closeModal();
            showToast('记录已删除', 'success');
            renderPage(state.currentPage);
        } catch (error) {
            showToast('删除失败: ' + error.message, 'error');
        }
    };
    
    // ========== 添加/编辑记录弹窗 ==========
    /**
     * 显示添加记录弹窗
     * @param {string} editId - 要编辑的记录ID（可选）
     */
    window.showAddRecordModal = function(editId = null) {
        const isEdit = editId !== null;
        let record = null;
        
        if (isEdit) {
            record = state.records.find(r => r.id === editId);
            if (!record) {
                showToast('记录不存在', 'error');
                return;
            }
        }
        
        // 存储当前编辑的记录ID，用于计算当月总额时排除该记录
        window._currentEditRecordId = editId;
        
        // 使用本地时间生成日期字符串
        const now = new Date();
        const today = now.getFullYear() + '-' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(now.getDate()).padStart(2, '0');
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">${isEdit ? '编辑记录' : '添加记录'}</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <form id="recordForm" onsubmit="return false;">
                    <div class="form-group">
                        <label class="form-label" for="recordDate">日期 <span style="color: var(--danger);">*</span></label>
                        <div class="date-input-wrapper">
                            <input type="text" class="form-input" id="recordDate" placeholder="请选择日期" value="${isEdit ? record.date : today}" readonly>
                        </div>
                        <div class="error-message" id="dateError">请选择日期</div>
                    </div>
                    
                    <!-- 公司 & 职位 可折叠组件 -->
                    <div class="collapsible-section" id="companyPositionSection">
                        <div class="collapsible-header" onclick="toggleCollapsible(this)">
                            <div class="collapsible-header-left">
                                <i class="fas fa-building collapsible-icon-left"></i>
                                <span class="collapsible-title">公司 & 职位</span>
                            </div>
                            <div class="collapsible-header-right">
                                <span class="collapsible-value" id="companyPositionValue">请选择</span>
                                <i class="fas fa-chevron-down collapsible-arrow"></i>
                            </div>
                        </div>
                        <div class="collapsible-body">
                            <div class="collapsible-body-content">
                                <div class="form-group">
                                    <label class="form-label" for="recordCompany">公司名称</label>
                                    <select class="form-input" id="recordCompany" onchange="updatePositionOptions(); updateCompanyPositionValue()">
                                        <option value="">请选择公司</option>
                                        ${state.companies.map(c => `<option value="${escapeHtml(c.name)}" ${isEdit && record.company === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                                    </select>
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label" for="recordPosition">职位</label>
                                    <select class="form-input" id="recordPosition" onchange="handlePositionChange(); updateCompanyPositionValue()">
                                        <option value="">请选择职位</option>
                                        ${isEdit && record.position ? `<option value="${escapeHtml(record.position)}" selected>${escapeHtml(record.position)}</option>` : ''}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="recordBaseSalary">基本工资 <span style="color: var(--danger);">*</span></label>
                        <input type="number" class="form-input" id="recordBaseSalary" placeholder="请输入基本工资" value="${isEdit ? record.baseSalary || 0 : ''}" min="0" step="0.01" required>
                        <div class="error-message" id="baseSalaryError">请输入有效的金额</div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="recordSalesAmount">销售额 <span style="font-size: 0.8rem; color: var(--text-tertiary);">(用于自动计算提成)</span></label>
                        <input type="number" class="form-input" id="recordSalesAmount" placeholder="请输入销售额" value="${isEdit && record.salesAmount ? record.salesAmount : ''}" min="0" step="0.01" oninput="autoCalculateCommission()">
                        <div class="error-message" id="salesAmountError">请先设置提成规则（我的 → 阶梯提成计算）</div>
                    </div>
                    
                    ${
                        state.commissionRules.length > 0 
                        ? `<div class="form-group">
                            <label class="form-label" for="recordCommissionRule">提成规则</label>
                            <select class="form-input" id="recordCommissionRule" onchange="autoCalculateCommission()">
                                ${state.commissionRules.map(rule => `<option value="${rule.id}" ${isEdit && record.commissionRuleId === rule.id ? 'selected' : ''}>${escapeHtml(rule.name)}</option>`).join('')}
                            </select>
                        </div>`
                        : ''
                    }
                    
                    <div class="form-group">
                        <label class="form-label" for="recordCommission">提成（自动计算）</label>
                        <input type="number" class="form-input" id="recordCommission" placeholder="自动计算出提成" value="${isEdit ? record.commission || 0 : '0'}" min="0" step="0.01" readonly style="background: var(--bg-tertiary); color: var(--primary); font-weight: 600;">
                    </div>
                    
                    <!-- 奖金/补贴/扣款 可折叠组件 -->
                    <div class="collapsible-section" id="bonusAllowanceDeductionSection">
                        <div class="collapsible-header" onclick="toggleCollapsible(this)">
                            <div class="collapsible-header-left">
                                <i class="fas fa-money-bill-wave collapsible-icon-left"></i>
                                <span class="collapsible-title">奖金 / 补贴 / 扣款</span>
                            </div>
                            <div class="collapsible-header-right">
                                <span class="collapsible-value" id="bonusAllowanceDeductionValue">选填</span>
                                <i class="fas fa-chevron-down collapsible-arrow"></i>
                            </div>
                        </div>
                        <div class="collapsible-body">
                            <div class="collapsible-body-content">
                                <div class="form-group">
                                    <label class="form-label" for="recordBonus">奖金</label>
                                    <input type="number" class="form-input" id="recordBonus" placeholder="请输入奖金" value="${isEdit ? record.bonus || 0 : ''}" min="0" step="0.01" oninput="updateBonusAllowanceDeductionValue()">
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label" for="recordAllowance">补贴</label>
                                    <input type="number" class="form-input" id="recordAllowance" placeholder="请输入补贴" value="${isEdit ? record.allowance || 0 : ''}" min="0" step="0.01" oninput="updateBonusAllowanceDeductionValue()">
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label" for="recordDeduction">扣款</label>
                                    <input type="number" class="form-input" id="recordDeduction" placeholder="请输入扣款金额" value="${isEdit ? record.deduction || 0 : ''}" min="0" step="0.01" oninput="updateBonusAllowanceDeductionValue()">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="recordNote">备注</label>
                        <textarea class="form-textarea" id="recordNote" placeholder="请输入备注信息" maxlength="200">${isEdit ? escapeHtml(record.note || '') : ''}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">图片（最多9张）</label>
                        <div class="image-upload-area" onclick="document.getElementById('recordImageInput').click()">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 1.2rem; color: var(--text-tertiary); margin-bottom: 8px;"></i>
                            <p style="color: var(--text-tertiary); font-size: 0.85rem;">点击上传图片，支持多选（最多9张）</p>
                        </div>
                        <input type="file" id="recordImageInput" accept="image/*" multiple style="display: none;" onchange="handleRecordImageUpload(this, '${editId || ''}')">
                        <div id="recordImagePreview" class="image-preview-grid">
                            ${isEdit && record.images ? record.images.map((img, idx) => `
                                <div class="image-preview-item">
                                    <img src="${img}" alt="预览">
                                    <button type="button" class="image-remove-btn" onclick="removeRecordImage(${idx}, '${editId || ''}')">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            `).join('') : ''}
                        </div>
                    </div>
                    
                    <div class="card" style="background: var(--bg-tertiary);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600;">实发工资</span>
                            <span style="font-size: 1rem; font-weight: 600; color: var(--success);" id="previewSalary">¥0.00</span>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="saveRecord('${editId || ''}')">
                    <i class="fas fa-save"></i> ${isEdit ? '保存修改' : '添加记录'}
                </button>
            </div>
        `;
        
        showModal(html);
        
        // 初始化可折叠组件的状态
        setTimeout(() => {
            // 初始化公司&职位可折叠组件
            updateCompanyPositionValue();
            // 初始化奖金/补贴/扣款可折叠组件
            updateBonusAllowanceDeductionValue();
            
            // 如果有值，自动展开对应的可折叠区域
            const company = document.getElementById('recordCompany');
            const position = document.getElementById('recordPosition');
            if ((company && company.value) || (position && position.value && position.value !== '请选择职位')) {
                const section = document.getElementById('companyPositionSection');
                if (section) {
                    section.classList.add('expanded');
                    section.querySelector('.collapsible-body')?.classList.add('expanded');
                }
            }
            
            const bonus = document.getElementById('recordBonus');
            const allowance = document.getElementById('recordAllowance');
            const deduction = document.getElementById('recordDeduction');
            if ((bonus && parseFloat(bonus.value) > 0) || 
                (allowance && parseFloat(allowance.value) > 0) || 
                (deduction && parseFloat(deduction.value) > 0)) {
                const section = document.getElementById('bonusAllowanceDeductionSection');
                if (section) {
                    section.classList.add('expanded');
                    section.querySelector('.collapsible-body')?.classList.add('expanded');
                }
            }
            
            // 触发一次提成计算（如果有销售额的值）
            autoCalculateCommission();
        }, 100);
        
        // 初始化临时图片数组
        if (isEdit && record.images) {
            window._tempRecordImages = [...record.images];
        } else {
            window._tempRecordImages = [];
        }
        
        // 绑定实时计算
        ['recordBaseSalary', 'recordCommission', 'recordBonus', 'recordAllowance', 'recordDeduction'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', calculatePreview);
            }
        });
        
        // 初始计算
        calculatePreview();
        
        // 初始化自定义日历组件
        setTimeout(() => {
            initCalendar('recordDate');
        }, 100);
        
        // 绑定销售额输入事件（自动计算提成）
        setTimeout(() => {
            const salesInput = document.getElementById('recordSalesAmount');
            if (salesInput) {
                salesInput.addEventListener('input', autoCalculateCommission);
                // 如果是编辑模式且已有销售额，触发一次计算
                if (salesInput.value) {
                    autoCalculateCommission();
                }
            }
        }, 200);
    };
    
    // ========= 工资记录图片上传相关函数 =========
    
    /**
     * 处理工资记录图片上传
     * @param {HTMLInputElement} input - 文件输入元素
     * @param {string} editId - 编辑ID
     */
    window.handleRecordImageUpload = async function(input, editId) {
        const files = Array.from(input.files || []);
        if (files.length === 0) return;
        
        // 初始化临时图片数组
        if (!window._tempRecordImages) {
            window._tempRecordImages = [];
        }
        
        // 检查总数是否超过9张
        const totalCount = window._tempRecordImages.length + files.length;
        if (totalCount > 9) {
            showToast('最多只能上传9张图片', 'warning');
            input.value = '';
            return;
        }
        
        showToast('正在压缩图片...', 'info');
        
        // 使用 browser-image-compression 压缩图片
        for (const file of files) {
            try {
                const options = {
                    maxSizeMB: 0.5,           // 压缩后最大500KB
                    maxWidthOrHeight: 1920,    // 最大宽度或高度
                    useWebWorker: true,        // 使用Web Worker加速
                    preserveExif: true,        // 保留EXIF信息
                    fileType: 'image/jpeg',    // 输出格式
                    initialQuality: 0.8         // 初始质量
                };
                
                const compressedFile = await imageCompression(file, options);
                
                // 将压缩后的文件转换为base64
                const reader = new FileReader();
                reader.onload = function(e) {
                    window._tempRecordImages.push(e.target.result);
                    updateRecordImagePreview(editId);
                };
                reader.readAsDataURL(compressedFile);
            } catch (error) {
                console.error('图片压缩失败:', error);
                showToast('图片压缩失败', 'error');
            }
        }
        
        input.value = '';
    };
    
    /**
     * 更新工资记录图片预览
     * @param {string} editId - 编辑ID
     */
    function updateRecordImagePreview(editId) {
        const previewContainer = document.getElementById('recordImagePreview');
        if (!previewContainer) return;
        
        previewContainer.innerHTML = (window._tempRecordImages || []).map((img, idx) => `
            <div class="image-preview-item">
                <img src="${img}" alt="预览" onclick="openImageViewer(${idx}, 'record')">
                <button type="button" class="image-remove-btn" onclick="removeRecordImage(${idx}, '${editId || ''}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
    
    /**
     * 移除工资记录图片
     * @param {number} index - 图片索引
     * @param {string} editId - 编辑ID
     */
    window.removeRecordImage = function(index, editId) {
        if (window._tempRecordImages && window._tempRecordImages.length > index) {
            window._tempRecordImages.splice(index, 1);
            updateRecordImagePreview(editId);
        }
    };
    
    // ========= 图片查看器相关函数 =========
    
    /**
     * 打开图片查看器
     * @param {number} startIndex - 起始图片索引
     * @param {string} type - 图片类型：'record' 或 'note'
     */
    window.openImageViewer = function(startIndex, type = 'note') {
        const images = type === 'record' ? window._tempRecordImages : window._tempNoteImages;
        if (!images || images.length === 0) return;
        
        // 创建图片查看器HTML
        const html = `
            <div class="image-viewer-overlay" id="imageViewerOverlay" onclick="closeImageViewer()">
                <div class="image-viewer-container" onclick="event.stopPropagation()">
                    <button class="image-viewer-close" onclick="closeImageViewer()">
                        <i class="fas fa-times"></i>
                    </button>
                    
                    ${images.length > 1 ? `
                        <button class="image-viewer-prev" onclick="changeImage(-1, '${type}')">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <button class="image-viewer-next" onclick="changeImage(1, '${type}')">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                        
                        <div class="image-viewer-counter" id="imageViewerCounter">
                            ${startIndex + 1} / ${images.length}
                        </div>
                        
                        <div class="image-viewer-dots" id="imageViewerDots">
                            ${images.map((_, idx) => `
                                <div class="image-viewer-dot ${idx === startIndex ? 'active' : ''}" onclick="goToImage(${idx}, '${type}')"></div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <div class="image-viewer-slide" id="imageViewerSlide">
                        <img src="${images[startIndex]}" alt="图片" id="imageViewerImg">
                    </div>
                </div>
            </div>
        `;
        
        // 添加到页面
        document.getElementById('app').insertAdjacentHTML('beforeend', html);
        
        // 显示查看器
        setTimeout(() => {
            document.getElementById('imageViewerOverlay').classList.add('active');
        }, 10);
        
        // 保存当前索引
        window._currentImageIndex = startIndex;
        window._currentImageType = type;
        
        // 绑定触摸事件（用于滑动）
        bindImageViewerTouchEvents();
    };
    
    /**
     * 关闭图片查看器
     */
    window.closeImageViewer = function() {
        const overlay = document.getElementById('imageViewerOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
    };
    
    /**
     * 切换图片
     * @param {number} direction - 方向：-1 上一张，1 下一张
     * @param {string} type - 图片类型
     */
    window.changeImage = function(direction, type) {
        const images = type === 'record' ? window._tempRecordImages : window._tempNoteImages;
        if (!images || images.length === 0) return;
        
        let newIndex = window._currentImageIndex + direction;
        
        // 循环
        if (newIndex < 0) newIndex = images.length - 1;
        if (newIndex >= images.length) newIndex = 0;
        
        window._currentImageIndex = newIndex;
        
        // 更新图片
        const img = document.getElementById('imageViewerImg');
        if (img) {
            img.src = images[newIndex];
        }
        
        // 更新计数器
        const counter = document.getElementById('imageViewerCounter');
        if (counter) {
            counter.textContent = `${newIndex + 1} / ${images.length}`;
        }
        
        // 更新圆点
        const dots = document.querySelectorAll('.image-viewer-dot');
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === newIndex);
        });
    };
    
    /**
     * 跳转到指定图片
     * @param {number} index - 图片索引
     * @param {string} type - 图片类型
     */
    window.goToImage = function(index, type) {
        window.changeImage(index - window._currentImageIndex, type);
    };
    
    /**
     * 绑定图片查看器的触摸事件（用于滑动）
     */
    function bindImageViewerTouchEvents() {
        const overlay = document.getElementById('imageViewerOverlay');
        if (!overlay) return;
        
        let startX = 0;
        let startY = 0;
        let distX = 0;
        let distY = 0;
        
        overlay.addEventListener('touchstart', function(e) {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
        }, { passive: true });
        
        overlay.addEventListener('touchmove', function(e) {
            if (!e.touches || e.touches.length === 0) return;
            const touch = e.touches[0];
            distX = touch.clientX - startX;
            distY = touch.clientY - startY;
        }, { passive: true });
        
        overlay.addEventListener('touchend', function() {
            // 判断滑动方向（水平滑动）
            if (Math.abs(distX) > Math.abs(distY) && Math.abs(distX) > 50) {
                if (distX > 0) {
                    // 向右滑动，上一张
                    window.changeImage(-1, window._currentImageType);
                } else {
                    // 向左滑动，下一张
                    window.changeImage(1, window._currentImageType);
                }
            }
            
            // 重置
            distX = 0;
            distY = 0;
        }, { passive: true });
        
        // 键盘事件
        document.addEventListener('keydown', function(e) {
            if (!document.getElementById('imageViewerOverlay')) return;
            
            if (e.key === 'ArrowLeft') {
                window.changeImage(-1, window._currentImageType);
            } else if (e.key === 'ArrowRight') {
                window.changeImage(1, window._currentImageType);
            } else if (e.key === 'Escape') {
                window.closeImageViewer();
            }
        });
    }
    
    /**
     * 计算提成（根据阶梯规则）
     * 计算方式：量级计费 - 根据销售额匹配最高适用阶级，按该阶级的提成率全量计算
     * @param {number} salesAmount - 销售额
     * @param {Object} rule - 提成规则
     * @param {number} monthlyTotalSales - 当月销售总额（可选，用于匹配阶级）
     * @returns {number} 提成金额（精确到分）
     */
    function calculateCommission(salesAmount, rule, monthlyTotalSales = null) {
        if (!rule || !rule.tiers || rule.tiers.length === 0 || salesAmount <= 0) {
            return 0;
        }
        
        // 使用整数计算（单位为分），彻底避免浮点数误差
        const salesInCents = Math.round(salesAmount * 100);
        
        // 确定用于匹配阶级的销售额：如果提供了当月总额，则使用总额；否则使用当前销售额
        const amountForTierMatching = (monthlyTotalSales !== null && monthlyTotalSales !== undefined) ? monthlyTotalSales : salesAmount;
        const amountForTierMatchingInCents = Math.round(amountForTierMatching * 100);
        
        // 按最小值排序阶梯
        const sortedTiers = [...rule.tiers].sort((a, b) => a.min - b.min);
        
        // 量级计费方式：
        // 根据销售额匹配最高适用阶级，直接按照该阶级的提成率进行全量计算
        // 例如：阶梯1 min=0 提成率5%，阶梯2 min=10000 提成率8%，阶梯3 min=30000 提成率10%
        // 销售额25000 -> 匹配阶梯2（25000 >= 10000）-> 25000 * 8% = 2000
        // 销售额35000 -> 匹配阶梯3（35000 >= 30000）-> 35000 * 10% = 3500
        
        // 找到最高适用阶级（amountForTierMatching >= tier.min 的最高阶级）
        let applicableTier = null;
        for (const tier of sortedTiers) {
            const tierMinInCents = Math.round(tier.min * 100);
            if (amountForTierMatchingInCents >= tierMinInCents) {
                applicableTier = tier;
            } else {
                break; // 由于已按 min 排序，后续阶级的 min 更大，无需继续检查
            }
        }
        
        if (!applicableTier || applicableTier.rate <= 0) {
            return 0;
        }
        
        // 按照适用阶级的提成率，对全部销售额进行计算
        const commissionInCents = Math.round(salesInCents * applicableTier.rate / 100);
        
        // 转换回元，精确到分（2位小数）
        return commissionInCents / 100;
    }
    
    /**
     * 根据销售额自动计算提成
     * 使用量级计费方式：根据当月销售总额匹配最高适用阶级，按该阶级的提成率全量计算
     */
    function autoCalculateCommission() {
        const salesInput = document.getElementById('recordSalesAmount');
        const commissionInput = document.getElementById('recordCommission');
        const ruleSelect = document.getElementById('recordCommissionRule');
        const dateInput = document.getElementById('recordDate');
        
        if (!salesInput || !commissionInput) return;
        
        const salesAmount = parseFloat(salesInput.value) || 0;
        
        // 检查是否有提成规则
        if (!state.commissionRules || state.commissionRules.length === 0) {
            commissionInput.value = '0.00';
            const errorDiv = document.getElementById('salesAmountError');
            if (errorDiv) errorDiv.style.display = 'block';
            calculatePreview();
            return;
        }
        
        // 获取选中的规则
        let selectedRule = null;
        if (ruleSelect && ruleSelect.value) {
            selectedRule = state.commissionRules.find(r => r.id === ruleSelect.value);
        }
        
        // 如果没有选中规则但有规则，使用第一个
        if (!selectedRule && state.commissionRules.length > 0) {
            selectedRule = state.commissionRules[0];
            // 自动选择第一个规则
            if (ruleSelect) ruleSelect.value = selectedRule.id;
        }
        
        if (!selectedRule) {
            commissionInput.value = '0.00';
            const errorDiv = document.getElementById('salesAmountError');
            if (errorDiv) errorDiv.style.display = 'block';
            calculatePreview();
            return;
        }
        
        // 隐藏错误提示
        const errorDiv = document.getElementById('salesAmountError');
        if (errorDiv) errorDiv.style.display = 'none';
        
        // 计算当月销售总额，用于匹配阶级
        let monthlyTotalSales = salesAmount;
        if (dateInput && dateInput.value) {
            const selectedDate = new Date(dateInput.value);
            const selectedMonth = selectedDate.getFullYear() * 100 + (selectedDate.getMonth() + 1);
            
            // 汇总当月所有记录的销售额（排除当前正在编辑的记录）
            const monthlyRecords = state.records.filter(r => {
                if (!r.date) return false;
                const recordDate = new Date(r.date);
                const recordMonth = recordDate.getFullYear() * 100 + (recordDate.getMonth() + 1);
                // 如果是编辑模式，排除当前编辑的记录
                if (window._currentEditRecordId && r.id === window._currentEditRecordId) {
                    return false;
                }
                return recordMonth === selectedMonth;
            });
            
            const monthlyTotal = monthlyRecords.reduce((sum, r) => sum + (r.salesAmount || 0), 0);
            monthlyTotalSales = monthlyTotal + salesAmount;
        }
        
        // 使用选中的提成规则进行计算
        // 传入当月销售总额用于匹配阶级，但提成按当前销售额全量计算
        const commission = calculateCommission(salesAmount, selectedRule, monthlyTotalSales);
        
        commissionInput.value = commission.toFixed(2);
        
        // 重新计算预览
        calculatePreview();
    }
    
    /**
     * 根据选择的公司更新职位选项
     */
    window.updatePositionOptions = function() {
        const companySelect = document.getElementById('recordCompany');
        const positionSelect = document.getElementById('recordPosition');
        
        if (!companySelect || !positionSelect) return;
        
        const selectedCompany = companySelect.value;
        
        // 更新职位选项
        if (selectedCompany) {
            // 查找该公司对应的职位
            const company = state.companies.find(c => c.name === selectedCompany);
            if (company) {
                DBUtil.getPositionsByCompany(company.id).then(positions => {
                    let options = '<option value="">请选择职位</option>';
                    positions.forEach(pos => {
                        options += `<option value="${escapeHtml(pos.name)}">${escapeHtml(pos.name)}</option>`;
                    });
                    positionSelect.innerHTML = options;
                });
            }
        } else {
            // 没有选择公司，清空职位
            positionSelect.innerHTML = '<option value="">请先选择公司</option>';
        }
    };
    
    /**
     * 更新公司下拉框
     */
    function updateCompanySelect(selectedName = '') {
        const companySelect = document.getElementById('recordCompany');
        if (!companySelect) return;
        
        let options = '<option value="">请选择公司</option>';
        state.companies.forEach(c => {
            const selected = c.name === selectedName ? 'selected' : '';
            options += `<option value="${escapeHtml(c.name)}" ${selected}>${escapeHtml(c.name)}</option>`;
        });
        companySelect.innerHTML = options;
        
        // 触发更新职位选项
        if (selectedName) {
            updatePositionOptions();
        }
    }
    
    /**
     * 处理职位下拉框变化
     */
    window.handlePositionChange = function() {
        // 函数保留但不再处理"添加新职位"逻辑
        // 如有需要，可以在此处添加其他处理逻辑
        const positionSelect = document.getElementById('recordPosition');
        if (!positionSelect) return;
        
        // 当前无需特殊处理
    };
    
    /**
     * 计算预览工资金额
     */
    function calculatePreview() {
        const base = parseFloat(document.getElementById('recordBaseSalary')?.value) || 0;
        const commission = parseFloat(document.getElementById('recordCommission')?.value) || 0;
        const bonus = parseFloat(document.getElementById('recordBonus')?.value) || 0;
        const allowance = parseFloat(document.getElementById('recordAllowance')?.value) || 0;
        const deduction = parseFloat(document.getElementById('recordDeduction')?.value) || 0;
        
        const total = base + commission + bonus + allowance - deduction;
        const preview = document.getElementById('previewSalary');
        if (preview) {
            preview.textContent = '¥' + formatMoney(total);
        }
    }
    
    /**
     * 保存记录
     * @param {string} editId - 要编辑的记录ID（为空表示新增）
     */
    window.saveRecord = async function(editId = '') {
        // 表单验证
        const date = document.getElementById('recordDate')?.value;
        const baseSalary = document.getElementById('recordBaseSalary')?.value;
        
        if (!date) {
            showToast('请选择日期', 'warning');
            return;
        }
        
        if (!baseSalary || parseFloat(baseSalary) < 0) {
            showToast('请输入有效的基本工资', 'warning');
            return;
        }
        
        // 收集数据
        const salesAmount = parseFloat(document.getElementById('recordSalesAmount')?.value) || 0;
        
        // 从日期中提取年份和月份
        const dateParts = date.split('-');
        const recordYear = parseInt(dateParts[0]) || new Date().getFullYear();
        const recordMonth = parseInt(dateParts[1]) || (new Date().getMonth() + 1);
        
        const record = {
            date: date,
            year: recordYear,
            month: recordMonth,
            company: document.getElementById('recordCompany')?.value.trim() || '',
            position: document.getElementById('recordPosition')?.value.trim() || '',
            baseSalary: parseFloat(baseSalary) || 0,
            salesAmount: salesAmount, // 保存销售额
            commission: parseFloat(document.getElementById('recordCommission')?.value) || 0, // 自动计算的提成
            commissionRuleId: document.getElementById('recordCommissionRule')?.value || '', // 保存使用的提成规则ID
            bonus: parseFloat(document.getElementById('recordBonus')?.value) || 0,
            allowance: parseFloat(document.getElementById('recordAllowance')?.value) || 0,
            deduction: parseFloat(document.getElementById('recordDeduction')?.value) || 0,
            note: document.getElementById('recordNote')?.value.trim() || '',
            images: window._tempRecordImages || [] // 保存图片
        };
        
        // 计算实发工资
        record.actualSalary = record.baseSalary + record.commission + record.bonus + record.allowance - record.deduction;
        
        try {
            if (editId) {
                record.id = editId;
                await DBUtil.updateRecord(record);
                showToast('记录已更新', 'success');
            } else {
                await DBUtil.addRecord(record);
                showToast('记录已添加', 'success');
            }
            
            await loadData();
            closeModal();
            renderPage(state.currentPage);
        } catch (error) {
            showToast('保存失败: ' + error.message, 'error');
        }
    };
    
    // ========== 统计分析页 ==========
    /**
     * 渲染统计分析页
     * @param {HTMLElement} container 
     */
    async function renderStatisticsPage(container) {
        const records = state.records;
        
        if (records.length === 0) {
            container.innerHTML = renderEmptyState(
                '暂无数据',
                '添加工资记录后可以查看统计分析'
            );
            return;
        }
        
        let html = '';
        
        // 外层容器 - 使用flex布局确保标签页能够sticky定位
        html += `<div class="stats-page-wrapper">`;
        
        // 标签页切换（固定到顶部）
        html += `
            <div class="tabs fade-in stats-tabs-sticky">
                <button class="tab active" onclick="switchStatsTab('overview', this)">概览</button>
                <button class="tab" onclick="switchStatsTab('trend', this)">趋势</button>
                <button class="tab" onclick="switchStatsTab('composition', this)">构成</button>
            </div>
        `;
        
        // 统计内容可滚动容器
        html += `<div class="stats-scroll-container">`;
        
        // 统计内容区域
        html += `<div id="statsContent"></div>`;
        
        html += `</div>`; // 关闭 stats-scroll-container
        html += `</div>`; // 关闭 stats-page-wrapper
        
        container.innerHTML = html;
        
        // 默认显示概览
        renderStatsOverview();
    }
    
    /**
     * 切换统计标签页
     * @param {string} tab - 标签名
     * @param {HTMLElement} element - 点击的元素
     */
    window.switchStatsTab = function(tab, element) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        element.classList.add('active');
        
        const content = document.getElementById('statsContent');
        content.style.opacity = '0';
        
        setTimeout(() => {
            switch (tab) {
                case 'overview':
                    renderStatsOverview();
                    break;
                case 'trend':
                    renderStatsTrend();
                    break;
                case 'composition':
                    renderStatsComposition();
                    break;
            }
            content.style.transition = 'opacity 0.3s';
            content.style.opacity = '1';
        }, 150);
    };
    
    /**
     * 渲染统计概览
     */
    async function renderStatsOverview() {
        const stats = await DBUtil.getStatistics();
        const content = document.getElementById('statsContent');
        
        let html = '';
        
        // 统计卡片
        html += `
            <div class="stat-grid fade-in">
                <div class="card">
                    <div class="stat-label">记录总数</div>
                    <div class="stat-value" style="font-size: 1rem; color: var(--primary);">${stats.totalRecords}</div>
                </div>
                <div class="card">
                    <div class="stat-label">总收入</div>
                    <div class="stat-value" style="font-size: 1rem; color: var(--success);">¥${formatMoney(stats.totalIncome)}</div>
                </div>
                <div class="card">
                    <div class="stat-label">平均收入</div>
                    <div class="stat-value" style="font-size: 1rem; color: var(--info);">¥${formatMoney(stats.averageIncome)}</div>
                </div>
                <div class="card">
                    <div class="stat-label">最高/最低</div>
                    <div class="stat-value" style="font-size: 1rem; color: var(--warning);">¥${formatMoney(stats.highestIncome)} / ¥${formatMoney(stats.lowestIncome)}</div>
                </div>
            </div>
        `;
        
        // 年度对比图
        html += `
            <div class="card fade-in">
                <h3 class="card-title">年度对比</h3>
                <div class="chart-container">
                    <canvas id="yearlyChart"></canvas>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
        
        // 渲染图表
        setTimeout(() => {
            ChartUtil.createYearlyComparisonChart('yearlyChart', state.records);
        }, 100);
    }
    
    /**
     * 渲染趋势统计
     */
    function renderStatsTrend() {
        const content = document.getElementById('statsContent');
        
        let html = '';
        
        // 月度趋势图
        html += `
            <div class="card fade-in">
                <h3 class="card-title">月度收入趋势</h3>
                <div class="chart-container">
                    <canvas id="trendChart"></canvas>
                </div>
            </div>
        `;
        
        // 年度趋势图
        html += `
            <div class="card fade-in">
                <h3 class="card-title">年度收入趋势</h3>
                <div class="chart-container">
                    <canvas id="yearlyTrendChart"></canvas>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
        
        // 渲染图表
        setTimeout(() => {
            ChartUtil.createMonthlyTrendChart('trendChart', state.records);
            ChartUtil.createYearlyTrendChart('yearlyTrendChart', state.records);
        }, 100);
    }
    
    /**
     * 渲染构成统计
     */
    function renderStatsComposition() {
        const content = document.getElementById('statsContent');
        
        let html = '';
        
        // 收入构成饼图
        html += `
            <div class="card fade-in">
                <h3 class="card-title">收入构成</h3>
                <div class="chart-container" style="height: 280px;">
                    <canvas id="compositionChart"></canvas>
                </div>
            </div>
        `;
        
        // 明细表格
        html += `
            <div class="card fade-in">
                <h3 class="card-title">收入明细</h3>
                ${renderIncomeBreakdown()}
            </div>
        `;
        
        content.innerHTML = html;
        
        // 渲染图表
        setTimeout(() => {
            ChartUtil.createIncomeCompositionChart('compositionChart', state.records);
        }, 100);
    }
    
    /**
     * 渲染收入明细表格
     * @returns {string}
     */
    function renderIncomeBreakdown() {
        const totals = state.records.reduce((acc, record) => {
            acc.baseSalary += parseFloat(record.baseSalary) || 0;
            acc.commission += parseFloat(record.commission) || 0;
            acc.bonus += parseFloat(record.bonus) || 0;
            acc.allowance += parseFloat(record.allowance) || 0;
            return acc;
        }, { baseSalary: 0, commission: 0, bonus: 0, allowance: 0 });
        
        const total = totals.baseSalary + totals.commission + totals.bonus + totals.allowance;
        
        const items = [
            { label: '基本工资', value: totals.baseSalary, color: 'var(--primary)' },
            { label: '提成', value: totals.commission, color: 'var(--success)' },
            { label: '奖金', value: totals.bonus, color: 'var(--warning)' },
            { label: '补贴', value: totals.allowance, color: 'var(--info)' }
        ];
        
        return items.map(item => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
            return `
                <div class="settings-item">
                    <div class="settings-item-left">
                        <div style="width: 12px; height: 12px; border-radius: 2px; background: ${item.color}; flex-shrink: 0;"></div>
                        <span class="settings-label">${item.label}</span>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600;">¥${formatMoney(item.value)}</div>
                        <div style="font-size: 0.8rem; color: var(--text-tertiary);">${percentage}%</div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // ========== 我的页面 ==========
    /**
     * 渲染个人页面
     * @param {HTMLElement} container 
     */
    function renderProfilePage(container) {
        const encryptionEnabled = localStorage.getItem('salary_encryption') === 'true';
        
        let html = '';
        
        // 用户信息卡片
        html += `
            <div class="card fade-in" style="text-align: center; padding: 30px 20px;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-user" style="font-size: 1.2rem; color: white;"></i>
                </div>
                <h2 style="margin-bottom: 4px;">工资管理</h2>
                <p style="color: var(--text-tertiary);">安全 · 便捷 · 高效</p>
            </div>
        `;
        
        // 主题色彩选择
        html += `
            <div class="card fade-in">
                <h3 class="card-title mb-16">主题色彩</h3>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 8px 0;">
                    <button class="theme-option ${state.theme === 'light' ? 'active' : ''}" onclick="switchColorTheme('light')" style="flex-direction: column; gap: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);"></div>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">默认紫</span>
                    </button>
                    <button class="theme-option ${state.theme === 'blue' ? 'active' : ''}" onclick="switchColorTheme('blue')" style="flex-direction: column; gap: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #06b6d4); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);"></div>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">海洋蓝</span>
                    </button>
                    <button class="theme-option ${state.theme === 'green' ? 'active' : ''}" onclick="switchColorTheme('green')" style="flex-direction: column; gap: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #0ea5e9); box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);"></div>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">自然绿</span>
                    </button>
                    <button class="theme-option ${state.theme === 'purple' ? 'active' : ''}" onclick="switchColorTheme('purple')" style="flex-direction: column; gap: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #ec4899); box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);"></div>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">梦幻紫</span>
                    </button>
                    <button class="theme-option ${state.theme === 'orange' ? 'active' : ''}" onclick="switchColorTheme('orange')" style="flex-direction: column; gap: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #f97316, #f59e0b); box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);"></div>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">活力橙</span>
                    </button>
                    <button class="theme-option ${state.theme === 'pink' ? 'active' : ''}" onclick="switchColorTheme('pink')" style="flex-direction: column; gap: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #ec4899, #8b5cf6); box-shadow: 0 2px 8px rgba(236, 72, 153, 0.3);"></div>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">浪漫粉</span>
                    </button>
                </div>
            </div>
        `;
        
        // 设置列表
        html += `
            <div class="card fade-in">
                <h3 class="card-title mb-16">设置</h3>
                
                <div class="settings-item">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-moon"></i></div>
                        <div class="settings-text">
                            <div class="settings-label">深色模式</div>
                            <div class="settings-desc">切换浅色/深色主题</div>
                        </div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" ${state.theme === 'dark' ? 'checked' : ''} onchange="toggleTheme()">
                        <span class="switch-slider"></span>
                    </label>
                </div>
                
                <div class="settings-item">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-lock"></i></div>
                        <div class="settings-text">
                            <div class="settings-label">数据加密</div>
                            <div class="settings-desc">使用AES加密敏感数据</div>
                        </div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" ${encryptionEnabled ? 'checked' : ''} onchange="toggleEncryption(this)">
                        <span class="switch-slider"></span>
                    </label>
                </div>
                
                <div class="settings-item" onclick="showCommissionRules()">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-calculator"></i></div>
                        <div class="settings-text">
                            <div class="settings-label">阶梯提成计算</div>
                            <div class="settings-desc">设置提成计算规则</div>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
                
                <div class="settings-item" onclick="showCompanyManagement()">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-building"></i></div>
                        <div class="settings-text">
                            <div class="settings-label">公司和职位管理</div>
                            <div class="settings-desc">管理公司和职位信息</div>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
            </div>
        `;
        
        // 数据管理
        html += `
            <div class="card fade-in">
                <h3 class="card-title mb-16">数据管理</h3>
                
                <div class="settings-item" onclick="exportData()">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-download"></i></div>
                        <div class="settings-text">
                            <div class="settings-label">导出数据</div>
                            <div class="settings-desc">导出为JSON或Excel格式</div>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
                
                <div class="settings-item" onclick="importData()">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-upload"></i></div>
                        <div class="settings-text">
                            <div class="settings-label">导入数据</div>
                            <div class="settings-desc">从JSON或Excel文件导入</div>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
                
                <div class="settings-item" onclick="confirmClearData()">
                    <div class="settings-item-left">
                        <div class="settings-icon" style="color: var(--danger);"><i class="fas fa-trash-alt"></i></div>
                        <div class="settings-text">
                            <div class="settings-label" style="color: var(--danger);">清除所有数据</div>
                            <div class="settings-desc">此操作不可恢复</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 关于信息
        html += `
            <div class="card fade-in" style="text-align: center; padding: 20px;">
                <p style="color: var(--text-tertiary); font-size: 0.85rem;">
                    工资管理系统 v1.0.0<br>
                    数据存储在本地浏览器中，请勿清除浏览器数据
                </p>
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    // ========== 笔记页面 ==========
    /**
     * 渲染笔记页面
     * @param {HTMLElement} container 
     */
    async function renderNotesPage(container) {
        // 加载笔记数据
        state.notes = await DBUtil.getAllNotes();
        
        let html = '';
        
        // 页面标题 - 固定顶部，类似首页头部设计
        html += `
            <div class="notes-page-header">
                <div class="notes-header-content">
                    <div class="notes-header-label">
                        <i class="fas fa-sticky-note"></i> 我的笔记
                    </div>
                    <div class="notes-header-count">共 ${state.notes.length} 篇笔记</div>
                </div>
                <i class="fas fa-pen-fancy notes-header-icon"></i>
            </div>
        `;
        
        // 笔记列表 - 按更新时间倒序排列（最新的在前面）
        const sortedNotes = [...state.notes].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
        
        if (sortedNotes.length === 0) {
            html += `<div class="empty-state-page-center">`;
            html += renderEmptyState('暂无笔记', '点击右上角加号添加第一条笔记', 'fa-sticky-note');
            html += `</div>`;
        } else {
            html += `<div class="notes-list fade-in">`;
            sortedNotes.forEach(note => {
                html += renderNoteItem(note);
            });
            html += `</div>`;
        }
        
        container.innerHTML = html;
    }
    
    /**
     * 渲染笔记项
     * @param {Object} note - 笔记对象
     * @returns {string}
     */
    function renderNoteItem(note) {
        const preview = (note.content || '').substring(0, 100);
        const hasImages = note.images && note.images.length > 0;
        const imageCount = hasImages ? note.images.length : 0;
        
        return `
            <div class="card mb-12 fade-in" onclick="showNoteDetail('${note.id}')" style="cursor: pointer;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1; min-width: 0;">
                        <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(note.title || '无标题')}</h4>
                        ${preview ? `<p style="color: var(--text-secondary); font-size: 0.8rem; line-height: 1.3; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHtml(preview)}</p>` : ''}
                        <div style="display: flex; align-items: center; gap: 10px; font-size: 0.75rem; color: var(--text-tertiary);">
                            <span><i class="fas fa-clock"></i> ${formatDateTime(note.updatedAt || note.createdAt)}</span>
                            ${hasImages ? `<span><i class="fas fa-image"></i> ${imageCount}张图片</span>` : ''}
                        </div>
                    </div>
                    ${hasImages && note.images[0] ? `
                        <img src="${note.images[0]}" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; margin-left: 12px; flex-shrink: 0;">
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * 显示添加/编辑笔记弹窗
     * @param {string} editId - 要编辑的笔记ID（可选）
     */
    window.showAddNoteModal = function(editId = null) {
        const isEdit = editId !== null;
        let note = null;
        
        if (isEdit) {
            note = state.notes.find(n => n.id === editId);
            if (!note) {
                showToast('笔记不存在', 'error');
                return;
            }
        }
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">${isEdit ? '编辑笔记' : '添加笔记'}</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <form id="noteForm" onsubmit="return false;">
                    <div class="form-group">
                        <label class="form-label" for="noteTitle">标题</label>
                        <input type="text" class="form-input" id="noteTitle" placeholder="请输入标题" value="${isEdit ? escapeHtml(note.title || '') : ''}" maxlength="100">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="noteContent">内容</label>
                        <textarea class="form-input" id="noteContent" placeholder="请输入内容" rows="6" style="resize: vertical; min-height: 120px;">${isEdit ? escapeHtml(note.content || '') : ''}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">图片（最多9张）</label>
                        <div class="image-upload-area" onclick="document.getElementById('noteImageInput').click()">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 1.2rem; color: var(--text-tertiary); margin-bottom: 8px;"></i>
                            <p style="color: var(--text-tertiary); font-size: 0.85rem;">点击上传图片，支持多选（最多9张）</p>
                        </div>
                        <input type="file" id="noteImageInput" accept="image/*" multiple style="display: none;" onchange="handleNoteImageUpload(this, '${editId || ''}')">
                        <div id="noteImagePreview" class="image-preview-grid">
                            ${isEdit && note.images ? note.images.map((img, idx) => `
                                <div class="image-preview-item">
                                    <img src="${img}" alt="预览">
                                    <button type="button" class="image-remove-btn" onclick="removeNoteImage(${idx}, '${editId || ''}')">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            `).join('') : ''}
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="saveNote('${editId || ''}')">
                    <i class="fas fa-save"></i> 保存
                </button>
            </div>
        `;
        
        showModal(html);
        
        // 存储当前编辑的笔记图片
        if (isEdit && note.images) {
            window._tempNoteImages = [...note.images];
        } else {
            window._tempNoteImages = [];
        }
    };
    
    /**
     * 处理笔记图片上传
     * @param {HTMLInputElement} input - 文件输入元素
     * @param {string} editId - 编辑ID
     */
    window.handleNoteImageUpload = async function(input, editId) {
        const files = Array.from(input.files || []);
        if (files.length === 0) return;
        
        // 初始化临时图片数组
        if (!window._tempNoteImages) {
            window._tempNoteImages = [];
        }
        
        // 检查总数是否超过9张
        const totalCount = window._tempNoteImages.length + files.length;
        if (totalCount > 9) {
            showToast('最多只能上传9张图片', 'warning');
            input.value = '';
            return;
        }
        
        showToast('正在压缩图片...', 'info');
        
        // 使用 browser-image-compression 压缩图片
        for (const file of files) {
            try {
                const options = {
                    maxSizeMB: 0.5,           // 压缩后最大500KB
                    maxWidthOrHeight: 1920,    // 最大宽度或高度
                    useWebWorker: true,        // 使用Web Worker加速
                    preserveExif: true,        // 保留EXIF信息
                    fileType: 'image/jpeg',    // 输出格式
                    initialQuality: 0.8         // 初始质量
                };
                
                const compressedFile = await imageCompression(file, options);
                
                // 将压缩后的文件转换为base64
                const reader = new FileReader();
                reader.onload = function(e) {
                    window._tempNoteImages.push(e.target.result);
                    updateNoteImagePreview(editId);
                };
                reader.readAsDataURL(compressedFile);
            } catch (error) {
                console.error('图片压缩失败:', error);
                showToast('图片压缩失败', 'error');
            }
        }
        
        input.value = '';
    };
    
    /**
     * 更新笔记图片预览
     * @param {string} editId - 编辑ID
     */
    function updateNoteImagePreview(editId) {
        const previewContainer = document.getElementById('noteImagePreview');
        if (!previewContainer) return;
        
        previewContainer.innerHTML = (window._tempNoteImages || []).map((img, idx) => `
            <div class="image-preview-item">
                <img src="${img}" alt="预览" onclick="openImageViewer(${idx}, 'note')">
                <button type="button" class="image-remove-btn" onclick="removeNoteImage(${idx}, '${editId || ''}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
    
    /**
     * 移除笔记图片
     * @param {number} index - 图片索引
     * @param {string} editId - 编辑ID
     */
    window.removeNoteImage = function(index, editId) {
        if (window._tempNoteImages && window._tempNoteImages.length > index) {
            window._tempNoteImages.splice(index, 1);
            updateNoteImagePreview(editId);
        }
    };
    
    /**
     * 保存笔记
     * @param {string} editId - 要编辑的笔记ID（为空表示新增）
     */
    window.saveNote = async function(editId = '') {
        const title = document.getElementById('noteTitle')?.value.trim() || '';
        const content = document.getElementById('noteContent')?.value.trim() || '';
        
        if (!title && !content) {
            showToast('请至少输入标题或内容', 'warning');
            return;
        }
        
        const note = {
            title: title,
            content: content,
            images: window._tempNoteImages || []
        };
        
        try {
            if (editId) {
                note.id = editId;
                await DBUtil.updateNote(note);
                showToast('笔记已更新', 'success');
            } else {
                await DBUtil.addNote(note);
                showToast('笔记已添加', 'success');
            }
            
            // 清理临时数据
            window._tempNoteImages = null;
            
            await loadData();
            closeModal();
            renderPage(state.currentPage);
        } catch (error) {
            showToast('保存失败: ' + error.message, 'error');
        }
    };
    
    /**
     * 显示笔记详情
     * @param {string} id - 笔记ID
     */
    window.showNoteDetail = async function(id) {
        const note = await DBUtil.getNote(id);
        if (!note) {
            showToast('笔记不存在', 'error');
            return;
        }
        
        // 修复：将图片数据存储到全局变量，避免HTML中序列化导致的问题
        window._tempNoteImages = note.images || [];
        
        const hasImages = note.images && note.images.length > 0;
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">笔记详情</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="card" style="border: 2px solid var(--primary);">
                    <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 12px;">${escapeHtml(note.title || '无标题')}</h3>
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 0.8rem; color: var(--text-tertiary);">
                        <span><i class="fas fa-clock"></i> 创建时间：${formatDateTime(note.createdAt)}</span>
                        ${note.updatedAt && note.updatedAt !== note.createdAt ? `<span><i class="fas fa-edit"></i> 更新时间：${formatDateTime(note.updatedAt)}</span>` : ''}
                    </div>
                </div>
                
                ${note.content ? `
                    <div class="card">
                        <h4 style="margin-bottom: 12px; font-size: 1rem;">内容</h4>
                        <p style="color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap;">${escapeHtml(note.content)}</p>
                    </div>
                ` : ''}
                
                ${hasImages ? `
                    <div class="card">
                        <h4 style="margin-bottom: 12px; font-size: 1rem;">图片（${note.images.length}张）</h4>
                        <div class="image-preview-grid" style="grid-template-columns: repeat(3, 1fr);">
                            ${note.images.map((img, idx) => `
                                <img src="${img}" alt="笔记图片" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; cursor: pointer;" onclick="openImageViewer(${idx}, 'note')">
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="editNote('${id}')">
                    <i class="fas fa-edit"></i> 编辑
                </button>
                <button class="btn btn-danger" onclick="confirmDeleteNote('${id}')">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 编辑笔记
     * @param {string} id 
     */
    window.editNote = function(id) {
        closeModal();
        showAddNoteModal(id);
    };
    
    /**
     * 确认删除笔记
     * @param {string} id 
     */
    window.confirmDeleteNote = function(id) {
        closeModal();
        
        const confirmHtml = `
            <div class="modal-header">
                <h3 class="modal-title">确认删除</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 40px 24px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; color: var(--warning); margin-bottom: 16px;"></i>
                <h3 style="margin-bottom: 8px;">确定要删除这条笔记吗？</h3>
                <p style="color: var(--text-tertiary);">此操作不可恢复</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-danger" onclick="deleteNote('${id}')">
                    <i class="fas fa-trash"></i> 确认删除
                </button>
            </div>
        `;
        
        showModal(confirmHtml);
    };
    
    /**
     * 删除笔记
     * @param {string} id 
     */
    window.deleteNote = async function(id) {
        try {
            await DBUtil.deleteNote(id);
            await loadData();
            closeModal();
            showToast('笔记已删除', 'success');
            renderPage(state.currentPage);
        } catch (error) {
            showToast('删除失败: ' + error.message, 'error');
        }
    };
    
    // ========== 主题切换 ==========
    /**
     * 切换主题（深色/浅色模式）
     */
    window.toggleTheme = function() {
        // 在深色和当前色彩主题之间切换
        const colorTheme = localStorage.getItem('salary_color_theme') || 'light';
        state.theme = state.theme === 'dark' ? colorTheme : 'dark';
        applyTheme(state.theme);
        localStorage.setItem('salary_theme', state.theme);
    };
    
    /**
     * 切换色彩主题（多种颜色）
     * @param {string} theme - 主题名称：light, blue, green, purple, orange, pink
     */
    window.switchColorTheme = function(theme) {
        // 如果是深色模式，先切换到浅色
        if (state.theme === 'dark') {
            state.theme = theme;
            applyTheme(theme);
        } else {
            state.theme = theme;
            applyTheme(theme);
        }
        
        // 保存色彩主题偏好
        localStorage.setItem('salary_color_theme', theme);
        localStorage.setItem('salary_theme', theme);
        
        // 重新渲染我的页面以更新主题选项的active状态
        if (state.currentPage === 'profile') {
            renderPage('profile');
        }
        
        showToast('主题已切换', 'success');
    };
    
    /**
     * 应用主题
     * @param {string} theme 
     */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        state.theme = theme;
    }
    
    // ========== 公司和职位管理 ==========
    
    /**
     * 显示公司和职位管理界面
     */
    window.showCompanyManagement = function() {
        let html = `
            <div class="modal-header">
                <h3 class="modal-title">公司和职位管理</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <button class="btn btn-primary btn-block mb-16" onclick="showAddCompanyModal()">
                    <i class="fas fa-plus"></i> 添加新公司
                </button>
        `;
        
        if (state.companies.length === 0) {
            html += renderEmptyState('暂无公司信息', '点击上方按钮添加第一个公司', true);
        } else {
            state.companies.forEach(company => {
                html += `
                    <div class="card mb-16">
                        <div class="card-header">
                            <h4 class="card-title">${escapeHtml(company.name)}</h4>
                            <div style="display: flex; gap: 8px;">
                                <button class="icon-btn" onclick="showEditCompanyModal('${company.id}')" title="编辑">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="icon-btn" onclick="deleteCompanyConfirm('${company.id}', '${escapeHtml(company.name)}')" title="删除" style="color: var(--danger);">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <span style="color: var(--text-secondary); font-size: 0.9rem;">职位列表</span>
                                <button class="btn btn-secondary btn-sm" onclick="showAddPositionModal('${company.id}')">
                                    <i class="fas fa-plus"></i> 添加职位
                                </button>
                            </div>
                `;
                
                // 获取该公司下的职位
                const companyPositions = state.positions.filter(p => p.companyId === company.id);
                
                if (companyPositions.length === 0) {
                    html += `<p style="color: var(--text-tertiary); font-size: 0.85rem; text-align: center; padding: 20px 0;">暂无职位，点击上方按钮添加</p>`;
                } else {
                    companyPositions.forEach(pos => {
                        html += `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                                <span>${escapeHtml(pos.name)}</span>
                                <div style="display: flex; gap: 4px;">
                                    <button class="icon-btn" onclick="showEditPositionModal('${pos.id}')" title="编辑">
                                        <i class="fas fa-edit" style="font-size: 0.85rem;"></i>
                                    </button>
                                    <button class="icon-btn" onclick="deletePositionConfirm('${pos.id}', '${escapeHtml(pos.name)}')" title="删除" style="color: var(--danger);">
                                        <i class="fas fa-trash" style="font-size: 0.85rem;"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    });
                }
                
                html += `
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 显示添加公司弹窗
     */
    window.showAddCompanyModal = function() {
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">添加公司</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label" for="companyName">公司名称 <span style="color: var(--danger);">*</span></label>
                    <input type="text" class="form-input" id="companyName" placeholder="请输入公司名称" maxlength="50" autofocus>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="saveCompany()">保存</button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 显示编辑公司弹窗
     */
    window.showEditCompanyModal = function(companyId) {
        const company = state.companies.find(c => c.id === companyId);
        if (!company) return;
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">编辑公司</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label" for="companyName">公司名称 <span style="color: var(--danger);">*</span></label>
                    <input type="text" class="form-input" id="companyName" placeholder="请输入公司名称" value="${escapeHtml(company.name)}" maxlength="50" autofocus>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="saveCompany('${companyId}')">保存</button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 保存公司（添加或更新）
     */
    window.saveCompany = function(editId = null) {
        const name = document.getElementById('companyName')?.value.trim();
        
        if (!name) {
            showToast('请输入公司名称', 'warning');
            return;
        }
        
        // 检查重名
        const exists = state.companies.some(c => c.name === name && c.id !== editId);
        if (exists) {
            showToast('公司已存在', 'warning');
            return;
        }
        
        const company = { name: name };
        
        const savePromise = editId 
            ? DBUtil.updateCompany({ ...company, id: editId })
            : DBUtil.addCompany(company);
        
        savePromise.then(() => {
            showToast(editId ? '公司更新成功' : '公司添加成功', 'success');
            closeModal();
            loadData().then(() => {
                showCompanyManagement(); // 刷新管理界面
            });
        }).catch(err => {
            console.error('保存公司失败:', err);
            showToast('保存失败', 'error');
        });
    };
    
    /**
     * 删除公司确认
     */
    window.deleteCompanyConfirm = function(companyId, companyName) {
        if (confirm(`确定要删除公司"${companyName}"吗？\n该公司在所有工资记录中的信息不会被删除，但关联职位将被删除。`)) {
            DBUtil.deleteCompany(companyId).then(() => {
                showToast('公司删除成功', 'success');
                loadData().then(() => {
                    showCompanyManagement(); // 刷新管理界面
                });
            }).catch(err => {
                console.error('删除公司失败:', err);
                showToast('删除失败', 'error');
            });
        }
    };
    
    /**
     * 显示添加职位弹窗
     */
    window.showAddPositionModal = function(companyId) {
        const company = state.companies.find(c => c.id === companyId);
        if (!company) return;
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">添加职位 - ${escapeHtml(company.name)}</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label" for="positionName">职位名称 <span style="color: var(--danger);">*</span></label>
                    <input type="text" class="form-input" id="positionName" placeholder="请输入职位名称" maxlength="30" autofocus>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="savePosition('${companyId}')">保存</button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 显示编辑职位弹窗
     */
    window.showEditPositionModal = function(positionId) {
        const position = state.positions.find(p => p.id === positionId);
        if (!position) return;
        
        const company = state.companies.find(c => c.id === position.companyId);
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">编辑职位</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">所属公司</label>
                    <div style="padding: 8px 0; color: var(--text-secondary);">${company ? escapeHtml(company.name) : '未知'}</div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="positionName">职位名称 <span style="color: var(--danger);">*</span></label>
                    <input type="text" class="form-input" id="positionName" placeholder="请输入职位名称" value="${escapeHtml(position.name)}" maxlength="30" autofocus>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="savePosition('${position.companyId}', '${positionId}')">保存</button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 保存职位（添加或更新）
     */
    window.savePosition = function(companyId, editId = null) {
        const name = document.getElementById('positionName')?.value.trim();
        
        if (!name) {
            showToast('请输入职位名称', 'warning');
            return;
        }
        
        // 检查重名
        const exists = state.positions.some(p => p.name === name && p.companyId === companyId && p.id !== editId);
        if (exists) {
            showToast('职位已存在', 'warning');
            return;
        }
        
        const position = { 
            name: name,
            companyId: companyId
        };
        
        const savePromise = editId 
            ? DBUtil.updatePosition({ ...position, id: editId })
            : DBUtil.addPosition(position);
        
        savePromise.then(() => {
            showToast(editId ? '职位更新成功' : '职位添加成功', 'success');
            closeModal();
            loadData().then(() => {
                showCompanyManagement(); // 刷新管理界面
            });
        }).catch(err => {
            console.error('保存职位失败:', err);
            showToast('保存失败', 'error');
        });
    };
    
    /**
     * 删除职位确认
     */
    window.deletePositionConfirm = function(positionId, positionName) {
        if (confirm(`确定要删除职位"${positionName}"吗？\n该职位在工资记录中的信息不会被删除。`)) {
            DBUtil.deletePosition(positionId).then(() => {
                showToast('职位删除成功', 'success');
                loadData().then(() => {
                    showCompanyManagement(); // 刷新管理界面
                });
            }).catch(err => {
                console.error('删除职位失败:', err);
                showToast('删除失败', 'error');
            });
        }
    };
    
    // ========== 搜索功能 ==========
    /**
     * 切换搜索栏
     * @param {boolean} forceShow - 强制显示
     */
    function toggleSearch(forceShow) {
        const searchBar = document.getElementById('searchBar');
        const searchInput = document.getElementById('searchInput');
        
        if (typeof forceShow === 'boolean') {
            state.searchActive = forceShow;
        } else {
            state.searchActive = !state.searchActive;
        }
        
        searchBar.classList.toggle('active', state.searchActive);
        
        if (state.searchActive) {
            searchInput.focus();
        } else {
            searchInput.value = '';
            document.getElementById('clearSearch').classList.remove('visible');
            if (state.currentPage === 'records') {
                state.filteredRecords = [...state.records];
                renderPage('records');
            }
        }
    }
    
    /**
     * 处理搜索
     */
    function handleSearch() {
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');
        const query = searchInput.value.trim();
        
        if (query) {
            clearBtn.classList.add('visible');
            
            if (state.currentPage === 'records') {
                state.filteredRecords = state.records.filter(record => {
                    const searchStr = query.toLowerCase();
                    return (
                        (record.company && record.company.toLowerCase().includes(searchStr)) ||
                        (record.position && record.position.toLowerCase().includes(searchStr)) ||
                        (record.note && record.note.toLowerCase().includes(searchStr))
                    );
                });
                renderPage('records');
            }
        } else {
            clearBtn.classList.remove('visible');
            if (state.currentPage === 'records') {
                state.filteredRecords = [...state.records];
                renderPage('records');
            }
        }
    }
    
    /**
     * 清除搜索
     */
    function clearSearch() {
        const searchInput = document.getElementById('searchInput');
        searchInput.value = '';
        document.getElementById('clearSearch').classList.remove('visible');
        
        if (state.currentPage === 'records') {
            state.filteredRecords = [...state.records];
            renderPage('records');
        }
    }
    
    // ========== 弹窗管理 ==========
    /**
     * 显示弹窗
     * @param {string} content - 弹窗HTML内容
     */
    function showModal(content) {
        const overlay = document.getElementById('modalOverlay');
        const container = document.getElementById('modalContainer');
        
        container.innerHTML = content;
        overlay.classList.add('active');
        container.classList.add('active');
        
        // 阻止背景滚动
        document.body.style.overflow = 'hidden';
    }
    
    /**
     * 关闭弹窗
     */
    window.closeModal = function() {
        const overlay = document.getElementById('modalOverlay');
        const container = document.getElementById('modalContainer');
        
        overlay.classList.remove('active');
        container.classList.remove('active');
        
        // 恢复背景滚动
        document.body.style.overflow = '';
        
        // 清除当前编辑的记录ID
        window._currentEditRecordId = null;
        
        // 延迟清空内容
        setTimeout(() => {
            if (!container.classList.contains('active')) {
                container.innerHTML = '';
            }
        }, 300);
    };
    
    // 点击遮罩关闭弹窗
    document.getElementById('modalOverlay').addEventListener('click', () => {
        closeModal();
    });
    
    // ========== 自定义输入弹窗 ==========
    /**
     * 显示自定义输入弹窗（替代原生prompt）
     * @param {Object} options - 配置选项
     * @param {string} options.title - 弹窗标题
     * @param {string} options.placeholder - 输入框占位符
     * @param {string} options.confirmText - 确认按钮文字
     * @param {string} options.initialValue - 初始值
     * @param {Function} options.onConfirm - 确认回调，接收输入值
     * @param {Function} options.onCancel - 取消回调（可选）
     */
    window.showInputModal = function(options) {
        const { title, placeholder, confirmText, initialValue, onConfirm, onCancel } = options;
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">${escapeHtml(title || '请输入')}</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group" style="margin-bottom: 0;">
                    <input type="text" class="form-input input-modal-field" 
                           placeholder="${escapeHtml(placeholder || '')}" 
                           value="${escapeHtml(initialValue || '')}" 
                           maxlength="50" 
                           autofocus
                           onkeydown="if(event.key==='Enter'){ event.preventDefault(); document.getElementById('inputModalConfirmBtn').click(); }">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal(); if(window._inputModalCancel) window._inputModalCancel();">取消</button>
                <button class="btn btn-primary" id="inputModalConfirmBtn" onclick="window._inputModalConfirm()">
                    ${escapeHtml(confirmText || '确认')}
                </button>
            </div>
        `;
        
        showModal(html);
        
        // 保存回调函数
        window._inputModalConfirm = function() {
            const input = document.querySelector('.input-modal-field');
            if (input) {
                const value = input.value.trim();
                closeModal();
                if (onConfirm) onConfirm(value);
            }
        };
        
        window._inputModalCancel = onCancel || null;
        
        // 自动聚焦并选中文本
        setTimeout(() => {
            const input = document.querySelector('.input-modal-field');
            if (input) {
                input.focus();
                if (input.value) {
                    input.select();
                }
            }
        }, 100);
    };
    
    // ========== Toast        };
    
    // ========== 可折叠组件 ==========
    /**
     * 切换可折叠组件的展开/收起状态
     * @param {HTMLElement} header - 点击的标题元素
     */
    window.toggleCollapsible = function(header) {
        const section = header.closest('.collapsible-section');
        const body = section.querySelector('.collapsible-body');
        
        if (section.classList.contains('expanded')) {
            // 收起
            section.classList.remove('expanded');
            body.classList.remove('expanded');
        } else {
            // 展开
            section.classList.add('expanded');
            body.classList.add('expanded');
        }
    };
    
    /**
     * 更新可折叠组件的标题显示值
     * @param {string} sectionId - 可折叠区域的ID或标识
     * @param {string} value - 要显示的值
     */
    function updateCollapsibleValue(sectionId, value) {
        const section = document.getElementById(sectionId);
        if (section) {
            const valueEl = section.querySelector('.collapsible-value');
            if (valueEl) {
                valueEl.textContent = value || '请选择';
                valueEl.style.color = value ? 'var(--text-primary)' : 'var(--text-tertiary)';
            }
        }
    }
    
    /**
     * 更新公司&职位可折叠组件的显示值
     */
    window.updateCompanyPositionValue = function() {
        const company = document.getElementById('recordCompany');
        const position = document.getElementById('recordPosition');
        const valueEl = document.querySelector('#companyPositionSection .collapsible-value');
        
        if (!valueEl) return;
        
        let display = '';
        if (company && company.value) {
            display += company.value;
        }
        if (position && position.value && position.value !== '请选择职位') {
            display += (display ? ' - ' : '') + position.value;
        }
        
        valueEl.textContent = display || '请选择';
        valueEl.style.color = display ? 'var(--text-primary)' : 'var(--text-tertiary)';
    };
    
    /**
     * 更新奖金/补贴/扣款可折叠组件的显示值
     */
    window.updateBonusAllowanceDeductionValue = function() {
        const bonus = document.getElementById('recordBonus');
        const allowance = document.getElementById('recordAllowance');
        const deduction = document.getElementById('recordDeduction');
        const valueEl = document.querySelector('#bonusAllowanceDeductionSection .collapsible-value');
        
        if (!valueEl) return;
        
        let parts = [];
        if (bonus && parseFloat(bonus.value) > 0) {
            parts.push('奖金¥' + parseFloat(bonus.value).toFixed(2));
        }
        if (allowance && parseFloat(allowance.value) > 0) {
            parts.push('补贴¥' + parseFloat(allowance.value).toFixed(2));
        }
        if (deduction && parseFloat(deduction.value) > 0) {
            parts.push('扣款¥' + parseFloat(deduction.value).toFixed(2));
        }
        
        valueEl.textContent = parts.length > 0 ? parts.join(' | ') : '选填';
        valueEl.style.color = parts.length > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)';
    };
    
    /**
     * 页面加载后初始化可折叠组件的状态
     */
    function initCollapsibleSections() {
        // 如果有选中的公司和职位，展开对应区域并更新显示
        const company = document.getElementById('recordCompany');
        const position = document.getElementById('recordPosition');
        
        if (company && company.value) {
            updateCollapsibleValue('companyPositionSection', company.value);
        }
        if (position && position.value && position.value !== '请选择职位') {
            const currentVal = document.querySelector('#companyPositionSection .collapsible-value');
            if (currentVal && company && company.value) {
                currentVal.textContent = company.value + ' - ' + position.value;
            }
        }
    }
    
    // ========== Toast通知 ==========
    /**
     * 显示Toast通知
     * @param {string} message - 消息内容
     * @param {string} type - 类型：success, error, warning, info
     */
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info} toast-icon"></i>
            <span class="toast-message">${escapeHtml(message)}</span>
        `;
        
        container.appendChild(toast);
        
        // 1.5秒后自动移除（加快提示消失速度）
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 1500);
    }
    
    /**
     * 显示居中Toast通知（用于日期筛选结果）
     * @param {string} message - 消息内容
     * @param {string} type - 类型：success, error, warning, info
     */
    function showCenterToast(message, type = 'success') {
        // 移除已存在的居中toast
        const existing = document.querySelector('.center-toast-container');
        if (existing) existing.remove();
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const colors = {
            success: 'var(--success)',
            error: 'var(--danger)',
            warning: 'var(--warning)',
            info: 'var(--info)'
        };
        
        const container = document.createElement('div');
        container.className = 'center-toast-container';
        
        const color = colors[type] || colors.info;
        container.innerHTML = `
            <div class="center-toast ${type}">
                <i class="fas ${icons[type] || icons.info} center-toast-icon" style="color: ${color};"></i>
                <div class="center-toast-message">${escapeHtml(message)}</div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // 2秒后自动移除
        setTimeout(() => {
            const toast = container.querySelector('.center-toast');
            if (toast) {
                toast.classList.add('removing');
                setTimeout(() => {
                    if (container.parentNode) {
                        container.parentNode.removeChild(container);
                    }
                }, 300);
            }
        }, 2000);
    }
    
    // ========== 骨架屏 ==========
    /**
     * 显示骨架屏
     */
    function showSkeleton() {
        document.getElementById('skeletonOverlay').classList.add('active');
    }
    
    /**
     * 隐藏骨架屏
     */
    function hideSkeleton() {
        document.getElementById('skeletonOverlay').classList.remove('active');
    }
    
    // ========== 空状态 ==========
    /**
     * 渲染空状态
     * @param {string} title - 标题
     * @param {string} desc - 描述
     * @param {string} icon - 图标类名
     * @returns {string}
     */
    function renderEmptyState(title, desc, compact = false) {
        const cls = 'empty-state fade-in' + (compact ? ' empty-state-compact' : '');
        return `
            <div class="${cls}">
                <h3 class="empty-title">${escapeHtml(title)}</h3>
                <p class="empty-desc">${escapeHtml(desc)}</p>
            </div>
        `;
    }
    
    // ========== 数据导出导入 ==========
    /**
     * 导出数据
     */
    window.exportData = function() {
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">导出数据</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p style="color: var(--text-secondary); margin-bottom: 20px;">选择导出格式：</p>
                
                <button class="btn btn-primary btn-full mb-16" onclick="doExport('json')">
                    <i class="fas fa-file-code"></i> 导出为JSON
                </button>
                
                <button class="btn btn-success btn-full" onclick="doExport('excel')">
                    <i class="fas fa-file-excel"></i> 导出为Excel
                </button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 执行导出
     * @param {string} format - 格式：json或excel
     */
    window.doExport = async function(format) {
        try {
            const data = await DBUtil.exportAllData();
            
            if (format === 'json') {
                ExportUtil.exportJSON(data);
            } else {
                ExportUtil.exportExcel(state.records);
            }
            
            showToast('导出成功', 'success');
            closeModal();
        } catch (error) {
            showToast('导出失败: ' + error.message, 'error');
        }
    };
    
    /**
     * 导入数据
     */
    window.importData = function() {
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">导入数据</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p style="color: var(--text-secondary); margin-bottom: 20px;">选择要导入的文件（支持JSON和Excel格式）：</p>
                
                <input type="file" id="importFile" accept=".json,.xlsx,.xls" style="display: none;" onchange="handleImportFile(event)">
                <button class="btn btn-primary btn-full" onclick="document.getElementById('importFile').click()">
                    <i class="fas fa-folder-open"></i> 选择文件
                </button>
                
                <div style="margin-top: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="overwriteData">
                        <span style="font-size: 0.9rem; color: var(--text-secondary);">覆盖现有数据</span>
                    </label>
                </div>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 处理导入文件
     * @param {Event} event 
     */
    window.handleImportFile = async function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            showToast('正在导入...', 'info');
            
            let data;
            if (file.name.endsWith('.json')) {
                data = await ExportUtil.importJSON(file);
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                const records = await ExportUtil.importExcel(file);
                data = { records: records };
            } else {
                throw new Error('不支持的文件格式');
            }
            
            const overwrite = document.getElementById('overwriteData')?.checked || false;
            const count = await DBUtil.importData(data, overwrite);
            
            await loadData();
            closeModal();
            renderPage(state.currentPage);
            showToast(`成功导入 ${count} 条记录`, 'success');
        } catch (error) {
            showToast('导入失败: ' + error.message, 'error');
        }
    };
    
    // ========== 清除数据 ==========
    /**
     * 确认清除数据
     */
    window.confirmClearData = function() {
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">确认清除</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 40px 24px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; color: var(--danger); margin-bottom: 16px;"></i>
                <h3 style="margin-bottom: 8px;">确定要清除所有数据吗？</h3>
                <p style="color: var(--text-tertiary);">此操作将删除所有工资记录，且不可恢复！</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-danger" onclick="clearAllData()">
                    <i class="fas fa-trash"></i> 确认清除
                </button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 清除所有数据
     */
    window.clearAllData = async function() {
        try {
            await DBUtil.clearAllData();
            state.records = [];
            state.filteredRecords = [];
            closeModal();
            showToast('所有数据已清除', 'success');
            renderPage(state.currentPage);
        } catch (error) {
            showToast('清除失败: ' + error.message, 'error');
        }
    };
    
    // ========== 阶梯提成计算 ==========
    /**
     * 显示提成规则设置
     */
    window.showCommissionRules = function() {
        const rules = state.commissionRules;
        
        let html = `
            <div class="modal-header">
                <h3 class="modal-title">阶梯提成计算</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="card" style="background: var(--info); color: white; margin-bottom: 16px; padding: 12px 16px;">
                    <i class="fas fa-info-circle"></i> 
                    <strong>使用说明：</strong>设置规则后，在"添加记录"页面输入"销售额"，系统会自动根据规则计算提成并填充到提成字段。
                </div>
                
                <div id="rulesList">
        `;
        
        if (rules.length === 0) {
            html += `
                <div class="empty-state" style="padding: 30px 0;">
                    <p class="empty-desc">暂无提成规则</p>
                </div>
            `;
        } else {
            rules.forEach((rule, index) => {
                html += `
                    <div class="card" style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <strong>${escapeHtml(rule.name || `规则${index + 1}`)}</strong>
                            <button class="icon-btn" style="color: var(--danger);" onclick="deleteCommissionRule('${rule.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">
                            ${rule.tiers.map(tier => 
                                `${formatMoney(tier.min)}~${tier.max ? formatMoney(tier.max) : '以上'}: ${tier.rate}%`
                            ).join('<br>')}
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                </div>
                
                <button class="btn btn-primary btn-full mt-16" onclick="showAddRuleModal()">
                    <i class="fas fa-plus"></i> 添加规则
                </button>
            </div>
        `;
        
        showModal(html);
    };
    
    /**
     * 显示添加规则弹窗
     */
    window.showAddRuleModal = function() {
        const html = `
            <div class="modal-header">
                <h3 class="modal-title"><i class="fas fa-layer-group" style="margin-right: 8px;"></i>添加提成规则</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label" for="ruleName">
                        <i class="fas fa-tag" style="margin-right: 4px; color: var(--primary);"></i>规则名称
                    </label>
                    <input type="text" class="form-input" id="ruleName" placeholder="例如：销售提成" maxlength="30" autofocus>
                </div>
                
                <div id="tiersList">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                        <div style="flex: 1; text-align: center; font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600;">最小值</div>
                        <div style="width: 20px;"></div>
                        <div style="flex: 1; text-align: center; font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600;">最大值</div>
                        <div style="flex: 1; text-align: center; font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600;">提成率</div>
                        <div style="width: 36px;"></div>
                    </div>
                </div>
                
                <button class="btn btn-secondary btn-full" onclick="addTier()" style="border: 2px dashed var(--border-color); background: transparent; transition: all 0.3s;">
                    <i class="fas fa-plus"></i> 添加阶梯
                </button>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-times"></i> 取消
                </button>
                <button class="btn btn-primary" onclick="saveCommissionRule()">
                    <i class="fas fa-save"></i> 保存规则
                </button>
            </div>
        `;
        
        showModal(html);
        
        // 默认添加一个阶梯
        setTimeout(() => addTier(), 100);
    };
    
    /**
     * 添加阶梯
     * 第一个阶梯的 min 固定为 0（不可编辑），确保阶梯从 0 开始连续
     */
    window.addTier = function() {
        const tiersList = document.getElementById('tiersList');
        if (!tiersList) return;
        
        const existingTiers = tiersList.querySelectorAll('.tier-item');
        const tierCount = existingTiers.length;
        const isFirst = tierCount === 0;
        
        const tierHtml = `
            <div class="tier-item" data-tier-index="${tierCount}">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div class="tier-number">${tierCount + 1}</div>
                    <div class="tier-min-wrapper" style="flex: 1; min-width: 0;">
                        <input type="number" class="form-input tier-min-input"
                               placeholder="最小值"
                               value="${isFirst ? '0' : ''}"
                               ${isFirst ? 'readonly' : ''}
                               data-tier-min>
                    </div>
                    <span class="tier-separator">~</span>
                    <div class="tier-max-wrapper" style="flex: 1; min-width: 0;">
                        <input type="number" class="form-input tier-max-input"
                               placeholder="最大值"
                               data-tier-max>
                    </div>
                    <div class="tier-rate-wrapper" style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px;">
                        <input type="number" class="form-input tier-rate-input"
                               placeholder="提成率"
                               data-tier-rate>
                        <span class="tier-rate-suffix">%</span>
                    </div>
                    <button class="tier-remove-btn" onclick="removeTier(this)" title="删除此阶梯">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="tier-hint"></div>
            </div>
        `;
        
        tiersList.insertAdjacentHTML('beforeend', tierHtml);
        
        // 绑定输入事件，实时验证
        const newTier = tiersList.querySelector('.tier-item:last-child');
        if (newTier) {
            const inputs = newTier.querySelectorAll('input');
            inputs.forEach(input => {
                input.addEventListener('input', () => {
                    validateTiers();
                });
            });
        }
        
        // 第一个阶梯显示提示
        if (isFirst) {
            const hint = tiersList.querySelector('.tier-item:last-child .tier-hint');
            if (hint) {
                hint.innerHTML = '<i class="fas fa-info-circle"></i> 第一个阶梯从 0 开始，系统会自动累计计算提成';
            }
        }
        
        // 聚焦到第一个可编辑的输入框
        if (!isFirst) {
            const firstInput = newTier.querySelector('.tier-min-input');
            if (firstInput) setTimeout(() => firstInput.focus(), 100);
        }
    };
    
    /**
     * 移除阶梯
     * @param {HTMLElement} btn - 触发删除的按钮
     */
    window.removeTier = function(btn) {
        if (!btn) return;
        
        const tierItem = btn.closest('.tier-item');
        const tiersList = document.getElementById('tiersList');
        if (!tierItem || !tiersList) return;
        
        const allTiers = tiersList.querySelectorAll('.tier-item');
        
        // 至少保留一个阶梯
        if (allTiers.length <= 1) {
            showToast('至少保留一个阶梯', 'warning');
            return;
        }
        
        // 添加删除动画
        tierItem.style.transition = 'all 0.3s ease';
        tierItem.style.opacity = '0';
        tierItem.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
            tierItem.remove();
            
            // 如果删除后没有阶梯了，重新添加一个（min=0）
            if (tiersList.querySelectorAll('.tier-item').length === 0) {
                addTier();
            }
            
            validateTiers();
        }, 300);
    };
    
    /**
     * 获取CSS变量值
     */
    function getCSSVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    /**
     * 验证阶梯设置
     * @returns {boolean} 是否有效
     */
    function validateTiers() {
        const tierItems = document.querySelectorAll('.tier-item');
        if (tierItems.length === 0) return false;

        let isValid = true;
        const errors = [];
        const tiers = [];
        const dangerColor = getCSSVar('--danger') || '#f56565';

        tierItems.forEach((item, index) => {
            const minInput = item.querySelector('[data-tier-min]');
            const maxInput = item.querySelector('[data-tier-max]');
            const rateInput = item.querySelector('[data-tier-rate]');

            const min = parseFloat(minInput?.value) || 0;
            const max = maxInput?.value ? parseFloat(maxInput.value) : null;
            const rate = parseFloat(rateInput?.value) || 0;

            tiers.push({ min, max, rate, index, item });

            // 清除错误样式
            [minInput, maxInput, rateInput].forEach(el => { if (el) el.style.borderColor = ''; });

            if (min < 0) {
                isValid = false;
                errors.push(`第${index + 1}个阶梯最小值不能为负数`);
                if (minInput) minInput.style.borderColor = dangerColor;
            }
            if (rate <= 0 || rate > 100) {
                isValid = false;
                errors.push(`第${index + 1}个阶梯提成率须在0-100之间`);
                if (rateInput) rateInput.style.borderColor = dangerColor;
            }
            if (max !== null && max <= min) {
                isValid = false;
                errors.push(`第${index + 1}个阶梯最大值须大于最小值`);
                if (maxInput) maxInput.style.borderColor = dangerColor;
            }
        });

        // 验证连续性
        const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
        for (let i = 0; i < sortedTiers.length - 1; i++) {
            const current = sortedTiers[i];
            const next = sortedTiers[i + 1];
            
            if (current.max === null) {
                isValid = false;
                errors.push('只有最后一个阶梯可设最大值为空');
                const maxInput = current.item.querySelector('[data-tier-max]');
                if (maxInput) maxInput.style.borderColor = dangerColor;
                break;
            }
            
            if (Math.abs(current.max - next.min) > 0.01) {
                isValid = false;
                errors.push(`阶梯${i + 1}与阶梯${i + 2}之间存在间隙（${current.max} → ${next.min}）`);
                const maxInput = current.item.querySelector('[data-tier-max]');
                const nextMinInput = next.item.querySelector('[data-tier-min]');
                if (maxInput) maxInput.style.borderColor = dangerColor;
                if (nextMinInput && !nextMinInput.readOnly) nextMinInput.style.borderColor = dangerColor;
                break;
            }
        }

        return isValid;
    }
    
    /**
     * 保存提成规则
     */
    window.saveCommissionRule = async function() {
        // 验证阶梯
        if (!validateTiers()) {
            showToast('请修正阶梯设置中的错误', 'warning');
            return;
        }
        
        const name = document.getElementById('ruleName')?.value.trim() || '未命名规则';
        const tierItems = document.querySelectorAll('.tier-item');
        
        if (tierItems.length === 0) {
            showToast('请至少添加一个阶梯', 'warning');
            return;
        }
        
        const tiers = [];
        let isValid = true;

        tierItems.forEach(item => {
            const minInput = item.querySelector('[data-tier-min]');
            const maxInput = item.querySelector('[data-tier-max]');
            const rateInput = item.querySelector('[data-tier-rate]');
            
            const min = parseFloat(minInput?.value) || 0;
            const max = maxInput?.value ? parseFloat(maxInput.value) : null;
            const rate = parseFloat(rateInput?.value) || 0;

            if (rate <= 0) {
                isValid = false;
            }

            tiers.push({ min, max, rate });
        });

        if (!isValid) {
            showToast('请填写完整的阶梯信息', 'warning');
            return;
        }
        
        try {
            const ruleId = DBUtil.generateId();
            await DBUtil.saveCommissionRule({
                id: ruleId,
                name,
                tiers,
                createdAt: new Date().toISOString()
            });
            
            // 重新加载数据并更新状态
            await loadData();
            
            // 手动更新状态以确保同步
            state.commissionRules = await DBUtil.getCommissionRules();
            
            closeModal();
            showToast('提成规则已保存', 'success');
        } catch (error) {
            showToast('保存失败: ' + error.message, 'error');
        }
    };
    
    /**
     * 删除提成规则
     * @param {string} id 
     */
    window.deleteCommissionRule = async function(id) {
        try {
            // 调用数据库方法删除规则
            await DBUtil.deleteCommissionRule(id);
            
            // 重新加载数据并更新状态
            await loadData();
            
            // 手动更新状态以确保同步
            state.commissionRules = await DBUtil.getCommissionRules();
            
            // 刷新显示
            showCommissionRules();
            
            showToast('规则已删除', 'success');
        } catch (error) {
            console.error('删除规则失败:', error);
            showToast('删除失败: ' + error.message, 'error');
        }
    };
    
    // ========== 菜单功能 ==========
    /**
     * 显示菜单
     */
    function showMenu() {
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">菜单</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="settings-item" onclick="navigateTo('home'); closeModal();">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-home"></i></div>
                        <span class="settings-label">首页</span>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
                
                <div class="settings-item" onclick="navigateTo('records'); closeModal();">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-list-alt"></i></div>
                        <span class="settings-label">工资记录</span>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
                
                <div class="settings-item" onclick="navigateTo('statistics'); closeModal();">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-chart-pie"></i></div>
                        <span class="settings-label">统计分析</span>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
                
                <div class="settings-item" onclick="navigateTo('profile'); closeModal();">
                    <div class="settings-item-left">
                        <div class="settings-icon"><i class="fas fa-user"></i></div>
                        <span class="settings-label">我的</span>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-tertiary);"></i>
                </div>
            </div>
        `;
        
        showModal(html);
    }
    
    // ========== 自定义日历组件 ==========
    const calendarState = {
        isOpen: false,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth(),
        selectedDate: null,
        inputElement: null,
        popupElement: null
    };
    
    /**
     * 初始化日历组件
     * @param {string} inputId - 日期输入框ID
     */
    function initCalendar(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        calendarState.inputElement = input;
        
        // 创建日历弹出层
        const popup = document.createElement('div');
        popup.className = 'calendar-popup';
        popup.id = 'calendarPopup';
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(popup);
        calendarState.popupElement = popup;
        
        // 点击输入框显示/隐藏日历
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCalendar();
        });
        
        // 阻止输入框的默认日期选择
        input.setAttribute('readonly', 'true');
        input.style.cursor = 'pointer';
        
        // 点击页面其他地方关闭日历
        document.addEventListener('click', (e) => {
            if (calendarState.isOpen && !popup.contains(e.target) && e.target !== input) {
                hideCalendar();
            }
        });
        
        // 初始渲染日历
        renderCalendar();
    }
    
    /**
     * 切换日历显示/隐藏
     */
    function toggleCalendar() {
        if (calendarState.isOpen) {
            hideCalendar();
        } else {
            showCalendar();
        }
    }
    
    /**
     * 显示日历
     */
    function showCalendar() {
        calendarState.isOpen = true;
        const popup = calendarState.popupElement;
        popup.classList.add('active');
        
        // 如果输入框有值，跳转到对应月份
        const input = calendarState.inputElement;
        if (input.value) {
            const date = new Date(input.value);
            if (!isNaN(date.getTime())) {
                calendarState.currentYear = date.getFullYear();
                calendarState.currentMonth = date.getMonth();
                calendarState.selectedDate = input.value;
                renderCalendar();
            }
        }
    }
    
    /**
     * 隐藏日历
     */
    function hideCalendar() {
        calendarState.isOpen = false;
        const popup = calendarState.popupElement;
        popup.classList.remove('active');
    }
    
    /**
     * 渲染日历
     */
    function renderCalendar() {
        const popup = calendarState.popupElement;
        const year = calendarState.currentYear;
        const month = calendarState.currentMonth;
        
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', 
                           '7月', '8月', '9月', '10月', '11月', '12月'];
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        
        // 获取当月第一天和最后一天
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startWeekday = firstDay.getDay();
        
        // 获取上个月的最后几天
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        
        let html = '';
        
        // 头部导航
        html += `
            <div class="calendar-header">
                <button class="calendar-nav-btn" onclick="event.stopPropagation(); changeCalendarMonth(-1)">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="calendar-title">${year}年 ${monthNames[month]}</span>
                <button class="calendar-nav-btn" onclick="event.stopPropagation(); changeCalendarMonth(1)">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
        
        // 星期标题
        html += `<div class="calendar-weekdays">`;
        weekDays.forEach(day => {
            html += `<div class="calendar-weekday">${day}</div>`;
        });
        html += `</div>`;
        
        // 日期网格
        html += `<div class="calendar-grid">`;
        
        // 上个月的日期
        for (let i = startWeekday - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            html += `<button class="calendar-day other-month" disabled>${day}</button>`;
        }
        
        // 当月日期
        const today = new Date();
        const selectedDate = calendarState.selectedDate;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = (year === today.getFullYear() && month === today.getMonth() && day === today.getDate());
            const isSelected = (dateStr === selectedDate);
            
            let classes = 'calendar-day';
            if (isToday) classes += ' today';
            if (isSelected) classes += ' selected';
            
            html += `<button class="${classes}" onclick="selectDate('${dateStr}')">${day}</button>`;
        }
        
        // 下个月的日期
        const totalCells = startWeekday + daysInMonth;
        const remainingCells = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remainingCells; i++) {
            html += `<button class="calendar-day other-month" disabled>${i}</button>`;
        }
        
        html += `</div>`;
        
        // 底部按钮
        html += `
            <div class="calendar-footer">
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); clearDate()">清除</button>
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); selectToday()">今天</button>
            </div>
        `;
        
        popup.innerHTML = html;
    }
    
    /**
     * 切换日历月份
     * @param {number} delta - 月份变化量
     */
    window.changeCalendarMonth = function(delta) {
        calendarState.currentMonth += delta;
        
        if (calendarState.currentMonth > 11) {
            calendarState.currentMonth = 0;
            calendarState.currentYear++;
        } else if (calendarState.currentMonth < 0) {
            calendarState.currentMonth = 11;
            calendarState.currentYear--;
        }
        
        renderCalendar();
    };
    
    /**
     * 选择日期
     * @param {string} dateStr - 日期字符串
     */
    window.selectDate = function(dateStr) {
        calendarState.selectedDate = dateStr;
        calendarState.inputElement.value = dateStr;
        hideCalendar();
        
        // 触发input事件
        calendarState.inputElement.dispatchEvent(new Event('input'));
        calendarState.inputElement.dispatchEvent(new Event('change'));
    };
    
    /**
     * 选择今天
     */
    window.selectToday = function() {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const mm = m < 10 ? '0' + m : '' + m;
        const dd = d < 10 ? '0' + d : '' + d;
        window.selectDate(y + '-' + mm + '-' + dd);
    };
    
    /**
     * 清除日期
     */
    window.clearDate = function() {
        calendarState.selectedDate = null;
        calendarState.inputElement.value = '';
        hideCalendar();
    };
    
    // ========== 工具函数 ==========
    
    /**
     * 格式化金额（去掉末尾多余的零，如10.50显示为10.5，10.00显示为10）
     * @param {number} amount 
     * @returns {string}
     */
    function formatMoney(amount) {
        const num = parseFloat(amount) || 0;
        
        // 直接返回完整数值，不缩写单位
        // 使用 toLocaleString 添加千位分隔符，自动去掉末尾的0
        return num.toLocaleString('zh-CN', { 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 2 
        });
    }
    
    /**
     * 格式化日期时间显示
     * @param {string} dateTimeStr - ISO格式的日期时间字符串
     * @returns {string}
     */
    function formatDateTime(dateTimeStr) {
        if (!dateTimeStr) return '';
        try {
            const date = new Date(dateTimeStr);
            if (isNaN(date.getTime())) return dateTimeStr;
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        } catch (e) {
            return dateTimeStr;
        }
    }
    
    /**
     * 格式化显示日期（手动解析，避免时区问题）
     * @param {string} dateStr 
     * @returns {string}
     */
    function formatDisplayDate(dateStr) {
        if (!dateStr) return '未知日期';
        // 手动解析 "YYYY-MM-DD" 格式，避免时区问题
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const year = parts[0];
            const month = parts[1];
            const day = parts[2];
            return `${year}-${month}-${day}`;
        }
        // 格式异常时回退到Date解析
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    /**
     * HTML转义
     * @param {string} str 
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    /**
     * 切换加密设置
     * @param {HTMLInputElement} checkbox 
     */
    window.toggleEncryption = function(checkbox) {
        if (checkbox.checked) {
            showEncryptionSetupModal(checkbox);
        } else {
            localStorage.setItem('salary_encryption', 'false');
            showToast('数据加密已关闭', 'info');
        }
    };
    
    /**
     * 显示加密设置弹窗
     * @param {HTMLInputElement} checkbox 
     */
    function showEncryptionSetupModal(checkbox) {
        const defaultKey = CryptoUtil.generateDefaultKey().substring(0, 16);
        
        const html = `
            <div class="modal-header">
                <h3 class="modal-title">数据加密设置</h3>
                <button class="modal-close" onclick="closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="encryption-setup">
                    <div class="encryption-icon">
                        <i class="fas fa-shield-alt"></i>
                    </div>
                    <h4>设置加密密钥</h4>
                    <p>密钥将用于加密您的敏感数据，请妥善保管，丢失后无法恢复数据！</p>
                </div>
                
                <div class="encryption-input-wrapper">
                    <input type="password" class="form-input" id="encryptionKeyInput" 
                           placeholder="请输入加密密钥（至少8位）" 
                           value="${defaultKey}"
                           minlength="8"
                           maxlength="32">
                    <button class="encryption-toggle-btn" onclick="togglePasswordVisibility()">
                        <i class="fas fa-eye" id="togglePasswordIcon"></i>
                    </button>
                </div>
                
                <div class="key-strength">
                    <div class="key-strength-fill" id="keyStrengthFill"></div>
                </div>
                <div class="key-hint" id="keyHint">请输入至少8位密钥</div>
                
                <div style="margin-top: 20px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem; color: var(--text-secondary);">
                        <input type="checkbox" id="useDefaultKey"> 使用系统生成的密钥
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal(); document.querySelector('[onchange*="toggleEncryption"]').checked = false;">取消</button>
                <button class="btn btn-primary" onclick="confirmEncryption()">
                    <i class="fas fa-lock"></i> 启用加密
                </button>
            </div>
        `;
        
        showModal(html);
        
        // 绑定密钥输入事件
        const keyInput = document.getElementById('encryptionKeyInput');
        const useDefaultCheck = document.getElementById('useDefaultKey');
        
        if (keyInput) {
            keyInput.addEventListener('input', checkKeyStrength);
            keyInput.focus();
            keyInput.select();
        }
        
        if (useDefaultCheck) {
            useDefaultCheck.addEventListener('change', function() {
                if (this.checked) {
                    keyInput.value = defaultKey;
                    keyInput.disabled = true;
                    checkKeyStrength();
                } else {
                    keyInput.disabled = false;
                    keyInput.focus();
                }
            });
        }
        
        // 初始检查密钥强度
        setTimeout(checkKeyStrength, 100);
    }
    
    /**
     * 切换密码可见性
     */
    window.togglePasswordVisibility = function() {
        const input = document.getElementById('encryptionKeyInput');
        const icon = document.getElementById('togglePasswordIcon');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    };
    
    /**
     * 检查密钥强度
     */
    function checkKeyStrength() {
        const input = document.getElementById('encryptionKeyInput');
        const fill = document.getElementById('keyStrengthFill');
        const hint = document.getElementById('keyHint');
        
        if (!input || !fill || !hint) return;
        
        const key = input.value;
        let strength = 0;
        let hintText = '';
        
        if (key.length === 0) {
            fill.className = 'key-strength-fill';
            hintText = '请输入至少8位密钥';
        } else if (key.length < 8) {
            fill.className = 'key-strength-fill weak';
            hintText = '密钥太短，至少需要8位';
        } else {
            if (key.length >= 12) strength++;
            if (/[a-z]/.test(key) && /[A-Z]/.test(key)) strength++;
            if (/\d/.test(key)) strength++;
            if (/[^a-zA-Z0-9]/.test(key)) strength++;
            
            if (strength <= 1) {
                fill.className = 'key-strength-fill weak';
                hintText = '密钥强度：弱';
            } else if (strength <= 2) {
                fill.className = 'key-strength-fill medium';
                hintText = '密钥强度：中';
            } else {
                fill.className = 'key-strength-fill strong';
                hintText = '密钥强度：强';
            }
        }
        
        hint.textContent = hintText;
    }
    
    /**
     * 确认启用加密
     */
    window.confirmEncryption = function() {
        const input = document.getElementById('encryptionKeyInput');
        const key = input ? input.value.trim() : '';
        
        if (!key || key.length < 8) {
            showToast('密钥至少需要8位', 'warning');
            return;
        }
        
        try {
            CryptoUtil.initKey(key);
            localStorage.setItem('salary_encryption', 'true');
            localStorage.setItem('salary_user_key', key);
            closeModal();
            showToast('数据加密已启用，请牢记您的密钥！', 'success');
        } catch (error) {
            showToast('设置失败：' + error.message, 'error');
        }
    };
    
})();
