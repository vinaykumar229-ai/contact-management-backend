const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
`);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      timezone TEXT NOT NULL
    )
  `);
});

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, password], function(err) {
    if (err) {
      return res.status(400).json({ message: 'User already exists.' });
    }
    res.json({ message: 'User registered successfully.' });
  });});
  
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password], (err, row) => {
    if (err || !row) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const token = jwt.sign({ id: row.id }, 'vinay');
    res.json({ token });
  });
});

const authenticateJWT = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if (token) {
    jwt.verify(token, 'vinay', (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

app.get('/api/contacts', authenticateJWT, (req, res) => {
  db.all(`SELECT * FROM contacts`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to fetch contacts.' });
    }
    res.json(rows);
  });
});

app.post('/api/contacts', authenticateJWT, (req, res) => {
  const { name, email, phone, address, timezone } = req.body;
  db.run(`INSERT INTO contacts (name, email, phone, address, timezone) VALUES (?, ?, ?, ?, ?)`, 
    [name, email, phone, address, timezone], 
    function(err) {
      if (err) {
        return res.status(400).json({ message: 'Error adding contact.' });
      }
      res.json({ message: 'Contact added successfully.' });
    });
});

const upload = multer({ dest: 'uploads/' });

app.post('/api/upload/csv', [authenticateJWT, upload.single('file')], (req, res) => {
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      const insertPromises = results.map(contact => {
        return new Promise((resolve, reject) => {
          db.run(`INSERT INTO contacts (name, email, phone, address, timezone) VALUES (?, ?, ?, ?, ?)`, 
            [contact.name, contact.email, contact.phone, contact.address, contact.timezone], 
            function(err) {
              if (err) reject(err);
              else resolve();
            });
        });
      });
      Promise.all(insertPromises)
        .then(() => {
          fs.unlinkSync(req.file.path);
          res.json({ message: 'Contacts uploaded successfully.' });
        })
        .catch(err => {
          res.status(500).json({ message: 'Error uploading contacts.' });
        });
    });
});
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
