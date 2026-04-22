const express = require('express');
const app = express();

app.use(express.text({ type: 'application/json' }));
app.use((req, res, next) => {
    if (req.is('application/json') && typeof req.body === 'string') {
        const decoded = req.body
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
        try {
            req.body = JSON.parse(decoded);
        } catch (e) {
            return res.status(400).json({ message: 'Invalid JSON payload' });
        }
    }
    next();
});

app.post('/', (req, res) => {
    res.json({ body: req.body });
});

app.listen(3000, () => console.log('Listening on 3000'));
