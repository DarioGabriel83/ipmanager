const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'VGjyABRe8MUv28HhEZWELEU49UVcJZpcBZ6Co7P6MkppawsoTbyHoWU6Hv25csbR';

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token. Your session might have timed out after 60 minutes.' });
    }
};

const isAdminMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Administrator privileges required.' });
    }
};

module.exports = { authMiddleware, isAdminMiddleware };
