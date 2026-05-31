// ═══════════════════════════════════════════════════════════════
//  TEXALAR REPARTO — app.js  (versión Supabase + Offline)
// ═══════════════════════════════════════════════════════════════

// ─── Supabase config ────────────────────────────────────────────
const SUPA_URL = 'https://qrrbspqxcvnbrsnepdgf.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFycmJzcHF4Y3ZuYnJzbmVwZGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mjc3NzcsImV4cCI6MjA5NTEwMzc3N30.NmwLFoZfSK2goF7jv7LF6s0Dzg6G6mr9RI7Y0W8TvxU';

function supaHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Prefer': 'return=representation'
  };
}

async function supa(path, opts = {}) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: supaHeaders(),
    ...opts
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : [];
}

// ─── Offline / caché ────────────────────────────────────────────
const CACHE_KEY = 'texalar_cache';
const COLA_KEY  = 'texalar_cola_offline';

function isOnline() { return navigator.onLine; }

function guardarCache(datos) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(datos)); } catch(e) {}
}

function leerCache() {
  try {
    const d = localStorage.getItem(CACHE_KEY);
    return d ? JSON.parse(d) : null;
  } catch(e) { return null; }
}

function agregarAColaOffline(operacion) {
  try {
    const cola = JSON.parse(localStorage.getItem(COLA_KEY) || '[]');
    cola.push({ ...operacion, ts: Date.now() });
    localStorage.setItem(COLA_KEY, JSON.stringify(cola));
  } catch(e) {}
}

function leerColaOffline() {
  try { return JSON.parse(localStorage.getItem(COLA_KEY) || '[]'); }
  catch(e) { return []; }
}

function limpiarColaOffline() {
  localStorage.removeItem(COLA_KEY);
}

// Sincronizar cola cuando vuelve internet
window.addEventListener('online', async () => {
  mostrarIndicadorConexion(true);
  await sincronizarCola();
});

window.addEventListener('offline', () => {
  mostrarIndicadorConexion(false);
});

function mostrarIndicadorConexion(online) {
  let el = document.getElementById('conexion-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'conexion-indicator';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;text-align:center;font-size:12px;font-weight:600;padding:4px;z-index:999;transition:all .3s;';
    document.body.appendChild(el);
  }
  if (online) {
    el.textContent = '✅ Conexión restaurada';
    el.style.background = '#22c55e';
    el.style.color = 'white';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  } else {
    el.style.display = 'block';
    el.textContent = '📵 Sin conexión — los datos se guardan localmente';
    el.style.background = '#f59e0b';
    el.style.color = 'white';
  }
}

async function sincronizarCola() {
  const cola = leerColaOffline();
  if (!cola.length) return;

  let exitosos = 0;
  for (const op of cola) {
    try {
      if (op.tipo === 'entrega_insert') {
        const rows = await supa('entregas', {
          method: 'POST',
          body: JSON.stringify(op.datos)
        });
        // Actualizar entregaId en state
        const today = getToday();
        if (state.ruta[today]?.entregas[op.clienteId]) {
          state.ruta[today].entregas[op.clienteId].entregaId = rows[0]?.id;
        }
      } else if (op.tipo === 'entrega_update') {
        await supa(`entregas?id=eq.${op.entregaId}`, {
          method: 'PATCH',
          body: JSON.stringify(op.datos)
        });
      }
      exitosos++;
    } catch(e) {
      console.error('Error sincronizando:', e);
    }
  }

  if (exitosos === cola.length) {
    limpiarColaOffline();
    // Recargar datos frescos
    await cargarDatosEmpleado();
    renderAll();
  }
}

// ─── Estado en memoria ──────────────────────────────────────────
const PRECIO_5  = 5000;
const PRECIO_10 = 8000;

let currentUser = null;
let state = {
  clientes: [],
  zonas: [],
  ruta: {},
  historial: [],
};

// ─── Helpers ────────────────────────────────────────────────────
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatPeso(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function calcularTotal(bid5, bid10) {
  return (bid5 || 0) * PRECIO_5 + (bid10 || 0) * PRECIO_10;
}

function showLoading(show) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

// ─── LOGIN ──────────────────────────────────────────────────────
async function doLogin() {
  const nombre = document.getElementById('login-usuario').value.trim();
  const clave  = document.getElementById('login-clave').value.trim();
  const errEl  = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!nombre || !clave) {
    errEl.textContent = 'Completá usuario y clave.';
    errEl.style.display = 'block';
    return;
  }

  showLoading(true);

  // Intentar login online
  if (isOnline()) {
    try {
      const rows = await supa(`usuarios?nombre=eq.${encodeURIComponent(nombre)}&clave=eq.${encodeURIComponent(clave)}&select=id,nombre,rol`);
      if (!rows.length) {
        errEl.textContent = 'Usuario o clave incorrectos.';
        errEl.style.display = 'block';
        showLoading(false);
        return;
      }
      currentUser = rows[0];
      localStorage.setItem('texalar_user', JSON.stringify(currentUser));
      await iniciarSesion();
    } catch(e) {
      // Si falla online, intentar con caché
      await loginDesdeCache(nombre, clave, errEl);
    }
  } else {
    await loginDesdeCache(nombre, clave, errEl);
  }
  showLoading(false);
}

async function loginDesdeCache(nombre, clave, errEl) {
  const cache = leerCache();
  if (cache?.user && cache.user.nombre === nombre) {
    // No podemos verificar clave offline de forma segura
    // Usamos el usuario guardado si el nombre coincide
    currentUser = cache.user;
    await iniciarSesionDesdeCache(cache);
  } else {
    errEl.textContent = 'Sin conexión. Iniciá sesión online al menos una vez.';
    errEl.style.display = 'block';
  }
}

document.getElementById('login-clave').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

function doLogout() {
  currentUser = null;
  localStorage.removeItem('texalar_user');
  document.getElementById('pantalla-app').style.display   = 'none';
  document.getElementById('pantalla-admin').style.display = 'none';
  document.getElementById('pantalla-login').style.display = 'flex';
  document.getElementById('login-usuario').value = '';
  document.getElementById('login-clave').value   = '';
}

async function iniciarSesion() {
  if (currentUser.rol === 'admin') {
    document.getElementById('pantalla-login').style.display = 'none';
    document.getElementById('pantalla-admin').style.display = 'block';
    await cargarAdmin();
  } else {
    document.getElementById('pantalla-login').style.display = 'none';
    document.getElementById('pantalla-app').style.display   = 'block';
    document.getElementById('header-usuario').textContent   = currentUser.nombre;
    await cargarDatosEmpleado();
    renderFecha();
    renderAll();
    // Mostrar indicador si está offline
    if (!isOnline()) mostrarIndicadorConexion(false);
  }
}

async function iniciarSesionDesdeCache(cache) {
  document.getElementById('pantalla-login').style.display = 'none';
  document.getElementById('pantalla-app').style.display   = 'block';
  document.getElementById('header-usuario').textContent   = currentUser.nombre;

  // Cargar desde caché
  state.zonas    = cache.zonas    || [];
  state.clientes = cache.clientes || [];
  state.ruta     = cache.ruta     || {};
  state.historial= cache.historial|| [];

  renderFecha();
  renderAll();
  mostrarIndicadorConexion(false);
}

