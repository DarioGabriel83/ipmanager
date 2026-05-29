const API_URL = '/api';

// State
let isLoginMode = true;
let currentUser = null;
let currentRole = localStorage.getItem('role') || null;
let currentToken = localStorage.getItem('token') || null;
let allIpsCache = []; // Store IPs for local filtering

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');
const authSuccess = document.getElementById('auth-success');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const confirmPasswordGroup = document.getElementById('confirm-password-group');
const welcomeMsg = document.getElementById('welcome-msg');
const ipTableBody = document.getElementById('ip-table-body');
const addIpError = document.getElementById('add-ip-error');
const navDashboard = document.getElementById('nav-dashboard');
const navAdmin = document.getElementById('nav-admin');
const viewDashboard = document.getElementById('view-dashboard');
const viewAdmin = document.getElementById('view-admin');
const userTableBody = document.getElementById('user-table-body');
const searchInput = document.getElementById('ip-search');
const importFileInput = document.getElementById('ip-file');
const importIpError = document.getElementById('import-ip-error');
const importIpSuccess = document.getElementById('import-ip-success');
const selectAllCheckbox = document.getElementById('select-all-ips');
const paginationControls = document.getElementById('pagination-controls');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const PAGE_SIZE = 10;
let currentPage = 1;
let currentIpResults = [];

// Initialization
function init() {
    const savedUser = localStorage.getItem('username');
    if (currentToken && savedUser) {
        currentUser = savedUser;
        showDashboard();
    } else {
        showAuth();
    }
}

// UI State Management
function switchTab(mode) {
    isLoginMode = mode === 'login';
    tabLogin.classList.toggle('active', isLoginMode);
    tabRegister.classList.toggle('active', !isLoginMode);
    authSubmitBtn.textContent = isLoginMode ? 'Login' : 'Register';
    authError.textContent = '';
    authSuccess.textContent = '';
    usernameInput.value = '';
    passwordInput.value = '';
    confirmPasswordInput.value = '';

    if (isLoginMode) {
        confirmPasswordGroup.classList.add('hidden');
        confirmPasswordInput.removeAttribute('required');
    } else {
        confirmPasswordGroup.classList.remove('hidden');
        confirmPasswordInput.setAttribute('required', 'true');
    }
}

function showAuth() {
    authSection.classList.remove('hidden');
    authSection.classList.add('active');
    dashboardSection.classList.remove('active');
    dashboardSection.classList.add('hidden');
}

function showDashboard() {
    authSection.classList.remove('active');
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    dashboardSection.classList.add('active');
    welcomeMsg.innerHTML = `Welcome, <strong>${currentUser}</strong>!`;

    // Role based visibility
    if (currentRole === 'admin') {
        navAdmin.classList.remove('hidden');
    } else {
        navAdmin.classList.add('hidden');
        switchMainTab('dashboard'); // Force back to IPs if they downgrade
    }

    loadIps();
}

function switchMainTab(tab) {
    if (tab === 'dashboard') {
        navDashboard.classList.add('active');
        navAdmin.classList.remove('active');
        viewDashboard.classList.remove('hidden');
        viewAdmin.classList.add('hidden');
        loadIps();
    } else if (tab === 'admin') {
        navDashboard.classList.remove('active');
        navAdmin.classList.add('active');
        viewDashboard.classList.add('hidden');
        viewAdmin.classList.remove('hidden');
        loadUsers();
    }
}

