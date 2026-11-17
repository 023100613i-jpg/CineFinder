/* =========================================================
   CineFinder v2 - Lógica del navegador
   ========================================================= */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIN_IMG = '/img/sin-imagen.svg';

async function api(url, { method = 'GET', body } = {}) {
    const res = await fetch(url, {
        method, credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* sin cuerpo */ }
    if (!res.ok) { const e = new Error((data && data.error) || 'Error de conexión'); e.status = res.status; throw e; }
    return data;
}

let toastTimer;
function aviso(texto) {
    const t = $('toast'); t.textContent = texto; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Estado ---------- */
let usuario = null;
const favs = new Set();
const pends = new Set();
let tiempoEspera, heroTimer;
let backdropsArray = [], backdropIndex = 0, fondoActivo = 1;
let peliculaHeroId = null;
let peliculaActual = null;
let puntuacionSel = 0;
let generoActivo = '';

/* ---------- Arranque ---------- */
document.addEventListener('DOMContentLoaded', async () => {
    montarSecciones();
    try { usuario = (await api('/api/auth/yo')).usuario; } catch (_) { usuario = null; }
    await cargarListasUsuario();
    renderNav();
    cargarSeccion('tendencias', 'grid-principal', true);
    cargarSeccion('top', 'grid-top');
    cargarSeccion('estrenos', 'grid-estrenos');
    cargarDestacadas();
    cargarSeccionesUsuario();
});

function bloqueCarrusel(id, icono, color, titulo, oculto, idTitulo) {
    return `<div id="wrap-${id}" class="${oculto ? 'oculto' : ''}">
        <h2 class="section-title" ${idTitulo ? `id="${idTitulo}"` : ''}><i class="fa-solid ${icono}" style="color:${color};"></i> ${titulo}</h2>
        <div class="carrusel-wrapper">
            <button class="btn-carrusel left" onclick="scrollCarrusel('${id}', -1)"><i class="fa-solid fa-chevron-left"></i></button>
            <div class="tendencias-grid" id="${id}"></div>
            <button class="btn-carrusel right" onclick="scrollCarrusel('${id}', 1)"><i class="fa-solid fa-chevron-right"></i></button>
        </div></div>`;
}

function montarSecciones() {
    $('main').innerHTML =
        bloqueCarrusel('grid-recomendadas', 'fa-wand-magic-sparkles', '#c084fc', 'Recomendadas para ti', true) +
        bloqueCarrusel('grid-favoritos', 'fa-heart', 'var(--accent)', 'Mis Favoritos', true) +
        bloqueCarrusel('grid-pendientes', 'fa-bookmark', '#00d2ff', 'Ver más tarde', true) +
        bloqueCarrusel('grid-destacadas', 'fa-crown', '#f5c518', 'Selección de CineFinder', true) +
        bloqueCarrusel('grid-principal', 'fa-fire', 'var(--accent)', 'Tendencias de la Semana', false, 'titulo-carrusel') +
        bloqueCarrusel('grid-top', 'fa-star', '#f5c518', 'Las Mejor Valoradas') +
        bloqueCarrusel('grid-estrenos', 'fa-calendar-days', '#00d2ff', 'Próximos Estrenos');
}

function scrollCarrusel(id, dir) {
    const c = $(id); if (c) c.scrollBy({ left: 235 * 3 * dir, behavior: 'smooth' });
}

/* ---------- Secciones de películas ---------- */
function pintarGrid(gridId, pelis) {
    const grid = $(gridId), wrap = $('wrap-' + gridId);
    grid.innerHTML = '';
    pelis.forEach(p => grid.appendChild(crearTarjeta(p)));
    if (wrap) wrap.classList.toggle('oculto', pelis.length === 0);
}

async function cargarSeccion(tipo, gridId, esPrincipal = false, genero = '') {
    try {
        const pelis = await api(`/api/seccion/${tipo}${genero ? `?genero=${genero}` : ''}`);
        pintarGrid(gridId, pelis);
        if (esPrincipal) {
            backdropsArray = pelis.filter(p => p.backdrop).map(p => ({ backdrop: p.backdrop, id: p.id, titulo: p.titulo }));
            backdropIndex = 0;
            if (backdropsArray.length) { actualizarHero(0); iniciarRotacionHero(); generarPuntitosHero(); }
        }
    } catch (e) { console.error('Error al cargar', tipo, e); }
}

async function cargarDestacadas() {
    try { pintarGrid('grid-destacadas', await api('/api/destacadas')); } catch (_) { }
}

async function cargarSeccionesUsuario() {
    if (!usuario) { ['grid-recomendadas', 'grid-favoritos', 'grid-pendientes'].forEach(id => $('wrap-' + id).classList.add('oculto')); return; }
    try {
        const [f, p] = await Promise.all([api('/api/usuario/favoritos'), api('/api/usuario/pendientes')]);
        pintarGrid('grid-favoritos', f); pintarGrid('grid-pendientes', p);
    } catch (_) { }
    cargarRecomendadas();
}
async function cargarRecomendadas() {
    if (!usuario) return;
    try { pintarGrid('grid-recomendadas', await api('/api/recomendadas')); } catch (_) { }
}

function cambiarFiltro(btn, generoId) {
    document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    generoActivo = generoId;
    $('titulo-carrusel').innerHTML = generoId === ''
        ? `<i class="fa-solid fa-fire" style="color: var(--accent);"></i> Tendencias de la Semana`
        : `<i class="fa-solid fa-filter" style="color: var(--accent);"></i> Películas de ${esc(btn.innerText)}`;
    cargarSeccion('tendencias', 'grid-principal', true, generoId);
}

/* ---------- Hero ---------- */
function actualizarHero(index) {
    if (!backdropsArray.length) return;
    const peli = backdropsArray[index];
    const act = fondoActivo === 1 ? 'hero-bg-1' : 'hero-bg-2';
    const inact = fondoActivo === 1 ? 'hero-bg-2' : 'hero-bg-1';
    $(inact).style.backgroundImage = `url('${peli.backdrop}')`;
    $(inact).classList.add('active'); $(act).classList.remove('active');
    fondoActivo = fondoActivo === 1 ? 2 : 1;
    peliculaHeroId = peli.id;
    $('btn-hero-texto').innerText = `Ver «${peli.titulo}»`;
    document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === index));
}
function iniciarRotacionHero() {
    clearInterval(heroTimer);
    if (backdropsArray.length < 2) return;
    heroTimer = setInterval(() => { backdropIndex = (backdropIndex + 1) % backdropsArray.length; actualizarHero(backdropIndex); }, 6000);
}
function generarPuntitosHero() {
    const c = $('hero-dots'); c.innerHTML = '';
    backdropsArray.forEach((_, i) => {
        const d = document.createElement('div');
        d.className = i === 0 ? 'dot active' : 'dot';
        d.onclick = () => { backdropIndex = i; actualizarHero(i); };
        c.appendChild(d);
    });
}

