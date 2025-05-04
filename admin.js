function isAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ error: 'Admin access required' });
}


app.get('/admin/users', authenticateToken, isAdmin, (req, res) => {
    pool.query('SELECT id, email, name, role FROM users', (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(result);
    });
});


app.get('/admin/products', authenticateToken, isAdmin, (req, res) => {
    pool.query('SELECT * FROM list', (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(result);
    });
});


app.delete('/admin/users/:id', authenticateToken, isAdmin, (req, res) => {
    const userId = req.params.id;
    pool.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'User deleted' });
    });
});


app.delete('/admin/products/:id', authenticateToken, isAdmin, (req, res) => {
    const productId = req.params.id;
    pool.query('DELETE FROM list WHERE id = ?', [productId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Product deleted' });
    });
});


app.get('/admin/profile', authenticateToken, isAdmin, (req, res) => {
    const user_id = req.user.id;
    pool.query('SELECT id, email, name, role FROM users WHERE id = ?', [user_id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.length === 0) return res.status(404).json({ message: 'User not found' });
        res.json(result[0]);
    });
});
