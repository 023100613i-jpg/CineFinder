const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (d) => d ? new Date(d).toLocaleDateString('es-PE') : '—';
let yo = null;

async function api(url, { method = 'GET', body } = {}) {
    const res = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch (_) { }
    if (!res.ok) throw new Error((data && data.error) || 'Error');
    return data;
}
let tt; function aviso(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 2500); }

(async function init() {
    try { yo = (await api('/api/auth/yo')).usuario; } catch (_) { }
    if (!yo || yo.rol !== 'admin') { location.href = '/'; return; }
    $('admin-saludo').textContent = `Sesión iniciada como ${yo.nombre} (${yo.email})`;
    document.querySelectorAll('.admin-tabs button').forEach(b => b.onclick = () => abrirTab(b.dataset.tab));
    abrirTab('resumen');
})();

function abrirTab(t) {
    document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    ['resumen', 'usuarios', 'resenas', 'destacadas'].forEach(x => $('tab-' + x).classList.toggle('oculto', x !== t));
    ({ resumen: cargarResumen, usuarios: cargarUsuarios, resenas: cargarResenas, destacadas: cargarDestacadas })[t]();
}

/* ---- Resumen ---- */
function barras(items, etiqueta, valor, fmt = (v) => v) {
    if (!items.length) return '<p class="vacio">Sin datos todavía.</p>';
    const max = Math.max(...items.map(i => Number(i[valor]))) || 1;
    return items.map(i => `<div class="barra-fila"><div class="top"><span>${esc(i[etiqueta])}</span><span>${esc(fmt(i[valor]))}</span></div><div class="barra"><i style="width:${(Number(i[valor]) / max) * 100}%"></i></div></div>`).join('');
}
async function cargarResumen() {
    const d = await api('/api/admin/estadisticas'), t = d.totales;
    const card = (n, l) => `<div class="stat-card"><b>${n}</b><span>${l}</span></div>`;
    $('tab-resumen').innerHTML = `
        <div class="stat-grid">
            ${card(t.usuarios, 'Usuarios registrados')}${card(t.usuarios_activos, 'Usuarios activos')}${card(t.favoritos, 'Favoritos guardados')}
            ${card(t.pendientes, 'Ver más tarde')}${card(t.resenas, 'Reseñas')}${card(t.consultas_animo, 'Consultas "Sorpréndeme"')}${card(t.peliculas, 'Películas en la BD')}
        </div>
        <div class="panel-2">
            <div class="panel"><h3>❤️ Más guardadas en favoritos</h3>${barras(d.masFavoritas, 'titulo', 'total')}</div>
            <div class="panel"><h3>⭐ Mejor valoradas por la comunidad</h3>${barras(d.mejorValoradas, 'titulo', 'promedio', v => `${v} / 5`)}</div>
            <div class="panel"><h3>🎭 Estados de ánimo más consultados</h3>${barras(d.animos, 'animo', 'total')}</div>
            <div class="panel"><h3>🆕 Últimos usuarios</h3>${d.usuariosRecientes.map(u => `<p style="margin-bottom:8px;font-size:.9rem;"><strong>${esc(u.nombre)}</strong> <span class="pill ${u.rol === 'admin' ? 'admin' : ''}">${u.rol}</span><br><small style="color:var(--text-muted)">${esc(u.email)} · ${fecha(u.creado_en)}</small></p>`).join('')}</div>
        </div>`;
}