/* ---------- Tarjetas ---------- */
function crearTarjeta(peli) {
    const div = document.createElement('div');
    div.className = 'tarjeta-peli';
    div.onclick = (e) => { if (!e.target.closest('.btn-fav-card, .btn-pend-card')) abrirDetalles(peli.id); };
    div.innerHTML = `
        <button class="btn-pend-card ${pends.has(peli.id) ? 'activo' : ''}" data-pend="${peli.id}" title="Ver más tarde"><i class="fa-solid fa-bookmark"></i></button>
        <button class="btn-fav-card ${favs.has(peli.id) ? 'activo' : ''}" data-fav="${peli.id}" title="Favorita"><i class="fa-solid fa-heart"></i></button>
        <img src="${esc(peli.imagen || SIN_IMG)}" alt="${esc(peli.titulo)}" loading="lazy" onerror="this.src='${SIN_IMG}'">
        <div class="tarjeta-info">
            <h4>${esc(peli.titulo)}</h4>
            <div class="tarjeta-footer">
                <span class="btn-ver-detalles">Ver detalles</span>
                <div class="rating-card"><i class="fa-solid fa-star"></i> ${esc(peli.calificacion || 'N/A')}</div>
            </div>
        </div>`;
    div.querySelector('.btn-fav-card').onclick = (e) => { e.stopPropagation(); toggleLista('favoritos', peli.id); };
    div.querySelector('.btn-pend-card').onclick = (e) => { e.stopPropagation(); toggleLista('pendientes', peli.id); };
    return div;
}

/* ---------- Favoritos y "Ver más tarde" (guardados en la base de datos) ---------- */
async function cargarListasUsuario() {
    favs.clear(); pends.clear();
    if (!usuario) return;
    try {
        const l = await api('/api/usuario/listas');
        l.favoritos.forEach(i => favs.add(i)); l.pendientes.forEach(i => pends.add(i));
    } catch (_) { }
}

