require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const { pool, iniciarBD } = require('./db/pool');
const { cargarUsuario } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);   // Render usa un proxy: necesario para IP real y cookies seguras

app.use(helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
            frameSrc: ['https://www.youtube.com'],
            connectSrc: ["'self'"],
            // En local (http) esta directiva da problemas; solo se activa en producción (https)
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    }
}));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', cargarUsuario);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuario', require('./routes/usuario'));
app.use('/api/resenas', require('./routes/resenas'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/ia'));
app.use('/api', require('./routes/peliculas'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Crea el primer administrador con las variables ADMIN_* si todavía no existe
async function crearAdminInicial() {
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const r = await pool.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1,$2,$3,'admin')
         ON CONFLICT (email) DO NOTHING RETURNING id`, [ADMIN_NOMBRE || 'Administrador', email, hash]);
    if (r.rows.length) console.log(`👑 Administrador creado: ${email}`);
}

const PORT = process.env.PORT || 3000;
iniciarBD()
    .then(crearAdminInicial)
    .then(() => app.listen(PORT, () => console.log(`🎬 CineFinder en puerto ${PORT}`)))
    .catch(err => { console.error('❌ No se pudo iniciar la base de datos:', err.message); process.exit(1); });
