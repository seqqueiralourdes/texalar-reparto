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
        ...state, ...saved,
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
function initials(n) { return n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function getZonaHoy() { return state.ruta[getToday()]?.zona || null; }
function clientesDeZona(zona) { return state.clientes.filter(c => c.zona === zona); }
function formatPeso(n) { return '$' + Math.round(n).toLocaleString('es-AR'); }
function calcularTotal(bid5, bid10) { return (bid5 * PRECIO_5) + (bid10 * PRECIO_10); }

// ─── Historial en tiempo real ────────────────────────────────

function actualizarHistorialHoy() {
  const today = getToday();
  const zonaHoy = getZonaHoy();
  if (!zonaHoy) return;

  const entregas = state.ruta[today]?.entregas || {};
  const clientesZona = clientesDeZona(zonaHoy);
  const entregados = clientesZona.filter(c => entregas[c.id]?.entregado);

  if (!entregados.length) {
    state.historial = state.historial.filter(h => h.fecha !== today || h.zona !== zonaHoy);
    saveState(); renderHistorial(); return;
  }

  const resumen = clientesZona.map(c => ({
    nombre: c.nombre,
    bid5: entregas[c.id]?.bid5 || 0,
    bid10: entregas[c.id]?.bid10 || 0,
    entregado: entregas[c.id]?.entregado || false,
    pago: entregas[c.id]?.pago || null
  }));

  const idx = state.historial.findIndex(h => h.fecha === today && h.zona === zonaHoy);
  const entrada = { fecha: today, zona: zonaHoy, entregas: resumen, enCurso: true };
  if (idx >= 0) { state.historial[idx] = entrada; }
  else { state.historial.unshift(entrada); }
  state.historial = state.historial.slice(0, 60);
  saveState();
  renderHistorial();
}

function exportarResumen() {
  const today = getToday();
  const zonaHoy = getZonaHoy();
  const entregas = state.ruta[today]?.entregas || {};
  const clientesZona = clientesDeZona(zonaHoy);
  const entregados = clientesZona.filter(c => entregas[c.id]?.entregado);

  if (!entregados.length) { alert('No hay entregas realizadas hoy.'); return; }

  let texto = `TEXALAR REPARTO — ${formatDate(today)}\nZona: ${zonaHoy}\n${'─'.repeat(30)}\n`;
  let totalEfectivo = 0, totalTransferencia = 0;

  entregados.forEach(c => {
    const e = entregas[c.id];
    const total = calcularTotal(e.bid5||0, e.bid10||0);
    const pago = e.pago === 'transferencia' ? '🔵 Transferencia' : '💵 Efectivo';
    texto += `• ${c.nombre} (${pago})\n`;
    if (e.bid5 > 0) texto += `  ${e.bid5} bidón/es 5lts\n`;
    if (e.bid10 > 0) texto += `  ${e.bid10} bidón/es 10lts\n`;
    texto += `  Subtotal: ${formatPeso(total)}\n`;
    if (e.pago === 'transferencia') totalTransferencia += total;
    else totalEfectivo += total;
  });

  texto += `${'─'.repeat(30)}\n`;
  texto += `💵 Efectivo: ${formatPeso(totalEfectivo)}\n`;
  texto += `🔵 Transferencia: ${formatPeso(totalTransferencia)}\n`;
  texto += `TOTAL: ${formatPeso(totalEfectivo + totalTransferencia)}\n`;

  navigator.clipboard.writeText(texto).then(() => {
    alert('¡Resumen copiado al portapapeles!');
  }).catch(() => { prompt('Copiá este resumen:', texto); });
}

// ─── Stats ───────────────────────────────────────────────────

function renderStats() {
  const today = getToday();
  const zonaHoy = getZonaHoy();
  const entregas = state.ruta[today]?.entregas || {};
  const clientes = zonaHoy ? clientesDeZona(zonaHoy) : [];
  const entregados = clientes.filter(c => entregas[c.id]?.entregado);
  const totalEfectivo = entregados
    .filter(c => (entregas[c.id]?.pago || 'efectivo') === 'efectivo')
    .reduce((s,c) => s + calcularTotal(entregas[c.id]?.bid5||0, entregas[c.id]?.bid10||0), 0);
  const totalTransferencia = entregados
    .filter(c => entregas[c.id]?.pago === 'transferencia')
    .reduce((s,c) => s + calcularTotal(entregas[c.id]?.bid5||0, entregas[c.id]?.bid10||0), 0);
  const totalPesos = totalEfectivo + totalTransferencia;
  const pct = clientes.length ? Math.round((entregados.length/clientes.length)*100) : 0;

  document.getElementById('stat-clientes').textContent = `${entregados.length}/${clientes.length}`;
  document.getElementById('prog-bar').style.width = pct + '%';
  document.getElementById('prog-pct').textContent = pct + '%';

  const totalEl = document.getElementById('stat-total');
  if (totalEl) {
    totalEl.innerHTML = `<span class="total-prefix">$</span><span class="total-amount" id="total-amount">${Math.round(totalPesos).toLocaleString('es-AR')}</span><button class="total-toggle" onclick="toggleTotal()" aria-label="Mostrar u ocultar total"><i class="ti ti-eye" id="total-icon"></i></button>`;
    if (!totalVisible) {
      const amt = document.getElementById('total-amount');
      if (amt) amt.style.filter = 'blur(4px)';
      const icon = document.getElementById('total-icon');
      if (icon) icon.className = 'ti ti-eye-off';
    }
  }

  const desgEl = document.getElementById('stat-desglose');
  if (desgEl) {
    desgEl.innerHTML = `
      <div class="desglose-item">💵 <span id="desg-efectivo">${formatPeso(totalEfectivo)}</span></div>
      <div class="desglose-item">🔵 <span id="desg-transf">${formatPeso(totalTransferencia)}</span></div>`;
    if (!totalVisible) {
      desgEl.querySelectorAll('span').forEach(s => s.style.filter = 'blur(4px)');
    }
  }

  const exportarWrap = document.getElementById('exportar-wrap');
  if (exportarWrap) exportarWrap.style.display = entregados.length > 0 ? 'block' : 'none';
}

let totalVisible = true;
function toggleTotal() {
  totalVisible = !totalVisible;
  const amt = document.getElementById('total-amount');
  const icon = document.getElementById('total-icon');
  if (amt) amt.style.filter = totalVisible ? 'none' : 'blur(4px)';
  if (icon) icon.className = totalVisible ? 'ti ti-eye' : 'ti ti-eye-off';
  document.querySelectorAll('#stat-desglose span').forEach(s => {
    s.style.filter = totalVisible ? 'none' : 'blur(4px)';
  });
}

// ─── Selector de zona ────────────────────────────────────────

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
  if (!confirm('¿Cambiar la zona? Las entregas ya realizadas quedan guardadas en el historial.')) return;
  const today = getToday();
  delete state.ruta[today];
  saveState();
  renderSelectorZona();
  renderOpcionesZona();
  renderHistorial();
  renderStats();
}

