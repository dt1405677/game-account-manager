// Firebase Imports
import { auth, database, provider, signInWithPopup, signOut, onAuthStateChanged, ref, set, get, child } from './firebase-config.js';

// Global State
let state = {
    accounts: [],
    backupDate: null
};

let currentUser = null;

// Constants
const STORAGE_KEY = 'game_account_manager_data';
const DEFAULT_INVENTORY = {
    silver: 0,
    items: [],
    note: ''
};

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

// --- Core Logic ---

function migrateAccountTasks(acc) {
    // Remove legacy tasks
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

            // Sync children for Dã Tẩu tasks from dynamically loaded files
            if (existing.title.startsWith('Dã Tẩu') && defaultTask.children) {
                console.log(`🔄 Syncing children for "${existing.title}":`, {
                    oldCount: existing.children.length,
                    newCount: defaultTask.children.length
                });

                // Preserve user's selection
                const previousSelectedIndex = existing.selectedIndex;
                const previousSelectedTitle = (previousSelectedIndex !== null && existing.children[previousSelectedIndex])
                    ? existing.children[previousSelectedIndex].title
                    : null;

                // Replace children with new data from files
                existing.children = JSON.parse(JSON.stringify(defaultTask.children));

                // Try to restore selection by title
                if (previousSelectedTitle) {
                    const newIndex = existing.children.findIndex(c => c.title === previousSelectedTitle);
                    if (newIndex !== -1) {
                        existing.selectedIndex = newIndex;
                        existing.children[newIndex].completed = true;
                        existing.children[newIndex].isRestored = true;
                    } else {
                        existing.selectedIndex = null; // Reset if option removed
                    }
                }
            }
        }
    });
    if (!acc.inventory) {
        acc.inventory = JSON.parse(JSON.stringify(DEFAULT_INVENTORY));
    }
}

