const express = require('express');
const multer = require('multer');
const { classifyWasteImage } = require('../services/wasteImageClassifier');
const { detectImageType } = require('../services/imageType');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const router = express.Router();

router.post('/api/waste-reports/classify', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'กรุณาแนบรูปภาพ (field name: image)' });
  }

  const mediaType = detectImageType(req.file.buffer);
  if (!mediaType) {
    return res.status(400).json({ error: 'ชนิดไฟล์ไม่รองรับ อนุญาตเฉพาะ .jpg, .jpeg, .png, .webp เท่านั้น' });
  }

  const result = await classifyWasteImage(req.file.buffer, mediaType);
  res.json(result);
});

// Multer errors (e.g. file too large) surface via next(err) — handle here.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'ขนาดไฟล์เกิน 5MB' });
  }
  next(err);
});

module.exports = router;