// ─── Cargar datos del empleado ────────────────────────────────────
async function cargarDatosEmpleado() {
  showLoading(true);

  if (!isOnline()) {
    const cache = leerCache();
    if (cache) {
      state.zonas    = cache.zonas    || [];
      state.clientes = cache.clientes || [];
      state.ruta     = cache.ruta     || {};
      state.historial= cache.historial|| [];
    }
    showLoading(false);
    return;
  }

  try {
    const zonas = await supa(`zonas?usuario_id=eq.${currentUser.id}&select=id,nombre&order=nombre`);
    state.zonas = zonas.map(z => ({ id: z.id, nombre: z.nombre }));

    const clientes = await supa(`clientes?usuario_id=eq.${currentUser.id}&select=id,nombre,direccion,telefono,bidones_habituales,bidones_habituales_10,orden,zona_id&order=orden`);
    state.clientes = clientes.map(c => ({
      id: c.id,
      nombre: c.nombre,
      dir: c.direccion,
      tel: c.telefono || '',
      bidHab: c.bidones_habituales ?? 0,
      bidHab10: c.bidones_habituales_10 || 0,
      orden: c.orden || 1,
      zonaId: c.zona_id
    }));

    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const desde = hace30.toISOString().slice(0, 10);
    const entregas = await supa(`entregas?usuario_id=eq.${currentUser.id}&fecha=gte.${desde}&select=id,cliente_id,fecha,bid5,bid10,pago,dev_bidones,dev_canillas,entregado&order=fecha.desc`);

    state.ruta = {};
    const porFecha = {};
    entregas.forEach(e => {
      if (!porFecha[e.fecha]) porFecha[e.fecha] = [];
      porFecha[e.fecha].push(e);
    });

    const today = getToday();
    if (porFecha[today]) {
      const entregasHoy = {};
      let zonaIdHoy = null;
      porFecha[today].forEach(e => {
        entregasHoy[e.cliente_id] = {
          entregaId: e.id,
          bid5: e.bid5,
          bid10: e.bid10,
          pago: e.pago,
          devBidones: e.dev_bidones || 0,
          devCanillas: e.dev_canillas || 0,
          entregado: e.entregado
        };
        if (!zonaIdHoy) {
          const cli = state.clientes.find(c => c.id === e.cliente_id);
          if (cli) zonaIdHoy = cli.zonaId;
        }
      });
      state.ruta[today] = { zonaId: zonaIdHoy, entregas: entregasHoy };
    }

    state.historial = [];
    const fechas = Object.keys(porFecha).filter(f => f !== today).sort().reverse();
    fechas.forEach(fecha => {
      const ents = porFecha[fecha];
      const entregasMap = {};
      let zonaIdDia = null;
      ents.forEach(e => {
        entregasMap[e.cliente_id] = {
          entregaId: e.id,
          bid5: e.bid5,
          bid10: e.bid10,
          pago: e.pago,
          entregado: e.entregado
        };
        if (!zonaIdDia) {
          const cli = state.clientes.find(c => c.id === e.cliente_id);
          if (cli) zonaIdDia = cli.zonaId;
        }
      });
      const zonaNombre = state.zonas.find(z => z.id === zonaIdDia)?.nombre || 'Sin zona';
      const entregasArr = state.clientes
        .filter(c => entregasMap[c.id])
        .map(c => ({
          nombre: c.nombre,
          bid5: entregasMap[c.id].bid5 || 0,
          bid10: entregasMap[c.id].bid10 || 0,
          pago: entregasMap[c.id].pago || '',
          entregado: entregasMap[c.id].entregado,
          entregaId: entregasMap[c.id].entregaId,
          clienteId: c.id
        }));
      state.historial.push({ fecha, zona: zonaNombre, zonaId: zonaIdDia, entregas: entregasArr });
    });

    // Guardar en caché
    guardarCache({
      user: currentUser,
      zonas: state.zonas,
      clientes: state.clientes,
      ruta: state.ruta,
      historial: state.historial,
      ts: Date.now()
    });

  } catch(e) {
    console.error('Error cargando datos:', e);
    // Intentar desde caché
    const cache = leerCache();
    if (cache) {
      state.zonas    = cache.zonas    || [];
      state.clientes = cache.clientes || [];
      state.ruta     = cache.ruta     || {};
      state.historial= cache.historial|| [];
    }
  }
  showLoading(false);
}

// ─── Guardar caché del state actual ──────────────────────────────
function actualizarCache() {
  const cache = leerCache() || {};
  guardarCache({
    ...cache,
    user: currentUser,
    zonas: state.zonas,
    clientes: state.clientes,
    ruta: state.ruta,
    historial: state.historial,
    ts: Date.now()
  });
}

