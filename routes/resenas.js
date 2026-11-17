const express = require('express');
const { pool } = require('../db/pool');
const tmdb = require('../services/tmdb');
const { requiereLogin } = require('../middleware/auth');

const router = express.Router();
const idValido = (v) => /^\d{1,9}$/.test(v);

// Reseñas visibles de una película
router.get('/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const r = await pool.query(
        `SELECT r.id, u.nombre, r.puntuacion, r.comentario, r.creado_en, r.usuario_id
         FROM resenas r JOIN usuarios u ON u.id = r.usuario_id
         WHERE r.tmdb_id=$1 AND r.visible ORDER BY r.actualizado_en DESC LIMIT 50`, [Number(req.params.id)]);
    res.json(r.rows);
});

// Crear o editar mi reseña (una por película)
router.post('/:id', requiereLogin, async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const id = Number(req.params.id);
    const puntuacion = parseInt(req.body.puntuacion, 10);
    const comentario = String(req.body.comentario || '').trim();
    if (!(puntuacion >= 1 && puntuacion <= 5)) return res.status(400).json({ error: 'La puntuación debe ser de 1 a 5.' });
    if (comentario.length > 1000) return res.status(400).json({ error: 'El comentario no puede superar 1000 caracteres.' });
    try {
        await tmdb.asegurarPelicula(id);
        await pool.query(
            `INSERT INTO resenas (usuario_id, tmdb_id, puntuacion, comentario) VALUES ($1,$2,$3,$4)
             ON CONFLICT (usuario_id, tmdb_id)
             DO UPDATE SET puntuacion=$3, comentario=$4, actualizado_en=NOW()`,
            [req.usuario.id, id, puntuacion, comentario]);
        res.status(201).json({ ok: true });
    } catch (e) { console.error(e.message); res.status(500).json({ error: 'No se pudo guardar la reseña.' }); }
});

router.delete('/:id', requiereLogin, async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    await pool.query('DELETE FROM resenas WHERE usuario_id=$1 AND tmdb_id=$2', [req.usuario.id, Number(req.params.id)]);
    res.json({ ok: true });
});

module.exports = router;