// Auth API Calls
async function handleAuth(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!username || !password) return;

    if (!isLoginMode) {
        if (password !== confirmPassword) {
            authError.textContent = 'Passwords do not match.';
            return;
        }

        const passwordStrength = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
        if (!passwordStrength.test(password)) {
            authError.textContent = 'La contraseña debe tener al menos 8 caracteres, incluir mayúscula, minúscula, número y símbolo.';
            return;
        }
    }

    authError.textContent = '';
    authSuccess.textContent = '';
    authSubmitBtn.disabled = true;

    const endpoint = isLoginMode ? '/login' : '/register';

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Authentication failed');
        }

        if (isLoginMode) {
            currentToken = data.token;
            currentUser = data.username;
            currentRole = data.role;
            localStorage.setItem('token', currentToken);
            localStorage.setItem('username', currentUser);
            localStorage.setItem('role', currentRole);
            showDashboard();
        } else {
            authSuccess.textContent = 'Registration successful! Wait for administrator to approve your account before logging in.';
            switchTab('login');
        }
    } catch (error) {
        authError.textContent = error.message;
    } finally {
        authSubmitBtn.disabled = false;
    }
}

function logout() {
    currentToken = null;
    currentUser = null;
    currentRole = null;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    showAuth();
}

// IP Management API Calls
async function loadIps() {
    try {
        const response = await fetch(`${API_URL}/ips`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (response.status === 401 || response.status === 403) {
            logout();
            return;
        }

        const ips = await response.json();
        allIpsCache = ips;
        currentIpResults = ips;
        currentPage = 1;
        renderIps(ips, currentPage);
    } catch (error) {
        console.error('Error loading IPs:', error);
    }
}

async function addIp(e) {
    e.preventDefault();
    const ipAddress = document.getElementById('ip-address').value.trim();
    const comment = document.getElementById('ip-comment').value.trim();
    const submitBtn = e.target.querySelector('button');

    if (!ipAddress) return;

    // Support simple IPv4 range syntax: start-end OR start - end
    if (ipAddress.includes('-')) {
        const parts = ipAddress.split('-').map(s => s.trim());
        if (parts.length === 2) {
            let start = parts[0];
            let end = parts[1];

            // If end looks like a single octet (e.g. 1-5), replace last octet of start
            if (!end.includes('.')) {
                const startParts = start.split('.');
                if (startParts.length === 4) {
                    startParts[3] = startParts[3];
                    end = `${startParts[0]}.${startParts[1]}.${startParts[2]}.${end}`;
                }
            }

            // Try to expand range (only IPv4 ranges supported here)
            try {
                const ranges = expandIpv4Range(start, end);
                if (ranges.length > 0) {
                    // Reuse import endpoint to add multiple entries
                    try {
                        const response = await fetch(`${API_URL}/ips/import`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${currentToken}`
                            },
                            body: JSON.stringify({ ips: ranges })
                        });

                        const data = await response.json();
                        if (!response.ok) throw new Error(data.message || 'Import failed');
                        document.getElementById('add-ip-form').reset();
                        await loadIps();
                        return;
                    } catch (err) {
                        addIpError.textContent = err.message;
                        return;
                    }
                }
            } catch (err) {
                // fall through to normal validation if expansion fails
            }
        }
    }

    // Frontend validation
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/;

    if (!ipv4Regex.test(ipAddress) && !ipv6Regex.test(ipAddress)) {
        addIpError.textContent = 'Please enter a valid IPv4, IPv6, or CIDR block.';
        return;
    }

    addIpError.textContent = '';
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/ips`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ ip_address: ipAddress, comment: comment })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to add IP');
        }

        document.getElementById('add-ip-form').reset();
        await loadIps();
    } catch (error) {
        addIpError.textContent = error.message;
    } finally {
        submitBtn.disabled = false;
    }
}

function extractIpsFromText(text) {
    const ipRegex = /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?|\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(?:\/(?:[0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?\b/gi;
    const matches = text.match(ipRegex) || [];
    const normalized = matches.map(match => match.trim()).filter(Boolean);
    return Array.from(new Set(normalized));
}

function ipToInt(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function intToIp(int) {
    return [(int >>> 24) & 0xFF, (int >>> 16) & 0xFF, (int >>> 8) & 0xFF, int & 0xFF].join('.');
}

function expandIpv4Range(start, end) {
    const sParts = start.split('.');
    const eParts = end.split('.');
    if (sParts.length !==4 || eParts.length !==4) throw new Error('Invalid IPv4 range');
    const sInt = ipToInt(start);
    const eInt = ipToInt(end);
    if (sInt > eInt) throw new Error('Range start greater than end');
    const out = [];
    for (let i = sInt; i <= eInt; i++) {
        out.push(intToIp(i));
        if (i - sInt > 10000) { // safety cap
            throw new Error('Range too large');
        }
    }
    return out;
}

// Bulk selection handlers
document.addEventListener('change', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('select-ip-checkbox')) {
        const anyChecked = !!document.querySelector('.select-ip-checkbox:checked');
        bulkDeleteBtn.disabled = !anyChecked;
    }
});

if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.select-ip-checkbox').forEach(cb => cb.checked = checked);
        bulkDeleteBtn.disabled = !checked;
    });
}

if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', bulkDeleteSelected);
}

async function bulkDeleteSelected() {
    const checked = Array.from(document.querySelectorAll('.select-ip-checkbox:checked'));
    if (checked.length === 0) return;
    if (!confirm(`Delete ${checked.length} selected IP(s)? This cannot be undone.`)) return;

    const ids = checked.map(cb => cb.getAttribute('data-id'));

    try {
        const response = await fetch(`${API_URL}/ips/delete-bulk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ ids })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Bulk delete failed');
        await loadIps();
    } catch (err) {
        alert(err.message);
    }
}

async function importIps(e) {
    e.preventDefault();
    importIpError.textContent = '';
    importIpSuccess.textContent = '';

    const file = importFileInput.files[0];
    if (!file) {
        importIpError.textContent = 'Please select a file to import.';
        return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
        const text = reader.result;
        const ipAddresses = extractIpsFromText(text);

        if (ipAddresses.length === 0) {
            importIpError.textContent = 'No IP addresses were detected in the selected file.';
            return;
        }

        try {
            const response = await fetch(`${API_URL}/ips/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ ips: ipAddresses })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Import failed');
            }

            importIpSuccess.textContent = data.message || `Imported ${data.imported.length} IP(s).`;
            importFileInput.value = '';
            await loadIps();
        } catch (error) {
            importIpError.textContent = error.message;
        }
    };

    reader.onerror = () => {
        importIpError.textContent = 'Unable to read the selected file.';
    };

    reader.readAsText(file);
}

