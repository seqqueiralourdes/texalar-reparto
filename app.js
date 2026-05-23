// ─── Configuración Supabase ───────────────────────────────────
const SUPABASE_URL = 'https://qrrbspqxcvnbrsnepdgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OrXy_D4fB0agmE-53Oytnw_3Ff6RSuK';

const PRECIO_5  = 5000;
const PRECIO_10 = 8000;

// ─── Estado ───────────────────────────────────────────────────
let currentUser = null;
let zonas       = [];
let clientes    = [];
let entregas    = {};
let historial   = [];
let zonaHoy     = null;

// ─── Supabase fetch helper ────────────────────────────────────
async function db(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        options.prefer || 'return=representation',
      ...options.headers
    },
    ...options
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function showLoading(v) {
  document.getElementById('loading').style.display = v ? 'flex' : 'none';
}

// ─── Login / Logout ───────────────────────────────────────────
async function login() {
  const nombre = document.getElementById('login-nombre').value.trim();
  const clave  = document.getElementById('login-clave').value.trim();
  if (!nombre || !clave) { alert('Completá usuario y contraseña.'); return; }

  showLoading(true);
  try {
    const rows = await db(`usuarios?nombre=eq.${encodeURIComponent(nombre)}&clave=eq.${encodeURIComponent(clave)}&select=*`);
    if (!rows.length) {
      document.getElementById('login-error').style.display = 'block';
      return;
    }
    currentUser = rows[0];
    document.getElementById('login-error').style.display = 'none';
    localStorage.setItem('texalar_user', JSON.stringify(currentUser));

    if (currentUser.rol === 'admin') {
      showScreen('admin');
      await cargarAdmin();
    } else {
      showScreen('app');
      await cargarDatos();
    }
  } catch(e) {
    alert('Error al conectar. Intentá de nuevo.');
    console.error(e);
  } finally {
    showLoading(false);
  }
}

