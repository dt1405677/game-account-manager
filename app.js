// Fallback hardcoded Dã Tẩu tasks (if file loading fails)
const FALLBACK_DA_TAU_TASKS = [
    {
        title: "Dã Tẩu - Chỉ Số",
        completed: false,
        selectionType: "radio",
        selectedIndex: null,
        skipDailyReset: true,
        children: [
            { title: "Thân Pháp 1-5", completed: false },
            { title: "Thân Pháp 6-10", completed: false },
            { title: "Sức Mạnh 1-5", completed: false },
            { title: "Sức Mạnh 6-10", completed: false },
            { title: "Sinh Khí 1-5", completed: false },
            { title: "Sinh Khí 6-10", completed: false },
            { title: "Thể Lực 1-50", completed: false },
            { title: "Thể Lực 51-100", completed: false },
            { title: "Sinh Lực 1-50", completed: false },
            { title: "Sinh Lực 51-100", completed: false },
            { title: "Nội Lực 1-50", completed: false },
            { title: "Nội Lực 51-100", completed: false }
        ]
    },
    {
        title: "Dã Tẩu - Tích Lũy",
        completed: false,
        selectionType: "radio",
        selectedIndex: null,
        skipDailyReset: true,
        children: [
            { title: "5000 điểm Tống Kim", completed: false },
            { title: "1 điểm PK", completed: false }
        ]
    },
    {
        title: "Dã Tẩu - Vật Phẩm",
        completed: false,
        selectionType: "radio",
        selectedIndex: null,
        skipDailyReset: true,
        children: [
            { title: "Kinh Bạch Ngọc Bội - Thổ (cấp 2)", completed: false },
            { title: "Thúy Lựu Thạch Giới Chỉ (cấp 5)", completed: false }
        ]
    }
];

/**
 * Parse txt file content into array of task names
 * Format: First line is ignored (category name), subsequent lines are options
 */
function parseTxtFile(content) {
    const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    // Skip first line (category name) and return rest
    return lines.slice(1).map(title => ({ title, completed: false }));
}

/**
 * Load Dã Tẩu tasks from txt files dynamically
 * Returns array of 3 task objects or null if loading fails
 */
async function loadDaTauFromFiles() {
    try {
        const [chisoRes, tichluyRes, vatphamRes] = await Promise.all([
            fetch('chiso.txt'),
            fetch('tichluy.txt'),
            fetch('vatpham.txt')
        ]);

        if (!chisoRes.ok || !tichluyRes.ok || !vatphamRes.ok) {
            console.warn('Failed to load one or more txt files, using fallback');
            return null;
        }

        const [chisoText, tichluyText, vatphamText] = await Promise.all([
            chisoRes.text(),
            tichluyRes.text(),
            vatphamRes.text()
        ]);

        return [
            {
                title: "Dã Tẩu - Chỉ Số",
                completed: false,
                selectionType: "radio",
                selectedIndex: null,
                skipDailyReset: true,
                children: parseTxtFile(chisoText)
            },
            {
                title: "Dã Tẩu - Tích Lũy",
                completed: false,
                selectionType: "radio",
                selectedIndex: null,
                skipDailyReset: true,
                children: parseTxtFile(tichluyText)
            },
            {
                title: "Dã Tẩu - Vật Phẩm",
                completed: false,
                selectionType: "radio",
                selectedIndex: null,
                skipDailyReset: true,
                children: parseTxtFile(vatphamText)
            }
        ];
    } catch (error) {
        console.warn('Error loading Dã Tẩu from files:', error);
        return null;
    }
}

const DEFAULT_TASKS = [
    {
        title: "Thí luyện",
        completed: false,
        selectionType: "checkbox",
        children: [
            { title: "Hạ 200 quái", completed: false },
            { title: "Hạ 100 quái", completed: false },
            { title: "Hạ 50 quái", completed: false }
        ]
    },
    // Dã Tẩu tasks will be inserted here dynamically
    ...FALLBACK_DA_TAU_TASKS,
    {
        title: "Sát Thủ",
        completed: false,
        selectionType: "checkbox",
        layout: "inline",
        children: [
            { title: "Sát thủ #1", completed: false },
            { title: "Sát thủ #2", completed: false },
            { title: "Sát thủ #3", completed: false },
            { title: "Sát thủ #4", completed: false }
        ]
    }
];

const DEFAULT_INVENTORY = {
    silver: 0,
    items: [],
    note: ''
};