// Function to load state (Local or Cloud)
function loadState() {
    try {
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) {
            const loadedState = JSON.parse(localData);
            if (!loadedState.accounts) loadedState.accounts = [];
            state = loadedState;

            // Run migration for all accounts
            state.accounts.forEach(migrateAccountTasks);

            checkDailyReset();
            console.log('✅ Loaded state from localStorage');
        } else {
            console.log('ℹ️ No local data found, starting fresh');
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
    render();
}

// Function to save state (To Cloud if logged in, else Local)
function saveState() {
    // Always save to localStorage as cache/backup
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log('💾 Saved to local storage');

    // If logged in, sync to Cloud
    if (currentUser) {
        const userId = currentUser.uid;
        set(ref(database, 'users/' + userId), state)
            .then(() => {
                console.log('☁️ Synced to Firebase');
                updateSyncStatus('success', 'Đã đồng bộ');
            })
            .catch((error) => {
                console.error('Firebase sync error:', error);
                updateSyncStatus('error', 'Lỗi đồng bộ');
            });
    }
}

function updateSyncStatus(type, message) {
    const btn = document.getElementById('loginBtn');
    if (btn) {
        if (type === 'success') {
            btn.innerHTML = `☁️ ${currentUser.displayName} (Synced)`;
            btn.style.borderColor = '#22c55e';
            setTimeout(() => {
                btn.innerHTML = `☁️ ${currentUser.displayName}`;
                btn.style.borderColor = '';
            }, 2000);
        } else if (type === 'error') {
            btn.style.borderColor = '#ef4444';
        }
    }
}

function checkDailyReset() {
    const today = new Date().toDateString();
    let hasChanges = false;
    state.accounts.forEach(acc => {
        if (acc.lastReset !== today) {
            acc.tasks.forEach(task => {
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
const modal = document.getElementById('accountModal');
const inventoryModal = document.getElementById('inventoryModal');
const openModalBtn = document.getElementById('addAccountBtn');
const closeModalBtn = document.getElementById('closeModal');
const closeInvBtn = document.getElementById('closeInventory');
const accountForm = document.getElementById('accountForm');
const inventoryForm = document.getElementById('inventoryForm');
const sidebarList = document.getElementById('sidebarList');
const detailPanel = document.getElementById('detailPanel');
const detailTitle = document.getElementById('detailTitle');
const detailStats = document.getElementById('detailStats');
const detailTasks = document.getElementById('detailTasks');
const totalAccountsElement = document.getElementById('totalAccounts');
const totalSilverElement = document.getElementById('totalSilver');
const sidebarSearch = document.getElementById('sidebarSearch');

let currentAccountId = null; // For editing/viewing details

// --- Event Listeners ---
if (openModalBtn) openModalBtn.addEventListener('click', openModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (closeInvBtn) closeInvBtn.addEventListener('click', closeInventoryModal);

function openModal() {
    modal.classList.remove('hidden');

    document.getElementById('modalTitle').textContent = 'Thêm Tài Khoản';
    document.getElementById('accId').value = ''; // Reset ID
    document.getElementById('accName').value = '';
    document.getElementById('charName').value = '';
    document.getElementById('accNote').value = '';
}

function closeModal() {
    modal.classList.add('hidden');
}

function closeInventoryModal() {
    inventoryModal.classList.add('hidden');
}

function openInventory(accId) {
    currentAccountId = accId;
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;

    // Populate
    document.getElementById('invSilver').value = acc.inventory.silver;
    document.getElementById('invNote').value = acc.inventory.note;

    // Render specific items (omitted for brevity, keeping existing logic if needed)

    inventoryModal.classList.remove('hidden');

    // Init OCR
    setupOCR();
}

accountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('accId').value;
    const name = document.getElementById('accName').value;
    const charName = document.getElementById('charName').value;
    const note = document.getElementById('accNote').value;

    if (id) {
        // Edit existing
        const acc = state.accounts.find(a => a.id === parseInt(id));
        if (acc) {
            acc.name = name;
            acc.charName = charName;
            acc.note = note;
        }
    } else {
        // Create new
        const newAcc = {
            id: Date.now(),
            name,
            charName,
            note,
            tasks: JSON.parse(JSON.stringify(DEFAULT_TASKS)),
            inventory: JSON.parse(JSON.stringify(DEFAULT_INVENTORY)),
            lastReset: new Date().toDateString(),
            checkedIn: false
        };
        state.accounts.push(newAcc);
    }

    saveState();
    closeModal();
    render();
});

inventoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentAccountId) return;
    const acc = state.accounts.find(a => a.id === currentAccountId);

    // Update core inventory
    acc.inventory.silver = parseInt(document.getElementById('invSilver').value) || 0;
    acc.inventory.note = document.getElementById('invNote').value;

    // Save
    saveState();
    closeInventoryModal();
    render(); // Update stats in sidebar
});

// --- Actions Exposed to Window ---

window.deleteAccount = function (id) {
    if (confirm('Bạn có chắc muốn xóa tài khoản này?')) {
        state.accounts = state.accounts.filter(acc => acc.id !== id);
        saveState();
        detailPanel.classList.remove('active'); // Close detail view
        render();
    }
};

window.addAccount = function () {
    openModal();
};

window.toggleTask = function (accId, taskIndex, childIndex = null) {
    const acc = state.accounts.find(a => a.id === accId);
    const task = acc.tasks[taskIndex];

    if (childIndex !== null) {
        task.children[childIndex].completed = !task.children[childIndex].completed;

        // Auto check parent if all children done (optional, logic depends on preference)
        // task.completed = task.children.every(c => c.completed);
    } else {
        task.completed = !task.completed;
    }

    saveState();
    render(); // Re-render to update progress bars
    // Optimization: could just update DOM elements instead of full render
};

window.toggleDay = function (accId, taskIndex, childIndex) {
    // Specific logic for Tống Kim tasks or similar
    // Reusing toggleTask logic in simplest form
    window.toggleTask(accId, taskIndex, childIndex);
};

window.selectQuest = function (accId, taskIndex, childIndex) {
    const acc = state.accounts.find(a => a.id === accId);
    const task = acc.tasks[taskIndex];
    if (task.selectionType === 'radio') {
        task.selectedIndex = childIndex;
        // Mark selected as "active/completed" for visual feedback if needed?
        // Usually radio just means "selected". 
        // Logic: Only one selected at a time.
    }
    saveState();
    render();
};

window.saveSilver = function (accId, input) {
    const acc = state.accounts.find(a => a.id === accId);
    acc.inventory.silver = parseInt(input.value) || 0;
    saveState();
    // Don't full render to avoid focus loss
    updateTotalStats();
};

window.checkIn = function (accId) {
    const acc = state.accounts.find(a => a.id === accId);
    acc.checkedIn = !acc.checkedIn;
    saveState();
    render();
}

window.resetDaily = function () {
    if (confirm('Đặt lại tất cả nhiệm vụ ngày hôm nay? (Không ảnh hưởng Dã Tẩu)')) {
        state.accounts.forEach(acc => {
            acc.tasks.forEach(task => {
                if (!task.skipDailyReset) {
                    task.completed = false;
                    if (task.children) {
                        task.children.forEach(c => c.completed = false);
                    }
                    if (task.selectionType === 'radio') {
                        task.selectedIndex = null;
                    }
                }
            });
            acc.checkedIn = false;
        });
        saveState();
        render();
    }
};

window.backupData = function () {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "gam_backup_" + new Date().toISOString().slice(0, 10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.restoreData = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const loaded = JSON.parse(event.target.result);
                if (loaded && loaded.accounts) {
                    state = loaded;
                    state.accounts.forEach(migrateAccountTasks);
                    saveState();
                    render();
                    alert('Khôi phục dữ liệu thành công!');
                } else {
                    alert('File không hợp lệ');
                }
            } catch (err) {
                alert('Lỗi đọc file: ' + err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

window.toggleSearch = function () {
    const panel = document.getElementById('searchPanel');
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
        document.getElementById('searchItemInput').focus();
    }
};

window.filterSidebar = function () {
    const term = sidebarSearch.value.toLowerCase();
    const items = document.querySelectorAll('.sidebar-item');
    items.forEach(item => {
        const name = item.querySelector('.sidebar-item-name').textContent.toLowerCase();
        const char = item.querySelector('.sidebar-item-char')?.textContent.toLowerCase() || '';
        if (name.includes(term) || char.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
};

window.selectAccount = function (id) {
    currentAccountId = id;

    // Update active class in sidebar
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    const sidebarItem = document.querySelector(`.sidebar-item[onclick="selectAccount(${id})"]`);
    if (sidebarItem) sidebarItem.classList.add('active');

    // Show detail panel, hide placeholder
    const placeholder = document.getElementById('detailPlaceholder');
    const content = document.getElementById('detailContent');
    if (placeholder) placeholder.classList.add('hidden');
    if (content) content.classList.remove('hidden');

    renderDetail(id);
};

window.editAccount = function (id) {
    const acc = state.accounts.find(a => a.id === id);
    if (!acc) return;
    openModal();
    document.getElementById('modalTitle').textContent = 'Sửa Tài Khoản';
    document.getElementById('accId').value = acc.id;
    document.getElementById('accName').value = acc.name;
    document.getElementById('charName').value = acc.charName;
    document.getElementById('accNote').value = acc.note;
};


// --- Auth Logic ---
window.toggleLogin = async function () {
    if (currentUser) {
        if (confirm(`Đăng xuất ${currentUser.displayName}?`)) {
            try {
                await signOut(auth);
                const btn = document.getElementById('loginBtn');
                btn.innerHTML = '☁️ Login';
                btn.style.borderColor = '';
                // Clear state or reload page
                location.reload();
            } catch (error) {
                console.error('Logout error', error);
                alert('Lỗi đăng xuất');
            }
        }
    } else {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error('Login error', error);
            alert('Lỗi đăng nhập: ' + error.message);
        }
    }
};

// --- Rendering ---

function render() {
    renderSidebar();
    updateTotalStats();
    if (currentAccountId) {
        renderDetail(currentAccountId); // Re-render detail if open
    }
}

function updateTotalStats() {
    totalAccountsElement.textContent = state.accounts.length;
    const totalSilver = state.accounts.reduce((sum, acc) => sum + (acc.inventory?.silver || 0), 0);
    totalSilverElement.textContent = totalSilver.toLocaleString();
}

function renderSidebar() {
    sidebarList.innerHTML = '';

    // Sort logic? Default by creation or name. Let's keep input order.
    state.accounts.forEach(acc => {
        const { progress } = calcProgress(acc);

        const item = document.createElement('div');
        item.className = 'sidebar-item';
        if (currentAccountId === acc.id) item.classList.add('active');
        item.onclick = () => window.selectAccount(acc.id); // Using window function

        let statusClass = 'status-low';
        if (progress >= 100) statusClass = 'status-done';
        else if (progress >= 50) statusClass = 'status-mid';

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
        sidebarList.appendChild(item);
    });
}

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

function renderDetail(accId) {
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;

    detailTitle.textContent = acc.name;
    const { progress } = calcProgress(acc);

    // Stats
    detailStats.innerHTML = `
        <div class="stat-card">
            <h3>Nhân vật</h3>
            <p>${acc.charName || '---'}</p>
        </div>
        <div class="stat-card">
            <h3>Tiến độ</h3>
            <p>${progress}%</p>
        </div>
        <div class="stat-card">
            <h3>Ngân lượng</h3>
            <p>${(acc.inventory?.silver || 0).toLocaleString()} vạn</p>
        </div>
        <div class="stat-card actions">
             <button class="btn secondary-btn" onclick="openInventory(${acc.id})" style="width:100%; margin-bottom: 0.5rem">🎒 Hành trang</button>
             <button class="btn secondary-btn" onclick="checkIn(${acc.id})" style="width:100%; margin-bottom: 0.5rem">${acc.checkedIn ? 'Hủy Báo Danh' : '✅ Báo Danh'}</button>
             <div style="display:flex; gap: 0.5rem">
                <button class="btn secondary-btn" onclick="editAccount(${acc.id})" style="flex:1">✏️ Sửa</button>
                <button class="btn delete-btn" onclick="deleteAccount(${acc.id})" style="flex:1">🗑️ Xóa</button>
             </div>
        </div>
    `;

    // Tasks Render
    detailTasks.innerHTML = '';

    acc.tasks.forEach((task, tIndex) => {
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card';

        // Header
        const header = document.createElement('div');
        header.className = 'task-header';
        header.innerHTML = `<span>${task.title}</span>`;
        taskCard.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'task-body';
        if (task.layout === 'inline') body.classList.add('inline-tasks');

        if (task.selectionType === 'radio') {
            // Dropdown style for Dã Tẩu
            const select = document.createElement('select');
            select.className = 'task-dropdown';

            // Placeholder option
            const defaultOpt = document.createElement('option');
            defaultOpt.value = "";
            defaultOpt.text = "-- Chọn nhiệm vụ --";
            defaultOpt.selected = (task.selectedIndex === null || task.selectedIndex === undefined);
            select.appendChild(defaultOpt);

            task.children.forEach((child, cIndex) => {
                const opt = document.createElement('option');
                opt.value = cIndex;
                opt.text = child.title;
                opt.selected = (task.selectedIndex === cIndex);
                select.appendChild(opt);
            });

            select.onchange = (e) => {
                const val = e.target.value;
                if (val === "") window.selectQuest(acc.id, tIndex, null); // Clear
                else window.selectQuest(acc.id, tIndex, parseInt(val));
            };
            body.appendChild(select);

        } else if (task.selectionType === 'checkbox') {
            task.children.forEach((child, cIndex) => {
                const label = document.createElement('label');
                label.className = 'task-item';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = child.completed;
                cb.onchange = () => {
                    // Check layout for specific toggle function logic if needed
                    // defaulting to generic toggleTask
                    window.toggleTask(acc.id, tIndex, cIndex);
                };

                const span = document.createElement('span');
                span.textContent = child.title;

                label.appendChild(cb);
                label.appendChild(span);
                body.appendChild(label);
            });
        }

        taskCard.appendChild(body);
        detailTasks.appendChild(taskCard);
    });
}

// --- OCR Functionality (Simplified integration) ---
// Note: Keeping OCR largely as is but ensuring it works in module scope
function setupOCR() {
    const pasteArea = document.getElementById('ocrPasteArea');
    if (!pasteArea) return;

    // Remove old listeners to avoid duplicates if reopened
    const newPasteArea = pasteArea.cloneNode(true);
    pasteArea.parentNode.replaceChild(newPasteArea, pasteArea);

    newPasteArea.addEventListener('paste', handlePaste);
}

async function handlePaste(e) {
    const items = e.clipboardData.items;
    let blob = null;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            blob = items[i].getAsFile();
            break;
        }
    }

    if (!blob) return;

    const ocrStatus = document.getElementById('ocrStatus');
    const ocrPasteArea = document.getElementById('ocrPasteArea');

    ocrPasteArea.classList.add('processing');
    ocrStatus.innerHTML = '⏳ Đang đọc ảnh...';

    try {
        const result = await Tesseract.recognize(blob, 'vie', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    ocrStatus.innerHTML = `⏳ Đang đọc... ${Math.round(m.progress * 100)}%`;
                }
            }
        });

        const rawText = result.data.text;
        // Regex to find number before "vạn"
        // Trying various patterns
        const patterns = [
            /(\d+)\s*vạn/i,
            /ngân lượng\s*:?\s*(\d+)/i,
            /(\d+)\s*van/i
        ];

        let silverVal = 0;
        let matchSource = '';

        for (let p of patterns) {
            const m = rawText.match(p);
            if (m) {
                silverVal = parseInt(m[1]);
                matchSource = m[0];
                break;
            }
        }

        // If not found, try just finding biggest number? No, risky.

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
        ocrStatus.innerHTML = '❌ Lỗi đọc ảnh';
    }
}

// Init - async to load Dã Tẩu from files
async function init() {
    console.log('🚀 Initializing Game Account Manager...');

    // Auth Listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            console.log('User logged in:', user.email);
            const btn = document.getElementById('loginBtn');
            btn.innerHTML = `☁️ ${user.displayName}`;
            btn.style.color = '#2dd4bf';

            // Load cloud data
            const userRef = ref(database, 'users/' + user.uid);
            get(userRef).then((snapshot) => {
                if (snapshot.exists()) {
                    console.log('☁️ Data downloaded from cloud');
                    const cloudData = snapshot.val();
                    if (cloudData.accounts) {
                        state = cloudData;
                        state.accounts.forEach(migrateAccountTasks);
                        checkDailyReset();
                        render();
                    }
                } else {
                    console.log('ℹ️ New cloud user, uploading local data');
                    saveState(); // Upload local data to cloud
                }
            }).catch((error) => {
                console.error('Error fetching cloud data', error);
            });

        } else {
            currentUser = null;
            console.log('User signed out');
            const btn = document.getElementById('loginBtn');
            btn.innerHTML = '☁️ Login';
            btn.style.color = '';
            // Revert to local state? Or keep current? 
            // Better to reload local state to prevent data leak from previous user
            loadState();
        }
    });

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

    // Initial load (will be overwritten if cloud auth succeeds quickly, but good for perceived perf)
    loadState();
    render();
}

// Expose openModal/closeModal/inv
window.openModal = openModal;
window.closeModal = closeModal;
window.closeInventoryModal = closeInventoryModal;
window.closeInventory = closeInventoryModal; // Alias if ID used in onclick

init();
