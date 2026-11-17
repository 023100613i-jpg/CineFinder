const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db/pool');
const groq = require('../services/groq');
const tmdb = require('../services/tmdb');

const router = express.Router();
// La IA cuesta: se limita por IP para que nadie la abuse
const limitadorIA = rateLimit({
    windowMs: 60 * 1000, max: 12,
    message: { respuesta: 'Demasiadas consultas seguidas. Espera un minuto.', error: 'Demasiadas consultas.' },
    standardHeaders: true, legacyHeaders: false
});

router.post('/preguntar', limitadorIA, async (req, res) => {
    const pregunta = String(req.body.pregunta || '').trim().slice(0, 400);
    if (!pregunta) return res.status(400).json({ respuesta: 'Escribe una pregunta.' });
    try {
        const r = await groq.consultar(`Actúa como un crítico de cine y experto en películas. Responde de forma amigable y breve a: "${pregunta}"`, 10000);
        res.json({ respuesta: r });
    } catch (e) { res.status(503).json({ respuesta: 'IA ocupada.' }); }
});

// Recomendaciones por estado de ánimo
router.post('/sorprendeme', limitadorIA, async (req, res) => {
    const animo = String(req.body.animo || '').trim().slice(0, 100);
    if (!animo) return res.status(400).json({ error: 'Falta el estado de ánimo.' });
    try {
        const prompt = `El usuario se siente: "${animo}". Recomienda 3 películas ideales para este estado de ánimo. Responde ÚNICAMENTE con un objeto JSON en este formato exacto, sin bloques markdown ni texto adicional: {"peliculas": ["Titulo 1", "Titulo 2", "Titulo 3"]}`;
        const respuesta = await groq.consultar(prompt, 15000);
        const datos = JSON.parse(respuesta.replace(/```json|```/g, '').trim());
        const titulos = (datos.peliculas || []).slice(0, 3).map(String);

        const encontradas = await Promise.all(titulos.map(t => tmdb.buscarPrimera(t).catch(() => null)));
        const lista = encontradas.filter(Boolean);

        pool.query('INSERT INTO historial_animo (usuario_id, animo, titulos) VALUES ($1,$2,$3)',
            [req.usuario ? req.usuario.id : null, animo, titulos.join(' | ')]).catch(() => {});
        res.json(lista);
    } catch (e) {
        console.error('Error en /api/sorprendeme:', e.message);
        res.status(500).json({ error: 'No se pudieron generar las recomendaciones.' });
    }
});

module.exports = router;
