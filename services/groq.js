const axios = require('axios');

const URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function consultar(prompt, timeout = 20000) {
    try {
        const r = await axios.post(URL, {
            model: MODELO,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
        }, {
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            timeout
        });
        return r.data.choices[0].message.content.trim();
    } catch (e) {
        console.error('Error en Groq:', e.message);
        throw new Error('IA_ERROR');
    }
}

function generarResena(titulo, sinopsis) {
    return consultar(`Actúa como un crítico de cine. Escribe una reseña profesional, emotiva y breve (máximo 2 párrafos) sobre la película "${titulo}".

Instrucciones importantes:
1. Si la sinopsis contiene temas sensibles (violencia, abuso, etc.), NO los describas explícitamente. Enfócate en el mensaje de la película, la actuación y la dirección.
2. Escribe la reseña directamente en español.
3. No incluyas advertencias de que eres una IA.

Aquí tienes un resumen de la trama para que te inspires (no lo copies literal): "${sinopsis}".`);
}

module.exports = { consultar, generarResena };