const STORAGE_KEY = 'game_account_manager_data';

// --- State Management ---
let state = {
    accounts: []
};

let selectedAccountId = null;
let editingAccountId = null;

function loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        state = JSON.parse(stored);
        state.accounts.forEach(acc => {
            migrateAccountTasks(acc);
        });
    }
    checkDailyReset();
}

function migrateAccountTasks(acc) {
    // Remove legacy tasks (now replaced by new implementations)
    acc.tasks = acc.tasks.filter(t => t.title !== 'Báo danh' && t.title !== 'Dã Tẩu');

    DEFAULT_TASKS.forEach(defaultTask => {
        const existing = acc.tasks.find(t => t.title === defaultTask.title);
        if (!existing) {
            acc.tasks.push(JSON.parse(JSON.stringify(defaultTask)));
        } else {
            // Update layout and skipDailyReset flags
            if (defaultTask.layout && !existing.layout) existing.layout = defaultTask.layout;
            if (defaultTask.skipDailyReset !== undefined && existing.skipDailyReset === undefined) {
                existing.skipDailyReset = defaultTask.skipDailyReset;
            }

            // CRITICAL: Sync children for Dã Tẩu tasks (they're loaded dynamically from files)
            if (existing.title.startsWith('Dã Tẩu') && defaultTask.children) {
                console.log(`🔄 Syncing children for "${existing.title}":`, {
                    oldCount: existing.children.length,
                    newCount: defaultTask.children.length,
                    oldChildren: existing.children.map(c => c.title),
                    newChildren: defaultTask.children.map(c => c.title)
                });

                // Preserve user's selection
                const previousSelectedIndex = existing.selectedIndex;
                const previousSelectedTitle = (previousSelectedIndex !== null && existing.children[previousSelectedIndex])
                    ? existing.children[previousSelectedIndex].title
                    : null;

                // Replace children with new data from files
                existing.children = JSON.parse(JSON.stringify(defaultTask.children));

                // Try to restore selection by title (in case index changed)
                if (previousSelectedTitle) {
                    const newIndex = existing.children.findIndex(c => c.title === previousSelectedTitle);
                    if (newIndex !== -1) {
                        existing.selectedIndex = newIndex;
                        existing.children[newIndex].completed = true;
                        console.log(`✅ Preserved selection: "${previousSelectedTitle}"`);
                    } else {
                        // Selection no longer exists, reset
                        existing.selectedIndex = null;
                        console.log(`⚠️ Previous selection "${previousSelectedTitle}" not found, reset`);
                    }
                }
            }
        }
    });
    if (!acc.inventory) {
        acc.inventory = JSON.parse(JSON.stringify(DEFAULT_INVENTORY));
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
}

function checkDailyReset() {
    const today = new Date().toDateString();
    let hasChanges = false;
    state.accounts.forEach(acc => {
        if (acc.lastReset !== today) {
            acc.tasks.forEach(task => {
                // Skip tasks that shouldn't be reset daily (e.g., Dã Tẩu tasks)
                if (task.skipDailyReset) return;

                task.completed = false;
                if (task.children && task.children.length > 0) {
                    task.children.forEach(child => child.completed = false);
                }
                if (task.selectionType === 'radio') {
                    task.selectedIndex = null;
                }
            });
            acc.checkedIn = false;
            acc.lastReset = today;
            hasChanges = true;
        }
    });
    if (hasChanges) saveState();
}

// --- DOM Elements ---
const sidebarListEl = document.getElementById('sidebarList');
const detailContentEl = document.getElementById('detailContent');
const detailPlaceholderEl = document.getElementById('detailPlaceholder');
const addAccountBtn = document.getElementById('addAccountBtn');
const accountModal = document.getElementById('accountModal');
const closeModalBtn = document.getElementById('closeModal');
const accountForm = document.getElementById('accountForm');
const accountNameInput = document.getElementById('accName');
const charNameInput = document.getElementById('charName');
const accountNoteInput = document.getElementById('accNote');

// --- Actions ---

function addAccount(name, charName, note) {
    const newAccount = {
        id: crypto.randomUUID(),
        name: name,
        charName: charName || '',
        note: note,
        checkedIn: false,
        lastReset: new Date().toDateString(),
        tasks: JSON.parse(JSON.stringify(DEFAULT_TASKS)),
        inventory: JSON.parse(JSON.stringify(DEFAULT_INVENTORY))
    };
    state.accounts.push(newAccount);
    selectedAccountId = newAccount.id;
    saveState();
}

function editAccount(accId) {
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;
    editingAccountId = accId;
    accountNameInput.value = acc.name;
    charNameInput.value = acc.charName || '';
    accountNoteInput.value = acc.note || '';
    document.getElementById('modalTitle').textContent = 'Sửa tài khoản';
    accountModal.classList.remove('hidden');
    accountNameInput.focus();
}

function deleteAccount(id) {
    if (confirm('Xóa tài khoản này?')) {
        state.accounts = state.accounts.filter(acc => acc.id !== id);
        if (selectedAccountId === id) selectedAccountId = null;
        saveState();
    }
}

function selectAccount(accId) {
    selectedAccountId = accId;
    render();
}

function toggleTask(accId, taskIndex, childIndex = null) {
    const acc = state.accounts.find(a => a.id === accId);
    if (acc) {
        const task = acc.tasks[taskIndex];
        if (childIndex !== null) {
            if (task.selectionType === 'radio') {
                task.children.forEach((child, idx) => {
                    child.completed = (idx === childIndex);
                });
                task.selectedIndex = childIndex;
            } else {
                task.children[childIndex].completed = !task.children[childIndex].completed;
                const allChildrenDone = task.children.every(c => c.completed);
                task.completed = allChildrenDone;
            }
        } else {
            task.completed = !task.completed;
            if (task.children && task.children.length > 0 && task.selectionType !== 'radio') {
                const newState = task.completed;
                task.children.forEach(child => child.completed = newState);
            }
        }
        saveState();
    }
}

function toggleCheckIn(accId) {
    const acc = state.accounts.find(a => a.id === accId);
    if (acc) {
        acc.checkedIn = !acc.checkedIn;
        saveState();
    }
}

function handleDropdownChange(accId, taskIndex, selectedValue) {
    const childIndex = parseInt(selectedValue);
    if (childIndex >= 0) {
        toggleTask(accId, taskIndex, childIndex);
    } else {
        const acc = state.accounts.find(a => a.id === accId);
        if (acc) {
            const task = acc.tasks[taskIndex];
            task.children.forEach(child => child.completed = false);
            task.selectedIndex = null;
            saveState();
        }
    }
}

// --- Inventory ---

function openInventory(accId) {
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;
    if (!acc.inventory) acc.inventory = JSON.parse(JSON.stringify(DEFAULT_INVENTORY));
    document.getElementById('invAccId').value = accId;
    document.getElementById('invAccName').textContent = acc.charName || acc.name;
    document.getElementById('invSilver').value = acc.inventory.silver || 0;
    document.getElementById('invNote').value = acc.inventory.note || '';
    renderInventoryItems(acc.inventory.items || []);
    document.getElementById('inventoryModal').classList.remove('hidden');
}

function renderInventoryItems(items) {
    const container = document.getElementById('invItemsList');
    container.innerHTML = items.map((item, idx) => `
        <div class="inv-row">
            <span class="inv-item-name">${item.name}</span>
            <div class="inv-item-controls">
                <input type="number" value="${item.qty}" min="0" 
                    onchange="updateInventoryItemQty(${idx}, this.value)" style="width: 80px;">
                <button type="button" class="inv-remove-btn" onclick="removeInventoryItem(${idx})" title="Xóa">✕</button>
            </div>
        </div>
    `).join('');
}

let tempItems = [];

function addPresetItem() {
    const select = document.getElementById('presetItemSelect');
    const name = select.value;
    if (!name) return;
    const accId = document.getElementById('invAccId').value;
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;
    acc.inventory.items.push({ name, qty: 1 });
    renderInventoryItems(acc.inventory.items);
    select.value = '';
}

function addInventoryItem() {
    const nameInput = document.getElementById('newItemName');
    const qtyInput = document.getElementById('newItemQty');
    const name = nameInput.value.trim();
    const qty = parseInt(qtyInput.value) || 1;
    if (!name) return;
    const accId = document.getElementById('invAccId').value;
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;
    acc.inventory.items.push({ name, qty });
    renderInventoryItems(acc.inventory.items);
    nameInput.value = '';
    qtyInput.value = '';
    nameInput.focus();
}

function updateInventoryItemQty(idx, value) {
    const accId = document.getElementById('invAccId').value;
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;
    acc.inventory.items[idx].qty = parseInt(value) || 0;
}

function removeInventoryItem(idx) {
    const accId = document.getElementById('invAccId').value;
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;
    acc.inventory.items.splice(idx, 1);
    renderInventoryItems(acc.inventory.items);
}

function removeItemFromCard(accId, itemIdx) {
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc || !acc.inventory) return;
    acc.inventory.items.splice(itemIdx, 1);
    saveState();
}