async function toggleLista(tipo, id) {
    if (!usuario) { abrirAuth('login', 'Inicia sesión para guardar tus películas.'); return; }
    const set = tipo === 'favoritos' ? favs : pends;
    const estaba = set.has(id);
    try {
        await api(`/api/usuario/${tipo}/${id}`, { method: estaba ? 'DELETE' : 'POST' });
        if (estaba) set.delete(id); else set.add(id);
        aviso(estaba ? 'Quitada de tu lista' : (tipo === 'favoritos' ? '❤️ Añadida a favoritos' : '🔖 Guardada para ver más tarde'));
        refrescarBotones();
        cargarSeccionesUsuario();
        if (peliculaActual && peliculaActual.id === id) pintarAcciones();
    } catch (e) { aviso(e.message); }
}

function refrescarBotones() {
    document.querySelectorAll('[data-fav]').forEach(b => b.classList.toggle('activo', favs.has(Number(b.dataset.fav))));
    document.querySelectorAll('[data-pend]').forEach(b => b.classList.toggle('activo', pends.has(Number(b.dataset.pend))));
}

function irASeccion(id) {
    if (!usuario) return abrirAuth('login', 'Inicia sesión para ver tus listas.');
    const w = $('wrap-' + id);
    if (w.classList.contains('oculto')) return aviso('Esta lista está vacía todavía.');
    w.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- Navbar de usuario ---------- */
function renderNav() {
    const cont = $('nav-usuario');
    if (!usuario) {
        cont.innerHTML = `<button class="btn-nav" onclick="abrirAuth('login')"><i class="fa-solid fa-user"></i> <span class="txt">Iniciar sesión</span></button>`;
        return;
    }
    const admin = usuario.rol === 'admin';
    cont.innerHTML = `
        <div class="user-menu">
            <button class="btn-nav" id="btn-user"><i class="fa-solid fa-circle-user"></i> <span class="txt">${esc(usuario.nombre.split(' ')[0])}</span></button>
            <div class="user-dropdown" id="user-dropdown">
                <div class="cabecera"><strong>${esc(usuario.nombre)}${admin ? '<span class="badge-admin">ADMIN</span>' : ''}</strong><small>${esc(usuario.email)}</small></div>
                <button onclick="abrirPerfil()"><i class="fa-solid fa-user-gear"></i> Mi perfil y reseñas</button>
                <button onclick="irASeccion('grid-favoritos')"><i class="fa-solid fa-heart" style="color:var(--accent)"></i> Mis favoritos</button>
                <button onclick="irASeccion('grid-pendientes')"><i class="fa-solid fa-bookmark" style="color:#00d2ff"></i> Ver más tarde</button>
                ${admin ? '<a href="/admin.html"><i class="fa-solid fa-shield-halved" style="color:#f5c518"></i> Panel de administración</a>' : ''}
                <button onclick="cerrarSesion()"><i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión</button>
            </div>
        </div>`;
    $('btn-user').onclick = (e) => { e.stopPropagation(); $('user-dropdown').classList.toggle('abierto'); };
}

/* ---------- Login / Registro ---------- */
let modoAuth = 'login';
function abrirAuth(modo = 'login', mensaje) {
    cambiarTabAuth(modo);
    if (mensaje) $('auth-sub').textContent = mensaje;
    $('auth-error').textContent = '';
    $('modal-auth').classList.add('active');
    setTimeout(() => $(modo === 'registro' ? 'auth-nombre' : 'auth-email').focus(), 100);
}
function cambiarTabAuth(modo) {
    modoAuth = modo;
    $('tab-login').classList.toggle('active', modo === 'login');
    $('tab-registro').classList.toggle('active', modo === 'registro');
    $('campo-nombre').classList.toggle('oculto', modo === 'login');
    $('auth-nombre').required = modo === 'registro';
    $('auth-titulo').textContent = modo === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta';
    $('auth-sub').textContent = modo === 'login' ? 'Inicia sesión para guardar tus películas.' : 'Es gratis y solo toma un minuto.';
    $('auth-btn').textContent = modo === 'login' ? 'Entrar' : 'Registrarme';
    $('auth-pass').autocomplete = modo === 'login' ? 'current-password' : 'new-password';
    $('auth-error').textContent = '';
}
async function enviarAuth(ev) {
    ev.preventDefault();
    const btn = $('auth-btn'); btn.disabled = true; $('auth-error').textContent = '';
    try {
        const body = { email: $('auth-email').value, password: $('auth-pass').value };
        if (modoAuth === 'registro') body.nombre = $('auth-nombre').value;
        const r = await api(`/api/auth/${modoAuth === 'login' ? 'login' : 'registro'}`, { method: 'POST', body });
        usuario = r.usuario;
        $('form-auth').reset();
        cerrarModal('modal-auth');
        await cargarListasUsuario(); renderNav(); refrescarBotones(); cargarSeccionesUsuario();
        aviso(`¡Hola, ${usuario.nombre}! 👋`);
        if ($('modal-resultado').classList.contains('active') && peliculaActual) abrirDetalles(peliculaActual.id);
    } catch (e) { $('auth-error').textContent = e.message; }
    btn.disabled = false;
}
async function cerrarSesion() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) { }
    usuario = null; favs.clear(); pends.clear();
    renderNav(); refrescarBotones(); cargarSeccionesUsuario();
    cerrarModal('modal-resultado'); cerrarModal('modal-perfil');
    aviso('Sesión cerrada');
}

