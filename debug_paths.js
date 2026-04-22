const fs = require('fs');
const path = require('path');

const paths = [
    path.join(__dirname, 'db', 'users.txt'),
    path.join(__dirname, 'db', 'ips.txt'),
    path.join(__dirname, 'utils', 'csvDb.js'),
    path.join(__dirname, '..', 'db', 'users.txt'), // Relative to utils/
];

console.log('--- Debugging Paths ---');
console.log('Current __dirname:', __dirname);

paths.forEach(p => {
    try {
        const stats = fs.statSync(p);
        console.log(`${p}: isDirectory=${stats.isDirectory()}, isFile=${stats.isFile()}, size=${stats.size}`);
    } catch (e) {
        console.log(`${p}: Error - ${e.message}`);
    }
});