function initRuta(zona) {
  const today = getToday();
  if (!state.ruta[today]) state.ruta[today] = { zona, entregas: {} };
  if (!state.ruta[today].entregas) state.ruta[today].entregas = {};
  clientesDeZona(zona).forEach(c => {
    if (!state.ruta[today].entregas[c.id]) {
      state.ruta[today].entregas[c.id] = { bid5: 0, bid10: c.bidHab, entregado: false, pago: null };
    }
  });
  saveState();
}

// ─── Ruta ────────────────────────────────────────────────────

function renderRuta() {
  const today = getToday();
  const zonaHoy = getZonaHoy();
  const entregas = state.ruta[today]?.entregas || {};

  if (!zonaHoy) { document.getElementById('ruta-list').innerHTML = ''; return; }

  const clientes = clientesDeZona(zonaHoy).sort((a,b) => a.orden - b.orden);

  if (!clientes.length) {
    document.getElementById('ruta-list').innerHTML = `<div class="empty">No hay clientes en ${zonaHoy}.</div>`;
    renderStats(); return;
  }

  const pendientes = clientes.filter(c => !entregas[c.id]?.entregado);
  const pendientesHtml = pendientes.length
    ? `<div class="pendientes-bar">⏳ ${pendientes.length} pendiente${pendientes.length!==1?'s':''}: ${pendientes.map(c=>c.nombre.split(' ')[0]).join(', ')}</div>`
    : `<div class="pendientes-bar pendientes-ok">✅ Todos entregados</div>`;

  document.getElementById('ruta-list').innerHTML = pendientesHtml + clientes.map(c => {
    const r = entregas[c.id] || { bid5: 0, bid10: c.bidHab, entregado: false, pago: null };
    const done = r.entregado;
    const total = calcularTotal(r.bid5, r.bid10);
    const pagoLabel = r.pago === 'transferencia'
      ? '<span class="pago-badge pago-transf">🔵 Transferencia</span>'
      : r.pago === 'efectivo'
        ? '<span class="pago-badge pago-efec">💵 Efectivo</span>'
        : '';

    return `
      <div class="card ${done?'done':''}">
        <div class="card-top">
          <div class="stop-badge ${done?'done':''}">${c.orden}</div>
          <div style="flex:1;min-width:0;">
            <div class="client-name ${done?'done':''}">${c.nombre}</div>
            <div class="client-addr">📍 ${c.dir}</div>
            ${c.tel?`<div class="client-tel">📞 ${c.tel}</div>`:''}
          </div>
          ${done?`<div class="card-total">${formatPeso(total)}</div>`:''}
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
        ${!done ? `
        <div class="pago-selector">
          <span class="pago-label">Método de pago:</span>
          <div class="pago-btns">
            <button class="pago-btn ${r.pago==='efectivo'?'pago-btn-active':''}" onclick="setPago(${c.id},'efectivo')">💵 Efectivo</button>
            <button class="pago-btn ${r.pago==='transferencia'?'pago-btn-active':''}" onclick="setPago(${c.id},'transferencia')">🔵 Transferencia</button>
          </div>
        </div>` : `<div style="margin-bottom:10px;">${pagoLabel}</div>`}
        <div class="card-bottom">
          <div class="subtotal">Subtotal: <strong>${formatPeso(total)}</strong></div>
          <button class="mark-btn ${done?'done':''}" onclick="toggleEntregado(${c.id})" ${!done && !r.pago ? 'disabled title="Seleccioná un método de pago"' : ''}>
            ${done?'✓ Entregado':'Marcar entregado'}
          </button>
        </div>
      </div>`;
  }).join('');

  renderStats();
}

