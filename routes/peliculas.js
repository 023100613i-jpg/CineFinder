const express = require('express');
const { pool } = require('../db/pool');
const tmdb = require('../services/tmdb');
const omdb = require('../services/omdb');
const groq = require('../services/groq');
const { requiereLogin } = require('../middleware/auth');

const router = express.Router();
const idValido = (v) => /^\d{1,9}$/.test(v);

router.get('/buscar', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.json([]);
    try { res.json(await tmdb.buscar(q)); }
    catch (e) { res.status(500).json({ error: 'Error al buscar' }); }
});

router.get('/seccion/:tipo', async (req, res) => {
    const genero = /^\d{1,6}$/.test(req.query.genero || '') ? req.query.genero : '';
    try { res.json(await tmdb.seccion(req.params.tipo, genero)); }
    catch (e) { res.status(500).json({ error: 'Error al cargar sección' }); }
});

router.get('/aleatoria', async (_req, res) => {
    try { res.json({ id: await tmdb.aleatoriaId() }); }
    catch (e) { res.status(500).json({ error: 'Error' }); }
});

// Películas destacadas por el administrador
router.get('/destacadas', async (_req, res) => {
    const r = await pool.query(
        `SELECT p.tmdb_id AS id, p.titulo, p.anio, p.imagen, p.backdrop, COALESCE(p.calificacion::text,'N/A') AS calificacion
         FROM destacadas d JOIN peliculas p ON p.tmdb_id = d.tmdb_id ORDER BY d.creado_en DESC LIMIT 20`);
    res.json(r.rows);
});

// Recomendadas para ti: se basan en tus últimos favoritos
router.get('/recomendadas', requiereLogin, async (req, res) => {
    try {
        const favs = await pool.query(
            'SELECT tmdb_id FROM favoritos WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 4', [req.usuario.id]);
        if (!favs.rows.length) return res.json([]);

        const excluir = await pool.query(
            `SELECT tmdb_id FROM favoritos WHERE usuario_id=$1 UNION SELECT tmdb_id FROM pendientes WHERE usuario_id=$1`, [req.usuario.id]);
        const yaTiene = new Set(excluir.rows.map(r => r.tmdb_id));

        const listas = await Promise.all(favs.rows.map(f => tmdb.recomendaciones(f.tmdb_id).catch(() => [])));
        const vistos = new Set(), salida = [];
        const maxLen = Math.max(...listas.map(l => l.length));
        for (let i = 0; i < maxLen && salida.length < 12; i++)        // intercala las listas
            for (const l of listas) {
                const p = l[i];
                if (p && !vistos.has(p.id) && !yaTiene.has(p.id)) { vistos.add(p.id); salida.push(p); }
            }
        res.json(salida.slice(0, 12));
    } catch (e) { res.status(500).json({ error: 'No se pudieron generar recomendaciones.' }); }
});

router.get('/pelicula/detalles/:id', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const id = Number(req.params.id);
    try {
        const peli = await tmdb.detalles(id);
        const [extra, comunidad] = await Promise.all([
            omdb.calificaciones(peli.imdbId),
            pool.query(`SELECT ROUND(AVG(puntuacion)::numeric,1) AS promedio, COUNT(*)::int AS total
                        FROM resenas WHERE tmdb_id=$1 AND visible`, [id])
        ]);
        const salida = {
            ...peli,
            externas: extra,
            comunidad: { promedio: comunidad.rows[0].promedio, total: comunidad.rows[0].total },
            mio: { favorito: false, pendiente: false, resena: null }
        };
        if (req.usuario) {
            const [f, p, r] = await Promise.all([
                pool.query('SELECT 1 FROM favoritos  WHERE usuario_id=$1 AND tmdb_id=$2', [req.usuario.id, id]),
                pool.query('SELECT 1 FROM pendientes WHERE usuario_id=$1 AND tmdb_id=$2', [req.usuario.id, id]),
                pool.query('SELECT puntuacion, comentario FROM resenas WHERE usuario_id=$1 AND tmdb_id=$2', [req.usuario.id, id])
            ]);
            salida.mio = { favorito: !!f.rows.length, pendiente: !!p.rows.length, resena: r.rows[0] || null };
        }
        res.json(salida);
    } catch (e) { res.status(500).json({ error: 'Error al cargar la película' }); }
});

// Reseña de IA: se genera una sola vez y se guarda en la BD
router.get('/pelicula/:id/resena-ia', async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const id = Number(req.params.id);
    try {
        const c = await pool.query('SELECT texto FROM resenas_ia WHERE tmdb_id=$1', [id]);
        if (c.rows[0]) return res.json({ texto: c.rows[0].texto });
        const peli = await tmdb.detalles(id);
        const texto = await groq.generarResena(peli.titulo, peli.sinopsis);
        await pool.query(
            'INSERT INTO resenas_ia (tmdb_id, texto) VALUES ($1,$2) ON CONFLICT (tmdb_id) DO NOTHING', [id, texto]);
        res.json({ texto });
    } catch (e) { res.json({ texto: 'No se pudo generar la reseña en este momento.' }); }
});

module.exports = router;
