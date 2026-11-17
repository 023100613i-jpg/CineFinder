-- =====================================================================
--  CineFinder - Esquema de base de datos (PostgreSQL)
--  Se ejecuta automáticamente al iniciar el servidor (es idempotente).
-- =====================================================================

-- 1) USUARIOS: cuentas de la página (rol 'usuario' o 'admin')
CREATE TABLE IF NOT EXISTS usuarios (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(60)  NOT NULL,
    email          VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(100) NOT NULL,
    rol            VARCHAR(10)  NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'admin')),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ultimo_acceso  TIMESTAMPTZ
);

-- 2) PELICULAS: copia local de las películas que usan los usuarios
--    (los datos vienen de TMDB; se guardan para no consultar la API cada vez)
CREATE TABLE IF NOT EXISTS peliculas (
    tmdb_id        INTEGER PRIMARY KEY,
    titulo         VARCHAR(255) NOT NULL,
    anio           VARCHAR(4),
    imagen         TEXT,
    backdrop       TEXT,
    calificacion   NUMERIC(3,1),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) FAVORITOS: relación muchos a muchos usuarios <-> películas
CREATE TABLE IF NOT EXISTS favoritos (
    usuario_id INTEGER     NOT NULL REFERENCES usuarios(id)      ON DELETE CASCADE,
    tmdb_id    INTEGER     NOT NULL REFERENCES peliculas(tmdb_id) ON DELETE CASCADE,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, tmdb_id)
);

-- 4) PENDIENTES: lista "Ver más tarde"
CREATE TABLE IF NOT EXISTS pendientes (
    usuario_id INTEGER     NOT NULL REFERENCES usuarios(id)      ON DELETE CASCADE,
    tmdb_id    INTEGER     NOT NULL REFERENCES peliculas(tmdb_id) ON DELETE CASCADE,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, tmdb_id)
);

-- 5) RESENAS: opinión + puntuación (1 a 5) de cada usuario (una por película)
CREATE TABLE IF NOT EXISTS resenas (
    id             SERIAL PRIMARY KEY,
    usuario_id     INTEGER     NOT NULL REFERENCES usuarios(id)      ON DELETE CASCADE,
    tmdb_id        INTEGER     NOT NULL REFERENCES peliculas(tmdb_id) ON DELETE CASCADE,
    puntuacion     SMALLINT    NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
    comentario     TEXT        NOT NULL DEFAULT '',
    visible        BOOLEAN     NOT NULL DEFAULT TRUE,  -- el admin puede ocultarla
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (usuario_id, tmdb_id)
);
CREATE INDEX IF NOT EXISTS idx_resenas_pelicula ON resenas(tmdb_id);

-- 6) RESENAS_IA: caché de las reseñas generadas por la IA (ahorra llamadas a Groq)
CREATE TABLE IF NOT EXISTS resenas_ia (
    tmdb_id      INTEGER PRIMARY KEY,
    texto        TEXT        NOT NULL,
    generado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7) HISTORIAL_ANIMO: registro de las recomendaciones "Sorpréndeme" (estadísticas)
CREATE TABLE IF NOT EXISTS historial_animo (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    animo       VARCHAR(100) NOT NULL,
    titulos     TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8) DESTACADAS: películas que el administrador elige mostrar en la portada
CREATE TABLE IF NOT EXISTS destacadas (
    tmdb_id        INTEGER PRIMARY KEY REFERENCES peliculas(tmdb_id) ON DELETE CASCADE,
    agregado_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