/* ---------- Perfil ---------- */
async function abrirPerfil() {
    $('user-dropdown').classList.remove('abierto');
    $('modal-perfil').classList.add('active');
    $('perfil-contenido').innerHTML = '<p class="vacio">Cargando...</p>';
    try {
        const d = await api('/api/usuario/perfil');
        const e = d.estadisticas;
        $('perfil-contenido').innerHTML = `
            <h2>${esc(d.usuario.nombre)} ${d.usuario.rol === 'admin' ? '<span class="badge-admin">ADMIN</span>' : ''}</h2>
            <p class="sub">${esc(d.usuario.email)} · miembro desde ${new Date(d.usuario.creado_en).toLocaleDateString('es-PE')}</p>
            <div class="perfil-stats">
                <div><b>${e.favoritos}</b><span>Favoritas</span></div>
                <div><b>${e.pendientes}</b><span>Por ver</span></div>
                <div><b>${e.resenas}</b><span>Reseñas</span></div>
            </div>
            <h3 style="margin: 18px 0 10px;">Cambiar nombre</h3>
            <div class="campo"><input id="perfil-nombre" value="${esc(d.usuario.nombre)}" maxlength="60"></div>
            <button class="btn-principal" onclick="guardarNombre()">Guardar nombre</button>
            <h3 style="margin: 22px 0 10px;">Cambiar contraseña</h3>
            <div class="campo"><input id="pass-actual" type="password" placeholder="Contraseña actual" autocomplete="current-password"></div>
            <div class="campo"><input id="pass-nueva" type="password" placeholder="Nueva contraseña (mín. 8)" autocomplete="new-password"></div>
            <div id="perfil-msg"></div>
            <button class="btn-principal" onclick="cambiarPassword()">Actualizar contraseña</button>
            <h3 style="margin: 22px 0 10px;">Mis reseñas</h3>
            ${d.resenas.length ? d.resenas.map(r => `
                <div class="perfil-resena" onclick="cerrarModal('modal-perfil'); abrirDetalles(${r.id})">
                    <img src="${esc(r.imagen || SIN_IMG)}" alt="">
                    <div><strong>${esc(r.titulo)}</strong><br><small>${'★'.repeat(r.puntuacion)}${'☆'.repeat(5 - r.puntuacion)}</small>
                    ${r.visible ? '' : '<br><small style="color:#ff7b80">Oculta por un administrador</small>'}</div>
                </div>`).join('') : '<p class="vacio">Aún no has escrito reseñas. ¡Abre una película y cuéntanos qué te pareció!</p>'}`;
    } catch (e) { $('perfil-contenido').innerHTML = `<p class="msg-error">${esc(e.message)}</p>`; }
}
async function guardarNombre() {
    try {
        const r = await api('/api/usuario/perfil', { method: 'PUT', body: { nombre: $('perfil-nombre').value } });
        usuario.nombre = r.nombre; renderNav(); aviso('Nombre actualizado');
    } catch (e) { $('perfil-msg').innerHTML = `<div class="msg-error">${esc(e.message)}</div>`; }
}
async function cambiarPassword() {
    try {
        await api('/api/usuario/password', { method: 'PUT', body: { actual: $('pass-actual').value, nueva: $('pass-nueva').value } });
        $('pass-actual').value = ''; $('pass-nueva').value = '';
        $('perfil-msg').innerHTML = '<div class="msg-ok">Contraseña actualizada ✔</div>';
    } catch (e) { $('perfil-msg').innerHTML = `<div class="msg-error">${esc(e.message)}</div>`; }
}

