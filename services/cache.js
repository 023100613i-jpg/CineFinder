// Caché simple en memoria con tiempo de vida (evita repetir llamadas a TMDB)
const almacen = new Map();

async function conCache(clave, ttlSegundos, funcion) {
    const ahora = Date.now();
    const hit = almacen.get(clave);
    if (hit && hit.expira > ahora) return hit.valor;
    const valor = await funcion();
    almacen.set(clave, { valor, expira: ahora + ttlSegundos * 1000 });
    if (almacen.size > 500) {           // limpieza básica
        for (const [k, v] of almacen) if (v.expira < ahora) almacen.delete(k);
    }
    return valor;
}

module.exports = { conCache };