// ─── Persiste entrega (online o cola offline) ─────────────────────
async function guardarEntrega(clienteId, datos) {
  const today = getToday();
  const existente = state.ruta[today]?.entregas?.[clienteId];

  // Guardar en caché local siempre
  actualizarCache();

  if (!isOnline()) {
    // Agregar a cola offline
    if (existente?.entregaId) {
      agregarAColaOffline({
        tipo: 'entrega_update',
        entregaId: existente.entregaId,
        clienteId,
        datos: {
          bid5: datos.bid5 || 0,
          bid10: datos.bid10 || 0,
          pago: datos.pago || null,
          dev_bidones: datos.devBidones || 0,
          dev_canillas: datos.devCanillas || 0,
          entregado: datos.entregado || false
        }
      });
    } else {
      agregarAColaOffline({
        tipo: 'entrega_insert',
        clienteId,
        datos: {
          cliente_id: clienteId,
          usuario_id: currentUser.id,
          fecha: today,
          bid5: datos.bid5 || 0,
          bid10: datos.bid10 || 0,
          pago: datos.pago || null,
          dev_bidones: datos.devBidones || 0,
          dev_canillas: datos.devCanillas || 0,
          entregado: datos.entregado || false
        }
      });
    }
    return;
  }

  // Online: guardar en Supabase
  if (existente?.entregaId) {
    await supa(`entregas?id=eq.${existente.entregaId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        bid5: datos.bid5 || 0,
        bid10: datos.bid10 || 0,
        pago: datos.pago || null,
        dev_bidones: datos.devBidones || 0,
        dev_canillas: datos.devCanillas || 0,
        entregado: datos.entregado || false
      })
    });
  } else {
    const rows = await supa('entregas', {
      method: 'POST',
      body: JSON.stringify({
        cliente_id: clienteId,
        usuario_id: currentUser.id,
        fecha: today,
        bid5: datos.bid5 || 0,
        bid10: datos.bid10 || 0,
        pago: datos.pago || null,
        dev_bidones: datos.devBidones || 0,
        dev_canillas: datos.devCanillas || 0,
        entregado: datos.entregado || false
      })
    });
    if (!state.ruta[today]) state.ruta[today] = { zonaId: null, entregas: {} };
    if (!state.ruta[today].entregas[clienteId]) state.ruta[today].entregas[clienteId] = {};
    state.ruta[today].entregas[clienteId].entregaId = rows[0]?.id;
    actualizarCache();
  }
}

// ─── Zona del día ────────────────────────────────────────────────
function getZonaHoy() {
  return state.ruta[getToday()]?.zonaId || null;
}

function clientesDeZona(zonaId) {
  return state.clientes.filter(c => c.zonaId === zonaId).sort((a,b) => a.orden - b.orden);
}

// ─── RENDER PRINCIPAL ────────────────────────────────────────────
function renderAll() {
  renderSelectorZona();
  renderRuta();
  renderClientes();
  renderZonas();
  renderHistorial();
  renderCobrosPendientes();
  renderStats();
}

// ─── Selector de zona del día ────────────────────────────────────
function renderSelectorZona() {
  const zonaId = getZonaHoy();
  const wrap   = document.getElementById('zona-selector');

  if (!zonaId) {
    if (!state.zonas.length) {
      wrap.innerHTML = '<div style="font-size:13px;color:#888;">Primero agregá una zona</div>';
      return;
    }
    wrap.innerHTML = `
      <select class="input input-sm" id="zona-select-hoy" style="margin-bottom:8px;">
        <option value="">Elegir zona...</option>
        ${state.zonas.map(z => `<option value="${z.id}">${z.nombre}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" onclick="elegirZona()">
        <i class="ti ti-check"></i> Confirmar
      </button>`;
  } else {
    const zona = state.zonas.find(z => z.id === zonaId);
    wrap.innerHTML = `
      <span class="zona-badge"><i class="ti ti-map-pin"></i> ${zona?.nombre || 'Zona'}</span>
      <button class="btn btn-outline btn-xs" style="margin-left:8px;" onclick="cambiarZona()">Cambiar</button>`;
  }

  const exportarWrap = document.getElementById('exportar-wrap');
  if (exportarWrap) exportarWrap.style.display = zonaId ? 'block' : 'none';
}

function elegirZona() {
  const sel = document.getElementById('zona-select-hoy');
  const zonaId = sel.value;
  if (!zonaId) return;
  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = { zonaId: null, entregas: {} };
  state.ruta[today].zonaId = zonaId;
  actualizarCache();
  renderAll();
}

function cambiarZona() {
  if (!confirm('¿Cambiar la zona? Las entregas ya realizadas quedan guardadas en el historial.')) return;
  const today = getToday();
  if (state.ruta[today]) state.ruta[today].zonaId = null;
  actualizarCache();
  renderAll();
}

// ─── RENDER RUTA ─────────────────────────────────────────────────
function renderRuta() {
  const zonaId = getZonaHoy();
  const list   = document.getElementById('ruta-list');
  if (!zonaId) {
    list.innerHTML = '<div class="empty"><i class="ti ti-map-route" style="font-size:32px;opacity:.3;display:block;margin-bottom:8px;"></i>Elegí una zona para empezar el reparto</div>';
    return;
  }
  const today    = getToday();
  const clientes = clientesDeZona(zonaId);
  const entregas = state.ruta[today]?.entregas || {};

  if (!clientes.length) {
    list.innerHTML = '<div class="empty">No hay clientes en esta zona.</div>';
    return;
  }

  const pendientes = clientes.filter(c => !entregas[c.id]?.entregado);
  const entregados = clientes.filter(c => entregas[c.id]?.entregado);
  const clientesOrdenados = [...pendientes, ...entregados];

  list.innerHTML = clientesOrdenados.map(c => {
    const r = entregas[c.id] || {};
    const bid5  = r.bid5  ?? c.bidHab ?? 0;
    const bid10 = r.bid10 ?? c.bidHab10 ?? 0;
    const total = calcularTotal(bid5, bid10);

    return `
    <div class="cliente-card ${r.entregado ? 'entregado' : ''}">
      <div class="cliente-top">
        <div class="cliente-info">
          <div class="cliente-nombre">${c.nombre}</div>
          <div class="cliente-dir"><i class="ti ti-map-pin"></i> ${c.dir}</div>
          ${c.tel ? `<div class="cliente-dir"><i class="ti ti-phone"></i> <a href="tel:${c.tel}" style="color:#64748b;text-decoration:none;">${c.tel}</a></div>` : ''}
        </div>
        <div class="cliente-total">${formatPeso(total)}</div>
      </div>

      <div class="bid-grid">
        <div class="bid-row">
          <span class="bid-lbl">Bidones 5L <span class="bid-precio">${formatPeso(PRECIO_5)}/u</span></span>
          <div class="bid-ctrl">
            <button class="bid-btn" onclick="setBid('${c.id}',5,-1)">−</button>
            <span class="bid-val" id="bid5-${c.id}">${bid5}</span>
            <button class="bid-btn" onclick="setBid('${c.id}',5,1)">+</button>
          </div>
        </div>
        <div class="bid-row">
          <span class="bid-lbl">Bidones 10L <span class="bid-precio">${formatPeso(PRECIO_10)}/u</span></span>
          <div class="bid-ctrl">
            <button class="bid-btn" onclick="setBid('${c.id}',10,-1)">−</button>
            <span class="bid-val" id="bid10-${c.id}">${bid10}</span>
            <button class="bid-btn" onclick="setBid('${c.id}',10,1)">+</button>
          </div>
        </div>
      </div>
      <div class="pago-selector">
        <div class="pago-label">Pago</div>
        <div class="pago-btns">
          <button class="pago-btn ${r.pago==='efectivo'?'pago-btn-active':''}" onclick="setPago('${c.id}','efectivo')">💵 Efectivo</button>
          <button class="pago-btn ${r.pago==='transferencia'?'pago-btn-active':''}" onclick="setPago('${c.id}','transferencia')">🔵 Transferencia</button>
          <button class="pago-btn ${r.pago==='pendiente'?'pago-btn-pendiente':''}" onclick="setPago('${c.id}','pendiente')">⏳ Pendiente</button>
        </div>
      </div>

      <div class="dev-section">
        <div class="dev-label">Devoluciones</div>
        <div class="dev-row">
          <span>Bidones</span>
          <div class="bid-ctrl">
            <button class="bid-btn bid-btn-sm" onclick="setDev('${c.id}','bidones',-1)">−</button>
            <span class="bid-val" id="devBid-${c.id}">${r.devBidones||0}</span>
            <button class="bid-btn bid-btn-sm" onclick="setDev('${c.id}','bidones',1)">+</button>
          </div>
        </div>
        <div class="dev-row">
          <span>Canillas</span>
          <div class="bid-ctrl">
            <button class="bid-btn bid-btn-sm" onclick="setDev('${c.id}','canillas',-1)">−</button>
            <span class="bid-val" id="devCan-${c.id}">${r.devCanillas||0}</span>
            <button class="bid-btn bid-btn-sm" onclick="setDev('${c.id}','canillas',1)">+</button>
          </div>
        </div>
      </div>

     <button class="btn ${r.entregado ? 'btn-success' : 'btn-primary'} btn-block" 
        onclick="toggleEntrega('${c.id}')"
        ${!r.entregado && !r.pago ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
        ${r.entregado
          ? '<i class="ti ti-check"></i> Entregado'
          : '<i class="ti ti-truck-delivery"></i> Marcar entregado'}
      </button>
      ${!r.entregado && !r.pago ? '<div style="text-align:center;font-size:12px;color:#94a3b8;margin-top:6px;">Seleccioná un método de pago primero</div>' : ''}
      ${r.entregado && r.pago && r.pago !== 'pendiente' ? `
      <div style="text-align:center;margin-top:8px;color:#16a34a;font-size:13px;font-weight:600;">
        <i class="ti ti-circle-check"></i> Cobrado — ${r.pago === 'efectivo' ? '💵 Efectivo' : '🔵 Transferencia'}
      </div>` : ''}
    </div>`;
  }).join('');
}

// ─── Acciones de ruta ────────────────────────────────────────────
async function toggleEntrega(clienteId) {
  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = { zonaId: getZonaHoy(), entregas: {} };
  const r = state.ruta[today].entregas[clienteId] || {};
  const cliente = state.clientes.find(c => c.id === clienteId);

  if (!r.entregado) {
    state.ruta[today].entregas[clienteId] = {
      ...r,
      bid5: r.bid5 ?? (cliente?.bidHab || 0),
      bid10: r.bid10 ?? (cliente?.bidHab10 || 0),
      entregado: true,
      pago: r.pago || null
    };
  } else {
    state.ruta[today].entregas[clienteId] = { ...r, entregado: false };
  }

  try {
    await guardarEntrega(clienteId, state.ruta[today].entregas[clienteId]);
  } catch(e) { console.error(e); }

  renderRuta();
  renderStats();
}

let setBidLock = false;
async function setBid(clienteId, tipo, delta) {
  if (setBidLock) return;
  setBidLock = true;
  setTimeout(() => { setBidLock = false; }, 600);

  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = { zonaId: getZonaHoy(), entregas: {} };
  if (!state.ruta[today].entregas[clienteId]) {
    const cli = state.clientes.find(c => c.id === clienteId);
    state.ruta[today].entregas[clienteId] = { bid5: cli?.bidHab||0, bid10: cli?.bidHab10||0, entregado: false };
  }
  const r = state.ruta[today].entregas[clienteId];
  if (tipo === 5)  r.bid5  = Math.max(0, (r.bid5  || 0) + delta);
  if (tipo === 10) r.bid10 = Math.max(0, (r.bid10 || 0) + delta);

  const el5  = document.getElementById(`bid5-${clienteId}`);
  const el10 = document.getElementById(`bid10-${clienteId}`);
  if (el5)  el5.textContent  = r.bid5;
  if (el10) el10.textContent = r.bid10;

  actualizarCache();

  if (r.entregado) {
    try { await guardarEntrega(clienteId, r); } catch(e) { console.error(e); }
    renderStats();
  }
}

async function setPago(clienteId, pago) {
  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = { zonaId: getZonaHoy(), entregas: {} };
  if (!state.ruta[today].entregas[clienteId]) state.ruta[today].entregas[clienteId] = {};
  state.ruta[today].entregas[clienteId].pago = pago;
  actualizarCache();
  try { await guardarEntrega(clienteId, state.ruta[today].entregas[clienteId]); } catch(e) { console.error(e); }
  renderRuta();
}

async function setDev(clienteId, tipo, delta) {
  const today = getToday();
  if (!state.ruta[today]?.entregas[clienteId]) return;
  const r = state.ruta[today].entregas[clienteId];
  if (tipo === 'bidones')  r.devBidones  = Math.max(0, (r.devBidones  || 0) + delta);
  if (tipo === 'canillas') r.devCanillas = Math.max(0, (r.devCanillas || 0) + delta);
  const elB = document.getElementById(`devBid-${clienteId}`);
  const elC = document.getElementById(`devCan-${clienteId}`);
  if (elB) elB.textContent = r.devBidones || 0;
  if (elC) elC.textContent = r.devCanillas || 0;
  actualizarCache();
  try { await guardarEntrega(clienteId, r); } catch(e) { console.error(e); }
}

// ─── Stats ───────────────────────────────────────────────────────
function renderStats() {
  const today    = getToday();
  const entregas = state.ruta[today]?.entregas || {};
  let totalEntregas = 0, totalBid5 = 0, totalBid10 = 0, totalPesos = 0;

  Object.values(entregas).forEach(r => {
    if (r.entregado) {
      totalEntregas++;
      totalBid5  += r.bid5  || 0;
      totalBid10 += r.bid10 || 0;
      if (r.pago !== 'pendiente') totalPesos += calcularTotal(r.bid5||0, r.bid10||0);
    }
  });

  document.getElementById('stat-entregas').textContent = totalEntregas;
  document.getElementById('stat-bid5').textContent     = totalBid5;
  document.getElementById('stat-bid10').textContent    = totalBid10;

  const totalEl = document.getElementById('stat-total');
  const currentlyBlurred = totalEl.querySelector('#total-amount')?.style.filter === 'blur(6px)';
  totalEl.innerHTML = `<span id="total-amount" style="filter:${currentlyBlurred?'blur(6px)':'none'}">${formatPeso(totalPesos)}</span> <button onclick="toggleTotal()" style="background:none;border:none;color:white;cursor:pointer;font-size:14px;vertical-align:middle;"><i class="ti ti-eye" id="total-icon"></i></button>`;
}

let totalVisible = true;
function toggleTotal() {
  totalVisible = !totalVisible;
  const amount = document.getElementById('total-amount');
  const icon   = document.getElementById('total-icon');
  if (amount) amount.style.filter = totalVisible ? 'none' : 'blur(6px)';
  if (icon)   icon.className = totalVisible ? 'ti ti-eye' : 'ti ti-eye-off';
}

// ─── Historial ───────────────────────────────────────────────────
function renderHistorial() {
  const list = document.getElementById('hist-list');

  const today = getToday();
  const entregasHoy = state.ruta[today]?.entregas || {};
  const zonaIdHoy = getZonaHoy();
  const zonaNombreHoy = state.zonas.find(z => z.id === zonaIdHoy)?.nombre || 'Sin zona';
  const clientesEntregadosHoy = state.clientes.filter(c => entregasHoy[c.id]?.entregado);

  let htmlHoy = '';
  if (clientesEntregadosHoy.length) {
    const totalHoy = clientesEntregadosHoy.reduce((s, c) => s + calcularTotal(entregasHoy[c.id].bid5||0, entregasHoy[c.id].bid10||0), 0);
    htmlHoy = `
    <div class="hist-item" style="border-left:4px solid #0C447C;">
      <div class="hist-header" onclick="toggleHist('hoy')">
        <div>
          <div style="font-weight:600;">Hoy</div>
          <div style="font-size:12px;color:#888;">${zonaNombreHoy} · ${clientesEntregadosHoy.length} entregas</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <strong>${formatPeso(totalHoy)}</strong>
          <i class="ti ti-chevron-right hist-arrow" id="hist-arrow-hoy"></i>
        </div>
      </div>
      <div class="hist-body" id="hist-body-hoy" style="display:none;">
        ${clientesEntregadosHoy.map(c => {
          const r = entregasHoy[c.id];
          const tot = calcularTotal(r.bid5||0, r.bid10||0);
          const badge = r.pago === 'efectivo'
            ? '<span class="pago-badge pago-efec">💵 Efectivo</span>'
            : r.pago === 'transferencia'
              ? '<span class="pago-badge pago-tr">🔵 Transferencia</span>'
              : r.pago === 'pendiente'
                ? '<span class="pago-badge pago-pend">⏳ Pendiente</span>'
                : '';
          return `
          <div class="hist-row">
            <div>
              <div style="font-size:14px;">${c.nombre}</div>
              <div style="font-size:12px;color:#888;">${r.bid5||0}×5L + ${r.bid10||0}×10L ${badge}</div>
            </div>
            <span style="font-weight:600;">${formatPeso(tot)}</span>
          </div>`;
        }).join('')}
        <div class="hist-row hist-row-total" style="font-weight:700;font-size:15px;">
          <span>Total</span><span>${formatPeso(totalHoy)}</span>
        </div>
      </div>
    </div>`;
  }

  if (!state.historial.length && !clientesEntregadosHoy.length) {
    list.innerHTML = '<div class="empty">Todavía no hay historial de entregas.</div>';
    return;
  }

  list.innerHTML = htmlHoy + state.historial.map((h, idx) => {
    const uid = 'h' + idx;
    const total = h.entregas.reduce((s, e) => e.entregado ? s + calcularTotal(e.bid5||0, e.bid10||0) : s, 0);
    const efectivo = h.entregas.filter(e => e.entregado && e.pago === 'efectivo').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
    const transf   = h.entregas.filter(e => e.entregado && e.pago === 'transferencia').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
    const pendAmt  = h.entregas.filter(e => e.entregado && e.pago === 'pendiente').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
    const nEntregados = h.entregas.filter(e => e.entregado).length;
    const [anio, mes, dia] = h.fecha.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const fechaStr = `${dia} ${meses[parseInt(mes)-1]} ${anio}`;

    return `
    <div class="hist-item">
      <div class="hist-header" onclick="toggleHist('${uid}')">
        <div>
          <div style="font-weight:600;">${fechaStr}</div>
          <div style="font-size:12px;color:#888;">${h.zona} · ${nEntregados} entregas</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <strong>${formatPeso(total)}</strong>
          <i class="ti ti-chevron-right hist-arrow" id="hist-arrow-${uid}"></i>
        </div>
      </div>
      <div class="hist-body" id="hist-body-${uid}" style="display:none;">
        ${h.entregas.filter(e => e.entregado).map(e => {
          const tot = calcularTotal(e.bid5||0, e.bid10||0);
          const badge = e.pago === 'efectivo'
            ? '<span class="pago-badge pago-efec">💵 Efectivo</span>'
            : e.pago === 'transferencia'
              ? '<span class="pago-badge pago-tr">🔵 Transferencia</span>'
              : e.pago === 'pendiente'
                ? '<span class="pago-badge pago-pend">⏳ Pendiente</span>'
                : '';
          return `
          <div class="hist-row">
            <div>
              <div style="font-size:14px;">${e.nombre}</div>
              <div style="font-size:12px;color:#888;">${e.bid5||0}×5L + ${e.bid10||0}×10L ${badge}</div>
            </div>
            <span style="font-weight:600;">${formatPeso(tot)}</span>
          </div>`;
        }).join('')}
        <div class="hist-row hist-row-total"><span>💵 Efectivo</span><span>${formatPeso(efectivo)}</span></div>
        <div class="hist-row hist-row-total"><span>🔵 Transferencia</span><span>${formatPeso(transf)}</span></div>
        ${pendAmt ? `<div class="hist-row hist-row-total"><span>⏳ Pendiente</span><span>${formatPeso(pendAmt)}</span></div>` : ''}
        <div class="hist-row hist-row-total" style="font-weight:700;font-size:15px;"><span>Total</span><span>${formatPeso(total)}</span></div>
      </div>
    </div>`;
  }).join('');
}

function toggleHist(uid) {
  const body  = document.getElementById('hist-body-' + uid);
  const arrow = document.getElementById('hist-arrow-' + uid);
  const open  = body.style.display !== 'none';
  body.style.display    = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(90deg)';
}

// ─── Cobros pendientes ────────────────────────────────────────────
function renderCobrosPendientes() {
  const list = document.getElementById('pendientes-list');
  const pendientes = [];

  const today = getToday();
  const entregasHoy = state.ruta[today]?.entregas || {};
  const zonaIdHoy = getZonaHoy();
  const zonaNombreHoy = state.zonas.find(z => z.id === zonaIdHoy)?.nombre || 'Sin zona';

  state.clientes.forEach(c => {
    const r = entregasHoy[c.id];
    if (r?.entregado && r?.pago === 'pendiente') {
      pendientes.push({
        nombre: c.nombre, bid5: r.bid5||0, bid10: r.bid10||0,
        fecha: today, zona: zonaNombreHoy,
        total: calcularTotal(r.bid5||0, r.bid10||0),
        tel: c.tel||null, clienteId: c.id, esHoy: true
      });
    }
  });

  state.historial.forEach(h => {
    h.entregas.forEach(e => {
      if (e.entregado && e.pago === 'pendiente') {
        const cli = state.clientes.find(c => c.nombre === e.nombre);
        pendientes.push({
          nombre: e.nombre, bid5: e.bid5||0, bid10: e.bid10||0,
          fecha: h.fecha, zona: h.zona,
          total: calcularTotal(e.bid5||0, e.bid10||0),
          tel: cli?.tel||null, clienteId: cli?.id||null,
          entregaId: e.entregaId, esHoy: false
        });
      }
    });
  });

  if (!pendientes.length) {
    list.innerHTML = '<div class="empty"><i class="ti ti-check" style="font-size:32px;opacity:.3;display:block;margin-bottom:8px;"></i>No hay cobros pendientes 🎉</div>';
    return;
  }

  const totalGeneral = pendientes.reduce((s, p) => s + p.total, 0);

  list.innerHTML = `
    <div class="pend-total-banner">
      <span>Total pendiente</span>
      <strong>${formatPeso(totalGeneral)}</strong>
    </div>
    ${pendientes.map((p, idx) => {
      const [anio, mes, dia] = p.fecha.split('-');
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const fechaStr = `${dia} ${meses[parseInt(mes)-1]}`;
      return `
      <div class="pend-card" id="pend-card-${idx}">
        <div class="pend-header" onclick="togglePend(${idx})">
          <div>
            <div class="pend-nombre" id="pend-nombre-${idx}">${p.nombre}</div>
            <div style="font-size:12px;color:#888;">${fechaStr} · ${p.zona}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="pend-monto">${formatPeso(p.total)}</span>
            <i class="ti ti-chevron-right hist-arrow" id="pend-arrow-${idx}"></i>
          </div>
        </div>
        <div class="pend-body" id="pend-body-${idx}" style="display:none;">
          <div class="pend-detalle">
            <div class="hist-row"><span>Bidones 5L</span><span>${p.bid5} × ${formatPeso(PRECIO_5)} = ${formatPeso(p.bid5*PRECIO_5)}</span></div>
            <div class="hist-row"><span>Bidones 10L</span><span>${p.bid10} × ${formatPeso(PRECIO_10)} = ${formatPeso(p.bid10*PRECIO_10)}</span></div>
            <div class="hist-row hist-row-total"><strong>Total</strong><strong>${formatPeso(p.total)}</strong></div>
          </div>
          <div class="pend-acciones">
            ${p.tel ? `<a href="tel:${p.tel}" class="btn btn-outline btn-sm" style="flex:1;"><i class="ti ti-phone"></i> ${p.tel}</a>` : ''}
            <button class="btn btn-sm" style="flex:1;background:#dcfce7;color:#166534;border:none;" onclick="cobrarEfectivo(${idx},'${p.clienteId}','${p.entregaId||''}',${p.esHoy})">💵 Cobrar efectivo</button>
            <button class="btn btn-sm" style="flex:1;background:#dbeafe;color:#1e40af;border:none;" onclick="cobrarTransferencia(${idx},'${p.clienteId}','${p.entregaId||''}',${p.esHoy})">🔵 Transferencia</button>
          </div>
        </div>
      </div>`;
    }).join('')}`;
}

function togglePend(idx) {
  const body  = document.getElementById('pend-body-' + idx);
  const arrow = document.getElementById('pend-arrow-' + idx);
  const open  = body.style.display !== 'none';
  body.style.display    = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(90deg)';
}

async function cobrarEfectivo(idx, clienteId, entregaId, esHoy) {
  await marcarCobrado(idx, clienteId, entregaId, esHoy, 'efectivo');
}
async function cobrarTransferencia(idx, clienteId, entregaId, esHoy) {
  await marcarCobrado(idx, clienteId, entregaId, esHoy, 'transferencia');
}

async function marcarCobrado(idx, clienteId, entregaId, esHoy, metodoPago) {
  const body   = document.getElementById('pend-body-' + idx);
  const nombre = document.getElementById('pend-nombre-' + idx);
  const card   = document.getElementById('pend-card-' + idx);
  if (nombre) nombre.style.textDecoration = 'line-through';
  if (body) body.innerHTML = `
    <div style="text-align:center;padding:16px 0;color:#16a34a;font-weight:600;font-size:15px;">
      <i class="ti ti-circle-check" style="font-size:28px;display:block;margin-bottom:6px;"></i>
      Cobrado — ${metodoPago === 'efectivo' ? '💵 Efectivo' : '🔵 Transferencia'}
    </div>`;
  if (card) card.style.borderLeftColor = '#22c55e';

  try {
    if (esHoy) {
      const today = getToday();
      if (state.ruta[today]?.entregas[clienteId]) {
        state.ruta[today].entregas[clienteId].pago = metodoPago;
        await guardarEntrega(clienteId, state.ruta[today].entregas[clienteId]);
      }
    } else if (entregaId && entregaId !== 'undefined') {
      if (isOnline()) {
        await supa(`entregas?id=eq.${entregaId}`, {
          method: 'PATCH',
          body: JSON.stringify({ pago: metodoPago })
        });
      } else {
        agregarAColaOffline({ tipo: 'entrega_update', entregaId, datos: { pago: metodoPago } });
      }
    }
    actualizarCache();
    renderStats();
  } catch(e) { console.error(e); }
}

// ─── Clientes ────────────────────────────────────────────────────
function renderClientes() {
  const list = document.getElementById('clientes-list');
  if (!state.clientes.length) {
    list.innerHTML = '<div class="empty">No hay clientes. Agregá el primero.</div>';
    return;
  }
  const porZona = {};
  state.clientes.forEach(c => {
    const z = state.zonas.find(z => z.id === c.zonaId)?.nombre || 'Sin zona';
    if (!porZona[z]) porZona[z] = [];
    porZona[z].push(c);
  });
  list.innerHTML = Object.entries(porZona).map(([zona, clientes]) => `
    <div style="margin-bottom:16px;">
      <div class="zona-header">${zona}</div>
      ${clientes.map(c => `
        <div class="item-card">
          <div class="item-info">
            <div class="item-nombre">${c.nombre}</div>
            <div class="item-sub"><i class="ti ti-map-pin"></i> ${c.dir}</div>
            ${c.tel ? `<div class="item-sub"><i class="ti ti-phone"></i> ${c.tel}</div>` : ''}
            <div class="item-sub"><i class="ti ti-droplet"></i> ${c.bidHab} × 5L · ${c.bidHab10} × 10L habituales</div>
          </div>
          <div class="item-actions">
            <button class="icon-btn" onclick="editCliente('${c.id}')"><i class="ti ti-pencil"></i></button>
            <button class="icon-btn icon-btn-danger" onclick="deleteCliente('${c.id}')"><i class="ti ti-trash"></i></button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

function showAddCliente() {
  openModal(`
    <div class="modal-title">Nuevo cliente</div>
    <div class="field-group"><label class="field-label">Nombre *</label><input id="nc-nombre" class="input" placeholder="Ej: María García"></div>
    <div class="field-group"><label class="field-label">Dirección *</label><input id="nc-dir" class="input" placeholder="Ej: Av. San Martín 1234"></div>
    <div class="field-group"><label class="field-label">Teléfono</label><input id="nc-tel" class="input" type="tel" placeholder="Ej: 11 4523-1890"></div>
    <div class="field-group"><label class="field-label">Bidones 5L habituales</label><input id="nc-bid" class="input" type="number" min="0" value="0"></div>
    <div class="field-group"><label class="field-label">Bidones 10L habituales</label><input id="nc-bid10" class="input" type="number" min="0" value="0"></div>
    <div class="field-group"><label class="field-label">Zona</label>
      <select id="nc-zona" class="input">
        <option value="">Sin zona</option>
        ${state.zonas.map(z => `<option value="${z.id}">${z.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCliente()">Guardar</button>
    </div>
  `);
}

async function saveCliente() {
  const nombre = document.getElementById('nc-nombre').value.trim();
  const dir    = document.getElementById('nc-dir').value.trim();
  const tel    = document.getElementById('nc-tel').value.trim();
  const bid    = parseInt(document.getElementById('nc-bid').value) || 0;
  const bid10  = parseInt(document.getElementById('nc-bid10').value) || 0;
  const zonaId = document.getElementById('nc-zona').value || null;
  if (!nombre || !dir) { alert('Nombre y dirección son obligatorios.'); return; }

  showLoading(true);
  try {
    const rows = await supa('clientes', {
      method: 'POST',
      body: JSON.stringify({ nombre, direccion: dir, telefono: tel||null, bidones_habituales: bid, bidones_habituales_10: bid10, orden: state.clientes.length+1, zona_id: zonaId, usuario_id: currentUser.id })
    });
    state.clientes.push({ id: rows[0].id, nombre, dir, tel: tel||'', bidHab: bid, bidHab10: bid10, orden: state.clientes.length+1, zonaId });
    actualizarCache();
    closeModal();
    renderClientes();
    renderRuta();
  } catch(e) { alert('Error al guardar cliente.'); console.error(e); }
  showLoading(false);
}

function editCliente(id) {
  const c = state.clientes.find(c => c.id === id);
  if (!c) return;
  openModal(`
    <div class="modal-title">Editar cliente</div>
    <div class="field-group"><label class="field-label">Nombre *</label><input id="ec-nombre" class="input" value="${c.nombre}"></div>
    <div class="field-group"><label class="field-label">Dirección *</label><input id="ec-dir" class="input" value="${c.dir}"></div>
    <div class="field-group"><label class="field-label">Teléfono</label><input id="ec-tel" class="input" type="tel" value="${c.tel||''}"></div>
    <div class="field-group"><label class="field-label">Bidones 5L habituales</label><input id="ec-bid" class="input" type="number" min="0" value="${c.bidHab}"></div>
    <div class="field-group"><label class="field-label">Bidones 10L habituales</label><input id="ec-bid10" class="input" type="number" min="0" value="${c.bidHab10||0}"></div>
    <div class="field-group"><label class="field-label">Zona</label>
      <select id="ec-zona" class="input">
        <option value="">Sin zona</option>
        ${state.zonas.map(z => `<option value="${z.id}" ${z.id === c.zonaId ? 'selected' : ''}>${z.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="updateCliente('${id}')">Guardar</button>
    </div>
  `);
}

async function updateCliente(id) {
  const nombre = document.getElementById('ec-nombre').value.trim();
  const dir    = document.getElementById('ec-dir').value.trim();
  const tel    = document.getElementById('ec-tel').value.trim();
  const bid    = parseInt(document.getElementById('ec-bid').value) || 0;
  const bid10  = parseInt(document.getElementById('ec-bid10').value) || 0;
  const zonaId = document.getElementById('ec-zona').value || null;
  if (!nombre || !dir) { alert('Nombre y dirección son obligatorios.'); return; }

  showLoading(true);
  try {
    await supa(`clientes?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ nombre, direccion: dir, telefono: tel||null, bidones_habituales: bid, bidones_habituales_10: bid10, zona_id: zonaId })
    });
    const idx = state.clientes.findIndex(c => c.id === id);
    if (idx >= 0) state.clientes[idx] = { ...state.clientes[idx], nombre, dir, tel, bidHab: bid, bidHab10: bid10, zonaId };
    actualizarCache();
    closeModal();
    renderClientes();
    renderRuta();
  } catch(e) { alert('Error al actualizar cliente.'); console.error(e); }
  showLoading(false);
}

async function deleteCliente(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  showLoading(true);
  try {
    await supa(`clientes?id=eq.${id}`, { method: 'DELETE' });
    state.clientes = state.clientes.filter(c => c.id !== id);
    actualizarCache();
    renderClientes();
    renderRuta();
  } catch(e) { alert('Error al eliminar cliente.'); console.error(e); }
  showLoading(false);
}

// ─── Zonas ──────────────────────────────────────────────────────
function renderZonas() {
  const list = document.getElementById('zonas-list');
  if (!state.zonas.length) { list.innerHTML = '<div class="empty">No hay zonas.</div>'; return; }
  list.innerHTML = state.zonas.map(z => {
    const cant = state.clientes.filter(c => c.zonaId === z.id).length;
    return `
    <div class="item-card">
      <div class="item-info">
        <div class="item-nombre"><i class="ti ti-map-pin"></i> ${z.nombre}</div>
        <div class="item-sub">${cant} cliente(s)</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" onclick="editZona('${z.id}')"><i class="ti ti-pencil"></i></button>
        <button class="icon-btn icon-btn-danger" onclick="deleteZona('${z.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function showAddZona() {
  openModal(`
    <div class="modal-title">Nueva zona</div>
    <div class="field-group"><label class="field-label">Nombre *</label><input id="nz-nombre" class="input" placeholder="Ej: Barrio Norte"></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveZona()">Guardar</button>
    </div>
  `);
}

async function saveZona() {
  const nombre = document.getElementById('nz-nombre').value.trim();
  if (!nombre) { alert('El nombre es obligatorio.'); return; }
  showLoading(true);
  try {
    const rows = await supa('zonas', { method: 'POST', body: JSON.stringify({ nombre, usuario_id: currentUser.id }) });
    state.zonas.push({ id: rows[0].id, nombre });
    actualizarCache();
    closeModal();
    renderZonas();
    renderSelectorZona();
  } catch(e) { alert('Error al guardar zona.'); console.error(e); }
  showLoading(false);
}

function editZona(id) {
  const z = state.zonas.find(z => z.id === id);
  if (!z) return;
  openModal(`
    <div class="modal-title">Editar zona</div>
    <div class="field-group"><label class="field-label">Nombre *</label><input id="ez-nombre" class="input" value="${z.nombre}"></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="updateZona('${id}')">Guardar</button>
    </div>
  `);
}

async function updateZona(id) {
  const nombre = document.getElementById('ez-nombre').value.trim();
  if (!nombre) { alert('El nombre es obligatorio.'); return; }
  showLoading(true);
  try {
    await supa(`zonas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ nombre }) });
    const idx = state.zonas.findIndex(z => z.id === id);
    if (idx >= 0) state.zonas[idx].nombre = nombre;
    actualizarCache();
    closeModal();
    renderZonas();
    renderSelectorZona();
    renderClientes();
  } catch(e) { alert('Error al actualizar zona.'); console.error(e); }
  showLoading(false);
}

async function deleteZona(id) {
  if (!confirm('¿Eliminar esta zona?')) return;
  showLoading(true);
  try {
    await supa(`zonas?id=eq.${id}`, { method: 'DELETE' });
    state.zonas = state.zonas.filter(z => z.id !== id);
    state.clientes.forEach(c => { if (c.zonaId === id) c.zonaId = null; });
    actualizarCache();
    renderZonas();
    renderClientes();
    renderSelectorZona();
  } catch(e) { alert('Error al eliminar zona.'); console.error(e); }
  showLoading(false);
}

// ─── Exportar ────────────────────────────────────────────────────
function exportarResumen() {
  const today    = getToday();
  const zonaId   = getZonaHoy();
  const zona     = state.zonas.find(z => z.id === zonaId);
  const entregas = state.ruta[today]?.entregas || {};
  const clientes = clientesDeZona(zonaId);
  const [anio, mes, dia] = today.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${dia} de ${meses[parseInt(mes)-1]} de ${anio}`;

  let txt = `📦 TEXALAR REPARTO — ${fechaStr}\n`;
  txt += `Empleado: ${currentUser.nombre}\nZona: ${zona?.nombre || '—'}\n`;
  txt += '─'.repeat(32) + '\n';

  let totalPesos = 0, totalBid5 = 0, totalBid10 = 0;
  clientes.forEach(c => {
    const r = entregas[c.id];
    if (r?.entregado) {
      const tot = calcularTotal(r.bid5||0, r.bid10||0);
      totalPesos += tot; totalBid5 += r.bid5||0; totalBid10 += r.bid10||0;
      txt += `✅ ${c.nombre}\n   ${r.bid5||0}×5L + ${r.bid10||0}×10L = ${formatPeso(tot)}`;
      if (r.pago) txt += ` (${r.pago})`;
      txt += '\n';
    } else {
      txt += `⬜ ${c.nombre} — sin entregar\n`;
    }
  });

  txt += '─'.repeat(32) + '\n';
  txt += `Total: ${totalBid5}×5L + ${totalBid10}×10L = ${formatPeso(totalPesos)}\n`;

  navigator.clipboard?.writeText(txt).then(() => {
    alert('Resumen copiado al portapapeles ✅');
  }).catch(() => {
    if (navigator.share) navigator.share({ text: txt });
  });
}

// ─── Navegación ──────────────────────────────────────────────────
function showTab(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('sec-' + tab).classList.add('active');
  btn.classList.add('active');
  const exp = document.getElementById('exportar-wrap');
  if (exp) exp.style.display = (tab === 'ruta' && getZonaHoy()) ? 'block' : 'none';
  if (tab === 'historial')  renderHistorial();
  if (tab === 'pendientes') renderCobrosPendientes();
}

function renderFecha() {
  const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const hoy   = new Date();
  const str   = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;
  document.getElementById('fecha-hoy').textContent = str;
  const adminFecha = document.getElementById('admin-fecha');
  if (adminFecha) adminFecha.textContent = str;
}

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'block';
  document.getElementById('modal').style.display = 'block';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════
//  PANEL ADMIN
// ═══════════════════════════════════════════════════════════════
async function cargarAdmin() {
  renderFecha();
  showLoading(true);
  try {
    const empleados = await supa('usuarios?rol=eq.empleado&select=id,nombre&order=nombre');
    renderAdminEmpleados(empleados);
    await cargarResumenHoy(empleados);
    await cargarHistorialAdmin(empleados);
  } catch(e) {
    console.error(e);
    document.getElementById('admin-resumen-hoy').innerHTML = '<div class="empty">Error al cargar datos.</div>';
  }
  showLoading(false);
}

async function cargarResumenHoy(empleados) {
  const today = getToday();
  const el = document.getElementById('admin-resumen-hoy');
  try {
    const entregas = await supa(`entregas?fecha=eq.${today}&select=usuario_id,bid5,bid10,pago,entregado`);
    if (!entregas.length) { el.innerHTML = '<div class="empty">Sin entregas registradas hoy.</div>'; return; }
    let html = '', totalGeneral = 0;
    empleados.forEach(emp => {
      const ents = entregas.filter(e => e.usuario_id === emp.id && e.entregado);
      if (!ents.length) return;
      const total  = ents.reduce((s,e) => s + calcularTotal(e.bid5||0, e.bid10||0), 0);
      const efect  = ents.filter(e => e.pago==='efectivo').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
      const transf = ents.filter(e => e.pago==='transferencia').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
      const pend   = ents.filter(e => e.pago==='pendiente').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
      totalGeneral += total;
      html += `<div class="admin-emp-card">
        <div class="admin-emp-nombre">${emp.nombre}</div>
        <div class="admin-stat-row"><span>${ents.length} entregas</span><span>${formatPeso(total)}</span></div>
        ${efect  ? `<div class="admin-stat-row admin-stat-sub"><span>💵 Efectivo</span><span>${formatPeso(efect)}</span></div>` : ''}
        ${transf ? `<div class="admin-stat-row admin-stat-sub"><span>🔵 Transferencia</span><span>${formatPeso(transf)}</span></div>` : ''}
        ${pend   ? `<div class="admin-stat-row admin-stat-sub"><span>⏳ Pendiente</span><span>${formatPeso(pend)}</span></div>` : ''}
      </div>`;
    });
    html += `<div class="admin-total-banner"><span>Total del día</span><strong>${formatPeso(totalGeneral)}</strong></div>`;
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="empty">Error al cargar resumen.</div>'; }
}

async function cargarHistorialAdmin(empleados) {
  const hace14 = new Date(); hace14.setDate(hace14.getDate()-14);
  const desde = hace14.toISOString().slice(0,10);
  const today = getToday();
  const el = document.getElementById('admin-historial');
  try {
    const entregas = await supa(`entregas?fecha=gte.${desde}&fecha=lt.${today}&select=usuario_id,fecha,bid5,bid10,pago,entregado&order=fecha.desc`);
    if (!entregas.length) { el.innerHTML = '<div class="empty">Sin historial en los últimos 14 días.</div>'; return; }
    const porFecha = {};
    entregas.forEach(e => { if (!porFecha[e.fecha]) porFecha[e.fecha]=[]; porFecha[e.fecha].push(e); });
    el.innerHTML = Object.keys(porFecha).sort().reverse().map(fecha => {
      const [anio,mes,dia] = fecha.split('-');
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const fechaStr = `${dia} ${meses[parseInt(mes)-1]} ${anio}`;
      const entsF = porFecha[fecha].filter(e => e.entregado);
      const totalF = entsF.reduce((s,e) => s + calcularTotal(e.bid5||0, e.bid10||0), 0);
      const porEmp = empleados.map(emp => {
        const ents = entsF.filter(e => e.usuario_id === emp.id);
        if (!ents.length) return '';
        const tot = ents.reduce((s,e) => s + calcularTotal(e.bid5||0, e.bid10||0), 0);
        return `<div class="admin-stat-row admin-stat-sub"><span>${emp.nombre}</span><span>${formatPeso(tot)}</span></div>`;
      }).join('');
      return `<div class="admin-hist-item">
        <div class="admin-stat-row" style="font-weight:600;margin-bottom:4px;"><span>${fechaStr}</span><span>${formatPeso(totalF)}</span></div>
        ${porEmp}
      </div>`;
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Error al cargar historial.</div>'; }
}

function renderAdminEmpleados(empleados) {
  const list = document.getElementById('admin-empleados-list');
  if (!empleados.length) { list.innerHTML = '<div class="empty">No hay empleados.</div>'; return; }
  list.innerHTML = empleados.map(e => `
    <div class="item-card">
      <div class="item-info"><div class="item-nombre">${e.nombre}</div><div class="item-sub">Empleado</div></div>
      <button class="icon-btn icon-btn-danger" onclick="deleteEmpleado('${e.id}')"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}

function showAddEmpleado() {
  openModal(`
    <div class="modal-title">Nuevo empleado</div>
    <div class="field-group"><label class="field-label">Nombre *</label><input id="ne-nombre" class="input" placeholder="Ej: Juan López"></div>
    <div class="field-group"><label class="field-label">Clave *</label><input id="ne-clave" class="input" type="password" placeholder="Mínimo 4 caracteres"></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveEmpleado()">Crear</button>
    </div>
  `);
}

async function saveEmpleado() {
  const nombre = document.getElementById('ne-nombre').value.trim();
  const clave  = document.getElementById('ne-clave').value.trim();
  if (!nombre || !clave) { alert('Nombre y clave son obligatorios.'); return; }
  if (clave.length < 4)  { alert('La clave debe tener al menos 4 caracteres.'); return; }
  showLoading(true);
  try {
    await supa('usuarios', { method: 'POST', body: JSON.stringify({ nombre, clave, rol: 'empleado' }) });
    closeModal();
    await cargarAdmin();
  } catch(e) { alert('Error al crear empleado.'); console.error(e); }
  showLoading(false);
}

async function deleteEmpleado(id) {
  if (!confirm('¿Eliminar este empleado?')) return;
  showLoading(true);
  try {
    await supa(`usuarios?id=eq.${id}`, { method: 'DELETE' });
    await cargarAdmin();
  } catch(e) { alert('Error al eliminar empleado.'); console.error(e); }
  showLoading(false);
}

// ─── Banner instalación ──────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-banner').style.display = 'flex';
});

function instalarApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      document.getElementById('install-banner').style.display = 'none';
    });
  } else {
    document.getElementById('install-banner').style.display = 'none';
    openModal(`
      <div class="modal-title">📲 Instalá la app</div>
      <p style="font-size:14px;color:#475569;margin-bottom:16px;">Para guardar la app en tu pantalla de inicio:</p>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:10px;">
        <div style="font-weight:600;margin-bottom:6px;">Android (Chrome)</div>
        <div style="font-size:13px;color:#475569;">1. Tocá los tres puntitos ⋮ arriba a la derecha<br>2. Tocá <strong>"Agregar a pantalla de inicio"</strong><br>3. Confirmá</div>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;">
        <div style="font-weight:600;margin-bottom:6px;">iPhone (Safari)</div>
        <div style="font-size:13px;color:#475569;">1. Tocá el ícono de compartir 📤 abajo<br>2. Tocá <strong>"Agregar a pantalla de inicio"</strong><br>3. Confirmá</div>
      </div>
      <div class="modal-footer" style="margin-top:16px;">
        <button class="btn btn-primary" onclick="closeModal()">Entendido</button>
      </div>
    `);
  }
}

function cerrarBanner() {
  document.getElementById('install-banner').style.display = 'none';
  localStorage.setItem('banner_cerrado', '1');
}

// ═══════════════════════════════════════════════════════════════
//  ARRANQUE
// ═══════════════════════════════════════════════════════════════
(async () => {
  // Mostrar banner de instalación después de 3 segundos
  if (!localStorage.getItem('banner_cerrado')) {
    setTimeout(() => {
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'flex';
    }, 3000);
  }

 const saved = localStorage.getItem('texalar_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      // Sincronizar cola ANTES de cargar datos frescos
      if (isOnline()) {
        await sincronizarCola();
      }
      await iniciarSesion();
    } catch(e) {
      localStorage.removeItem('texalar_user');
    }
  }
})();
