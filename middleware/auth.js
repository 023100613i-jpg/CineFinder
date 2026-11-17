const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
    console.error('❌ Define JWT_SECRET en el .env (mínimo 16 caracteres).');
    process.exit(1);
}

const COOKIE = 'cf_token';
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

function emitirSesion(res, usuario) {
    const token = jwt.sign({ id: usuario.id }, SECRET, { expiresIn: '7d' });
    res.cookie(COOKIE, token, {
        httpOnly: true,                                   // JavaScript del navegador no puede leerla
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',    // solo HTTPS en producción
        maxAge: SIETE_DIAS
    });
}

function cerrarSesion(res) {
    res.clearCookie(COOKIE);
}

// Carga req.usuario si hay sesión válida (no obliga a estar logueado)
async function cargarUsuario(req, _res, next) {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) return next();
    try {
        const { id } = jwt.verify(token, SECRET);
        const r = await pool.query(
            'SELECT id, nombre, email, rol, activo, creado_en FROM usuarios WHERE id = $1', [id]);
        if (r.rows[0] && r.rows[0].activo) req.usuario = r.rows[0];
    } catch (_) { /* token inválido o vencido: se trata como invitado */ }
    next();
}

function requiereLogin(req, res, next) {
    if (!req.usuario) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    next();
}

function requiereAdmin(req, res, next) {
    if (!req.usuario) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Acceso solo para administradores.' });
    next();
}

module.exports = { emitirSesion, cerrarSesion, cargarUsuario, requiereLogin, requiereAdmin };
