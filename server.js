const express = require('express');
const cors = require('cors');
const { readUsers, writeUser, updateUser, deleteUser, readIps, writeIp, deleteIp } = require('./utils/csvDb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authMiddleware, isAdminMiddleware } = require('./middleware/auth');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3210;
const SECRET_KEY = process.env.JWT_SECRET || 'VGjyABRe8MUv28HhEZWELEU49UVcJZpcBZ6Co7P6MkppawsoTbyHoWU6Hv25csbR';

app.set('trust proxy', 1); // Proxy trust for IP rate limiting
app.use(cors());

// Request logging — controlled by LOG_ENABLED and LOG_LEVEL env vars
app.use(logger.requestMiddleware());

// Parse JSON and support HTML-decoded JSON payload
app.use(express.text({ type: 'application/json' }));
app.use((req, res, next) => {
    if (req.is('application/json') && typeof req.body === 'string') {
        try {
            const raw = req.body;
            // Handle URL-encoded form data (e.g. "username=dario&password=Dario83%21")
            if (/^[\w%+.-]+=/.test(raw) && !raw.trimStart().startsWith('{')) {
                const params = new URLSearchParams(raw);
                req.body = Object.fromEntries(params.entries());
            } else {
                // Decode HTML entities then parse as JSON
                const decoded = raw
                    .replace(/&quot;/g, '"')
                    .replace(/&#34;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#39;/g, "'");
                req.body = JSON.parse(decoded);
            }
        } catch (e) {
            return res.status(400).json({ message: 'Invalid JSON payload' });
        }
    }
    next();
});

// Set Referrer-Policy to avoid browser "strict-origin-when-cross-origin" opaque errors
app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    next();
});

app.use(express.static('public'));

// Helpers
const isValidIp = (ip) => {
    // Regex matches IPv4 or IPv6, optionally followed by / and a valid CIDR subnet mask
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

// --- Rate Limiting (Brute-Force & Password Spray Protection) ---
const failedLoginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 60 * 60 * 1000; // 1 hora

const checkRateLimit = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const record = failedLoginAttempts.get(ip);

    if (record && record.lockUntil && record.lockUntil > Date.now()) {
        const remainingMinutes = Math.ceil((record.lockUntil - Date.now()) / 60000);
        return res.status(429).json({ message: `IP address temporarily blocked due to multiple failed attempts. Please try again in ${remainingMinutes} minutes.` });
    }
    next();
};

const handleFailedLogin = (ip) => {
    let record = failedLoginAttempts.get(ip) || { attempts: 0, lockUntil: null, lockLevel: 0 };
    
    // Si el bloqueo anterior expiró, se limpia la cantidad de intentos
    // pero se mantiene el nivel de bloqueo (lockLevel) para poder aplicar 
    // el retroceso exponencial si la persona insiste.
    if (record.lockUntil && record.lockUntil < Date.now()) {
        record.attempts = 0;
        record.lockUntil = null;
    }

    record.attempts += 1;

    if (record.attempts >= MAX_ATTEMPTS) {
        record.lockLevel += 1;
        // Incremento exponencial basado en el histórico de bloqueos previos: 1h, 2h, 4h, 8h...
        const blockDuration = BASE_LOCKOUT_MS * Math.pow(2, record.lockLevel - 1);
        record.lockUntil = Date.now() + blockDuration;
        record.attempts = 0; // Se reinicia para la ventana actual
    }

    failedLoginAttempts.set(ip, record);
};

const clearFailedLogin = (ip) => {
    // Cuando el usuario ingresa correctamente la contraseña, se remueve todo su historial de bloqueos
    failedLoginAttempts.delete(ip);
};

// --- Authentication UI/API ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

    try {
        const users = await readUsers();
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // If it's the first user ever, make them an active admin
        const isFirstUser = users.length === 0;

        const newUser = {
            id: Date.now().toString(),
            username,
            password_hash: hashedPassword,
            role: isFirstUser ? 'admin' : 'user',
            status: isFirstUser ? 'active' : 'pending'
        };

        await writeUser(newUser);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error });
    }
});

