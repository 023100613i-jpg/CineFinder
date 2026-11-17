const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const tmdb = require('../services/tmdb');
const { requiereLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereLogin);

const idValido = (v) => /^\d{1,9}$/.test(v);
const COLS = `p.tmdb_id AS id, p.titulo, p.anio, p.imagen, p.backdrop, COALESCE(p.calificacion::text,'N/A') AS calificacion`;

// Ids de favoritos y pendientes (para pintar los corazones)
router.get('/listas', async (req, res) => {
    const [f, p] = await Promise.all([
        pool.query('SELECT tmdb_id FROM favoritos  WHERE usuario_id=$1', [req.usuario.id]),
        pool.query('SELECT tmdb_id FROM pendientes WHERE usuario_id=$1', [req.usuario.id])
    ]);
    res.json({ favoritos: f.rows.map(r => r.tmdb_id), pendientes: p.rows.map(r => r.tmdb_id) });
});

// Un mismo código para las dos listas (favoritos y pendientes)
for (const tabla of ['favoritos', 'pendientes']) {
    router.get(`/${tabla}`, async (req, res) => {
        const r = await pool.query(
            `SELECT ${COLS} FROM ${tabla} t JOIN peliculas p ON p.tmdb_id = t.tmdb_id
             WHERE t.usuario_id=$1 ORDER BY t.creado_en DESC`, [req.usuario.id]);
        res.json(r.rows);
    });

    router.post(`/${tabla}/:id`, async (req, res) => {
        if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
        const id = Number(req.params.id);
        try {
            await tmdb.asegurarPelicula(id);
            await pool.query(
                `INSERT INTO ${tabla} (usuario_id, tmdb_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.usuario.id, id]);
            res.status(201).json({ ok: true });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'No se pudo guardar.' }); }
    });

    router.delete(`/${tabla}/:id`, async (req, res) => {
        if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
        await pool.query(`DELETE FROM ${tabla} WHERE usuario_id=$1 AND tmdb_id=$2`, [req.usuario.id, Number(req.params.id)]);
        res.json({ ok: true });
    });
}

// Perfil: datos + estadísticas + mis reseñas
router.get('/perfil', async (req, res) => {
    const [s, rs] = await Promise.all([
        pool.query(`SELECT (SELECT COUNT(*)::int FROM favoritos  WHERE usuario_id=$1) AS favoritos,
                           (SELECT COUNT(*)::int FROM pendientes WHERE usuario_id=$1) AS pendientes,
                           (SELECT COUNT(*)::int FROM resenas    WHERE usuario_id=$1) AS resenas`, [req.usuario.id]),
        pool.query(`SELECT r.tmdb_id AS id, p.titulo, p.imagen, r.puntuacion, r.comentario, r.visible, r.actualizado_en
                    FROM resenas r JOIN peliculas p ON p.tmdb_id = r.tmdb_id
                    WHERE r.usuario_id=$1 ORDER BY r.actualizado_en DESC`, [req.usuario.id])
    ]);
    res.json({ usuario: req.usuario, estadisticas: s.rows[0], resenas: rs.rows });
});

router.put('/perfil', async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    if (nombre.length < 2 || nombre.length > 60) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 60 caracteres.' });
    await pool.query('UPDATE usuarios SET nombre=$1 WHERE id=$2', [nombre, req.usuario.id]);
    res.json({ ok: true, nombre });
});

router.put('/password', async (req, res) => {
    const actual = String(req.body.actual || ''), nueva = String(req.body.nueva || '');
    if (nueva.length < 8 || nueva.length > 72) return res.status(400).json({ error: 'La nueva contraseña debe tener entre 8 y 72 caracteres.' });
    const r = await pool.query('SELECT password_hash FROM usuarios WHERE id=$1', [req.usuario.id]);
    if (!(await bcrypt.compare(actual, r.rows[0].password_hash))) return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
    await pool.query('UPDATE usuarios SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(nueva, 10), req.usuario.id]);
    res.json({ ok: true });
});

module.exports = router;
