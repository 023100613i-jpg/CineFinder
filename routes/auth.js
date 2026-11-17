const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db/pool');
const { emitirSesion, cerrarSesion } = require('../middleware/auth');

const router = express.Router();
const limitador = rateLimit({
    windowMs: 15 * 60 * 1000, max: 30,
    message: { error: 'Demasiados intentos. Espera unos minutos.' },
    standardHeaders: true, legacyHeaders: false
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, creado_en: u.creado_en });

router.post('/registro', limitador, async (req, res) => {
    try {
        const nombre = String(req.body.nombre || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (nombre.length < 2 || nombre.length > 60) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 60 caracteres.' });
        if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ error: 'Correo electrónico no válido.' });
        if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' });

        const hash = await bcrypt.hash(password, 10);
        const r = await pool.query(
            `INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1,$2,$3)
             RETURNING id, nombre, email, rol, creado_en`, [nombre, email, hash]);
        emitirSesion(res, r.rows[0]);
        res.status(201).json({ usuario: publico(r.rows[0]) });
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado.' });
        console.error(e); res.status(500).json({ error: 'No se pudo crear la cuenta.' });
    }
});

router.post('/login', limitador, async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const r = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        const u = r.rows[0];
        // Mismo mensaje si no existe o la clave es incorrecta (no revela qué correos existen)
        if (!u || !(await bcrypt.compare(password, u.password_hash)))
            return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
        if (!u.activo) return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });

        await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1', [u.id]);
        emitirSesion(res, u);
        res.json({ usuario: publico(u) });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al iniciar sesión.' }); }
});

router.post('/logout', (_req, res) => { cerrarSesion(res); res.json({ ok: true }); });

// Devuelve el usuario actual o null (invitado)
router.get('/yo', (req, res) => res.json({ usuario: req.usuario ? publico(req.usuario) : null }));

module.exports = router;
