const fs = require('fs').promises;
const path = require('path');

const usersFile = path.join(__dirname, '..', 'db', 'users.txt');
const ipsFile = path.join(__dirname, '..', 'db', 'ips.txt');

// Helper to ensure files exist and are not empty
async function ensureFileExists(filepath, header) {
    try {
        const stats = await fs.stat(filepath);
        if (stats.size === 0) {
            await fs.writeFile(filepath, header + '\n');
        }
    } catch (error) {
        await fs.writeFile(filepath, header + '\n');
    }
}

async function initDb() {
    await ensureFileExists(usersFile, 'id,username,password_hash,role,status');
    await ensureFileExists(ipsFile, 'id,ip_address,comment,added_by,timestamp');
}

// Ensure DB is initialized
initDb();

function parseCSV(content, parseRow) {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).filter(line => line.trim().length > 0).map(line => {
        const values = line.split(',');
        return parseRow(headers, values);
    });
}

// -- Users --
async function readUsers() {
    await initDb();
    const content = await fs.readFile(usersFile, 'utf8');
    return parseCSV(content, (headers, values) => ({
        id: values[0],
        username: values[1],
        password_hash: values[2],
        role: values[3] || 'user',
        status: values[4] || 'pending'
    }));
}

async function writeUser(user) {
    await initDb();
    const line = `${user.id},${user.username},${user.password_hash},${user.role},${user.status}\n`;
    await fs.appendFile(usersFile, line);
}

async function updateUser(id, partialUpdates) {
    const users = await readUsers();
    let updated = false;

    const newUsers = users.map(u => {
        if (u.id === id) {
            updated = true;
            return { ...u, ...partialUpdates };
        }
        return u;
    });

    if (updated) {
        const header = 'id,username,password_hash,role,status\n';
        const content = newUsers.map(u => `${u.id},${u.username},${u.password_hash},${u.role},${u.status}`).join('\n') + '\n';
        await fs.writeFile(usersFile, header + content);
    }
    return updated;
}

async function deleteUser(id) {
    await initDb();
    const content = await fs.readFile(usersFile, 'utf8');
    const lines = content.trim().split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1);

    const filteredLines = dataLines.filter(line => {
        if (!line.trim()) return false;
        const lineId = line.split(',')[0];
        return lineId !== id;
    });

    if (filteredLines.length === dataLines.length && dataLines.filter(l => l.trim()).length > 0) {
        return false; // not found
    }

    const newContent = [header, ...filteredLines].join('\n') + '\n';
    await fs.writeFile(usersFile, newContent);
    return true;
}

// -- IPs --
async function readIps() {
    await initDb();
    const content = await fs.readFile(ipsFile, 'utf8');
    return parseCSV(content, (headers, values) => ({
        id: values[0],
        ip_address: values[1],
        comment: values[2] ? decodeURIComponent(values[2]) : '',
        added_by: values[3],
        timestamp: values[4]
    }));
}

async function writeIp(ipData) {
    await initDb();
    // Encodes comment to prevent CSV breakages if there are commas
    const encodedComment = ipData.comment ? encodeURIComponent(ipData.comment) : '';
    const line = `${ipData.id},${ipData.ip_address},${encodedComment},${ipData.added_by},${ipData.timestamp}\n`;
    await fs.appendFile(ipsFile, line);
}

async function deleteIp(id) {
    await initDb();
    const content = await fs.readFile(ipsFile, 'utf8');
    const lines = content.trim().split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1);

    const filteredLines = dataLines.filter(line => {
        if (!line.trim()) return false;
        const lineId = line.split(',')[0];
        return lineId !== id;
    });

    if (filteredLines.length === dataLines.length && dataLines.filter(l => l.trim()).length > 0) {
        return false; // not found
    }

    const newContent = [header, ...filteredLines].join('\n') + '\n';
    await fs.writeFile(ipsFile, newContent);
    return true;
}

module.exports = {
    readUsers,
    writeUser,
    updateUser,
    deleteUser,
    readIps,
    writeIp,
    deleteIp
};
