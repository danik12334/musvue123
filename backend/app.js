import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import teachersRouter from './routes/teachers.js';
import coursesRouter from './routes/courses.js';
import { login } from './api/login.js';
import { getMe } from './api/me.js';

// Конфигурация ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Роутеры
app.use('/api/teachers', teachersRouter);
app.use('/api/courses', coursesRouter);

// Auth endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }

    const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    const isAdmin = email.endsWith('@melody.ru');
    const token = jwt.sign(
      { id: result.insertId, isAdmin },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: { id: result.insertId, name, email, isAdmin }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

app.post('/api/login', login);
app.get('/api/me', getMe);

// Health check
app.get('/api/check', (req, res) => {
  res.json({ 
    status: 'API работает', 
    db: process.env.DB_NAME || 'not configured',
    timestamp: new Date().toISOString()
  });
});

// Admin routes
const checkAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ message: 'Требуется авторизация' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Недостаточно прав' });
    
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Неверный токен' });
  }
};

app.get('/api/admin-only', checkAdmin, (req, res) => {
  res.json({ message: 'Добро пожаловать, администратор!' });
});

// Статические файлы (если фронтенд собран)
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Fallback для SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`
=== Сервер запущен ===
Порт: ${PORT}
База данных: ${process.env.DB_NAME || 'not configured'}
CORS разрешен для: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}
Проверка API: http://localhost:${PORT}/api/check
`);
});