function setPago(id, metodo) {
  const today = getToday();
  if (!state.ruta[today].entregas[id]) return;
  state.ruta[today].entregas[id].pago = metodo;
  saveState(); renderRuta();
}

function cambiarBidones(id, tipo, delta) {
  const today = getToday();
  const c = state.clientes.find(x => x.id === id);
  if (!state.ruta[today].entregas[id]) {
    state.ruta[today].entregas[id] = { bid5: 0, bid10: c.bidHab, entregado: false, pago: null };
  }
  state.ruta[today].entregas[id][tipo] = Math.max(0, (state.ruta[today].entregas[id][tipo]||0) + delta);
  saveState(); renderRuta();
}

function toggleEntregado(id) {
  const today = getToday();
  const c = state.clientes.find(x => x.id === id);
  if (!state.ruta[today].entregas[id]) {
    state.ruta[today].entregas[id] = { bid5: 0, bid10: c.bidHab, entregado: false, pago: null };
  }
  const e = state.ruta[today].entregas[id];
  if (!e.entregado && !e.pago) { alert('Seleccioná un método de pago antes de marcar como entregado.'); return; }
  e.entregado = !e.entregado;
  saveState(); renderRuta(); actualizarHistorialHoy();
}

// ─── Zonas ───────────────────────────────────────────────────

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
  saveState(); renderZonas(); renderZonaSelect(); renderOpcionesZona();
}

function renderZonaSelect() {
  const sel = document.getElementById('inp-zona-cliente');
  sel.innerHTML = '<option value="">Seleccioná una zona</option>' +
    state.zonas.map(z => `<option value="${z}">${z}</option>`).join('');
}

// ─── Clientes ────────────────────────────────────────────────

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
       ${c.tel?`<a class="client-card-detail client-tel-link" href="tel:${c.tel.replace(/\s/g,'')}" >📞 ${c.tel}</a>`:''}
        <div class="client-tags">
          <span class="tag tag-blue">💧 ${c.bidHab} bidones</span>
          <span class="tag tag-gray">${c.zona||'Sin zona'}</span>
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
  saveState(); renderClientes(); renderRuta(); renderZonas();
}

// ─── Historial ───────────────────────────────────────────────

