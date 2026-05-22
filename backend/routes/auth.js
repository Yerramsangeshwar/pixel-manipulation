const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get } = require('../database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const existing = get('SELECT id FROM users WHERE email = ? OR username = ?', [email.toLowerCase(), username]);
    if (existing) return res.status(409).json({ error: 'Username or email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    // FIX: run() returns the last insert ID directly — no need for a separate getLastInsertId() call
    const userId = run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email.toLowerCase(), hashed]);
    const token = jwt.sign({ id: userId, username, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Account created successfully', token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });
  try {
    const user = get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/profile', authMiddleware, (req, res) => {
  const user = get('SELECT id, username, email, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