function logout() {
  currentUser = null;
  zonas = []; clientes = []; entregas = {}; historial = []; zonaHoy = null;
  localStorage.removeItem('texalar_user');
  document.getElementById('login-nombre').value = '';
  document.getElementById('login-clave').value  = '';
  showScreen('login');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// ─── Cargar datos del empleado ────────────────────────────────
async function cargarDatos() {
  showLoading(true);
  try {
    // Zonas
    zonas = await db(`zonas?usuario_id=eq.${currentUser.id}&order=created_at`);
    // Clientes
    clientes = await db(`clientes?usuario_id=eq.${currentUser.id}&order=orden`);
    // Entregas de hoy
    const today = getToday();
    const hoy = await db(`entregas?usuario_id=eq.${currentUser.id}&fecha=eq.${today}&select=*,clientes(nombre)`);
    entregas = {};
    hoy.forEach(e => { entregas[e.cliente_id] = e; });
    // Historial de la semana
    const lunesFecha = getLunes();
    historial = await db(`entregas?usuario_id=eq.${currentUser.id}&fecha=gte.${lunesFecha}&entregado=eq.true&select=*,clientes(nombre,zona_id),zonas:clientes(zona_id(nombre))`);

    renderFecha();
    renderHeaderUser();
    renderSelectorZona();
    renderOpcionesZona();
    renderZonaSelect();
    renderClientes();
    renderZonas();
    renderHistorial();
    renderStats();
    renderCobrosPendientes();
  } catch(e) {
    console.error(e);
    alert('Error cargando datos.');
  } finally {
    showLoading(false);
  }
}

function renderHeaderUser() {
  const el = document.getElementById('header-user');
  if (el) el.textContent = `👤 ${currentUser.nombre}`;
}

// ─── Utilidades ───────────────────────────────────────────────
function getToday()  { return new Date().toISOString().slice(0,10); }
function getLunes()  {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  return lunes.toISOString().slice(0,10);
}
function formatDate(d)        { const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }
function initials(n)          { return n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function formatPeso(n)        { return '$' + Math.round(n).toLocaleString('es-AR'); }
function calcularTotal(b5,b10){ return (b5*PRECIO_5) + (b10*PRECIO_10); }
function clientesDeZona(zid)  { return clientes.filter(c => c.zona_id === zid); }

// ─── Stats ────────────────────────────────────────────────────
let totalVisible = true;

function renderStats() {
  const clientesZona = zonaHoy ? clientesDeZona(zonaHoy.id) : [];
  const entregados   = clientesZona.filter(c => entregas[c.id]?.entregado);
  const pct = clientesZona.length ? Math.round((entregados.length/clientesZona.length)*100) : 0;

  document.getElementById('stat-clientes').textContent = `${entregados.length}/${clientesZona.length}`;
  document.getElementById('prog-bar').style.width = pct + '%';
  document.getElementById('prog-pct').textContent  = pct + '%';

  // Total del día completo
  const today = getToday();
  const todasHoy = Object.values(entregas).filter(e => e.entregado);
  const histHoy  = historial.filter(e => e.fecha === today && e.entregado);
  const todas    = [...todasHoy, ...histHoy];

  const totalEf = todas.filter(e => (e.pago||'efectivo')==='efectivo')
    .reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
  const totalTr = todas.filter(e => e.pago==='transferencia')
    .reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
  const totalDia = totalEf + totalTr;

  const totalEl = document.getElementById('stat-total');
  if (totalEl) {
    totalEl.innerHTML = `<span class="total-prefix">$</span><span class="total-amount" id="total-amount">${Math.round(totalDia).toLocaleString('es-AR')}</span><button class="total-toggle" onclick="toggleTotal()"><i class="ti ti-eye" id="total-icon"></i></button>`;
    if (!totalVisible) {
      const amt = document.getElementById('total-amount');
      if (amt) amt.style.filter = 'blur(4px)';
    }
  }

  const desgEl = document.getElementById('stat-desglose');
  if (desgEl) {
    desgEl.innerHTML = `
      <div class="desglose-item">💵 <span>${formatPeso(totalEf)}</span></div>
      <div class="desglose-item">🔵 <span>${formatPeso(totalTr)}</span></div>`;
  }

  const totalDevBid = clientesZona.reduce((s,c) => s+(entregas[c.id]?.dev_bidones||0), 0);
  const totalDevCan = clientesZona.reduce((s,c) => s+(entregas[c.id]?.dev_canillas||0), 0);
  const devEl = document.getElementById('stat-devoluciones');
  if (devEl) {
    devEl.innerHTML = `
      <div class="desglose-item">🪣 ${totalDevBid} bid. devueltos</div>
      <div class="desglose-item">🚰 ${totalDevCan} canillas devueltas</div>`;
  }

  const exportarWrap = document.getElementById('exportar-wrap');
  if (exportarWrap) exportarWrap.style.display = entregados.length > 0 ? 'block' : 'none';
}

function toggleTotal() {
  totalVisible = !totalVisible;
  const amt  = document.getElementById('total-amount');
  const icon = document.getElementById('total-icon');
  if (amt)  amt.style.filter = totalVisible ? 'none' : 'blur(4px)';
  if (icon) icon.className   = totalVisible ? 'ti ti-eye' : 'ti ti-eye-off';
}

// ─── Fecha ────────────────────────────────────────────────────
function renderFecha() {
  const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const hoy   = new Date();
  const el = document.getElementById('fecha-hoy');
  if (el) el.textContent = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;
}

// ─── Navegación ───────────────────────────────────────────────
function showTab(tab, btn) {
  document.querySelectorAll('#screen-app .section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#screen-app .nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('sec-' + tab).classList.add('active');
  btn.classList.add('active');
  const exportarWrap = document.getElementById('exportar-wrap');
  if (exportarWrap) exportarWrap.style.display = (tab==='ruta' && zonaHoy) ? 'block' : 'none';
  if (tab === 'pendientes') renderCobrosPendientes();
  if (tab === 'historial')  renderHistorial();
}

// ─── Selector de zona ─────────────────────────────────────────
function renderSelectorZona() {
  if (zonaHoy) {
    document.getElementById('zona-selector').style.display = 'none';
    document.getElementById('zona-activa').style.display   = 'flex';
    document.getElementById('zona-activa-nombre').textContent = zonaHoy.nombre;
  } else {
    document.getElementById('zona-selector').style.display = 'block';
    document.getElementById('zona-activa').style.display   = 'none';
    document.getElementById('ruta-list').innerHTML = '';
  }
}

function renderOpcionesZona() {
  const list = document.getElementById('zonas-opciones');
  if (!zonas.length) {
    list.innerHTML = '<div class="empty">No hay zonas creadas. Agregá una en la pestaña Zonas.</div>';
    return;
  }
  list.innerHTML = zonas.map(z => {
    const todos      = clientesDeZona(z.id);
    const pendientes = todos.filter(c => !entregas[c.id]?.entregado).length;
    return `
      <button class="zona-opcion" onclick="elegirZona('${z.id}')">
        <span class="zona-opcion-icon">📍</span>
        <span class="zona-opcion-nombre">${z.nombre}</span>
        <span class="zona-opcion-cant">${pendientes} pendientes</span>
      </button>`;
  }).join('');
}

function elegirZona(zonaId) {
  zonaHoy = zonas.find(z => z.id === zonaId);
  initEntregas();
  renderSelectorZona();
  renderRuta();
  renderStats();
}

function cambiarZona() {
  if (!confirm('¿Cambiar la zona? Las entregas ya realizadas quedan en el historial.')) return;
  zonaHoy = null;
  renderSelectorZona();
  renderOpcionesZona();
  renderStats();
}

function initEntregas() {
  if (!zonaHoy) return;
  clientesDeZona(zonaHoy.id).forEach(c => {
    if (!entregas[c.id]) {
      entregas[c.id] = {
        cliente_id: c.id, usuario_id: currentUser.id,
        fecha: getToday(), bid5: 0, bid10: c.bidones_habituales||1,
        pago: null, dev_bidones: 0, dev_canillas: 0, entregado: false
      };
    }
  });
}

// ─── Ruta ─────────────────────────────────────────────────────
function renderRuta() {
  if (!zonaHoy) { document.getElementById('ruta-list').innerHTML = ''; return; }

  const lista = clientesDeZona(zonaHoy.id).sort((a,b) => a.orden - b.orden);

  if (!lista.length) {
    document.getElementById('ruta-list').innerHTML = `<div class="empty">No hay clientes en ${zonaHoy.nombre}.</div>`;
    renderStats(); return;
  }

  const pendientes = lista.filter(c => !entregas[c.id]?.entregado);
  const pendientesHtml = pendientes.length
    ? `<div class="pendientes-bar">⏳ ${pendientes.length} pendiente${pendientes.length!==1?'s':''}: ${pendientes.map(c=>c.nombre.split(' ')[0]).join(', ')}</div>`
    : `<div class="pendientes-bar pendientes-ok">✅ Todos entregados</div>`;

  document.getElementById('ruta-list').innerHTML = pendientesHtml + lista.map(c => {
    const r    = entregas[c.id] || { bid5:0, bid10:c.bidones_habituales||1, entregado:false, pago:null, dev_bidones:0, dev_canillas:0 };
    const done = r.entregado;
    const total = calcularTotal(r.bid5, r.bid10);
    const pagoLabel = r.pago==='transferencia' ? '<span class="pago-badge pago-transf">🔵 Transferencia</span>'
                    : r.pago==='efectivo'      ? '<span class="pago-badge pago-efec">💵 Efectivo</span>'
                    : r.pago==='pendiente'     ? '<span class="pago-badge pago-pend">⏳ Pendiente</span>'
                    : '';
    return `
      <div class="card ${done?'done':''}">
        <div class="card-top">
          <div class="stop-badge ${done?'done':''}">${c.orden}</div>
          <div style="flex:1;min-width:0;">
            <div class="client-name ${done?'done':''}">${c.nombre}</div>
            <div class="client-addr">📍 ${c.direccion}</div>
            ${c.telefono ? `<div class="client-tel">📞 ${c.telefono}</div>` : ''}
          </div>
          ${done ? `<div class="card-total">${formatPeso(total)}</div>` : ''}
        </div>
        <div class="bid-grid">
          <div class="bid-row">
            <span class="bid-tipo">5 lts</span>
            <button class="bid-btn" onclick="cambiarBidones('${c.id}','bid5',-1)" ${done?'disabled':''}>−</button>
            <span class="bid-num">${r.bid5}</span>
            <button class="bid-btn" onclick="cambiarBidones('${c.id}','bid5',1)" ${done?'disabled':''}>+</button>
            <span class="bid-precio">${formatPeso(PRECIO_5)}c/u</span>
          </div>
          <div class="bid-row">
            <span class="bid-tipo">10 lts</span>
            <button class="bid-btn" onclick="cambiarBidones('${c.id}','bid10',-1)" ${done?'disabled':''}>−</button>
            <span class="bid-num">${r.bid10}</span>
            <button class="bid-btn" onclick="cambiarBidones('${c.id}','bid10',1)" ${done?'disabled':''}>+</button>
            <span class="bid-precio">${formatPeso(PRECIO_10)}c/u</span>
          </div>
        </div>
        ${!done ? `
        <div class="pago-selector">
          <span class="pago-label">Método de pago:</span>
          <div class="pago-btns">
            <button class="pago-btn ${r.pago==='efectivo'?'pago-btn-active':''}" onclick="setPago('${c.id}','efectivo')">💵 Efectivo</button>
            <button class="pago-btn ${r.pago==='transferencia'?'pago-btn-active':''}" onclick="setPago('${c.id}','transferencia')">🔵 Transferencia</button>
            <button class="pago-btn ${r.pago==='pendiente'?'pago-btn-pendiente':''}" onclick="setPago('${c.id}','pendiente')">⏳ Pendiente</button>
          </div>
        </div>` : `<div style="margin-bottom:10px;">${pagoLabel}</div>`}
        <div class="dev-section">
          <div class="dev-row">
            <span class="dev-label">🪣 ¿Devuelve bidones?</span>
            <div class="dev-ctrl">
              <button class="bid-btn" onclick="cambiarDev('${c.id}','dev_bidones',-1)" ${done?'disabled':''}>−</button>
              <span class="bid-num">${r.dev_bidones||0}</span>
              <button class="bid-btn" onclick="cambiarDev('${c.id}','dev_bidones',1)" ${done?'disabled':''}>+</button>
            </div>
          </div>
          <div class="dev-row">
            <span class="dev-label">🚰 ¿Devuelve canillas?</span>
            <div class="dev-ctrl">
              <button class="bid-btn" onclick="cambiarDev('${c.id}','dev_canillas',-1)" ${done?'disabled':''}>−</button>
              <span class="bid-num">${r.dev_canillas||0}</span>
              <button class="bid-btn" onclick="cambiarDev('${c.id}','dev_canillas',1)" ${done?'disabled':''}>+</button>
            </div>
          </div>
        </div>
        <div class="card-bottom">
          <div class="subtotal">Subtotal: <strong>${formatPeso(total)}</strong></div>
          <button class="mark-btn ${done?'done':''}" onclick="toggleEntregado('${c.id}')" ${!done&&!r.pago?'disabled':''}>
            ${done ? '✓ Entregado' : 'Marcar entregado'}
          </button>
        </div>
      </div>`;
  }).join('');
  renderStats();
}

function cambiarBidones(id, tipo, delta) {
  if (!entregas[id]) return;
  entregas[id][tipo] = Math.max(0, (entregas[id][tipo]||0) + delta);
  renderRuta();
}

function cambiarDev(id, tipo, delta) {
  if (!entregas[id]) return;
  entregas[id][tipo] = Math.max(0, (entregas[id][tipo]||0) + delta);
  renderRuta();
}

function setPago(id, metodo) {
  if (!entregas[id]) return;
  entregas[id].pago = metodo;
  renderRuta();
}

async function toggleEntregado(id) {
  if (!entregas[id]) return;
  const e = entregas[id];
  if (!e.entregado && !e.pago) { alert('Seleccioná un método de pago antes de marcar como entregado.'); return; }
  e.entregado = !e.entregado;
  renderRuta();

  // Guardar en Supabase
  try {
    if (e.id) {
      // Actualizar
      await db(`entregas?id=eq.${e.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          bid5: e.bid5, bid10: e.bid10, pago: e.pago,
          dev_bidones: e.dev_bidones, dev_canillas: e.dev_canillas,
          entregado: e.entregado
        })
      });
    } else {
      // Crear
      const rows = await db('entregas', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: id, usuario_id: currentUser.id,
          fecha: getToday(), bid5: e.bid5, bid10: e.bid10,
          pago: e.pago, dev_bidones: e.dev_bidones,
          dev_canillas: e.dev_canillas, entregado: e.entregado
        })
      });
      if (rows[0]) entregas[id].id = rows[0].id;
    }
    await recargarHistorial();
    renderStats();
  } catch(err) {
    console.error('Error guardando entrega:', err);
  }
}

async function recargarHistorial() {
  const lunesFecha = getLunes();
  historial = await db(`entregas?usuario_id=eq.${currentUser.id}&fecha=gte.${lunesFecha}&entregado=eq.true&select=*,clientes(nombre,zona_id,zonas:zona_id(nombre))`);
  renderHistorial();
  renderCobrosPendientes();
}

// ─── Exportar ─────────────────────────────────────────────────
function exportarResumen() {
  if (!zonaHoy) return;
  const today = getToday();
  const lista = clientesDeZona(zonaHoy.id).filter(c => entregas[c.id]?.entregado);
  if (!lista.length) { alert('No hay entregas realizadas hoy.'); return; }

  let texto = `TEXALAR REPARTO — ${formatDate(today)}\nEmpleado: ${currentUser.nombre}\nZona: ${zonaHoy.nombre}\n${'─'.repeat(30)}\n`;
  let totalEf = 0, totalTr = 0;

  lista.forEach(c => {
    const e = entregas[c.id];
    const total = calcularTotal(e.bid5||0, e.bid10||0);
    const pago  = e.pago==='transferencia' ? '🔵 Transferencia' : e.pago==='pendiente' ? '⏳ Pendiente' : '💵 Efectivo';
    texto += `• ${c.nombre} (${pago})\n`;
    if (e.bid5  > 0) texto += `  ${e.bid5} bidón/es 5lts\n`;
    if (e.bid10 > 0) texto += `  ${e.bid10} bidón/es 10lts\n`;
    texto += `  Subtotal: ${formatPeso(total)}\n`;
    if (e.pago==='transferencia') totalTr += total;
    else if (e.pago!=='pendiente') totalEf += total;
  });

  const devBid = lista.reduce((s,c) => s+(entregas[c.id]?.dev_bidones||0), 0);
  const devCan = lista.reduce((s,c) => s+(entregas[c.id]?.dev_canillas||0), 0);

  texto += `${'─'.repeat(30)}\n`;
  texto += `💵 Efectivo:      ${formatPeso(totalEf)}\n`;
  texto += `🔵 Transferencia: ${formatPeso(totalTr)}\n`;
  texto += `TOTAL:            ${formatPeso(totalEf+totalTr)}\n`;
  texto += `${'─'.repeat(30)}\n`;
  texto += `🪣 Bidones recolectados:  ${devBid}\n`;
  texto += `🚰 Canillas recolectadas: ${devCan}\n`;

  navigator.clipboard.writeText(texto)
    .then(() => alert('¡Resumen copiado al portapapeles!'))
    .catch(() => prompt('Copiá este resumen:', texto));
}

// ─── Zonas ────────────────────────────────────────────────────
function renderZonas() {
  const list = document.getElementById('zonas-list');
  if (!zonas.length) { list.innerHTML = '<div class="empty">No hay zonas creadas todavía.</div>'; return; }
  list.innerHTML = zonas.map(z => {
    const cant = clientesDeZona(z.id).length;
    return `
      <div class="client-card">
        <div class="client-avatar" style="font-size:18px;">📍</div>
        <div class="client-info">
          <div class="client-card-name">${z.nombre}</div>
          <div class="client-card-detail">${cant} cliente${cant!==1?'s':''}</div>
        </div>
        <button class="del-btn" onclick="eliminarZona('${z.id}')">🗑</button>
      </div>`;
  }).join('');
}

async function agregarZona() {
  const nombre = document.getElementById('inp-zona').value.trim();
  if (!nombre) { alert('Escribí un nombre para la zona.'); return; }
  if (zonas.find(z => z.nombre === nombre)) { alert('Ya existe una zona con ese nombre.'); return; }
  showLoading(true);
  try {
    const rows = await db('zonas', { method:'POST', body: JSON.stringify({ nombre, usuario_id: currentUser.id }) });
    zonas.push(rows[0]);
    document.getElementById('inp-zona').value = '';
    renderZonas(); renderZonaSelect(); renderOpcionesZona();
  } catch(e) { alert('Error al agregar zona.'); console.error(e); }
  finally { showLoading(false); }
}

async function eliminarZona(id) {
  const cant = clientesDeZona(id).length;
  if (cant > 0) { alert(`No podés eliminar esta zona porque tiene ${cant} cliente${cant!==1?'s':''} asignado${cant!==1?'s':''}.`); return; }
  if (!confirm('¿Eliminar esta zona?')) return;
  showLoading(true);
  try {
    await db(`zonas?id=eq.${id}`, { method:'DELETE', prefer:'return=minimal' });
    zonas = zonas.filter(z => z.id !== id);
    renderZonas(); renderZonaSelect(); renderOpcionesZona();
  } catch(e) { alert('Error al eliminar zona.'); }
  finally { showLoading(false); }
}

function renderZonaSelect() {
  const sel = document.getElementById('inp-zona-cliente');
  sel.innerHTML = '<option value="">Seleccioná una zona</option>' +
    zonas.map(z => `<option value="${z.id}">${z.nombre}</option>`).join('');
}

// ─── Clientes ─────────────────────────────────────────────────
function renderClientes() {
  const sorted = [...clientes].sort((a,b) => a.orden - b.orden);
  if (!sorted.length) { document.getElementById('clientes-list').innerHTML = '<div class="empty">No hay clientes todavía.</div>'; return; }
  document.getElementById('clientes-list').innerHTML = sorted.map(c => {
    const zona = zonas.find(z => z.id === c.zona_id);
    return `
      <div class="client-card">
        <div class="client-avatar">${initials(c.nombre)}</div>
        <div class="client-info">
          <div class="client-card-name">${c.nombre}</div>
          <div class="client-card-detail">📍 ${c.direccion}</div>
          ${c.telefono ? `<a class="client-card-detail client-tel-link" href="tel:${c.telefono.replace(/\s/g,'')}">📞 ${c.telefono}</a>` : ''}
          <div class="client-tags">
            <span class="tag tag-blue">💧 ${c.bidones_habituales} bidones</span>
            <span class="tag tag-gray">${zona?.nombre || 'Sin zona'}</span>
            <span class="tag tag-gray">Parada ${c.orden}</span>
          </div>
        </div>
        <button class="del-btn" onclick="eliminarCliente('${c.id}')">🗑</button>
      </div>`;
  }).join('');
}

async function agregarCliente() {
  const nombre  = document.getElementById('inp-nombre').value.trim();
  const dir     = document.getElementById('inp-dir').value.trim();
  const tel     = document.getElementById('inp-tel').value.trim();
  const zona_id = document.getElementById('inp-zona-cliente').value;
  const bid     = parseInt(document.getElementById('inp-bid').value)   || 1;
  const orden   = parseInt(document.getElementById('inp-orden').value) || (clientes.length + 1);

  if (!nombre || !dir) { alert('Nombre y dirección son obligatorios.'); return; }
  if (!zona_id)        { alert('Seleccioná una zona.'); return; }

  showLoading(true);
  try {
    const rows = await db('clientes', { method:'POST', body: JSON.stringify({
      nombre, direccion: dir, telefono: tel, bidones_habituales: bid,
      orden, zona_id, usuario_id: currentUser.id
    })});
    clientes.push(rows[0]);
    ['inp-nombre','inp-dir','inp-tel','inp-bid','inp-orden'].forEach(id => document.getElementById(id).value='');
    document.getElementById('inp-zona-cliente').value='';
    renderClientes(); renderRuta(); renderZonas();
  } catch(e) { alert('Error al agregar cliente.'); console.error(e); }
  finally { showLoading(false); }
}

async function eliminarCliente(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  showLoading(true);
  try {
    await db(`clientes?id=eq.${id}`, { method:'DELETE', prefer:'return=minimal' });
    clientes = clientes.filter(c => c.id !== id);
    renderClientes(); renderRuta(); renderZonas();
  } catch(e) { alert('Error al eliminar cliente.'); }
  finally { showLoading(false); }
}

// ─── Historial ────────────────────────────────────────────────
function esLunes() { return new Date().getDay() === 1; }

async function limpiarHistorial() {
  const clave = prompt('Ingresá la contraseña para limpiar el historial:');
  if (clave === null) return;
  if (clave !== '1234') { alert('Contraseña incorrecta.'); return; }
  if (!confirm('¿Limpiar todo el historial de la semana?')) return;
  showLoading(true);
  try {
    const lunesFecha = getLunes();
    await db(`entregas?usuario_id=eq.${currentUser.id}&fecha=gte.${lunesFecha}`, { method:'DELETE', prefer:'return=minimal' });
    historial = [];
    entregas  = {};
    renderHistorial(); renderStats();
    alert('Historial limpiado correctamente.');
  } catch(e) { alert('Error al limpiar historial.'); }
  finally { showLoading(false); }
}

function renderHistorial() {
  const botonLunes = esLunes()
    ? `<button class="limpiar-btn" onclick="limpiarHistorial()">🗑 Limpiar historial de la semana</button>`
    : '';

  if (!historial.length) {
    document.getElementById('hist-list').innerHTML = botonLunes + '<div class="empty">Todavía no hay entregas realizadas.</div>';
    return;
  }

  // Agrupar por fecha y zona
  const porFecha = {};
  historial.forEach(e => {
    const fecha    = e.fecha;
    const zonaNombre = e.clientes?.zonas?.nombre || 'Sin zona';
    if (!porFecha[fecha]) porFecha[fecha] = {};
    if (!porFecha[fecha][zonaNombre]) porFecha[fecha][zonaNombre] = [];
    porFecha[fecha][zonaNombre].push(e);
  });

  const htmlFechas = Object.keys(porFecha)
    .sort((a,b) => b.localeCompare(a))
    .map(fecha => {
      const zonasFecha = porFecha[fecha];
      const totalDia   = Object.values(zonasFecha).flat().reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
      const totalEfDia = Object.values(zonasFecha).flat().filter(e=>(e.pago||'efectivo')==='efectivo').reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
      const totalTrDia = Object.values(zonasFecha).flat().filter(e=>e.pago==='transferencia').reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
      const totalCli   = Object.values(zonasFecha).flat().length;

      return `
        <div class="hist-fecha-grupo">
          <div class="hist-fecha-header">
            <div class="hist-fecha-title">${formatDate(fecha)}</div>
            <div class="hist-fecha-sub">${totalCli} entregas · ${formatPeso(totalDia)}</div>
            <div class="hist-fecha-desglose">
              <span class="desglose-ef">💵 ${formatPeso(totalEfDia)}</span>
              <span class="desglose-tr">🔵 ${formatPeso(totalTrDia)}</span>
            </div>
          </div>
          ${Object.keys(zonasFecha).map((znombre, idx) => {
            const ents      = zonasFecha[znombre];
            const totalZona = ents.reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
            const efZona    = ents.filter(e=>(e.pago||'efectivo')==='efectivo').reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
            const trZona    = ents.filter(e=>e.pago==='transferencia').reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
            const uid       = fecha.replace(/-/g,'') + idx;
            return `
              <div class="hist-zona-card">
                <div class="hist-head" onclick="toggleHist('${uid}')">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="tag tag-blue">📍 ${znombre}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span class="hist-zona-total">${formatPeso(totalZona)}</span>
                    <span class="hist-arrow" id="hist-arrow-${uid}">›</span>
                  </div>
                </div>
                <div id="hist-body-${uid}" class="hist-body" style="display:none;">
                  ${ents.map(e => {
                    const subtotal  = calcularTotal(e.bid5||0,e.bid10||0);
                    const pagoIcon  = e.pago==='transferencia'?'🔵':e.pago==='pendiente'?'⏳':'💵';
                    const pagoTexto = e.pago==='transferencia'?'Transferencia':e.pago==='pendiente'?'Pendiente':'Efectivo';
                    return `
                      <div class="hist-row">
                        <div>
                          <div>${e.clientes?.nombre||'Cliente'}</div>
                          <div style="font-size:11px;color:#888;margin-top:2px;">${pagoIcon} ${pagoTexto}</div>
                          ${(e.dev_bidones||0)>0||(e.dev_canillas||0)>0?`<div style="font-size:11px;color:#888;margin-top:2px;">${e.dev_bidones>0?`🪣 ${e.dev_bidones} bid. `:''}${e.dev_canillas>0?`🚰 ${e.dev_canillas} can.`:''}</div>`:''}
                        </div>
                        <div class="hist-row-right">
                          <span class="hist-bid-detail">${e.bid5>0?e.bid5+'×5lts ':''} ${e.bid10>0?e.bid10+'×10lts':''}</span>
                          <span class="badge-ok">${formatPeso(subtotal)}</span>
                        </div>
                      </div>`;
                  }).join('')}
                  <div class="hist-row" style="padding:8px 0 4px;font-size:12px;">
                    <span style="color:#888;">💵 Efectivo</span><span style="color:#555;">${formatPeso(efZona)}</span>
                  </div>
                  <div class="hist-row" style="padding:4px 0 8px;font-size:12px;">
                    <span style="color:#888;">🔵 Transferencia</span><span style="color:#555;">${formatPeso(trZona)}</span>
                  </div>
                  <div class="hist-row hist-row-total">
                    <strong>Total zona</strong><strong>${formatPeso(totalZona)}</strong>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');

  document.getElementById('hist-list').innerHTML = botonLunes + htmlFechas;
}

function toggleHist(uid) {
  const body  = document.getElementById('hist-body-'  + uid);
  const arrow = document.getElementById('hist-arrow-' + uid);
  const open  = body.style.display !== 'none';
  body.style.display    = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(90deg)';
}

// ─── Cobros pendientes ────────────────────────────────────────
function renderCobrosPendientes() {
  const list    = document.getElementById('pendientes-list');
  const pending = historial.filter(e => e.pago === 'pendiente');

  if (!pending.length) { list.innerHTML = '<div class="empty">No hay cobros pendientes. 🎉</div>'; return; }

  const porZona = {};
  pending.forEach(e => {
    const znombre = e.clientes?.zonas?.nombre || 'Sin zona';
    if (!porZona[znombre]) porZona[znombre] = [];
    const cliente = clientes.find(c => c.id === e.cliente_id);
    porZona[znombre].push({ ...e, tel: cliente?.telefono || null, cnombre: e.clientes?.nombre || 'Cliente' });
  });

  const totalGeneral = pending.reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);

  list.innerHTML = `
    <div class="pend-total-banner">
      <span>Total a cobrar</span>
      <strong>${formatPeso(totalGeneral)}</strong>
    </div>
    ${Object.keys(porZona).map(znombre => {
      const ents      = porZona[znombre];
      const totalZona = ents.reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
      return `
        <div class="pend-zona-grupo">
          <div class="pend-zona-header">
            <span class="tag tag-blue">📍 ${znombre}</span>
            <span class="pend-zona-total">${formatPeso(totalZona)}</span>
          </div>
          ${ents.map(e => {
            const bid5txt  = e.bid5  > 0 ? `${e.bid5} bidón${e.bid5>1?'es':''} 5lts`   : '';
            const bid10txt = e.bid10 > 0 ? `${e.bid10} bidón${e.bid10>1?'es':''} 10lts` : '';
            const bidTxt   = [bid5txt,bid10txt].filter(Boolean).join(' y ');
            return `
              <div class="pend-card">
                <div class="pend-card-top">
                  <div class="pend-card-info">
                    <div class="pend-card-nombre">${e.cnombre}</div>
                    <div class="pend-card-detalle">Entregado el ${formatDate(e.fecha)}</div>
                    <div class="pend-card-detalle">${bidTxt}</div>
                  </div>
                  <div class="pend-card-right">
                    <span class="pend-monto">${formatPeso(calcularTotal(e.bid5||0,e.bid10||0))}</span>
                  </div>
                </div>
                <div class="pend-card-actions">
                  ${e.tel ? `<a class="pend-action-btn pend-tel-btn" href="tel:${e.tel.replace(/\s/g,'')}">📞 Llamar</a>` : ''}
                  <button class="pend-action-btn pend-cobrado-btn" onclick="marcarCobrado('${e.id}')">✓ Cobrado</button>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('')}`;
}

async function marcarCobrado(entregaId) {
  if (!confirm('¿Marcar este cobro como recibido?')) return;
  showLoading(true);
  try {
    await db(`entregas?id=eq.${entregaId}`, { method:'PATCH', body: JSON.stringify({ pago: 'efectivo' }) });
    await recargarHistorial();
  } catch(e) { alert('Error al actualizar cobro.'); }
  finally { showLoading(false); }
}

// ─── Panel Admin ──────────────────────────────────────────────
function showAdminTab(tab, btn) {
  document.querySelectorAll('#screen-admin .section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#screen-admin .nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('admin-sec-' + tab).classList.add('active');
  btn.classList.add('active');
  if (tab === 'resumen')   cargarAdminResumen();
  if (tab === 'empleados') cargarAdminEmpleados();
}

async function cargarAdmin() {
  await cargarAdminResumen();
  await cargarAdminEmpleados();
}

async function cargarAdminResumen() {
  const el = document.getElementById('admin-resumen');
  el.innerHTML = '<div class="empty">Cargando...</div>';
  try {
    const today = getToday();
    const ents  = await db(`entregas?fecha=eq.${today}&entregado=eq.true&select=*,clientes(nombre,usuarios:usuario_id(nombre))`);

    if (!ents.length) { el.innerHTML = '<div class="empty">No hay entregas hoy todavía.</div>'; return; }

    // Agrupar por empleado
    const porEmpleado = {};
    ents.forEach(e => {
      const emp = e.clientes?.usuarios?.nombre || 'Desconocido';
      if (!porEmpleado[emp]) porEmpleado[emp] = [];
      porEmpleado[emp].push(e);
    });

    const totalDia = ents.reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);

    el.innerHTML = `
      <div class="pend-total-banner" style="margin-bottom:16px;">
        <span>Total recaudado hoy</span>
        <strong>${formatPeso(totalDia)}</strong>
      </div>
      ${Object.keys(porEmpleado).map(emp => {
        const lista   = porEmpleado[emp];
        const totalEmp = lista.reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
        const totalEf  = lista.filter(e=>(e.pago||'efectivo')==='efectivo').reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
        const totalTr  = lista.filter(e=>e.pago==='transferencia').reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
        return `
          <div class="hist-zona-card" style="margin-bottom:12px;">
            <div class="hist-head">
              <div>
                <div style="font-weight:600;font-size:14px;">👤 ${emp}</div>
                <div style="font-size:12px;color:#555;margin-top:4px;">${lista.length} entregas</div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:700;color:#0C447C;">${formatPeso(totalEmp)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">💵 ${formatPeso(totalEf)} · 🔵 ${formatPeso(totalTr)}</div>
              </div>
            </div>
          </div>`;
      }).join('')}
      <button class="exportar-btn" onclick="adminExportarDia()">📋 Exportar resumen del día</button>`;
  } catch(e) { el.innerHTML = '<div class="empty">Error cargando resumen.</div>'; console.error(e); }
}

async function cargarAdminEmpleados() {
  const el = document.getElementById('admin-empleados-list');
  try {
    const emps = await db(`usuarios?rol=eq.empleado&select=*`);
    if (!emps.length) { el.innerHTML = '<div class="empty">No hay empleados todavía.</div>'; return; }
    el.innerHTML = emps.map(e => `
      <div class="client-card">
        <div class="client-avatar">${initials(e.nombre)}</div>
        <div class="client-info">
          <div class="client-card-name">${e.nombre}</div>
          <div class="client-card-detail">Clave: ${e.clave}</div>
        </div>
        <button class="del-btn" onclick="adminEliminarEmpleado('${e.id}')">🗑</button>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Error cargando empleados.</div>'; }
}

async function adminAgregarEmpleado() {
  const nombre = document.getElementById('admin-emp-nombre').value.trim();
  const clave  = document.getElementById('admin-emp-clave').value.trim();
  if (!nombre || !clave) { alert('Completá nombre y contraseña.'); return; }
  showLoading(true);
  try {
    await db('usuarios', { method:'POST', body: JSON.stringify({ nombre, clave, rol:'empleado' }) });
    document.getElementById('admin-emp-nombre').value = '';
    document.getElementById('admin-emp-clave').value  = '';
    await cargarAdminEmpleados();
    alert(`Empleado "${nombre}" agregado correctamente.`);
  } catch(e) { alert('Error al agregar empleado.'); }
  finally { showLoading(false); }
}

async function adminEliminarEmpleado(id) {
  if (!confirm('¿Eliminar este empleado? Se borrarán todos sus datos.')) return;
  showLoading(true);
  try {
    await db(`usuarios?id=eq.${id}`, { method:'DELETE', prefer:'return=minimal' });
    await cargarAdminEmpleados();
  } catch(e) { alert('Error al eliminar empleado.'); }
  finally { showLoading(false); }
}

async function adminExportarDia() {
  const today = getToday();
  const ents  = await db(`entregas?fecha=eq.${today}&entregado=eq.true&select=*,clientes(nombre,usuarios:usuario_id(nombre))`);
  if (!ents.length) { alert('No hay entregas hoy.'); return; }

  let texto = `TEXALAR REPARTO — ${formatDate(today)}\n${'─'.repeat(30)}\n`;
  const porEmp = {};
  ents.forEach(e => {
    const emp = e.clientes?.usuarios?.nombre || 'Desconocido';
    if (!porEmp[emp]) porEmp[emp] = [];
    porEmp[emp].push(e);
  });

  Object.keys(porEmp).forEach(emp => {
    const lista = porEmp[emp];
    const total = lista.reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
    texto += `\n👤 ${emp}\n`;
    lista.forEach(e => {
      const pago = e.pago==='transferencia'?'🔵':e.pago==='pendiente'?'⏳':'💵';
      texto += `  • ${e.clientes?.nombre} ${pago} ${formatPeso(calcularTotal(e.bid5||0,e.bid10||0))}\n`;
    });
    texto += `  Subtotal: ${formatPeso(total)}\n`;
  });

  const totalDia = ents.reduce((s,e) => s+calcularTotal(e.bid5||0,e.bid10||0), 0);
  texto += `\n${'─'.repeat(30)}\nTOTAL DÍA: ${formatPeso(totalDia)}\n`;

  navigator.clipboard.writeText(texto)
    .then(() => alert('¡Resumen copiado!'))
    .catch(() => prompt('Copiá este resumen:', texto));
}

// ─── Arranque ─────────────────────────────────────────────────
const savedUser = localStorage.getItem('texalar_user');
if (savedUser) {
  currentUser = JSON.parse(savedUser);
  if (currentUser.rol === 'admin') {
    showScreen('admin');
    cargarAdmin();
  } else {
    showScreen('app');
    cargarDatos();
  }
}