app.post('/api/login', checkRateLimit, async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

    try {
        const users = await readUsers();
        const user = users.find(u => u.username === username);
        if (!user) {
            handleFailedLogin(ip);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ message: 'Account pending administrator approval' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            handleFailedLogin(ip);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        clearFailedLogin(ip);

        const token = jwt.sign({
            id: user.id,
            username: user.username,
            role: user.role
        }, SECRET_KEY, { expiresIn: '60m' });

        res.json({ token, username: user.username, role: user.role });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error });
    }
});

// --- IPs API (Protected) ---
app.get('/api/ips', authMiddleware, async (req, res) => {
    try {
        const ips = await readIps();
        res.json(ips);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching IPs' });
    }
});

app.post('/api/ips', authMiddleware, async (req, res) => {
    const { ip_address, comment } = req.body;
    if (!ip_address) return res.status(400).json({ message: 'IP Address is required' });

    if (!isValidIp(ip_address)) {
        return res.status(400).json({ message: 'Invalid IP address format. Only IPv4, IPv6, or valid CIDR notations are allowed.' });
    }

    try {
        const existingIps = await readIps();
        if (existingIps.find(entry => entry.ip_address === ip_address)) {
            return res.status(409).json({ message: `The IP ${ip_address} has already been added previously.` });
        }

        const newIp = {
            id: Date.now().toString(),
            ip_address,
            comment: comment || '',
            added_by: req.user.username,
            timestamp: new Date().toISOString()
        };

        await writeIp(newIp);
        res.status(201).json({ message: 'IP added successfully', ip: newIp });
    } catch (error) {
        res.status(500).json({ message: 'Error adding IP' });
    }
});

app.delete('/api/ips/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const success = await deleteIp(id);
        if (success) {
            res.json({ message: 'IP record removed successfully' });
        } else {
            res.status(404).json({ message: 'IP not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error removing IP' });
    }
});

// --- Public APIs ---
app.get('/api/public/ips', async (req, res) => {
    try {
        const path = require('path');
        const fs = require('fs');
        const ipsFile = path.join(__dirname, 'db', 'ips.txt');

        if (fs.existsSync(ipsFile)) {
            // res.setHeader('Content-Type', 'text/csv');
            // res.setHeader('Content-Disposition', 'attachment; filename="ips.csv"');
            const fileStream = fs.createReadStream(ipsFile);
            fileStream.pipe(res);
        } else {
            res.status(404).send('No IPs database found');
        }
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving CSV' });
    }
});

// --- Admin API ---
app.get('/api/admin/users', authMiddleware, isAdminMiddleware, async (req, res) => {
    try {
        const users = await readUsers();
        const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role, status: u.status }));
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

app.post('/api/admin/users/:id/approve', authMiddleware, isAdminMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const success = await updateUser(id, { status: 'active' });
        if (success) res.json({ message: 'User approved' });
        else res.status(404).json({ message: 'User not found' });
    } catch (error) {
        res.status(500).json({ message: 'Error approving user' });
    }
});

app.post('/api/admin/users/:id/promote', authMiddleware, isAdminMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const success = await updateUser(id, { role: 'admin' });
        if (success) res.json({ message: 'User promoted to Admin' });
        else res.status(404).json({ message: 'User not found' });
    } catch (error) {
        res.status(500).json({ message: 'Error promoting user' });
    }
});

app.post('/api/admin/users/:id/reset-password', authMiddleware, isAdminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: 'New password is required' });

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const success = await updateUser(id, { password_hash: hashedPassword });
        if (success) res.json({ message: 'Password reset successfully' });
        else res.status(404).json({ message: 'User not found' });
    } catch (error) {
        res.status(500).json({ message: 'Error resetting password' });
    }
});

app.delete('/api/admin/users/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        // Optional: Prevent deleting self
        if (req.user.id === id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const success = await deleteUser(id);
        if (success) res.json({ message: 'User deleted successfully' });
        else res.status(404).json({ message: 'User not found' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
