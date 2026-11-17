const axios = require('axios');
const { pool } = require('../db/pool');
const { conCache } = require('./cache');

const BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const IMG = process.env.TMDB_IMG_URL || 'https://image.tmdb.org/t/p';
const SIN_IMAGEN = '/img/sin-imagen.svg';

function tmdb(ruta, params = {}) {
    return axios.get(BASE + ruta, {
        params: { api_key: process.env.TMDB_API_KEY, language: 'es-ES', ...params },
        timeout: 10000
    }).then(r => r.data);
}

function normalizar(p, tam = 'w500') {
    return {
        id: p.id,
        titulo: p.title || p.titulo,
        anio: p.release_date ? p.release_date.split('-')[0] : 'N/A',
        imagen: p.poster_path ? `${IMG}/${tam}${p.poster_path}` : SIN_IMAGEN,
        backdrop: p.backdrop_path ? `${IMG}/original${p.backdrop_path}` : null,
        calificacion: p.vote_average ? p.vote_average.toFixed(1) : 'N/A'
    };
}

const buscar = (q) => tmdb('/search/movie', { query: q }).then(d => d.results.slice(0, 10).map(p => normalizar(p, 'w200')));

function seccion(tipo, genero) {
    const clave = `seccion:${tipo}:${genero || ''}`;
    return conCache(clave, 600, async () => {
        let ruta, params = { page: 1 };
        if (genero) { ruta = '/discover/movie'; params.with_genres = genero; params.sort_by = 'popularity.desc'; }
        else if (tipo === 'tendencias') ruta = '/trending/movie/week';
        else if (tipo === 'top') ruta = '/movie/top_rated';
        else if (tipo === 'estrenos') ruta = '/movie/upcoming';
        else return [];
        const d = await tmdb(ruta, params);
        return d.results.slice(0, 10).map(p => ({ ...normalizar(p), generos: p.genre_ids }));
    });
}

async function aleatoriaId() {
    const d = await tmdb('/discover/movie', { page: Math.floor(Math.random() * 500) + 1 });
    return d.results[Math.floor(Math.random() * d.results.length)].id;
}

// Detalle completo (con trailer, reparto, streaming en Perú, id de IMDb)
function detalles(id) {
    return conCache(`detalle:${id}`, 1800, async () => {
        const p = await tmdb(`/movie/${id}`, { append_to_response: 'videos,watch/providers,credits,external_ids' });
        const trailer = (p.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
        const prov = p['watch/providers']?.results?.PE || null;
        return {
            ...normalizar(p),
            genero: (p.genres || []).map(g => g.name).join(', '),
            sinopsis: p.overview || 'No disponible',
            actores: (p.credits?.cast || []).slice(0, 5).map(a => a.name).join(', '),
            trailerKey: trailer ? trailer.key : null,
            imdbId: p.external_ids?.imdb_id || null,
            streaming: prov ? {
                flatrate: (prov.flatrate || []).map(x => x.provider_name),
                rent: (prov.rent || []).map(x => x.provider_name)
            } : null
        };
    });
}

// Recomendaciones basadas en una película (para "Recomendadas para ti")
const recomendaciones = (id) => conCache(`reco:${id}`, 3600, () =>
    tmdb(`/movie/${id}/recommendations`).then(d => d.results.map(p => normalizar(p))));

const buscarPrimera = (titulo) =>
    tmdb('/search/movie', { query: titulo }).then(d => d.results[0] ? normalizar(d.results[0]) : null);

// Guarda/actualiza la película en la tabla "peliculas" (necesaria antes de favoritos/reseñas)
async function asegurarPelicula(id) {
    const ya = await pool.query('SELECT tmdb_id FROM peliculas WHERE tmdb_id = $1', [id]);
    if (ya.rows.length) return;
    const d = await detalles(id);
    await guardarPelicula(d);
}

async function guardarPelicula(p) {
    const cal = p.calificacion && p.calificacion !== 'N/A' ? Number(p.calificacion) : null;
    await pool.query(
        `INSERT INTO peliculas (tmdb_id, titulo, anio, imagen, backdrop, calificacion)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tmdb_id) DO UPDATE SET titulo=$2, anio=$3, imagen=$4, backdrop=$5, calificacion=$6, actualizado_en=NOW()`,
        [p.id, p.titulo, p.anio === 'N/A' ? null : p.anio, p.imagen, p.backdrop, cal]);
}

module.exports = { buscar, seccion, aleatoriaId, detalles, recomendaciones, buscarPrimera, asegurarPelicula, guardarPelicula, SIN_IMAGEN };