/* ---------- Búsqueda ---------- */
function buscar() {
    const query = $('titulo').value, lista = $('lista-resultados');
    clearTimeout(tiempoEspera);
    if (!query.trim()) { lista.style.display = 'none'; return; }
    tiempoEspera = setTimeout(async () => {
        try {
            const pelis = await api(`/api/buscar?q=${encodeURIComponent(query)}`);
            lista.innerHTML = '';
            if (!pelis.length) lista.innerHTML = '<div style="padding: 20px; text-align: center; color: #aaa;">No se encontraron resultados</div>';
            pelis.forEach(peli => {
                const item = document.createElement('div');
                item.className = 'item-busqueda';
                item.onclick = (e) => { e.stopPropagation(); lista.style.display = 'none'; $('titulo').value = ''; abrirDetalles(peli.id); };
                item.innerHTML = `<img src="${esc(peli.imagen)}" alt=""><div><h4>${esc(peli.titulo)}</h4><span>${esc(peli.anio)}</span></div>`;
                lista.appendChild(item);
            });
            lista.style.display = 'block';
        } catch (error) { console.error(error); }
    }, 400);
}

/* ---------- Detalle de película ---------- */
async function abrirDetalles(idTmdb) {
    if (!idTmdb) return;
    $('lista-resultados').style.display = 'none';
    $('modal-resultado').classList.add('active');
    $('nombre').textContent = 'Cargando...';
    $('resena').textContent = 'La IA está escribiendo su reseña...';
    $('lista-resenas').innerHTML = ''; $('form-resena').innerHTML = '';
    try {
        const d = await api(`/api/pelicula/detalles/${idTmdb}`);
        peliculaActual = d;
        $('poster').src = d.imagen;
        $('nombre').textContent = d.titulo;
        $('sinopsis').textContent = d.sinopsis;
        $('actores').textContent = d.actores || 'No disponible';

        let tags = `<span class="tag rating">${esc(d.anio)}</span>`;
        if (d.genero) tags += `<span class="tag">${esc(d.genero)}</span>`;
        tags += `<span class="tag"><i class="fa-solid fa-star" style="color:#f5c518"></i> TMDB ${esc(d.calificacion)}</span>`;
        if (d.externas) {
            if (d.externas.imdb) tags += `<span class="tag imdb">IMDb ${esc(d.externas.imdb)}</span>`;
            if (d.externas.rotten) tags += `<span class="tag rt">🍅 ${esc(d.externas.rotten)}</span>`;
            if (d.externas.duracion) tags += `<span class="tag">${esc(d.externas.duracion)}</span>`;
        }
        $('tags').innerHTML = tags;

        pintarAcciones();
        pintarStreaming(d);
        pintarResumenComunidad(d.comunidad);
        pintarFormResena(d.mio.resena);
        cargarResenas(d.id);

        api(`/api/pelicula/${d.id}/resena-ia`).then(r => { if (peliculaActual && peliculaActual.id === d.id) $('resena').textContent = r.texto; })
            .catch(() => { $('resena').textContent = 'No se pudo generar la reseña en este momento.'; });
    } catch (error) { cerrarModal('modal-resultado'); aviso('Error al cargar los detalles'); }
}

function pintarAcciones() {
    const d = peliculaActual, c = $('acciones-peli');
    const esFav = favs.has(d.id), esPend = pends.has(d.id);
    c.innerHTML = `
        ${d.trailerKey ? `<button class="btn-accion trailer" onclick="verTrailer('${esc(d.trailerKey)}')"><i class="fa-brands fa-youtube"></i> Ver tráiler</button>` : ''}
        <button class="btn-accion ${esFav ? 'on-fav' : ''}" onclick="toggleLista('favoritos', ${d.id})"><i class="fa-solid fa-heart"></i> ${esFav ? 'En favoritos' : 'Favorita'}</button>
        <button class="btn-accion ${esPend ? 'on-pend' : ''}" onclick="toggleLista('pendientes', ${d.id})"><i class="fa-solid fa-bookmark"></i> ${esPend ? 'Guardada' : 'Ver más tarde'}</button>`;
}

