const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Save an encrypted/decrypted result (base64 PNG from client)
router.post('/save', authMiddleware, (req, res) => {
  const { dataUrl, originalFilename, method, params, operation, dimensions } = req.body;
  if (!dataUrl || !method || !operation)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const id = uuidv4();
    const filename = `${id}.png`;
    const dir = path.join(__dirname, '../uploads/processed');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);

    run(`INSERT INTO image_history (id, user_id, original_filename, encrypted_filename, method, params, operation, file_size, dimensions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, originalFilename || 'image.png', filename, method, JSON.stringify(params || {}), operation, buffer.length, dimensions || '']);

    res.json({ id, filename, message: 'Saved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

// Get history
router.get('/history', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const rows = all(`SELECT id, original_filename, encrypted_filename, method, params, operation, file_size, dimensions, created_at
    FROM image_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset]);
  const totalRow = get('SELECT COUNT(*) as c FROM image_history WHERE user_id = ?', [req.user.id]);
  res.json({ images: rows, total: totalRow ? totalRow.c : 0, limit, offset });
});

// Get a specific saved image file
router.get('/file/:filename', authMiddleware, (req, res) => {
  const filename = req.params.filename;
  const record = get('SELECT * FROM image_history WHERE encrypted_filename = ? AND user_id = ?', [filename, req.user.id]);
  if (!record) return res.status(404).json({ error: 'Image not found' });
  const filepath = path.join(__dirname, '../uploads/processed', filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found on disk' });
  res.sendFile(filepath);
});

// Delete a history entry
router.delete('/history/:id', authMiddleware, (req, res) => {
  const record = get('SELECT * FROM image_history WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!record) return res.status(404).json({ error: 'Record not found' });
  if (record.encrypted_filename) {
    const filepath = path.join(__dirname, '../uploads/processed', record.encrypted_filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  run('DELETE FROM image_history WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted successfully' });
});

// Stats
router.get('/stats', authMiddleware, (req, res) => {
  const totalRow = get('SELECT COUNT(*) as c FROM image_history WHERE user_id = ?', [req.user.id]);
  const encRow = get("SELECT COUNT(*) as c FROM image_history WHERE user_id = ? AND operation = 'encrypt'", [req.user.id]);
  const decRow = get("SELECT COUNT(*) as c FROM image_history WHERE user_id = ? AND operation = 'decrypt'", [req.user.id]);
  const byMethod = all("SELECT method, COUNT(*) as count FROM image_history WHERE user_id = ? GROUP BY method", [req.user.id]);
  res.json({
    total: totalRow ? totalRow.c : 0,
    encrypted: encRow ? encRow.c : 0,
    decrypted: decRow ? decRow.c : 0,
    byMethod
  });
});

module.exports = router;
