const axios = require('axios');
const { conCache } = require('./cache');

// Calificación de IMDb y Rotten Tomatoes vía OMDb (opcional: si falla, devuelve null)
function calificaciones(imdbId) {
    if (!imdbId || !process.env.OMDB_API_KEY) return Promise.resolve(null);
    return conCache(`omdb:${imdbId}`, 86400, async () => {
        try {
            const url = process.env.OMDB_BASE_URL || 'https://www.omdbapi.com/';
            const { data } = await axios.get(url, { params: { i: imdbId, apikey: process.env.OMDB_API_KEY }, timeout: 8000 });
            if (data.Response === 'False') return null;
            const rt = (data.Ratings || []).find(r => r.Source === 'Rotten Tomatoes');
            return {
                imdb: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
                rotten: rt ? rt.Value : null,
                duracion: data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : null,
                director: data.Director && data.Director !== 'N/A' ? data.Director : null
            };
        } catch (e) { return null; }
    });
}

module.exports = { calificaciones };