function pintarStreaming(d) {
    const cont = $('streaming-container');
    const s = d.streaming;
    if (!s || (!s.flatrate.length && !s.rent.length)) { cont.innerHTML = ''; return; }
    const link = (prov, titulo) => {
        const p = prov.toLowerCase(), q = encodeURIComponent(titulo);
        if (p.includes('netflix')) return `https://www.netflix.com/search?q=${q}`;
        if (p.includes('prime') || p.includes('amazon')) return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`;
        if (p.includes('disney')) return `https://www.disneyplus.com/search?q=${q}`;
        if (p.includes('max') || p.includes('hbo')) return `https://play.max.com/search?q=${q}`;
        return `https://www.google.com/search?q=ver+${q}+en+${encodeURIComponent(p)}`;
    };
    const st = 'background:#2a2d37;padding:6px 12px;border-radius:6px;margin:0 8px 8px 0;display:inline-block;color:white;text-decoration:none;font-size:0.85rem;';
    let html = '<p style="margin-bottom:5px;"><strong>Disponible en:</strong></p>';
    s.flatrate.forEach(p => html += `<a href="${link(p, d.titulo)}" target="_blank" rel="noopener" style="${st}">Ver en ${esc(p)}</a>`);
    s.rent.forEach(p => html += `<a href="${link(p, d.titulo)}" target="_blank" rel="noopener" style="${st}">Alquilar en ${esc(p)}</a>`);
    cont.innerHTML = html;
}

/* ---------- Reseñas de usuarios ---------- */
function pintarResumenComunidad(c) {
    const el = $('comunidad-resumen');
    if (c && c.total > 0) { el.textContent = `★ ${c.promedio} (${c.total})`; el.classList.remove('oculto'); }
    else el.classList.add('oculto');
}

function pintarFormResena(mia) {
    const cont = $('form-resena');
    if (!usuario) {
        cont.innerHTML = `<p class="vacio" style="margin-bottom:12px;"><a href="#" style="color:var(--accent)" onclick="event.preventDefault(); abrirAuth('login','Inicia sesión para dejar tu opinión.')">Inicia sesión</a> para dejar tu opinión.</p>`;
        return;
    }
    puntuacionSel = mia ? mia.puntuacion : 0;
    cont.innerHTML = `
        <div class="estrellas" id="estrellas">${[1, 2, 3, 4, 5].map(n => `<i class="fa-solid fa-star" data-v="${n}"></i>`).join('')}</div>
        <div class="campo"><textarea id="resena-texto" maxlength="1000" placeholder="¿Qué te pareció la película? (opcional)"></textarea></div>
        <div id="resena-msg"></div>
        <div style="display:flex; gap:10px; margin-bottom:16px;">
            <button class="btn-principal" style="width:auto; padding:10px 22px;" onclick="guardarResena()">${mia ? 'Actualizar mi reseña' : 'Publicar reseña'}</button>
            ${mia ? '<button class="btn-sec btn-peligro" onclick="borrarMiResena()">Eliminar</button>' : ''}
        </div>`;
    $('resena-texto').value = mia ? mia.comentario : '';
    pintarEstrellas();
    document.querySelectorAll('#estrellas i').forEach(i => i.onclick = () => { puntuacionSel = Number(i.dataset.v); pintarEstrellas(); });
}
function pintarEstrellas() { document.querySelectorAll('#estrellas i').forEach(i => i.classList.toggle('on', Number(i.dataset.v) <= puntuacionSel)); }