function renderHistorial() {
  if (!state.historial.length) {
    document.getElementById('hist-list').innerHTML = '<div class="empty">Todavía no hay entregas realizadas.</div>';
    return;
  }

  const porFecha = {};
  state.historial.forEach(h => {
    if (!porFecha[h.fecha]) porFecha[h.fecha] = [];
    porFecha[h.fecha].push(h);
  });

  document.getElementById('hist-list').innerHTML = Object.keys(porFecha)
    .sort((a,b) => b.localeCompare(a))
    .map(fecha => {
      const zonas = porFecha[fecha];
      const totalDia = zonas.reduce((s,z) =>
        s + z.entregas.filter(e=>e.entregado).reduce((ss,e) => ss + calcularTotal(e.bid5||0,e.bid10||0), 0), 0);
      const totalEfDia = zonas.reduce((s,z) =>
        s + z.entregas.filter(e=>e.entregado && (e.pago||'efectivo')==='efectivo').reduce((ss,e) => ss + calcularTotal(e.bid5||0,e.bid10||0), 0), 0);
      const totalTrDia = zonas.reduce((s,z) =>
        s + z.entregas.filter(e=>e.entregado && e.pago==='transferencia').reduce((ss,e) => ss + calcularTotal(e.bid5||0,e.bid10||0), 0), 0);
      const totalClientes = zonas.reduce((s,z) => s + z.entregas.filter(e=>e.entregado).length, 0);

      return `
        <div class="hist-fecha-grupo">
          <div class="hist-fecha-header">
            <div>
              <div class="hist-fecha-title">${formatDate(fecha)}</div>
              <div class="hist-fecha-sub">${totalClientes} entregas · ${formatPeso(totalDia)}</div>
              <div class="hist-fecha-desglose">
                <span class="desglose-ef">💵 ${formatPeso(totalEfDia)}</span>
                <span class="desglose-tr">🔵 ${formatPeso(totalTrDia)}</span>
              </div>
            </div>
          </div>
          ${zonas.map((h, idx) => {
            const entregados = h.entregas.filter(e=>e.entregado);
            const totalZona = entregados.reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
            const efZona = entregados.filter(e=>(e.pago||'efectivo')==='efectivo').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
            const trZona = entregados.filter(e=>e.pago==='transferencia').reduce((s,e) => s + calcularTotal(e.bid5||0,e.bid10||0), 0);
            const uid = fecha.replace(/-/g,'') + idx;
            return `
              <div class="hist-zona-card">
                <div class="hist-head" onclick="toggleHist('${uid}')">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span class="tag tag-blue">📍 ${h.zona}</span>
                    ${h.enCurso?'<span class="tag-en-curso">En curso</span>':''}
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span class="hist-zona-total">${formatPeso(totalZona)}</span>
                    <span class="hist-arrow" id="hist-arrow-${uid}">›</span>
                  </div>
                </div>
                <div id="hist-body-${uid}" class="hist-body" style="display:none;">
                  ${entregados.map(e => {
                    const subtotal = calcularTotal(e.bid5||0,e.bid10||0);
                    const pagoIcon = e.pago==='transferencia' ? '🔵' : '💵';
                    return `
                      <div class="hist-row">
                        <div>
                          <div>${e.nombre}</div>
                          <div style="font-size:11px;color:#888;margin-top:2px;">${pagoIcon} ${e.pago==='transferencia'?'Transferencia':'Efectivo'}</div>
                        </div>
                        <div class="hist-row-right">
                          <span class="hist-bid-detail">${e.bid5>0?e.bid5+'×5lts ':''} ${e.bid10>0?e.bid10+'×10lts':''}</span>
                          <span class="badge-ok">${formatPeso(subtotal)}</span>
                        </div>
                      </div>`;
                  }).join('')}
                  <div class="hist-row" style="padding:8px 0 4px;">
                    <span style="font-size:12px;color:#888;">💵 Efectivo</span>
                    <span style="font-size:12px;color:#555;">${formatPeso(efZona)}</span>
                  </div>
                  <div class="hist-row" style="padding:4px 0 8px;">
                    <span style="font-size:12px;color:#888;">🔵 Transferencia</span>
                    <span style="font-size:12px;color:#555;">${formatPeso(trZona)}</span>
                  </div>
                  <div class="hist-row hist-row-total">
                    <strong>Total zona</strong>
                    <strong>${formatPeso(totalZona)}</strong>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
}

function toggleHist(uid) {
  const body = document.getElementById('hist-body-'+uid);
  const arrow = document.getElementById('hist-arrow-'+uid);
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(90deg)';
}

// ─── Navegación ──────────────────────────────────────────────

function showTab(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('sec-'+tab).classList.add('active');
  btn.classList.add('active');
  const exportarWrap = document.getElementById('exportar-wrap');
  if (exportarWrap) exportarWrap.style.display = tab === 'ruta' && getZonaHoy() ? 'block' : 'none';
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
