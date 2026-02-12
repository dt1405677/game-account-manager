// Firebase Imports
import { auth, database, provider, signInWithPopup, signOut, onAuthStateChanged, ref, set, get, child } from './firebase-config.js';

// Global State
let state = {
    accounts: [],
    backupDate: null
};

let currentUser = null;
let cloudSyncDone = false; // Flag to prevent stale data upload race condition
let tempInventoryItems = []; // Temporary staging for items being added in modal
let availableItems = []; // Items loaded from vatpham.txt for dropdown
let availableChisoItems = []; // Items loaded from chiso.txt for dropdown

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
 * Parse vatpham.txt to get simple item list (without category)
 */
function parseItemList(content) {
    const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    // Skip first line (category name) and return rest as simple strings
    return lines.slice(1);
}

/**
 * Load Dã Tẩu tasks from txt files dynamically
 * Returns array of 3 task objects or null if loading fails
 */
async function loadDaTauFromFiles() {
    try {
        const timestamp = Date.now();
        const [chisoRes, tichluyRes, vatphamRes] = await Promise.all([
            fetch(`assets/data/chiso.txt?v=${timestamp}`),
            fetch(`assets/data/tichluy.txt?v=${timestamp}`),
            fetch(`assets/data/vatpham.txt?v=${timestamp}`)
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

    // If logged in, sync to Cloud (but NEVER upload empty data, and wait for cloud sync first)
    if (currentUser && cloudSyncDone && state.accounts && state.accounts.length > 0) {
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
    } else if (currentUser && !cloudSyncDone) {
        console.log('⏳ Waiting for cloud sync before uploading...');
    } else if (currentUser) {
        console.warn('⚠️ Skipped cloud sync: no accounts to upload');
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
    tempInventoryItems = []; // Clear temp items when closing

    // Reset OCR areas
    const itemOcrResults = document.getElementById('itemOcrResults');
    const itemOcrStatus = document.getElementById('itemOcrStatus');
    const itemOcrPasteArea = document.getElementById('itemOcrPasteArea');

    if (itemOcrResults) {
        itemOcrResults.innerHTML = '';
        itemOcrResults.classList.add('hidden');
    }

    if (itemOcrStatus) {
        itemOcrStatus.innerHTML = '📸 Dán ảnh vật phẩm (Ctrl+V) để tự nhận diện';
    }

    if (itemOcrPasteArea) {
        itemOcrPasteArea.classList.remove('processing', 'success');
    }
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

    // Merge temporary items with existing items (append new items)
    if (!acc.inventory.items) acc.inventory.items = [];
    acc.inventory.items = [...acc.inventory.items, ...tempInventoryItems];

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
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        // Focus on the dropdown select element
        const dropdown = document.getElementById('searchDropdown');
        if (dropdown) dropdown.focus();
    }
};

window.setSearchMode = function (mode) {
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
};

window.searchItems = function () {
    const mode = document.getElementById('searchDropdown').classList.contains('hidden') ? 'keyword' : 'dropdown';
    const query = mode === 'dropdown'
        ? document.getElementById('searchDropdown').value
        : document.getElementById('searchKeyword').value.trim().toLowerCase();

    const resultsDiv = document.getElementById('searchResults');

    if (!query) {
        resultsDiv.classList.add('hidden');
        return;
    }

    // Search across all accounts
    const results = [];
    state.accounts.forEach(acc => {
        if (acc.inventory?.items) {
            acc.inventory.items.forEach(item => {
                const match = mode === 'dropdown'
                    ? item.name === query
                    : item.name.toLowerCase().includes(query);

                if (match) {
                    results.push({
                        accountName: acc.name,
                        charName: acc.charName,
                        itemName: item.name,
                        qty: item.qty || 1
                    });
                }
            });
        }
    });

    if (results.length === 0) {
        resultsDiv.innerHTML = '<p style="opacity:0.6; text-align:center; margin:1rem 0">Không tìm thấy vật phẩm</p>';
        resultsDiv.classList.remove('hidden');
    } else {
        resultsDiv.innerHTML = `
            <div style="margin-top:1rem">
                <p style="font-size:0.85rem; opacity:0.7; margin-bottom:0.5rem">Tìm thấy ${results.length} kết quả:</p>
                ${results.map(r => `
                    <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:6px; margin-bottom:0.3rem">
                        <div style="font-weight:600">${r.accountName} ${r.charName ? `(${r.charName})` : ''}</div>
                        <div style="font-size:0.85rem; opacity:0.8">${r.itemName} x${r.qty}</div>
                    </div>
                `).join('')}
            </div>
        `;
        resultsDiv.classList.remove('hidden');
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

window.openInventory = function (accId) {
    currentAccountId = accId;
    const acc = state.accounts.find(a => a.id === accId);
    if (!acc) return;

    // Populate modal
    document.getElementById('invAccName').textContent = acc.name;
    document.getElementById('invAccId').value = acc.id;
    document.getElementById('invSilver').value = acc.inventory?.silver || 0;
    document.getElementById('invNote').value = acc.inventory?.note || '';

    // Start with empty temp items (only show new additions)
    tempInventoryItems = [];

    // Render the staging items (empty initially)
    renderStagingItems();

    // Populate dropdowns with available items
    populateChisoDropdown();
    populateItemDropdown();

    // Show modal
    inventoryModal.classList.remove('hidden');

    // Init OCR
    setupOCR();
    setupItemOCR(); // Initialize item OCR
};

// Helper function to render staging items in modal
function renderStagingItems() {
    const itemsList = document.getElementById('invItemsList');

    if (!tempInventoryItems || tempInventoryItems.length === 0) {
        itemsList.innerHTML = '<p style="opacity:0.6; font-size:0.9rem; margin:0">Chưa có vật phẩm (thêm vật phẩm sẽ hiển thị ở đây)</p>';
        return;
    }

    itemsList.innerHTML = tempInventoryItems.map((item, idx) => `
        <div class="inv-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:4px; margin-bottom:0.3rem">
            <span style="flex:1">${item.name}</span>
            <span style="opacity:0.7; margin:0 0.5rem">x${item.qty || 1}</span>
            <button type="button" onclick="removeStagingItem(${idx})" class="btn delete-btn" style="padding:0.2rem 0.5rem; font-size:1.2rem">×</button>
        </div>
    `).join('');
}

// Populate dropdown with items from vatpham.txt
function populateItemDropdown() {
    const select = document.getElementById('presetItemSelect');
    if (!select) return;

    // Clear existing options except first (placeholder)
    select.innerHTML = '<option value="">-- Chọn từ danh sách --</option>';

    // Add items from availableItems
    availableItems.forEach(itemName => {
        const option = document.createElement('option');
        option.value = itemName;
        option.textContent = itemName;
        select.appendChild(option);
    });
}

// Populate chiso dropdown with items from chiso.txt
function populateChisoDropdown() {
    const select = document.getElementById('presetChisoSelect');
    if (!select) return;

    // Clear existing options except first (placeholder)
    select.innerHTML = '<option value="">-- Chọn chỉ số --</option>';

    // Add items from availableChisoItems
    availableChisoItems.forEach(itemName => {
        const option = document.createElement('option');
        option.value = itemName;
        option.textContent = itemName;
        select.appendChild(option);
    });
}

// Add preset chiso item from dropdown to staging
window.addPresetChiso = function () {
    const select = document.getElementById('presetChisoSelect');
    const itemName = select.value;
    if (!itemName) return;

    // Add to temp staging (each item is separate)
    tempInventoryItems.push({ name: itemName, qty: 1 });

    // Re-render staging list
    renderStagingItems();

    // Reset dropdown
    select.selectedIndex = 0;
};

// Add preset item from dropdown to staging
window.addPresetItem = function () {
    const select = document.getElementById('presetItemSelect');
    const itemName = select.value;
    if (!itemName) return;

    // Add to temp staging (each item is separate)
    tempInventoryItems.push({ name: itemName, qty: 1 });

    // Re-render staging list
    renderStagingItems();

    // Reset dropdown
    select.selectedIndex = 0;
};

// Add custom inventory item to staging
window.addInventoryItem = function () {
    const nameInput = document.getElementById('newItemName');
    const qtyInput = document.getElementById('newItemQty');
    const name = nameInput.value.trim();
    const qty = parseInt(qtyInput.value) || 1;

    if (!name) {
        alert('Vui lòng nhập tên vật phẩm');
        return;
    }

    // Add to temp staging
    tempInventoryItems.push({ name, qty });

    // Re-render staging list
    renderStagingItems();

    // Clear inputs
    nameInput.value = '';
    qtyInput.value = '';
};

// Remove staging item by index (in modal)
window.removeStagingItem = function (index) {
    tempInventoryItems.splice(index, 1);
    renderStagingItems();
};

// Remove inventory item by index (from detail panel)
window.removeInventoryItem = function (index) {
    const acc = state.accounts.find(a => a.id === currentAccountId);
    acc.inventory.items.splice(index, 1);
    saveState();
    render(); // Update detail panel immediately
};


window.deleteAccount = function (id) {
    if (!confirm('Xóa tài khoản này?')) return;
    state.accounts = state.accounts.filter(a => a.id !== id);
    currentAccountId = null;
    saveState();

    // Hide detail panel, show placeholder
    const placeholder = document.getElementById('detailPlaceholder');
    const content = document.getElementById('detailContent');
    if (placeholder) placeholder.classList.remove('hidden');
    if (content) content.classList.add('hidden');

    render();
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

    // Sort accounts with natural number ordering (9 → 10 → 11...)
    const sortedAccounts = [...state.accounts].sort((a, b) =>
        a.name.localeCompare(b.name, 'vi', { numeric: true })
    );

    sortedAccounts.forEach(acc => {
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
                ${acc.note ? `<div class="sidebar-item-note">📝 ${acc.note}</div>` : ''}
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

    // Stats (removed items stat-card)
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

    // Render Items Panel
    const detailItems = document.getElementById('detailItems');
    if (detailItems) {
        if (!acc.inventory?.items || acc.inventory.items.length === 0) {
            detailItems.innerHTML = `
                <div class="task-card">
                    <div class="task-header"><span>📦 Vật phẩm</span></div>
                    <div class="task-body">
                        <p style="opacity:0.6; font-size:0.9rem; margin:0">Chưa có vật phẩm</p>
                    </div>
                </div>
            `;
        } else {
            const itemsHTML = acc.inventory.items.map((item, idx) => `
                <label class="task-item" style="justify-content:space-between">
                    <span style="flex:1">${item.name}</span>
                    <span style="opacity:0.7; margin:0 0.5rem">x${item.qty || 1}</span>
                    <button type="button" onclick="removeInventoryItem(${idx}); render();" class="btn delete-btn" style="padding:0.2rem 0.5rem; font-size:1.2rem">×</button>
                </label>
            `).join('');

            detailItems.innerHTML = `
                <div class="task-card">
                    <div class="task-header"><span>📦 Vật phẩm (${acc.inventory.items.length})</span></div>
                    <div class="task-body">
                        ${itemsHTML}
                    </div>
                </div>
            `;
        }
    }
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

// --- Item OCR Functionality (Enhanced) ---

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// Strip Vietnamese diacritics to ASCII for fallback matching
function stripDiacritics(str) {
    const diacriticsMap = {
        'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
        'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
        'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
        'đ': 'd',
        'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
        'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
        'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
        'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
        'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
        'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
        'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
        'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
        'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y'
    };
    return str.toLowerCase().split('').map(c => diacriticsMap[c] || c).join('');
}

// Normalize text for matching (keeps diacritics)
function normalizeText(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[()[\]{}]/g, '')
        .replace(/[.,;:!?'"]/g, '')
        .replace(/[-–—]/g, ' ');
}

// Extract key tokens from item name (for token-based matching)
function extractTokens(text) {
    return normalizeText(text)
        .split(' ')
        .filter(t => t.length > 1);
}

// Calculate token overlap ratio between two strings
function tokenOverlapScore(a, b) {
    const tokensA = extractTokens(a);
    const tokensB = extractTokens(b);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    let matchCount = 0;
    for (const tokenA of tokensA) {
        for (const tokenB of tokensB) {
            // Exact token match or fuzzy token match (distance ≤ 1)
            if (tokenA === tokenB || levenshteinDistance(tokenA, tokenB) <= 1) {
                matchCount++;
                break;
            }
        }
    }
    // Score = matched tokens / max tokens
    return matchCount / Math.max(tokensA.length, tokensB.length);
}

// Preprocess image for better OCR (grayscale + contrast boost)
function preprocessImage(blob) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Scale up small images for better OCR
            const scale = Math.max(1, Math.min(3, 2000 / Math.max(img.width, img.height)));
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Convert to grayscale and increase contrast
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                // Grayscale: weighted average
                const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

                // Increase contrast (factor 1.5, centered at 128)
                const contrast = 1.5;
                const adjusted = Math.max(0, Math.min(255, ((gray - 128) * contrast) + 128));

                // Threshold for cleaner text (binarize)
                const threshold = adjusted > 140 ? 255 : 0;

                data[i] = threshold;
                data[i + 1] = threshold;
                data[i + 2] = threshold;
            }

            ctx.putImageData(imageData, 0, 0);

            canvas.toBlob(resolve, 'image/png');
        };
        img.src = URL.createObjectURL(blob);
    });
}

// Multi-strategy matching: exact → contains → token → diacritics-stripped → fuzzy
function matchOcrTextToItems(ocrText) {
    const lines = ocrText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 3); // Keep lines with 4+ chars

    const results = [];

    for (const line of lines) {
        const normalizedLine = normalizeText(line);
        const strippedLine = stripDiacritics(line);
        let bestMatch = null;
        let bestScore = 0;
        let matchMethod = 'none';

        // Strategy 1: Exact match (normalized)
        for (const item of availableItems) {
            const normalizedItem = normalizeText(item);
            if (normalizedItem === normalizedLine) {
                bestMatch = item;
                bestScore = 1.0;
                matchMethod = 'exact';
                break;
            }
        }

        // Strategy 2: Contains match (OCR line contains a known item or vice versa)
        if (!bestMatch) {
            for (const item of availableItems) {
                const normalizedItem = normalizeText(item);
                if (normalizedLine.includes(normalizedItem) || normalizedItem.includes(normalizedLine)) {
                    // Prefer longer matches
                    const score = normalizedItem.length / Math.max(normalizedLine.length, normalizedItem.length);
                    if (score > bestScore && score > 0.5) {
                        bestMatch = item;
                        bestScore = score;
                        matchMethod = 'contains';
                    }
                }
            }
        }

        // Strategy 3: Token-based matching (compare individual words)
        if (!bestMatch || bestScore < 0.7) {
            for (const item of availableItems) {
                const score = tokenOverlapScore(line, item);
                if (score > bestScore && score >= 0.5) {
                    bestMatch = item;
                    bestScore = score;
                    matchMethod = 'token';
                }
            }
        }

        // Strategy 4: Diacritics-stripped matching (fallback for OCR losing diacritics)
        if (!bestMatch || bestScore < 0.7) {
            for (const item of availableItems) {
                const strippedItem = stripDiacritics(item);
                // Stripped exact
                if (strippedLine === strippedItem ||
                    strippedLine.includes(strippedItem) ||
                    strippedItem.includes(strippedLine)) {
                    const score = strippedItem.length / Math.max(strippedLine.length, strippedItem.length);
                    if (score > bestScore && score > 0.4) {
                        bestMatch = item;
                        bestScore = Math.max(0.6, score);
                        matchMethod = 'stripped';
                    }
                }
            }
        }

        // Strategy 5: Fuzzy Levenshtein (last resort)
        if (!bestMatch || bestScore < 0.6) {
            let bestDistance = Infinity;
            for (const item of availableItems) {
                const normalizedItem = normalizeText(item);
                const distance = levenshteinDistance(normalizedLine, normalizedItem);
                const maxDistance = Math.max(10, Math.floor(normalizedItem.length * 0.45));
                if (distance < bestDistance && distance <= maxDistance) {
                    bestDistance = distance;
                    const fuzzyScore = 1 - (distance / Math.max(normalizedLine.length, normalizedItem.length));
                    if (fuzzyScore > bestScore) {
                        bestMatch = item;
                        bestScore = fuzzyScore;
                        matchMethod = 'fuzzy';
                    }
                }
            }
        }

        // Only include if score is meaningful
        const isMatched = bestMatch && bestScore >= 0.4;
        const confidence = bestScore >= 0.9 ? 'exact'
            : bestScore >= 0.7 ? 'high'
                : bestScore >= 0.5 ? 'medium'
                    : 'low';

        results.push({
            ocrText: line,
            matchedItem: isMatched ? bestMatch : null,
            confidence: confidence,
            score: bestScore,
            method: matchMethod
        });
    }

    return results;
}

// Generate vatpham.txt format entry for unmatched item
function generateVatphamEntry(itemName) {
    const hasElementLevel = /[-–]\s*(Kim|Thủy|Mộc|Hỏa|Thổ)\s*[\(\[]?\s*(cấp|cap)\s*\d+/i.test(itemName);
    if (hasElementLevel) return itemName;

    const elements = ['Kim', 'Thủy', 'Mộc', 'Hỏa', 'Thổ'];
    return elements.map(el => `${itemName} - ${el} (cấp 5)`).join('\n');
}

// Render OCR item results
function renderOcrItemResults(results) {
    const resultsDiv = document.getElementById('itemOcrResults');
    if (!results || results.length === 0) {
        resultsDiv.classList.add('hidden');
        return;
    }

    let html = '';
    const unmatchedItems = [];

    for (const result of results) {
        if (result.matchedItem) {
            const scorePercent = Math.round(result.score * 100);
            const escapedItem = result.matchedItem.replace(/'/g, "\\'");
            html += `
                <div class="ocr-result-item matched" onclick="selectOcrItem('${escapedItem}')" style="cursor: pointer;" title="Click để chọn trong dropdown">
                    <span class="ocr-result-icon">🔍</span>
                    <div class="ocr-result-text">
                        ${result.matchedItem}
                        <small>Click để chọn (${result.confidence}, ${scorePercent}%)</small>
                    </div>
                    <span style="font-size: 0.75rem; opacity: 0.6;">👆</span>
                </div>
            `;
        } else {
            unmatchedItems.push(result.ocrText);
            html += `
                <div class="ocr-result-item unmatched">
                    <span class="ocr-result-icon">⚠️</span>
                    <div class="ocr-result-text">
                        ${result.ocrText}
                        <small>Không tìm thấy trong danh sách</small>
                    </div>
                </div>
            `;
        }
    }

    if (unmatchedItems.length > 0) {
        const copyableText = unmatchedItems.map(item => generateVatphamEntry(item)).join('\n');
        html += `
            <div style="margin-top: 0.75rem; padding: 0.5rem; background: rgba(251, 191, 36, 0.1); border-radius: 6px; border: 1px solid rgba(251, 191, 36, 0.3);">
                <div style="font-size: 0.8rem; margin-bottom: 0.5rem; color: #fbbf24; font-weight: 600;">
                    📋 Copy để thêm vào vatpham.txt:
                </div>
                <div class="ocr-copyable-text" id="copyableVatphamText">${copyableText}</div>
                <button class="ocr-copy-btn" onclick="copyVatphamText()" style="margin-top: 0.5rem; width: 100%;">
                    📋 Copy tất cả
                </button>
            </div>
        `;
    }

    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

// Select an OCR-recognized item in the dropdown
window.selectOcrItem = function (itemName) {
    const select = document.getElementById('presetItemSelect');
    if (!select) return;

    // Find the option that matches this item name
    let found = false;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === itemName || select.options[i].text === itemName) {
            select.selectedIndex = i;
            found = true;
            break;
        }
    }

    if (!found) {
        // Try partial match
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value.includes(itemName) || select.options[i].text.includes(itemName)) {
                select.selectedIndex = i;
                found = true;
                break;
            }
        }
    }

    if (found) {
        // Highlight the dropdown to draw attention
        select.style.outline = '2px solid #22c55e';
        select.style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
        select.focus();

        // Open dropdown programmatically
        select.size = Math.min(8, select.options.length);
        select.style.position = 'relative';
        select.style.zIndex = '100';

        // Close dropdown on selection or blur
        const closeDropdown = () => {
            select.size = 1;
            select.style.position = '';
            select.style.zIndex = '';
            select.style.outline = '';
            select.style.backgroundColor = '';
            select.removeEventListener('change', closeDropdown);
            select.removeEventListener('blur', closeDropdown);
        };

        select.addEventListener('change', closeDropdown);
        select.addEventListener('blur', closeDropdown);

        // Scroll dropdown into view
        select.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Remove highlight after 3 seconds
        setTimeout(() => {
            select.style.outline = '';
            select.style.backgroundColor = '';
        }, 3000);
    }
};

// Copy vatpham text to clipboard
window.copyVatphamText = function (e) {
    const textDiv = document.getElementById('copyableVatphamText');
    if (!textDiv) return;

    const text = textDiv.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = e ? e.target : document.querySelector('.ocr-copy-btn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ Đã copy!';
            btn.style.background = 'rgba(34, 197, 94, 0.2)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        }
    });
};

// Setup Item OCR
function setupItemOCR() {
    const pasteArea = document.getElementById('itemOcrPasteArea');
    if (!pasteArea) return;

    const newPasteArea = pasteArea.cloneNode(true);
    pasteArea.parentNode.replaceChild(newPasteArea, pasteArea);
    newPasteArea.addEventListener('paste', handleItemPaste);
}

// Handle item image paste (with preprocessing)
async function handleItemPaste(e) {
    const items = e.clipboardData.items;
    let blob = null;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            blob = items[i].getAsFile();
            break;
        }
    }

    if (!blob) return;

    const statusSpan = document.getElementById('itemOcrStatus');
    const pasteArea = document.getElementById('itemOcrPasteArea');

    pasteArea.classList.add('processing');
    statusSpan.innerHTML = '⏳ Đang xử lý ảnh...';

    try {
        // Step 1: Preprocess image for better OCR
        statusSpan.innerHTML = '🔄 Đang cải thiện ảnh...';
        const processedBlob = await preprocessImage(blob);

        // Step 2: Run OCR with optimized settings
        const result = await Tesseract.recognize(
            processedBlob,
            'vie',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        statusSpan.innerHTML = `⏳ Đang nhận diện... ${Math.round(m.progress * 100)}%`;
                    }
                }
            }
        );

        const rawText = result.data.text;
        console.log('📸 OCR Raw Text:', rawText);
        console.log('📸 OCR Confidence:', result.data.confidence);

        // Step 3: Match against available items
        const matchResults = matchOcrTextToItems(rawText);

        // Step 4: Render results
        renderOcrItemResults(matchResults);

        pasteArea.classList.remove('processing');
        pasteArea.classList.add('success');

        const matchedCount = matchResults.filter(r => r.matchedItem).length;
        const totalCount = matchResults.length;

        statusSpan.innerHTML = `✅ Nhận diện: ${matchedCount}/${totalCount} vật phẩm (OCR: ${Math.round(result.data.confidence)}%)`;

        setTimeout(() => {
            pasteArea.classList.remove('success');
            statusSpan.innerHTML = '📸 Dán ảnh vật phẩm (Ctrl+V) để tự nhận diện';
        }, 5000);

    } catch (err) {
        console.error('Item OCR Error:', err);
        pasteArea.classList.remove('processing');
        statusSpan.innerHTML = '❌ Lỗi đọc ảnh';

        setTimeout(() => {
            statusSpan.innerHTML = '📸 Dán ảnh vật phẩm (Ctrl+V) để tự nhận diện';
        }, 3000);
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
                try {
                    if (snapshot.exists()) {
                        console.log('☁️ Data downloaded from cloud');
                        const cloudData = snapshot.val();
                        console.log('📦 Cloud data keys:', Object.keys(cloudData));

                        // Firebase converts arrays to objects - convert back
                        let accounts = cloudData.accounts;
                        if (!accounts) {
                            console.warn('⚠️ No accounts in cloud data');
                            return;
                        }
                        if (!Array.isArray(accounts)) {
                            accounts = Object.values(accounts);
                            console.log('🔄 Converted accounts object→array');
                        }
                        // Filter null/undefined entries
                        accounts = accounts.filter(a => a != null);

                        if (accounts.length > 0) {
                            state = { accounts: accounts, backupDate: cloudData.backupDate || null };

                            // Fix nested arrays
                            state.accounts.forEach(acc => {
                                if (!acc.tasks) acc.tasks = [];
                                else if (!Array.isArray(acc.tasks)) {
                                    acc.tasks = Object.values(acc.tasks).filter(t => t != null);
                                }
                                acc.tasks.forEach(task => {
                                    if (task.children && !Array.isArray(task.children)) {
                                        task.children = Object.values(task.children).filter(c => c != null);
                                    }
                                });
                                if (!acc.inventory) acc.inventory = { silver: 0, items: [], note: '' };
                                else if (acc.inventory.items && !Array.isArray(acc.inventory.items)) {
                                    acc.inventory.items = Object.values(acc.inventory.items).filter(i => i != null);
                                }
                            });

                            state.accounts.forEach(migrateAccountTasks);
                            cloudSyncDone = true;
                            checkDailyReset();
                            render();
                            console.log(`✅ Loaded ${state.accounts.length} accounts from cloud`);
                        } else {
                            console.log('ℹ️ Cloud has no valid accounts');
                            cloudSyncDone = true;
                            // If local has data, upload it to restore cloud
                            if (state.accounts && state.accounts.length > 0) {
                                console.log('📤 Uploading local data to restore cloud...');
                                saveState();
                            }
                        }
                    } else {
                        console.log('ℹ️ New cloud user, uploading local data');
                        cloudSyncDone = true;
                        saveState();
                    }
                } catch (err) {
                    cloudSyncDone = true; // Allow saves even on error
                    console.error('❌ Cloud data processing error:', err);
                    alert('Lỗi xử lý data: ' + err.message);
                }
            }).catch((error) => {
                cloudSyncDone = true; // Allow saves even on error
                console.error('❌ Firebase get error:', error);
                alert('Lỗi tải data: ' + error.message);
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

    // Load items from chiso.txt for dropdown
    try {
        const chisoRes = await fetch('assets/data/chiso.txt');
        if (chisoRes.ok) {
            const chisoText = await chisoRes.text();
            availableChisoItems = parseItemList(chisoText);
            console.log(`✅ Loaded ${availableChisoItems.length} items from chiso.txt`);
        } else {
            console.warn('⚠️ Failed to load chiso.txt');
        }
    } catch (error) {
        console.warn('⚠️ Error loading chiso.txt:', error);
    }

    // Load items from vatpham.txt for dropdown
    try {
        const vatphamRes = await fetch('assets/data/vatpham.txt');
        if (vatphamRes.ok) {
            const vatphamText = await vatphamRes.text();
            availableItems = parseItemList(vatphamText);
            console.log(`✅ Loaded ${availableItems.length} items from vatpham.txt`);
        } else {
            console.warn('⚠️ Failed to load vatpham.txt');
        }
    } catch (error) {
        console.warn('⚠️ Error loading vatpham.txt:', error);
    }

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

// === SIDEBAR RESIZING ===
function initSidebarResize() {
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('sidebarResizer');
    if (!sidebar || !resizer) return;

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('sidebar-width');
    if (savedWidth) {
        document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const delta = e.clientX - startX;
        const newWidth = Math.max(200, Math.min(600, startWidth + delta)); // Min 200px, max 600px

        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Save to localStorage
            const currentWidth = sidebar.offsetWidth;
            localStorage.setItem('sidebar-width', currentWidth);
        }
    });
}

init();
initSidebarResize();

