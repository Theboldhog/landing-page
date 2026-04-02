const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'registrations.json');

// Admin token — set ADMIN_TOKEN env variable in production
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';

// Gzip/Brotli compression
app.use(compression());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none';"
  );
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

// Limit payload size to 10kb
app.use(express.json({ limit: '10kb' }));

// Static files with cache headers (1 week for assets)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // Never cache HTML — always fresh
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Rate limit: max 5 registrations per IP per 15 minutes
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const FIELD_LIMITS = { name: 100, email: 254, phone: 30, message: 1000 };

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[+\d\s\-().]{0,30}$/;

// In-memory cache — loaded once at startup, no blocking I/O on each request
let registrationsCache = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    registrationsCache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    registrationsCache = [];
  }
}

function loadRegistrations() {
  return registrationsCache;
}

function saveRegistrations(data) {
  registrationsCache = data;
  fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), (err) => {
    if (err) console.error('Failed to persist registrations:', err);
  });
}

function sanitize(str) {
  return String(str).trim().replace(/[\x00-\x1F\x7F]/g, '');
}

// POST /register
app.post('/register', registerLimiter, (req, res) => {
  let { name, email, phone, message } = req.body;

  // Type check — reject non-strings
  if (typeof name !== 'string' || typeof email !== 'string') {
    return res.status(400).json({ error: 'Données invalides.' });
  }

  name = sanitize(name);
  email = sanitize(email).toLowerCase();
  phone = phone ? sanitize(String(phone)) : '';
  message = message ? sanitize(String(message)) : '';

  if (!name || !email) {
    return res.status(400).json({ error: 'Le nom et l\'e-mail sont obligatoires.' });
  }

  // Length limits
  if (name.length > FIELD_LIMITS.name)
    return res.status(400).json({ error: `Le nom ne doit pas dépasser ${FIELD_LIMITS.name} caractères.` });
  if (email.length > FIELD_LIMITS.email)
    return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  if (phone.length > FIELD_LIMITS.phone)
    return res.status(400).json({ error: `Le téléphone ne doit pas dépasser ${FIELD_LIMITS.phone} caractères.` });
  if (message.length > FIELD_LIMITS.message)
    return res.status(400).json({ error: `Le message ne doit pas dépasser ${FIELD_LIMITS.message} caractères.` });

  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Adresse e-mail invalide.' });

  if (phone && !phoneRegex.test(phone))
    return res.status(400).json({ error: 'Numéro de téléphone invalide.' });

  const registrations = loadRegistrations();

  if (registrations.some(r => r.email === email)) {
    return res.status(409).json({ error: 'Cet e-mail est déjà inscrit.' });
  }

  const entry = {
    id: Date.now().toString(),
    name,
    email,
    phone,
    message,
    registeredAt: new Date().toISOString(),
  };

  registrations.push(entry);
  saveRegistrations(registrations);

  console.log(`New registration: ${entry.name} <${entry.email}>`);
  res.status(201).json({ success: true, message: 'Registration successful!' });
});

// GET /admin/registrations — protected by token
app.get('/admin/registrations', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }
  const registrations = loadRegistrations();
  res.json({ count: registrations.length, registrations });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (ADMIN_TOKEN === 'changeme') {
    console.warn('⚠️  ADMIN_TOKEN is set to default "changeme" — set a strong token via env variable in production.');
  }
});