async function removeIp(id) {
    if (!confirm('Are you sure you want to remove this IP?')) return;

    try {
        const response = await fetch(`${API_URL}/ips/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (response.ok) {
            await loadIps();
        } else {
            const data = await response.json();
            alert(data.message || 'Failed to delete IP');
        }
    } catch (error) {
        console.error('Error removing IP', error);
    }
}

function renderIps(ips, page = 1) {
    const totalItems = ips.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageItems = ips.slice(startIndex, startIndex + PAGE_SIZE);

    ipTableBody.innerHTML = '';

    if (pageItems.length === 0) {
        ipTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No IPs tracked yet. Be the first to add one!</td></tr>`;
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
        bulkDeleteBtn.disabled = true;
        renderPagination(totalItems);
        return;
    }

    pageItems.forEach(ip => {
        const date = new Date(ip.timestamp).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="select-ip-checkbox" data-id="${ip.id}"></td>
            <td><strong>${ip.ip_address}</strong></td>
            <td class="comment-cell">${ip.comment || '-'}</td>
            <td><span style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 6px; font-size: 0.8rem;">${ip.added_by}</span></td>
            <td style="font-size: 0.9rem; color: var(--text-secondary);">${date}</td>
            <td>
                <button class="danger-btn" onclick="removeIp('${ip.id}')">Delete</button>
            </td>
        `;
        ipTableBody.appendChild(tr);
    });

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    bulkDeleteBtn.disabled = true;

    renderPagination(totalItems);
}

// Search Logic
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allIpsCache.filter(ip => {
        const address = ip.ip_address.toLowerCase();
        const comment = (ip.comment || '').toLowerCase();
        const author = (ip.added_by || '').toLowerCase();
        return address.includes(term) || comment.includes(term) || author.includes(term);
    });
    currentIpResults = filtered;
    currentPage = 1;
    renderIps(filtered, currentPage);
});

function changePage(page) {
    const totalPages = Math.max(1, Math.ceil(currentIpResults.length / PAGE_SIZE));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    currentPage = page;
    renderIps(currentIpResults, currentPage);
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    if (totalPages <= 1) {
        paginationControls.innerHTML = '';
        return;
    }

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    paginationControls.innerHTML = `
        <div class="pagination-controls-inner">
            <button class="secondary-btn" ${prevDisabled} onclick="changePage(${currentPage - 1})">Previous</button>
            <span class="pagination-summary">Page ${currentPage} of ${totalPages}</span>
            <button class="secondary-btn" ${nextDisabled} onclick="changePage(${currentPage + 1})">Next</button>
        </div>
    `;
}

// --- Admin Features ---
async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (response.status === 401 || response.status === 403) {
            return;
        }

        const users = await response.json();
        renderUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function approveUser(id) {
    if (!confirm('Approve this user?')) return;
    try {
        const response = await fetch(`${API_URL}/admin/users/${id}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (response.ok) await loadUsers();
    } catch (error) {
        console.error('Error approving user:', error);
    }
}

async function promoteUser(id) {
    if (!confirm('Promote this user to Admin?')) return;
    try {
        const response = await fetch(`${API_URL}/admin/users/${id}/promote`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (response.ok) await loadUsers();
    } catch (error) {
        console.error('Error promoting user:', error);
    }
}

async function resetUserPassword(id) {
    const newPassword = prompt('Enter the new password for this user:');
    if (!newPassword || newPassword.trim() === '') return;

    try {
        const response = await fetch(`${API_URL}/admin/users/${id}/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword: newPassword })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
        } else {
            alert('Failed: ' + data.message);
        }
    } catch (error) {
        console.error('Error resetting password:', error);
    }
}

async function deleteAdminUser(id, username) {
    if (!confirm(`Are you sure you want to completely delete user '${username}'? This action cannot be undone.`)) return;

    try {
        const response = await fetch(`${API_URL}/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await response.json();
        if (response.ok) {
            await loadUsers();
        } else {
            alert('Failed: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting user:', error);
    }
}

function renderUsers(users) {
    userTableBody.innerHTML = '';

    if (users.length === 0) {
        userTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No users found.</td></tr>`;
        return;
    }

    users.forEach(u => {
        const isSelf = u.username === currentUser;

        let actionsHtml = '';
        if (!isSelf) {
            if (u.status === 'pending') {
                actionsHtml += `<button class="secondary-btn" style="padding: 4px 8px; margin-right: 4px;" onclick="approveUser('${u.id}')">Approve</button>`;
            }
            if (u.role === 'user' && u.status === 'active') {
                actionsHtml += `<button class="primary-btn" style="padding: 4px 8px; margin-right: 4px; width: auto;" onclick="promoteUser('${u.id}')">Make Admin</button>`;
            }
            // Always show reset password and delete for other users
            actionsHtml += `<button class="secondary-btn" style="padding: 4px 8px; margin-right: 4px;" onclick="resetUserPassword('${u.id}')">Reset PW</button>`;
            actionsHtml += `<button class="danger-btn" style="padding: 4px 8px;" onclick="deleteAdminUser('${u.id}', '${u.username}')">Delete</button>`;
        } else {
            actionsHtml = '<span style="color: var(--text-secondary); font-size: 0.8rem;">(You)</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${u.username}</strong></td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td><span class="badge badge-${u.status}">${u.status}</span></td>
            <td><div style="display:flex; flex-wrap: wrap; gap: 4px;">${actionsHtml}</div></td>
        `;
        userTableBody.appendChild(tr);
    });
}

// Start app
init();
