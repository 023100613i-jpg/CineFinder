const express = require('express');
const { pool } = require('../db/pool');
const tmdb = require('../services/tmdb');
const { requiereAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereAdmin);

const idValido = (v) => /^\d{1,9}$/.test(String(v));

router.get('/estadisticas', async (_req, res) => {
    const [tot, topFav, topRes, animos, recientes] = await Promise.all([
        pool.query(`SELECT (SELECT COUNT(*)::int FROM usuarios) AS usuarios,
                           (SELECT COUNT(*)::int FROM usuarios WHERE activo) AS usuarios_activos,
                           (SELECT COUNT(*)::int FROM resenas) AS resenas,
                           (SELECT COUNT(*)::int FROM favoritos) AS favoritos,
                           (SELECT COUNT(*)::int FROM pendientes) AS pendientes,
                           (SELECT COUNT(*)::int FROM historial_animo) AS consultas_animo,
                           (SELECT COUNT(*)::int FROM peliculas) AS peliculas`),
        pool.query(`SELECT p.titulo, COUNT(*)::int AS total FROM favoritos f JOIN peliculas p ON p.tmdb_id=f.tmdb_id
                    GROUP BY p.titulo ORDER BY total DESC, p.titulo LIMIT 5`),
        pool.query(`SELECT p.titulo, ROUND(AVG(r.puntuacion)::numeric,1) AS promedio, COUNT(*)::int AS total
                    FROM resenas r JOIN peliculas p ON p.tmdb_id=r.tmdb_id WHERE r.visible
                    GROUP BY p.titulo ORDER BY promedio DESC, total DESC LIMIT 5`),
        pool.query(`SELECT animo, COUNT(*)::int AS total FROM historial_animo GROUP BY animo ORDER BY total DESC LIMIT 5`),
        pool.query(`SELECT id, nombre, email, rol, creado_en FROM usuarios ORDER BY creado_en DESC LIMIT 5`)
    ]);
    res.json({ totales: tot.rows[0], masFavoritas: topFav.rows, mejorValoradas: topRes.rows, animos: animos.rows, usuariosRecientes: recientes.rows });
});

// ---- Usuarios ----
router.get('/usuarios', async (req, res) => {
    const q = `%${String(req.query.q || '').trim().slice(0, 60)}%`;
    const r = await pool.query(
        `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.creado_en, u.ultimo_acceso,
                (SELECT COUNT(*)::int FROM favoritos f WHERE f.usuario_id=u.id) AS favoritos,
                (SELECT COUNT(*)::int FROM resenas   r WHERE r.usuario_id=u.id) AS resenas
         FROM usuarios u WHERE u.nombre ILIKE $1 OR u.email ILIKE $1 ORDER BY u.creado_en DESC LIMIT 200`, [q]);
    res.json(r.rows);
});

router.patch('/usuarios/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(400).json({ error: 'No puedes modificar tu propia cuenta desde aquí.' });
    const campos = [], vals = [];
    if (req.body.rol !== undefined) {
        if (!['usuario', 'admin'].includes(req.body.rol)) return res.status(400).json({ error: 'Rol no válido.' });
        vals.push(req.body.rol); campos.push(`rol=$${vals.length}`);
    }
    if (req.body.activo !== undefined) { vals.push(!!req.body.activo); campos.push(`activo=$${vals.length}`); }
    if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar.' });
    vals.push(id);
    const r = await pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id=$${vals.length} RETURNING id`, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ ok: true });
});

router.delete('/usuarios/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    await pool.query('DELETE FROM usuarios WHERE id=$1', [id]);
    res.json({ ok: true });
});

// ---- Reseñas (moderación) ----
router.get('/resenas', async (_req, res) => {
    const r = await pool.query(
        `SELECT r.id, u.nombre, u.email, p.titulo, r.puntuacion, r.comentario, r.visible, r.creado_en
         FROM resenas r JOIN usuarios u ON u.id=r.usuario_id JOIN peliculas p ON p.tmdb_id=r.tmdb_id
         ORDER BY r.creado_en DESC LIMIT 200`);
    res.json(r.rows);
});

router.patch('/resenas/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    await pool.query('UPDATE resenas SET visible=$1 WHERE id=$2', [!!req.body.visible, Number(req.params.id)]);
    res.json({ ok: true });
});

router.delete('/resenas/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    await pool.query('DELETE FROM resenas WHERE id=$1', [Number(req.params.id)]);
    res.json({ ok: true });
});

// ---- Destacadas ----
router.get('/destacadas', async (_req, res) => {
    const r = await pool.query(
        `SELECT p.tmdb_id AS id, p.titulo, p.anio, p.imagen FROM destacadas d
         JOIN peliculas p ON p.tmdb_id=d.tmdb_id ORDER BY d.creado_en DESC`);
    res.json(r.rows);
});

router.post('/destacadas/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    try {
        const id = Number(req.params.id);
        await tmdb.asegurarPelicula(id);
        await pool.query('INSERT INTO destacadas (tmdb_id, agregado_por) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.usuario.id]);
        res.status(201).json({ ok: true });
    } catch (e) { res.status(404).json({ error: 'No se encontró esa película en TMDB.' }); }
});

router.delete('/destacadas/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    await pool.query('DELETE FROM destacadas WHERE tmdb_id=$1', [Number(req.params.id)]);
    res.json({ ok: true });
});

module.exports = router;
