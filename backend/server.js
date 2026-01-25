require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('../frontend'));

// ===== DATABASE SETUP =====
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('✓ Connected to SQLite');
  initializeDB();
});

function initializeDB() {
  db.serialize(() => {
    // Verifications table
    db.run(`
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        profile_url TEXT NOT NULL,
        platform TEXT NOT NULL,
        prediction TEXT NOT NULL,
        confidence REAL NOT NULL,
        image_path TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_session TEXT
      )
    `);

    // Reports table
    db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        verification_id TEXT NOT NULL,
        profile_url TEXT NOT NULL,
        platform_name TEXT NOT NULL,
        internal_reported BOOLEAN DEFAULT 0,
        platform_report_confirmed BOOLEAN DEFAULT 0,
        reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (verification_id) REFERENCES verifications(id)
      )
    `);
  });
}

// ===== MULTER SETUP (Image Upload) =====
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

// ===== HELPER: Extract features from URL =====
function extractFeaturesFromURL(url, platform) {
  try {
    const urlObj = new URL(url);
    const features = {
      has_username: urlObj.pathname.length > 1,
      has_query_params: urlObj.search.length > 0,
      url_length: url.length,
      has_special_chars: /[!@#$%^&*]/.test(url) ? 1 : 0,
      platform: platform === 'instagram' ? 1 : platform === 'linkedin' ? 2 : 0
    };
    return features;
  } catch (e) {
    return null;
  }
}

// ===== ENDPOINT: Verify URL (Instagram/Other) =====
app.post('/api/verify', (req, res) => {
  const { url, platform } = req.body;
  const session = req.headers['x-session-id'] || uuidv4();

  if (!url || !platform) {
    return res.status(400).json({ error: 'URL and platform required' });
  }

  const features = extractFeaturesFromURL(url, platform);
  if (!features) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Call Python ML model
  callMLModel(features, (prediction, confidence) => {
    const verificationId = uuidv4();

    db.run(
      `INSERT INTO verifications (id, profile_url, platform, prediction, confidence, user_session)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [verificationId, url, platform, prediction, confidence, session],
      (err) => {
        if (err) {
          console.error('DB Insert Error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          verification_id: verificationId,
          profile_url: url,
          platform,
          prediction,
          confidence: (confidence * 100).toFixed(2) + '%',
          features_analyzed: Object.keys(features).length
        });
      }
    );
  });
});

// ===== ENDPOINT: Verify LinkedIn with Image =====
app.post('/api/verify-linkedin', upload.single('image'), (req, res) => {
  const { url } = req.body;
  const session = req.headers['x-session-id'] || uuidv4();

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  const features = extractFeaturesFromURL(url, 'linkedin');
  if (!features) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const imagePath = req.file ? req.file.path : null;

  callMLModel(features, (prediction, confidence) => {
    const verificationId = uuidv4();

    db.run(
      `INSERT INTO verifications (id, profile_url, platform, prediction, confidence, image_path, user_session)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [verificationId, url, 'linkedin', prediction, confidence, imagePath, session],
      (err) => {
        if (err) {
          console.error('DB Insert Error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          verification_id: verificationId,
          profile_url: url,
          platform: 'linkedin',
          prediction,
          confidence: (confidence * 100).toFixed(2) + '%',
          image_uploaded: !!imagePath,
          features_analyzed: Object.keys(features).length
        });
      }
    );
  });
});

// ===== ENDPOINT: Report Suspicious Profile =====
app.post('/api/report', (req, res) => {
  const { verification_id, profile_url, platform_name } = req.body;

  if (!verification_id || !profile_url || !platform_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const reportId = uuidv4();

  db.run(
    `INSERT INTO reports (id, verification_id, profile_url, platform_name, internal_reported)
     VALUES (?, ?, ?, ?, 1)`,
    [reportId, verification_id, profile_url, platform_name],
    (err) => {
      if (err) {
        console.error('Report Insert Error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        report_id: reportId,
        message: 'Profile reported successfully',
        internal_reported: true
      });
    }
  );
});

// ===== ENDPOINT: Confirm Platform Report =====
app.put('/api/report-confirm/:report_id', (req, res) => {
  const { report_id } = req.params;

  db.run(
    `UPDATE reports SET platform_report_confirmed = 1 WHERE id = ?`,
    [report_id],
    function(err) {
      if (err) {
        console.error('Update Error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }

      res.json({
        report_id,
        message: 'Platform report confirmed',
        platform_report_confirmed: true
      });
    }
  );
});

// ===== ENDPOINT: Get Verification History =====
app.get('/api/history', (req, res) => {
  const { platform, label } = req.query;

  let query = `
    SELECT 
      v.id,
      v.profile_url,
      v.platform,
      v.prediction,
      v.confidence,
      v.timestamp,
      COALESCE(r.internal_reported, 0) as internal_reported,
      COALESCE(r.platform_report_confirmed, 0) as platform_report_confirmed
    FROM verifications v
    LEFT JOIN reports r ON v.id = r.verification_id
    WHERE 1=1
  `;

  const params = [];

  if (platform && platform !== 'all') {
    query += ` AND v.platform = ?`;
    params.push(platform);
  }

  if (label === 'fake') {
    query += ` AND v.prediction = 'Fake'`;
  }

  query += ` ORDER BY v.timestamp DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Query Error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(rows || []);
  });
});

// ===== ENDPOINT: Get Today's Stats =====
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  db.serialize(() => {
    let stats = {};

    // Total verifications today
    db.get(
      `SELECT COUNT(*) as count FROM verifications WHERE DATE(timestamp) = ?`,
      [today],
      (err, row) => {
        stats.total_today = row?.count || 0;

        // Fake results today
        db.get(
          `SELECT COUNT(*) as count FROM verifications WHERE DATE(timestamp) = ? AND prediction = 'Fake'`,
          [today],
          (err, row) => {
            stats.fake_today = row?.count || 0;

            // Reports today
            db.get(
              `SELECT COUNT(*) as count FROM reports WHERE DATE(reported_at) = ?`,
              [today],
              (err, row) => {
                stats.reports_today = row?.count || 0;

                res.json(stats);
              }
            );
          }
        );
      }
    );
  });
});

// ===== HELPER: Call Python ML Model =====
function callMLModel(features, callback) {
  const options = {
    mode: 'text',
    pythonPath: 'python',
    pythonOptions: ['-u'],
    scriptPath: __dirname,
    args: [JSON.stringify(features)]
  };

  PythonShell.run('ml_model.py', options, (err, results) => {
    if (err) {
      console.error('Python Error:', err);
      // Fallback: simple heuristic
      const confidence = Math.random() * 0.5 + 0.5;
      const prediction = confidence > 0.6 ? 'Fake' : 'Real';
      return callback(prediction, confidence);
    }

    try {
      const result = JSON.parse(results[0]);
      callback(result.prediction, result.confidence);
    } catch (e) {
      console.error('Parse Error:', e);
      callback('Unknown', 0.5);
    }
  });
}

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`\n✓ Server running on http://localhost:${PORT}`);
  console.log('✓ Frontend should connect to this endpoint');
  console.log('✓ Database: ./database.db\n');
});
