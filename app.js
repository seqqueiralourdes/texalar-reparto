// Registro del Service Worker para modo offline
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

// Estado inicial de la app
let state = {
  clientes: [
    { id:1, nombre:"María Rodríguez", dir:"Av. Rivadavia 2450, Piso 1", tel:"11 4523-1890", bidHab:2, orden:1 },
    { id:2, nombre:"Carlos Méndez", dir:"Calle Belgrano 780", tel:"11 3201-4455", bidHab:3, orden:2 },
    { id:3, nombre:"Supermercado El Sol", dir:"Av. San Martín 1100, Local 4", tel:"11 5588-2200", bidHab:6, orden:3 },
  ],
  ruta: {},
  historial: [],
  nextId: 4
};

// ─── Persistencia ───────────────────────────────────────────

function loadState() {
  try {
    const s = localStorage.getItem('texalar');
    if (s) state = JSON.parse(s);
  } catch(e) {
    console.error('Error cargando estado:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem('texalar', JSON.stringify(state));
  } catch(e) {
    console.error('Error guardando estado:', e);
  }
}

// ─── Utilidades ─────────────────────────────────────────────

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function initials(nombre) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ─── Inicialización de ruta ──────────────────────────────────

function initRuta() {
  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = {};
  state.clientes.forEach(c => {
    if (!state.ruta[today][c.id]) {
      state.ruta[today][c.id] = { bidones: c.bidHab, entregado: false };
    }
  });
  saveState();
}

// ─── Estadísticas y progreso ─────────────────────────────────

function renderStats() {
  const today = getToday();
  const ruta = state.ruta[today] || {};
  const total = state.clientes.length;
  const entregados = state.clientes.filter(c => ruta[c.id]?.entregado).length;
  const entregBid = state.clientes
    .filter(c => ruta[c.id]?.entregado)
    .reduce((s, c) => s + (ruta[c.id]?.bidones || 0), 0);
  const pct = total ? Math.round((entregados / total) * 100) : 0;

  document.getElementById('stat-clientes').textContent = `${entregados}/${total}`;
  document.getElementById('stat-bidones').textContent = entregBid;
  document.getElementById('prog-bar').style.width = pct + '%';
  document.getElementById('prog-pct').textContent = pct + '%';

  const cerrarWrap = document.getElementById('cerrar-wrap');
  cerrarWrap.style.display = entregados > 0 ? 'block' : 'none';
}

// ─── Hoja de ruta ────────────────────────────────────────────

function renderRuta() {
  const today = getToday();
  const ruta = state.ruta[today] || {};
  const sorted = [...state.clientes].sort((a, b) => a.orden - b.orden);

  if (!sorted.length) {
    document.getElementById('ruta-list').innerHTML =
      '<div class="empty">No hay clientes en la ruta.<br>Agregá desde la pestaña Clientes.</div>';
    renderStats();
    return;
  }

  document.getElementById('ruta-list').innerHTML = sorted.map(c => {
    const r = ruta[c.id] || { bidones: c.bidHab, entregado: false };
    const done = r.entregado;
    return `
      <div class="card ${done ? 'done' : ''}">
        <div class="card-top">
          <div class="stop-badge ${done ? 'done' : ''}">${c.orden}</div>
          <div style="flex:1; min-width:0;">
            <div class="client-name ${done ? 'done' : ''}">${c.nombre}</div>
            <div class="client-addr">📍 ${c.dir}</div>
            ${c.tel ? `<div class="client-tel">📞 ${c.tel}</div>` : ''}
          </div>
        </div>
        <div class="card-bottom">
          <div class="bid-ctrl">
            <button class="bid-btn" onclick="cambiarBidones(${c.id}, -1)" ${done ? 'disabled' : ''}>−</button>
            <span class="bid-num">${r.bidones}</span>
            <button class="bid-btn" onclick="cambiarBidones(${c.id}, 1)" ${done ? 'disabled' : ''}>+</button>
            <span class="bid-lbl">bidones</span>
          </div>
          <button class="mark-btn ${done ? 'done' : ''}" onclick="toggleEntregado(${c.id})">
            ${done ? '✓ Entregado' : 'Marcar entregado'}
          </button>
        </div>
      </div>`;
  }).join('');

  renderStats();
}

function cambiarBidones(id, delta) {
  const today = getToday();
  const c = state.clientes.find(x => x.id === id);
  if (!state.ruta[today][id]) {
    state.ruta[today][id] = { bidones: c.bidHab, entregado: false };
  }
  state.ruta[today][id].bidones = Math.max(0, (state.ruta[today][id].bidones || 0) + delta);
  saveState();
  renderRuta();
}

function toggleEntregado(id) {
  const today = getToday();
  const c = state.clientes.find(x => x.id === id);
  if (!state.ruta[today][id]) {
    state.ruta[today][id] = { bidones: c.bidHab, entregado: false };
  }
  state.ruta[today][id].entregado = !state.ruta[today][id].entregado;
  saveState();
  renderRuta();
}

function cerrarReparto() {
  const today = getToday();
  const ruta = state.ruta[today] || {};
  if (!confirm('¿Cerrar el reparto de hoy y guardarlo en el historial?')) return;

  const resumen = state.clientes.map(c => ({
    nombre: c.nombre,
    bidones: ruta[c.id]?.bidones || 0,
    entregado: ruta[c.id]?.entregado || false
  }));

  state.historial.unshift({ fecha: today, entregas: resumen });
  state.historial = state.historial.slice(0, 60);
  delete state.ruta[today];

  saveState();
  initRuta();
  renderRuta();
  renderHistorial();
  alert('¡Reparto cerrado! Guardado en el historial.');
}

// ─── Clientes ────────────────────────────────────────────────

function renderClientes() {
  const sorted = [...state.clientes].sort((a, b) => a.orden - b.orden);

  if (!sorted.length) {
    document.getElementById('clientes-list').innerHTML =
      '<div class="empty">No hay clientes todavía.</div>';
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
  const bid = parseInt(document.getElementById('inp-bid').value) || 1;
  const orden = parseInt(document.getElementById('inp-orden').value) || (state.clientes.length + 1);

  if (!nombre || !dir) {
    alert('Nombre y dirección son obligatorios.');
    return;
  }

  const c = { id: state.nextId++, nombre, dir, tel, bidHab: bid, orden };
  state.clientes.push(c);

  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = {};
  state.ruta[today][c.id] = { bidones: bid, entregado: false };

  saveState();
  ['inp-nombre', 'inp-dir', 'inp-tel', 'inp-bid', 'inp-orden']
    .forEach(id => document.getElementById(id).value = '');
  renderClientes();
  renderRuta();
}

function eliminarCliente(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  state.clientes = state.clientes.filter(c => c.id !== id);
  saveState();
  renderClientes();
  renderRuta();
}

// ─── Historial ───────────────────────────────────────────────

function renderHistorial() {
  if (!state.historial.length) {
    document.getElementById('hist-list').innerHTML =
      '<div class="empty">Todavía no hay repartos cerrados.</div>';
    return;
  }

  document.getElementById('hist-list').innerHTML = state.historial.map((h, idx) => {
    const totalBid = h.entregas.reduce((s, e) => s + e.bidones, 0);
    const entregados = h.entregas.filter(e => e.entregado).length;
    return `
      <div class="hist-card">
        <div class="hist-head" onclick="toggleHist(${idx})">
          <div>
            <div class="hist-title">${formatDate(h.fecha)}</div>
            <div class="hist-sub">${entregados} clientes · ${totalBid} bidones</div>
          </div>
          <span class="hist-arrow" id="hist-arrow-${idx}">›</span>
        </div>
        <div id="hist-body-${idx}" class="hist-body" style="display:none;">
          ${h.entregas.map(e => `
            <div class="hist-row">
              <span>${e.nombre}</span>
              ${e.entregado
                ? `<span class="badge-ok">✓ ${e.bidones} bid.</span>`
                : '<span class="badge-no">No entregado</span>'}
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

function toggleHist(idx) {
  const body = document.getElementById('hist-body-' + idx);
  const arrow = document.getElementById('hist-arrow-' + idx);
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(90deg)';
}

// ─── Navegación ──────────────────────────────────────────────

function showTab(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('sec-' + tab).classList.add('active');
  btn.classList.add('active');

  const cerrarWrap = document.getElementById('cerrar-wrap');
  if (tab === 'ruta') {
    renderStats();
    cerrarWrap.style.display = state.clientes.some(c =>
      state.ruta[getToday()]?.[c.id]?.entregado
    ) ? 'block' : 'none';
  } else {
    cerrarWrap.style.display = 'none';
  }
}

// ─── Fecha en el header ──────────────────────────────────────

function renderFecha() {
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                 'septiembre','octubre','noviembre','diciembre'];
  const hoy = new Date();
  document.getElementById('fecha-hoy').textContent =
    `${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;
}

// ─── Arranque ────────────────────────────────────────────────

loadState();
initRuta();
renderFecha();
renderRuta();
renderClientes();
renderHistorial();