/* ---- Usuarios ---- */
async function cargarUsuarios() {
    const lista = await api('/api/admin/usuarios?q=' + encodeURIComponent($('buscar-usuario').value));
    $('tabla-usuarios').innerHTML = lista.map(u => {
        const soyYo = u.id === yo.id;
        return `<tr>
            <td><strong>${esc(u.nombre)}</strong><br><small style="color:var(--text-muted)">${esc(u.email)}</small></td>
            <td><span class="pill ${u.rol === 'admin' ? 'admin' : ''}">${u.rol}</span></td>
            <td><span class="pill ${u.activo ? 'ok' : 'off'}">${u.activo ? 'Activo' : 'Desactivado'}</span></td>
            <td>${u.favoritos}</td><td>${u.resenas}</td><td>${fecha(u.creado_en)}</td>
            <td>${soyYo ? '<small style="color:var(--text-muted)">(tú)</small>' : `
                <button class="btn-sec" onclick="cambiarUsuario(${u.id}, { rol: '${u.rol === 'admin' ? 'usuario' : 'admin'}' })">${u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>
                <button class="btn-sec" onclick="cambiarUsuario(${u.id}, { activo: ${!u.activo} })">${u.activo ? 'Desactivar' : 'Activar'}</button>
                <button class="btn-sec btn-peligro" onclick="borrarUsuario(${u.id})">Eliminar</button>`}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="vacio">Sin resultados.</td></tr>';
}
async function cambiarUsuario(id, body) {
    try { await api('/api/admin/usuarios/' + id, { method: 'PATCH', body }); aviso('Usuario actualizado'); cargarUsuarios(); } catch (e) { aviso(e.message); }
}
async function borrarUsuario(id) {
    if (!confirm('¿Eliminar este usuario y todos sus datos (favoritos, reseñas)? No se puede deshacer.')) return;
    try { await api('/api/admin/usuarios/' + id, { method: 'DELETE' }); aviso('Usuario eliminado'); cargarUsuarios(); } catch (e) { aviso(e.message); }
}

/* ---- Reseñas ---- */
async function cargarResenas() {
    const lista = await api('/api/admin/resenas');
    $('tabla-resenas').innerHTML = lista.map(r => `<tr>
        <td>${esc(r.titulo)}</td>
        <td>${esc(r.nombre)}<br><small style="color:var(--text-muted)">${esc(r.email)}</small></td>
        <td style="color:#f5c518;white-space:nowrap">${'★'.repeat(r.puntuacion)}</td>
        <td style="max-width:320px;word-break:break-word">${esc(r.comentario) || '<small style="color:var(--text-muted)">(sin comentario)</small>'}</td>
        <td><span class="pill ${r.visible ? 'ok' : 'off'}">${r.visible ? 'Visible' : 'Oculta'}</span></td>
        <td><button class="btn-sec" onclick="moderar(${r.id}, ${!r.visible})">${r.visible ? 'Ocultar' : 'Mostrar'}</button>
            <button class="btn-sec btn-peligro" onclick="borrarResena(${r.id})">Eliminar</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="vacio">Todavía no hay reseñas.</td></tr>';
}
async function moderar(id, visible) { try { await api('/api/admin/resenas/' + id, { method: 'PATCH', body: { visible } }); cargarResenas(); } catch (e) { aviso(e.message); } }
async function borrarResena(id) { if (!confirm('¿Eliminar esta reseña?')) return; try { await api('/api/admin/resenas/' + id, { method: 'DELETE' }); cargarResenas(); } catch (e) { aviso(e.message); } }

/* ---- Destacadas ---- */
async function cargarDestacadas() {
    const l = await api('/api/admin/destacadas');
    $('grid-dest').innerHTML = l.map(p => `<div class="dest-item"><img src="${esc(p.imagen)}" alt=""><button title="Quitar" onclick="quitarDestacada(${p.id})"><i class="fa-solid fa-xmark"></i></button><p>${esc(p.titulo)}</p></div>`).join('') || '<p class="vacio">No hay películas destacadas.</p>';
}
async function buscarDestacada() {
    const q = $('buscar-dest').value.trim(); if (!q) return;
    const l = await api('/api/buscar?q=' + encodeURIComponent(q));
    $('res-dest').innerHTML = `<div class="res-busqueda">${l.map(p => `<div class="item-busqueda" onclick="agregarDestacada(${p.id})"><img src="${esc(p.imagen)}" alt=""><div><h4>${esc(p.titulo)}</h4><span>${esc(p.anio)} · clic para destacar</span></div></div>`).join('') || '<p class="vacio" style="padding:14px">Sin resultados.</p>'}</div>`;
}
async function agregarDestacada(id) {
    try { await api('/api/admin/destacadas/' + id, { method: 'POST' }); aviso('⭐ Película destacada'); $('res-dest').innerHTML = ''; cargarDestacadas(); } catch (e) { aviso(e.message); }
}
async function quitarDestacada(id) { try { await api('/api/admin/destacadas/' + id, { method: 'DELETE' }); cargarDestacadas(); } catch (e) { aviso(e.message); } }
