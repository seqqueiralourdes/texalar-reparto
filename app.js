if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

const PRECIO_5 = 5000;
const PRECIO_10 = 8000;

let state = {
  clientes: [
    { id:1, nombre:"María Rodríguez", dir:"Av. Rivadavia 2450, Piso 1", tel:"11 4523-1890", bidHab:2, orden:1, zona:"Zona Centro" },
    { id:2, nombre:"Carlos Méndez", dir:"Calle Belgrano 780", tel:"11 3201-4455", bidHab:3, orden:2, zona:"Zona Norte" },
    { id:3, nombre:"Supermercado El Sol", dir:"Av. San Martín 1100, Local 4", tel:"11 5588-2200", bidHab:6, orden:3, zona:"Zona Centro" },
  ],
  zonas: ["Zona Centro", "Zona Norte"],
  ruta: {},
  historial: [],
  nextId: 4
};

function loadState() {
  try {
    const s = localStorage.getItem('texalar');
    if (s) {
      const saved = JSON.parse(s);
      state = {
        ...state,
        ...saved,
        zonas: saved.zonas || state.zonas,
        clientes: saved.clientes || state.clientes,
        historial: saved.historial || state.historial,
        ruta: saved.ruta || state.ruta,
        nextId: saved.nextId || state.nextId
      };
    }
  } catch(e) { console.error('Error cargando estado:', e); }
}

function saveState() {
  try { localStorage.setItem('texalar', JSON.stringify(state)); }
  catch(e) { console.error('Error guardando estado:', e); }
}