function saveInventory(e) {
    e.preventDefault();
    const accId = document.getElementById('invAccId').value;
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;
    acc.inventory.silver = parseInt(document.getElementById('invSilver').value) || 0;
    acc.inventory.note = document.getElementById('invNote').value.trim();
    saveState();
    document.getElementById('inventoryModal').classList.add('hidden');
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// --- Dashboard & Search ---

let currentSearchMode = 'dropdown';

function copyAccountName(name) {
    navigator.clipboard.writeText(name).then(() => {
        // Brief visual feedback could be added here
    });
}

function updateDashboard() {
    let totalSilver = 0;
    state.accounts.forEach(acc => {
        if (acc.inventory) totalSilver += (acc.inventory.silver || 0);
    });
    document.getElementById('totalSilver').textContent = formatNumber(totalSilver);
    document.getElementById('totalAccounts').textContent = state.accounts.length;
}

function toggleSearch() {
    const panel = document.getElementById('searchPanel');
    panel.classList.toggle('hidden');
}

function filterSidebar() {
    const query = document.getElementById('sidebarSearch').value.trim().toLowerCase();
    const items = sidebarListEl.querySelectorAll('.sidebar-item');
    items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        const charName = (item.dataset.charname || '').toLowerCase();
        if (name.includes(query) || charName.includes(query)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function setSearchMode(mode) {
    currentSearchMode = mode;
    const dropdown = document.getElementById('searchDropdown');
    const keyword = document.getElementById('searchKeyword');
    const btnDropdown = document.getElementById('searchModeDropdown');
    const btnKeyword = document.getElementById('searchModeKeyword');
    if (mode === 'dropdown') {
        dropdown.classList.remove('hidden');
        keyword.classList.add('hidden');
        btnDropdown.classList.add('active');
        btnKeyword.classList.remove('active');
    } else {
        dropdown.classList.add('hidden');
        keyword.classList.remove('hidden');
        btnKeyword.classList.add('active');
        btnDropdown.classList.remove('active');
        keyword.focus();
    }
    document.getElementById('searchResults').classList.add('hidden');
    document.getElementById('searchDropdown').value = '';
    document.getElementById('searchKeyword').value = '';
}

function searchItems() {
    let query = '';
    if (currentSearchMode === 'dropdown') {
        query = document.getElementById('searchDropdown').value;
    } else {
        query = document.getElementById('searchKeyword').value.trim().toLowerCase();
    }
    const resultsEl = document.getElementById('searchResults');
    if (!query) {
        resultsEl.classList.add('hidden');
        return;
    }
    const results = [];
    state.accounts.forEach(acc => {
        if (!acc.inventory || !acc.inventory.items) return;
        acc.inventory.items.forEach(item => {
            const match = currentSearchMode === 'dropdown'
                ? item.name === query
                : item.name.toLowerCase().includes(query);
            if (match) {
                results.push({
                    accName: acc.charName || acc.name,
                    itemName: item.name,
                    qty: item.qty
                });
            }
        });
    });
    if (results.length === 0) {
        resultsEl.innerHTML = '<div class="search-no-result">Không tìm thấy vật phẩm nào.</div>';
    } else {
        let totalQty = results.reduce((sum, r) => sum + r.qty, 0);
        resultsEl.innerHTML = `
            <div class="search-result-header">Tìm thấy <strong>${results.length}</strong> kết quả (Tổng: <strong>${totalQty}</strong>)</div>
            ${results.map(r => `
                <div class="search-result-row">
                    <span class="search-acc-name">👤 ${r.accName}</span>
                    <span class="search-item-info">📦 ${r.itemName}: <strong>${r.qty}</strong></span>
                </div>
            `).join('')}
        `;
    }
    resultsEl.classList.remove('hidden');
}

// --- Helper: Calculate task progress ---
function calcProgress(acc) {
    let completedTasks = 0;
    let totalTasks = 0;
    acc.tasks.forEach(task => {
        // Skip tasks that are not daily tasks (e.g., Dã Tẩu)
        if (task.skipDailyReset) return;
        if (task.selectionType === 'radio') return;
        if (task.children && task.children.length > 0) {
            task.children.forEach(child => {
                totalTasks++;
                if (child.completed) completedTasks++;
            });
        } else {
            totalTasks++;
            if (task.completed) completedTasks++;
        }
    });
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    return { completedTasks, totalTasks, progress };
}

// --- Rendering ---

function render() {
    renderSidebar();
    renderDetail();
    updateDashboard();
}

function renderSidebar() {
    sidebarListEl.innerHTML = '';

    if (state.accounts.length === 0) {
        sidebarListEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">Chưa có tài khoản nào</div>';
        return;
    }

    const sorted = [...state.accounts].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    sorted.forEach(acc => {
        const { completedTasks, totalTasks, progress } = calcProgress(acc);

        let statusClass = 'incomplete';
        if (progress === 100) statusClass = 'completed';
        else if (progress > 0) statusClass = 'partial';

        const item = document.createElement('div');
        item.className = `sidebar-item${acc.id === selectedAccountId ? ' active' : ''}`;
        item.dataset.name = acc.name;
        item.dataset.charname = acc.charName || '';
        item.onclick = () => selectAccount(acc.id);

        // Find all Dã Tẩu selected quests
        const daTauQuests = [];
        const daTauTasks = acc.tasks.filter(t => t.title.startsWith('Dã Tẩu'));
        daTauTasks.forEach(daTau => {
            if (daTau.selectedIndex !== null && daTau.selectedIndex !== undefined) {
                const selected = daTau.children[daTau.selectedIndex];
                if (selected) {
                    daTauQuests.push(selected.title);
                }
            }
        });

        item.innerHTML = `
            <div class="sidebar-item-info">
                <div class="sidebar-item-name">${acc.name}</div>
                ${acc.charName ? `<div class="sidebar-item-char">⚔️ ${acc.charName}${acc.checkedIn ? ' <span class="checkin-badge">✓</span>' : ''}</div>` : ''}
                ${daTauQuests.length > 0 ? daTauQuests.map(q => `<div class="sidebar-item-quest">🏃 ${q}</div>`).join('') : ''}
            </div>
            <div class="sidebar-item-status">
                <div class="status-dot ${statusClass}"></div>
                <div class="sidebar-progress">
                    <div class="sidebar-progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
        sidebarListEl.appendChild(item);
    });
}

function renderDetail() {
    if (!selectedAccountId) {
        detailPlaceholderEl.classList.remove('hidden');
        detailContentEl.classList.add('hidden');
        return;
    }

    const acc = state.accounts.find(a => a.id === selectedAccountId);
    if (!acc) {
        selectedAccountId = null;
        detailPlaceholderEl.classList.remove('hidden');
        detailContentEl.classList.add('hidden');
        return;
    }

    detailPlaceholderEl.classList.add('hidden');
    detailContentEl.classList.remove('hidden');

    const { completedTasks, totalTasks, progress } = calcProgress(acc);

    // Build task HTML
    let taskListHTML = acc.tasks.map((task, idx) => {
        let html = '';

        if (task.selectionType === 'radio') {
            const selectedChild = task.children.find(c => c.completed);
            html = `
                <li class="task-item">
                    <span class="task-icon">📋</span>
                    <span class="task-label">${task.title}</span>
                </li>
                <li class="task-item task-child">
                    <select class="task-dropdown" onchange="handleDropdownChange('${acc.id}', ${idx}, this.value)">
                        <option value="-1" ${!selectedChild ? 'selected' : ''}>-- Chọn nhiệm vụ --</option>
                        ${task.children.map((child, childIdx) => `
                            <option value="${childIdx}" ${child.completed ? 'selected' : ''}>${child.title}</option>
                        `).join('')}
                    </select>
                </li>
            `;
        } else if (task.layout === 'inline') {
            const doneCount = task.children.filter(c => c.completed).length;
            html = `
                <li class="task-item ${task.completed ? 'completed' : ''}">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask('${acc.id}', ${idx})">
                    <span class="task-label">${task.title} (${doneCount}/${task.children.length})</span>
                </li>
                <li class="task-inline-row">
                    ${task.children.map((child, childIdx) => `
                        <button class="task-inline-btn ${child.completed ? 'done' : ''}" 
                            onclick="toggleTask('${acc.id}', ${idx}, ${childIdx})" 
                            title="${child.title}">💀</button>
                    `).join('')}
                </li>
            `;
        } else {
            html = `
                <li class="task-item ${task.completed ? 'completed' : ''}">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask('${acc.id}', ${idx})">
                    <span class="task-label">${task.title}</span>
                </li>
            `;
            if (task.children && task.children.length > 0) {
                task.children.forEach((child, childIdx) => {
                    html += `
                        <li class="task-item task-child ${child.completed ? 'completed' : ''}">
                            <input type="checkbox" ${child.completed ? 'checked' : ''} onchange="toggleTask('${acc.id}', ${idx}, ${childIdx})">
                            <span class="task-label">${child.title}</span>
                        </li>
                    `;
                });
            }
        }
        return html;
    }).join('');

    // Build inventory HTML
    let invHTML = '';
    if (acc.inventory) {
        const hasStuff = acc.inventory.silver > 0 || (acc.inventory.items && acc.inventory.items.length > 0);
        if (hasStuff) {
            invHTML = `<div class="inv-summary-detail">
                ${acc.inventory.silver > 0 ? `<span class="inv-tag silver">💰 ${formatNumber(acc.inventory.silver)} vạn</span>` : ''}
                ${(acc.inventory.items || []).map((item, itemIdx) => `
                    <span class="inv-tag item">📦 ${item.name}: ${item.qty}
                        <button class="inv-tag-remove" onclick="removeItemFromCard('${acc.id}', ${itemIdx})" title="Xóa">✕</button>
                    </span>
                `).join('')}
            </div>`;
        } else {
            invHTML = '<div class="inv-empty">Chưa có vật phẩm nào</div>';
        }
    }

    detailContentEl.innerHTML = `
        <div class="detail-header">
            <div class="detail-title-area">
                <h2>${acc.name}</h2>
                ${acc.charName ? `<div class="detail-char-name">⚔️ ${acc.charName}</div>` : ''}
                ${acc.note ? `<div class="detail-note">📝 ${acc.note}</div>` : ''}
            </div>
            <div class="detail-actions">
                <button class="action-btn" onclick="copyAccountName('${acc.name}')" title="Copy tên">📋 Copy</button>
                <button class="action-btn" onclick="editAccount('${acc.id}')" title="Sửa">✏️ Sửa</button>
                <button class="action-btn" onclick="openInventory('${acc.id}')" title="Kho đồ">🎒 Kho</button>
                <button class="action-btn danger" onclick="deleteAccount('${acc.id}')" title="Xóa">🗑️ Xóa</button>
            </div>
        </div>

        <div class="detail-body">
            <!-- Tasks Section -->
            <div class="detail-section">
                <div class="detail-task-header">
                    <h3>📋 Nhiệm vụ hàng ngày</h3>
                    <span class="detail-progress-text">${completedTasks}/${totalTasks}</span>
                </div>
                <div class="detail-progress-track">
                    <div class="detail-progress-fill" style="width: ${progress}%"></div>
                </div>
                <div class="detail-checkin-row">
                    <span class="detail-checkin-label">🎁 Điểm danh</span>
                    <button class="status-badge ${acc.checkedIn ? 'done' : ''}" onclick="toggleCheckIn('${acc.id}')">
                        ${acc.checkedIn ? 'ĐÃ NHẬN' : 'CHƯA NHẬN'}
                    </button>
                </div>
                <ul class="task-list">
                    ${taskListHTML}
                </ul>
            </div>

            <!-- Inventory Section -->
            <div class="detail-section">
                <h3>🎒 Kho đồ</h3>
                ${invHTML}
            </div>

            ${acc.inventory && acc.inventory.note ? `
            <div class="detail-section full-width">
                <h3>📝 Ghi chú trang bị</h3>
                <p style="font-size: 0.85rem; color: var(--text-main); white-space: pre-wrap;">${acc.inventory.note}</p>
            </div>
            ` : ''}
        </div>
    `;
}

// --- Event Listeners ---

addAccountBtn.addEventListener('click', () => {
    editingAccountId = null;
    accountForm.reset();
    document.getElementById('modalTitle').textContent = 'Thêm tài khoản';
    accountModal.classList.remove('hidden');
    accountNameInput.focus();
});

closeModalBtn.addEventListener('click', () => {
    accountModal.classList.add('hidden');
    accountForm.reset();
    editingAccountId = null;
});

accountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = accountNameInput.value.trim();
    const charName = charNameInput.value.trim();
    const note = accountNoteInput.value.trim();
    if (name) {
        if (editingAccountId) {
            const acc = state.accounts.find(a => a.id === editingAccountId);
            if (acc) {
                acc.name = name;
                acc.charName = charName;
                acc.note = note;
                saveState();
            }
            editingAccountId = null;
        } else {
            addAccount(name, charName, note);
        }
        accountModal.classList.add('hidden');
        accountForm.reset();
    }
});

// Keyboard navigation for sidebar
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    const sorted = [...state.accounts].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (sorted.length === 0) return;

    const currentIdx = sorted.findIndex(a => a.id === selectedAccountId);

    if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const nextIdx = currentIdx < sorted.length - 1 ? currentIdx + 1 : 0;
        selectAccount(sorted[nextIdx].id);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : sorted.length - 1;
        selectAccount(sorted[prevIdx].id);
    }
});

// Expose functions to global scope for HTML onclick handlers
window.deleteAccount = deleteAccount;
window.copyAccountName = copyAccountName;
window.editAccount = editAccount;
window.selectAccount = selectAccount;
window.toggleTask = toggleTask;
window.toggleCheckIn = toggleCheckIn;
window.handleDropdownChange = handleDropdownChange;
window.openInventory = openInventory;
window.addPresetItem = addPresetItem;
window.addInventoryItem = addInventoryItem;
window.updateInventoryItemQty = updateInventoryItemQty;
window.removeInventoryItem = removeInventoryItem;
window.removeItemFromCard = removeItemFromCard;
window.setSearchMode = setSearchMode;
window.searchItems = searchItems;
window.toggleSearch = toggleSearch;
window.filterSidebar = filterSidebar;

// --- Export / Import ---

function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `GAM_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.accounts || !Array.isArray(imported.accounts)) {
                alert('File không hợp lệ: không tìm thấy dữ liệu tài khoản.');
                return;
            }
            const count = imported.accounts.length;
            if (!confirm(`Nạp ${count} tài khoản từ file backup?\nDữ liệu hiện tại sẽ bị thay thế.`)) return;
            state = imported;
            state.accounts.forEach(acc => migrateAccountTasks(acc));
            selectedAccountId = null;
            saveState();
        } catch (err) {
            alert('Lỗi đọc file: ' + err.message);
        }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    event.target.value = '';
}

window.exportData = exportData;
window.importData = importData;

// Inventory modal event listeners
document.getElementById('closeInventory').addEventListener('click', () => {
    document.getElementById('inventoryModal').classList.add('hidden');
});

document.getElementById('inventoryForm').addEventListener('submit', saveInventory);

// --- OCR Feature (Improved) ---

const ocrPasteArea = document.getElementById('ocrPasteArea');
const ocrStatus = document.getElementById('ocrStatus');

if (ocrPasteArea) {
    ocrPasteArea.addEventListener('paste', handleOCRPaste);
    ocrPasteArea.addEventListener('click', () => ocrPasteArea.focus());
}

/**
 * Preprocess image for better OCR accuracy:
 * - Scale up 2x (small text is hard for Tesseract)
 * - Convert to grayscale
 * - Increase contrast
 * - Binarize (black/white threshold)
 */
function preprocessImage(img) {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');

    // Draw scaled up
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        // Increase contrast (stretch histogram)
        let val = ((gray - 128) * 1.8) + 128;
        val = Math.max(0, Math.min(255, val));

        // Binarize: threshold at 140
        const bw = val > 140 ? 255 : 0;

        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

/**
 * Extract silver value from OCR text using multiple heuristics.
 */
function extractSilverFromText(rawText) {
    console.log('--- OCR Raw Text ---');
    console.log(rawText);
    console.log('--------------------');

    // Normalize: remove dots/commas used as thousand separators, 
    // fix common OCR mistakes (O -> 0, l/I -> 1)
    let text = rawText
        .replace(/\./g, '')       // "1.234" -> "1234"
        .replace(/,/g, '')        // "1,234" -> "1234"
        .replace(/[oO](?=\d)/g, '0')  // "O23" -> "023"
        .replace(/(?<=\d)[oO]/g, '0') // "1O3" -> "103"
        .replace(/[lI](?=\d)/g, '1')  // "l23" -> "123"
        .replace(/(?<=\d)[lI]/g, '1');  // "1l3" -> "113"

    let silverVal = 0;
    let matchSource = '';

    // Strategy 1: "Bạc" keyword near a number (highest confidence)
    // Handles: "Bạc: 12345", "Bạc 12345", "Bac: 12345"
    const matchBac = text.match(/[Bb][aạ][ccs]\s*[:\s\-]*\s*(\d+)/);
    if (matchBac) {
        silverVal = parseInt(matchBac[1]);
        matchSource = `"Bạc" keyword → ${silverVal}`;
    }

    // Strategy 2: Number followed by "vạn" / "van"
    if (!silverVal) {
        const matchVan = text.match(/(\d+)\s*[vV][aạ][nN]?/);
        if (matchVan) {
            silverVal = parseInt(matchVan[1]);
            matchSource = `"vạn" keyword → ${silverVal}`;
        }
    }

    // Strategy 3: Find all numbers, pick the largest (likely the currency)
    if (!silverVal) {
        const allNumbers = text.match(/\d+/g);
        if (allNumbers) {
            const nums = allNumbers.map(n => parseInt(n)).filter(n => n > 0);
            if (nums.length > 0) {
                silverVal = Math.max(...nums);
                matchSource = `Largest number → ${silverVal}`;
            }
        }
    }

    return { silverVal, matchSource, rawText };
}

async function handleOCRPaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let blob = null;

    for (const item of items) {
        if (item.type.indexOf('image') === 0) {
            blob = item.getAsFile();
            break;
        }
    }

    if (!blob) {
        alert('Vui lòng dán một hình ảnh (Screenshot)!');
        return;
    }

    // UI: show processing state
    ocrPasteArea.classList.remove('success');
    ocrPasteArea.classList.add('processing');
    ocrStatus.textContent = '⏳ Đang xử lý ảnh...';

    try {
        // Load image
        const img = await createImageBitmap(blob);

        // Preprocess
        const processedCanvas = preprocessImage(img);
        ocrStatus.textContent = '⏳ Đang nhận dạng chữ...';

        // OCR with both English (for numbers) and Vietnamese (for keywords)
        const result = await Tesseract.recognize(processedCanvas, 'eng+vie', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 100);
                    ocrStatus.textContent = `⏳ Đang đọc... ${pct}%`;
                }
            }
        });

        const { silverVal, matchSource, rawText } = extractSilverFromText(result.data.text);

        if (silverVal > 0) {
            const silverInput = document.getElementById('invSilver');
            silverInput.value = silverVal;

            ocrPasteArea.classList.remove('processing');
            ocrPasteArea.classList.add('success');
            ocrStatus.innerHTML = `✅ Đã điền: <strong>${silverVal}</strong> vạn<br><small style="opacity:0.7">Nguồn: ${matchSource}</small>`;

            silverInput.style.backgroundColor = '#dcfce7';
            setTimeout(() => silverInput.style.backgroundColor = '', 800);
        } else {
            ocrPasteArea.classList.remove('processing');
            ocrStatus.innerHTML = `⚠️ Không tìm thấy số.<br><small style="opacity:0.7; word-break:break-all;">OCR: "${rawText.trim().substring(0, 100)}"</small>`;
        }

    } catch (err) {
        console.error('OCR Error:', err);
        ocrPasteArea.classList.remove('processing');
        ocrStatus.textContent = '❌ Lỗi nhận dạng: ' + err.message;
    }
}

// Init - async to load Dã Tẩu from files
async function init() {
    console.log('🚀 Initializing Game Account Manager...');

    // Try to load Dã Tẩu tasks from txt files
    const daTauTasks = await loadDaTauFromFiles();

    if (daTauTasks) {
        console.log('✅ Loaded Dã Tẩu tasks from files:', daTauTasks.map(t => `${t.title} (${t.children.length} options)`));

        // Replace the fallback tasks with loaded ones in DEFAULT_TASKS
        // Find index of first Dã Tẩu task
        const firstDaTauIndex = DEFAULT_TASKS.findIndex(t => t.title.startsWith('Dã Tẩu'));
        if (firstDaTauIndex !== -1) {
            // Remove the 3 fallback tasks and insert the loaded ones
            DEFAULT_TASKS.splice(firstDaTauIndex, 3, ...daTauTasks);
        }
    } else {
        console.log('⚠️ Using fallback hardcoded Dã Tẩu tasks');
    }

    loadState();
    render();
}

init();
