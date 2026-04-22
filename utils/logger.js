const fs = require('fs');
const path = require('path');

// --- Config from environment ---
const LOG_ENABLED = (process.env.LOG_ENABLED || 'false').toLowerCase() === 'true';
const LOG_LEVEL   = (process.env.LOG_LEVEL   || 'info').toLowerCase();  // info | error | debug

const LEVELS = { error: 0, info: 1, debug: 2 };
const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

const LOG_FILE = path.join(__dirname, '..', 'db', 'requests.log');

// --- Internal write helper ---
function writeLine(level, message) {
    if (!LOG_ENABLED) return;
    if ((LEVELS[level] ?? 99) > currentLevel) return;

    const line = `[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${message}\n`;

    // Always print to stdout as well
    process.stdout.write(line);

    fs.appendFile(LOG_FILE, line, (err) => {
        if (err) process.stderr.write(`[LOGGER] Failed to write log: ${err.message}\n`);
    });
}

// --- Public API ---
const logger = {
    info:  (msg) => writeLine('info',  msg),
    error: (msg) => writeLine('error', msg),
    debug: (msg) => writeLine('debug', msg),

    /**
     * Express middleware that logs every request when it finishes.
     * - info  → method, url, status, response time, client IP
     * - debug → adds request headers and body
     */
    requestMiddleware() {
        return (req, res, next) => {
            if (!LOG_ENABLED) return next();

            const startAt = Date.now();
            const clientIp = req.ip || req.socket?.remoteAddress || '-';

            res.on('finish', () => {
                const ms     = Date.now() - startAt;
                const status = res.statusCode;
                const base   = `${req.method} ${req.originalUrl} ${status} ${ms}ms — ${clientIp}`;

                if (status >= 400) {
                    // Always log errors regardless of level
                    writeLine('error', base);
                } else {
                    writeLine('info', base);
                }

                if (LOG_LEVEL === 'debug') {
                    // Read body here — after all middleware has parsed/decoded it
                    const rawBody = req.body;
                    let safeBody;
                    if (rawBody && typeof rawBody === 'object') {
                        // Mask common sensitive fields
                        const masked = { ...rawBody };
                        for (const key of ['password', 'token', 'secret', 'newPassword']) {
                            if (masked[key] !== undefined) masked[key] = '***';
                        }
                        safeBody = JSON.stringify(masked).slice(0, 512);
                    } else {
                        safeBody = String(rawBody ?? '').slice(0, 512);
                    }

                    writeLine('debug', `  headers: ${JSON.stringify(req.headers)}`);
                    writeLine('debug', `  body:    ${safeBody}`);
                }
            });

            next();
        };
    }
};

module.exports = logger;