function getToday() { return new Date().toISOString().slice(0, 10); }
function formatDate(d) { const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }
function initials(nombre) { return nombre.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function getZonaHoy() { return state.ruta[getToday()]?.zona || null; }
function clientesDeZona(zona) { return state.clientes.filter(c => c.zona === zona); }
function formatPeso(n) { return '$' + n.toLocaleString('es-AR'); }

function calcularTotal(bid5, bid10) {
  return (bid5 * PRECIO_5) + (bid10 * PRECIO_10);
}

function initRuta(zona) {
  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = { zona, entregas: {} };
  if (!state.ruta[today].entregas) state.ruta[today].entregas = {};
  clientesDeZona(zona).forEach(c => {
    if (!state.ruta[today].entregas[c.id]) {
      state.ruta[today].entregas[c.id] = { bid5: 0, bid10: c.bidHab, entregado: false };
    }
  });
  saveState();
}

function renderStats() {
  const today = getToday();
  const zonaHoy = getZonaHoy();
  const entregas = state.ruta[today]?.entregas || {};
  const clientes = zonaHoy ? clientesDeZona(zonaHoy) : [];
  const total = clientes.length;
  const entregados = clientes.filter(c => entregas[c.id]?.entregado).length;
  const totalPesos = clientes
    .filter(c => entregas[c.id]?.entregado)
    .reduce((s, c) => s + calcularTotal(entregas[c.id]?.bid5||0, entregas[c.id]?.bid10||0), 0);
  const pct = total ? Math.round((entregados / total) * 100) : 0;

  document.getElementById('stat-clientes').textContent = `${entregados}/${total}`;
  document.getElementById('stat-total').textContent = formatPeso(totalPesos);
  document.getElementById('prog-bar').style.width = pct + '%';
  document.getElementById('prog-pct').textContent = pct + '%';

  document.getElementById('cerrar-wrap').style.display = entregados > 0 ? 'block' : 'none';
}

function renderSelectorZona() {
  const zonaHoy = getZonaHoy();
  if (zonaHoy) {
    document.getElementById('zona-selector').style.display = 'none';
    document.getElementById('zona-activa').style.display = 'flex';
    document.getElementById('zona-activa-nombre').textContent = zonaHoy;
  } else {
    document.getElementById('zona-selector').style.display = 'block';
    document.getElementById('zona-activa').style.display = 'none';
    renderRuta();
  }
}

function renderOpcionesZona() {
  const list = document.getElementById('zonas-opciones');
  if (!state.zonas.length) {
    list.innerHTML = '<div class="empty" style="padding:1rem;">No hay zonas creadas. Agregá una en la pestaña Zonas.</div>';
    return;
  }
  const today = getToday();
  list.innerHTML = state.zonas.map(z => {
    const todos = clientesDeZona(z);
    const entregas = state.ruta[today]?.entregas || {};
    const pendientes = todos.filter(c => !entregas[c.id]?.entregado).length;
    return `
      <button class="zona-opcion" onclick="elegirZona('${z}')">
        <span class="zona-opcion-icon">📍</span>
        <span class="zona-opcion-nombre">${z}</span>
        <span class="zona-opcion-cant">${pendientes} pendientes</span>
      </button>`;
  }).join('');
}

function elegirZona(zona) {
  initRuta(zona);
  renderSelectorZona();
  renderRuta();
  renderStats();
}

function cambiarZona() {
  if (!confirm('¿Cambiar la zona? Las entregas ya realizadas se guardarán en el historial.')) return;
  const today = getToday();
  const zonaHoy = getZonaHoy();
  const entregas = state.ruta[today]?.entregas || {};
  const clientesZona = clientesDeZona(zonaHoy);
  const entregasHechas = clientesZona.filter(c => entregas[c.id]?.entregado);

  if (entregasHechas.length > 0) {
    const resumen = clientesZona.map(c => ({
      nombre: c.nombre,
      bid5: entregas[c.id]?.bid5 || 0,
      bid10: entregas[c.id]?.bid10 || 0,
      entregado: entregas[c.id]?.entregado || false
    }));
    state.historial.unshift({ fecha: today, zona: zonaHoy + ' (parcial)', entregas: resumen });
    state.historial = state.historial.slice(0, 60);
  }

  delete state.ruta[today];
  saveState();
  renderSelectorZona();
  renderOpcionesZona();
  renderHistorial();
  renderStats();
}

function renderRuta() {
  const today = getToday();
  const zonaHoy = getZonaHoy();
  const entregas = state.ruta[today]?.entregas || {};

  if (!zonaHoy) { document.getElementById('ruta-list').innerHTML = ''; return; }

  const clientes = clientesDeZona(zonaHoy).sort((a,b) => a.orden - b.orden);

  if (!clientes.length) {
    document.getElementById('ruta-list').innerHTML =
      `<div class="empty">No hay clientes en ${zonaHoy}.</div>`;
    renderStats(); return;
  }

  // Pendientes
  const pendientes = clientes.filter(c => !entregas[c.id]?.entregado);
  const pendientesHtml = pendientes.length
    ? `<div class="pendientes-bar">⏳ ${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}: ${pendientes.map(c => c.nombre.split(' ')[0]).join(', ')}</div>`
    : `<div class="pendientes-bar pendientes-ok">✅ Todos entregados</div>`;

  document.getElementById('ruta-list').innerHTML = pendientesHtml + clientes.map(c => {
    const r = entregas[c.id] || { bid5: 0, bid10: c.bidHab, entregado: false };
    const done = r.entregado;
    const total = calcularTotal(r.bid5, r.bid10);
    return `
      <div class="card ${done ? 'done' : ''}">
        <div class="card-top">
          <div class="stop-badge ${done ? 'done' : ''}">${c.orden}</div>
          <div style="flex:1;min-width:0;">
            <div class="client-name ${done ? 'done' : ''}">${c.nombre}</div>
            <div class="client-addr">📍 ${c.dir}</div>
            ${c.tel ? `<div class="client-tel">📞 ${c.tel}</div>` : ''}
          </div>
          ${done ? `<div class="card-total">${formatPeso(total)}</div>` : ''}
        </div>
        <div class="bid-grid">
          <div class="bid-row">
            <span class="bid-tipo">5 lts</span>
            <button class="bid-btn" onclick="cambiarBidones(${c.id},'bid5',-1)" ${done?'disabled':''}>−</button>
            <span class="bid-num">${r.bid5}</span>
            <button class="bid-btn" onclick="cambiarBidones(${c.id},'bid5',1)" ${done?'disabled':''}>+</button>
            <span class="bid-precio">${formatPeso(PRECIO_5)}c/u</span>
          </div>
          <div class="bid-row">
            <span class="bid-tipo">10 lts</span>
            <button class="bid-btn" onclick="cambiarBidones(${c.id},'bid10',-1)" ${done?'disabled':''}>−</button>
            <span class="bid-num">${r.bid10}</span>
            <button class="bid-btn" onclick="cambiarBidones(${c.id},'bid10',1)" ${done?'disabled':''}>+</button>
            <span class="bid-precio">${formatPeso(PRECIO_10)}c/u</span>
          </div>
        </div>
        <div class="card-bottom">
          <div class="subtotal">Subtotal: <strong>${formatPeso(total)}</strong></div>
          <button class="mark-btn ${done?'done':''}" onclick="toggleEntregado(${c.id})">
            ${done ? '✓ Entregado' : 'Marcar entregado'}
          </button>
        </div>
      </div>`;
  }).join('');

  renderStats();
}

function cambiarBidones(id, tipo, delta) {
  const today = getToday();
  const c = state.clientes.find(x => x.id === id);
  if (!state.ruta[today].entregas[id]) {
    state.ruta[today].entregas[id] = { bid5: 0, bid10: c.bidHab, entregado: false };
  }
  state.ruta[today].entregas[id][tipo] = Math.max(0, (state.ruta[today].entregas[id][tipo]||0) + delta);
  saveState(); renderRuta();
}

function toggleEntregado(id) {
  const today = getToday();
  const c = state.clientes.find(x => x.id === id);
  if (!state.ruta[today].entregas[id]) {
    state.ruta[today].entregas[id] = { bid5: 0, bid10: c.bidHab, entregado: false };
  }
  state.ruta[today].entregas[id].entregado = !state.ruta[today].entregas[id].entregado;
  saveState(); renderRuta();
}

function cerrarReparto() {
  const today = getToday();
  const zonaHoy = getZonaHoy();
  const entregas = state.ruta[today]?.entregas || {};
  if (!confirm('¿Cerrar el reparto de hoy y guardarlo en el historial?')) return;

  const clientes = clientesDeZona(zonaHoy);
  const resumen = clientes.map(c => ({
    nombre: c.nombre,
    bid5: entregas[c.id]?.bid5 || 0,
    bid10: entregas[c.id]?.bid10 || 0,
    entregado: entregas[c.id]?.entregado || false
  }));

  state.historial.unshift({ fecha: today, zona: zonaHoy, entregas: resumen });
  state.historial = state.historial.slice(0, 60);
  delete state.ruta[today];

  saveState();
  renderSelectorZona();
  renderRuta();
  renderHistorial();
  renderStats();
  alert('¡Reparto cerrado! Guardado en el historial.');
}

function renderZonas() {
  const list = document.getElementById('zonas-list');
  if (!state.zonas.length) {
    list.innerHTML = '<div class="empty">No hay zonas creadas todavía.</div>';
    return;
  }
  list.innerHTML = state.zonas.map(z => {
    const cant = clientesDeZona(z).length;
    return `
      <div class="client-card">
        <div class="client-avatar" style="background:#E6F1FB;color:#0C447C;font-size:18px;">📍</div>
        <div class="client-info">
          <div class="client-card-name">${z}</div>
          <div class="client-card-detail">${cant} cliente${cant!==1?'s':''}</div>
        </div>
        <button class="del-btn" onclick="eliminarZona('${z}')">🗑</button>
      </div>`;
  }).join('');
}

function agregarZona() {
  const nombre = document.getElementById('inp-zona').value.trim();
  if (!nombre) { alert('Escribí un nombre para la zona.'); return; }
  if (state.zonas.includes(nombre)) { alert('Ya existe una zona con ese nombre.'); return; }
  state.zonas.push(nombre);
  saveState();
  document.getElementById('inp-zona').value = '';
  renderZonas(); renderZonaSelect(); renderOpcionesZona();
}

function eliminarZona(zona) {
  const cant = clientesDeZona(zona).length;
  if (cant > 0) { alert(`No se puede eliminar "${zona}" porque tiene ${cant} cliente${cant!==1?'s':''} asignado${cant!==1?'s':''}.`); return; }
  if (!confirm(`¿Eliminar la zona "${zona}"?`)) return;
  state.zonas = state.zonas.filter(z => z !== zona);
  saveState();
  renderZonas(); renderZonaSelect(); renderOpcionesZona();
}

function renderZonaSelect() {
  const sel = document.getElementById('inp-zona-cliente');
  sel.innerHTML = '<option value="">Seleccioná una zona</option>' +
    state.zonas.map(z => `<option value="${z}">${z}</option>`).join('');
}

function renderClientes() {
  const sorted = [...state.clientes].sort((a,b) => a.orden - b.orden);
  if (!sorted.length) {
    document.getElementById('clientes-list').innerHTML = '<div class="empty">No hay clientes todavía.</div>';
    return;
  }
  document.getElementById('clientes-list').innerHTML = sorted.map(c => `
    <div class="client-card">
      <div class="client-avatar">${initials(c.nombre)}</div>
      <div class="client-info">
        <div class="client-card-name">${c.nombre}</div>
        <div class="client-card-detail">📍 ${c.dir}</div>
        ${c.tel ? `<div class="client-card-detail">📞 ${c.tel}</div>` : ''}
        <div class="client-tags">
          <span class="tag tag-blue">💧 ${c.bidHab} bidones</span>
          <span class="tag tag-gray">${c.zona || 'Sin zona'}</span>
          <span class="tag tag-gray">Parada ${c.orden}</span>
        </div>
      </div>
      <button class="del-btn" onclick="eliminarCliente(${c.id})">🗑</button>
    </div>
  `).join('');
}

function agregarCliente() {
  const nombre = document.getElementById('inp-nombre').value.trim();
  const dir = document.getElementById('inp-dir').value.trim();
  const tel = document.getElementById('inp-tel').value.trim();
  const zona = document.getElementById('inp-zona-cliente').value;
  const bid = parseInt(document.getElementById('inp-bid').value) || 1;
  const orden = parseInt(document.getElementById('inp-orden').value) || (state.clientes.length + 1);

  if (!nombre || !dir) { alert('Nombre y dirección son obligatorios.'); return; }
  if (!zona) { alert('Seleccioná una zona para el cliente.'); return; }

  const c = { id: state.nextId++, nombre, dir, tel, bidHab: bid, orden, zona };
  state.clientes.push(c);
  saveState();

  ['inp-nombre','inp-dir','inp-tel','inp-bid','inp-orden'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('inp-zona-cliente').value = '';
  renderClientes(); renderRuta(); renderZonas();
}

function eliminarCliente(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  state.clientes = state.clientes.filter(c => c.id !== id);
  saveState();
  renderClientes(); renderRuta(); renderZonas();
}

function renderHistorial() {
  if (!state.historial.length) {
    document.getElementById('hist-list').innerHTML = '<div class="empty">Todavía no hay repartos cerrados.</div>';
    return;
  }
  document.getElementById('hist-list').innerHTML = state.historial.map((h, idx) => {
    const entregados = h.entregas.filter(e => e.entregado);
    const totalPesos = entregados.reduce((s,e) => s + calcularTotal(e.bid5||0, e.bid10||0), 0);
    const totalBid = entregados.reduce((s,e) => s + (e.bid5||0) + (e.bid10||0), 0);
    return `
      <div class="hist-card">
        <div class="hist-head" onclick="toggleHist(${idx})">
          <div>
            <div class="hist-title">${formatDate(h.fecha)}</div>
            <div class="hist-sub">
              <span class="tag tag-blue">📍 ${h.zona}</span>
              <span>${entregados.length} clientes · ${totalBid} bidones</span>
              <span class="hist-total">${formatPeso(totalPesos)}</span>
            </div>
          </div>
          <span class="hist-arrow" id="hist-arrow-${idx}">›</span>
        </div>
        <div id="hist-body-${idx}" class="hist-body" style="display:none;">
          ${h.entregas.map(e => {
            const subtotal = calcularTotal(e.bid5||0, e.bid10||0);
            return `
              <div class="hist-row">
                <span>${e.nombre}</span>
                ${e.entregado ? `
                  <div class="hist-row-right">
                    <span class="hist-bid-detail">${e.bid5||0}×5lts ${e.bid10||0}×10lts</span>
                    <span class="badge-ok">${formatPeso(subtotal)}</span>
                  </div>` : '<span class="badge-no">No entregado</span>'}
              </div>`;
          }).join('')}
          <div class="hist-row hist-row-total">
            <strong>Total recaudado</strong>
            <strong>${formatPeso(totalPesos)}</strong>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleHist(idx) {
  const body = document.getElementById('hist-body-'+idx);
  const arrow = document.getElementById('hist-arrow-'+idx);
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(90deg)';
}

function showTab(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('sec-'+tab).classList.add('active');
  btn.classList.add('active');

  const cerrarWrap = document.getElementById('cerrar-wrap');
  if (tab === 'ruta') {
    renderStats();
    const zonaHoy = getZonaHoy();
    cerrarWrap.style.display = zonaHoy && state.clientes.some(c =>
      state.ruta[getToday()]?.entregas?.[c.id]?.entregado
    ) ? 'block' : 'none';
  } else {
    cerrarWrap.style.display = 'none';
  }
}

function renderFecha() {
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const hoy = new Date();
  document.getElementById('fecha-hoy').textContent = `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;
}

loadState();
renderFecha();
renderSelectorZona();
renderOpcionesZona();
renderZonaSelect();
renderClientes();
renderZonas();
renderHistorial();
renderStats();