async function guardarResena() {
    if (!puntuacionSel) { $('resena-msg').innerHTML = '<div class="msg-error">Elige de 1 a 5 estrellas.</div>'; return; }
    try {
        await api(`/api/resenas/${peliculaActual.id}`, { method: 'POST', body: { puntuacion: puntuacionSel, comentario: $('resena-texto').value } });
        aviso('✔ Reseña guardada');
        abrirDetalles(peliculaActual.id);
    } catch (e) { $('resena-msg').innerHTML = `<div class="msg-error">${esc(e.message)}</div>`; }
}
async function borrarMiResena() {
    if (!confirm('¿Eliminar tu reseña?')) return;
    try { await api(`/api/resenas/${peliculaActual.id}`, { method: 'DELETE' }); aviso('Reseña eliminada'); abrirDetalles(peliculaActual.id); }
    catch (e) { aviso(e.message); }
}
async function cargarResenas(id) {
    const cont = $('lista-resenas');
    try {
        const lista = await api(`/api/resenas/${id}`);
        cont.innerHTML = lista.length ? lista.map(r => `
            <div class="resena-user">
                <div class="cab"><strong>${esc(r.nombre)}</strong><span class="est">${'★'.repeat(r.puntuacion)}${'☆'.repeat(5 - r.puntuacion)}</span></div>
                ${r.comentario ? `<p>${esc(r.comentario)}</p>` : ''}
                <small>${new Date(r.creado_en).toLocaleDateString('es-PE')}</small>
            </div>`).join('') : '<p class="vacio">Sé la primera persona en opinar sobre esta película.</p>';
    } catch (_) { cont.innerHTML = ''; }
}

/* ---------- Modales ---------- */
function cerrarModal(id) { $(id).classList.remove('active'); }
function verTrailer(key) {
    $('iframe-trailer').src = `https://www.youtube.com/embed/${encodeURIComponent(key)}?autoplay=1`;
    $('modal-video').classList.add('active');
}
function cerrarTrailer() { $('iframe-trailer').src = ''; $('modal-video').classList.remove('active'); }

function abrirModalAnimo() { $('modal-animo').classList.add('active'); }
function cerrarModalAnimo() { $('modal-animo').classList.remove('active'); $('contenedor-animo-resultados').innerHTML = ''; }

async function pedirPorAnimo(animoTexto) {
    const c = $('contenedor-animo-resultados');
    c.innerHTML = '<p style="grid-column: 1/-1; color: #fff; font-size: 1.1rem; padding: 20px;">Consultando a la IA... 🤖</p>';
    try {
        const pelis = await api('/api/sorprendeme', { method: 'POST', body: { animo: animoTexto } });
        if (!pelis.length) { c.innerHTML = '<p style="grid-column: 1/-1; color: #aaa; padding: 20px;">No se encontraron películas. Intenta con otro estado de ánimo.</p>'; return; }
        c.innerHTML = pelis.map(p => `
            <div class="animo-card" onclick="cerrarModalAnimo(); abrirDetalles(${Number(p.id)});">
                <img src="${esc(p.imagen)}" alt="${esc(p.titulo)}">
                <div class="animo-card-info">
                    <h4 title="${esc(p.titulo)}">${esc(p.titulo)}</h4>
                    <div class="animo-card-meta"><span>${esc(p.anio)}</span><span class="rating"><i class="fa-solid fa-star"></i> ${esc(p.calificacion)}</span></div>
                </div>
            </div>`).join('');
    } catch (err) {
        c.innerHTML = `<p style="grid-column: 1/-1; color: var(--accent); padding: 20px;">${esc(err.message || 'Error al consultar las recomendaciones de la IA.')}</p>`;
    }
}

/* ---------- Chat IA ---------- */
function toggleChat() { $('chat-window').classList.toggle('active'); }
async function preguntarIA() {
    const input = $('chat-input'), pregunta = input.value.trim();
    if (!pregunta) return;
    const cont = $('chat-mensajes');
    const u = document.createElement('div'); u.className = 'msg msg-user'; u.textContent = pregunta; cont.appendChild(u);
    input.value = '';
    const t = document.createElement('div'); t.className = 'msg msg-ia'; t.innerHTML = '<i class="fa-solid fa-ellipsis fa-fade"></i>'; cont.appendChild(t);
    cont.scrollTop = cont.scrollHeight;
    try {
        const r = await fetch('/api/preguntar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta }) });
        const data = await r.json();
        t.textContent = data.respuesta || data.error || 'Error.';
    } catch (e) { t.textContent = 'Error.'; }
    cont.scrollTop = cont.scrollHeight;
}

/* ---------- Cierres globales ---------- */
document.addEventListener('click', (e) => {
    const lista = $('lista-resultados'), box = document.querySelector('.search-box');
    if (lista && !lista.contains(e.target) && !box.contains(e.target)) lista.style.display = 'none';
    const dd = $('user-dropdown'); if (dd && !dd.contains(e.target)) dd.classList.remove('abierto');
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('modal-video').classList.contains('active')) return cerrarTrailer();
    ['modal-auth', 'modal-perfil', 'modal-resultado'].forEach(cerrarModal); cerrarModalAnimo();
});
