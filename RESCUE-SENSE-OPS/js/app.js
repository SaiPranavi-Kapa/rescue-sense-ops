/* RESCUE-SENSE OPS — front-end simulation, structured for a future Flask/API adapter.
   No real sensor hardware or external notification service is connected in this version. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'rescueSenseOpsStateV3';
  const MAX_EVENTS = 80;
  const MAX_TREND = 24;
  const SENSOR_BLUEPRINTS = [
    { id: 'S-01', name: 'North facade', floor: 'Level 03', baseMovement: 0.8, baseVibration: 1.2 },
    { id: 'S-02', name: 'East corner', floor: 'Level 03', baseMovement: 1.1, baseVibration: 1.4 },
    { id: 'S-03', name: 'Central frame', floor: 'Level 02', baseMovement: 0.7, baseVibration: 1.1 },
    { id: 'S-04', name: 'East column', floor: 'Level 02', baseMovement: 1.0, baseVibration: 1.3 },
    { id: 'S-05', name: 'West foundation', floor: 'Level 01', baseMovement: 0.5, baseVibration: 0.9 },
    { id: 'S-06', name: 'South foundation', floor: 'Level 01', baseMovement: 0.6, baseVibration: 1.0 }
  ];
  const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const stamp = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const clamp = (num, min, max) => Math.min(max, Math.max(min, num));

  function makeInitialSensors() {
    return SENSOR_BLUEPRINTS.map((s, index) => ({ ...s, movement: s.baseMovement, vibration: s.baseVibration, status: 'normal', online: true, updatedAt: stamp(), index }));
  }
  const state = {
    sensors: makeInitialSensors(), risk: 18, scenario: 'normal', movementFactor: 12, vibrationFactor: 16, agreement: 96,
    incidents: [], events: [], trend: [], autoSim: false, timer: null, lastCheck: null, selectedSensor: null,
    bannerVisible: true, allIncidentsView: false, modalAction: null
  };

  function addEvent(type, title, detail, status = 'info') {
    state.events.unshift({ id: uid('EVT'), time: stamp(), type, title, detail, status });
    state.events = state.events.slice(0, MAX_EVENTS);
    renderTimeline();
  }
  function loadSavedHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (Array.isArray(saved.events)) state.events = saved.events.filter(e => e && e.id && e.time).slice(0, MAX_EVENTS);
      if (Array.isArray(saved.incidents)) state.incidents = saved.incidents.filter(i => i && i.id && i.title).slice(0, 50);
      if (Array.isArray(saved.trend)) state.trend = saved.trend.filter(p => Number.isFinite(p.risk)).slice(-MAX_TREND);
      if (saved.lastCheck && typeof saved.lastCheck === 'string') state.lastCheck = saved.lastCheck;
    } catch (_) { /* Storage may be unavailable; continue in memory. */ }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ events: state.events, incidents: state.incidents, trend: state.trend, lastCheck: state.lastCheck })); }
    catch (_) { /* Private browsing or storage limits should not break the prototype. */ }
  }
  function levelForRisk(score) { return score >= 70 ? 'critical' : score >= 30 ? 'warning' : 'normal'; }
  function labelForRisk(score) { return score >= 70 ? 'CRITICAL' : score >= 50 ? 'ELEVATED' : score >= 30 ? 'WARNING' : 'LOW'; }
  function calculateRisk() {
    const online = state.sensors.filter(s => s.online);
    if (!online.length) return { risk: 100, movement: 100, vibration: 100, agreement: 0 };
    const movement = Math.max(...online.map(s => s.movement));
    const vibration = Math.max(...online.map(s => s.vibration));
    const movementFactor = clamp(Math.round(movement * 15), 0, 100);
    const vibrationFactor = clamp(Math.round(vibration * 12), 0, 100);
    const spread = Math.max(...online.map(s => s.movement)) - Math.min(...online.map(s => s.movement));
    const agreement = clamp(100 - Math.round(spread * 7), 0, 100);
    const risk = clamp(Math.round(movementFactor * 0.55 + vibrationFactor * 0.35 + (100 - agreement) * 0.10), 0, 100);
    return { risk, movement: movementFactor, vibration: vibrationFactor, agreement };
  }
  function updateSensorStatuses() {
    state.sensors.forEach(s => {
      if (!s.online) s.status = 'offline';
      else if (s.movement >= 4.8 || s.vibration >= 6) s.status = 'critical';
      else if (s.movement >= 2.1 || s.vibration >= 3.2) s.status = 'warning';
      else s.status = 'normal';
    });
  }
  function setScenario(name, quiet = false) {
    stopAutoSim(false);
    state.scenario = name;
    const profiles = {
      normal: [
        [0.7, 1.1], [0.9, 1.3], [0.6, 1.0], [0.8, 1.2], [0.4, 0.8], [0.5, 0.9]
      ],
      warning: [
        [2.8, 3.4], [1.1, 1.5], [2.4, 3.1], [1.2, 1.4], [0.7, 1.0], [0.8, 1.1]
      ],
      critical: [
        [6.8, 8.2], [2.4, 3.5], [5.9, 7.6], [2.2, 3.1], [1.1, 1.7], [1.4, 2.0]
      ]
    };
    const profile = profiles[name] || profiles.normal;
    state.sensors.forEach((s, index) => {
      const variation = name === 'normal' ? Math.random() * 0.25 : Math.random() * 0.35;
      s.movement = Math.max(0, +(profile[index][0] + variation).toFixed(1));
      s.vibration = Math.max(0, +(profile[index][1] + variation).toFixed(1));
      s.online = true;
      s.updatedAt = stamp();
    });
    updateSensorStatuses();
    runSafetyCheck({ source: `${name[0].toUpperCase()}${name.slice(1)} scenario`, quiet, forceEvent: !quiet });
    $$('[data-scenario]').forEach(btn => btn.classList.toggle('selected-scenario', btn.dataset.scenario === name));
  }
  function runSafetyCheck(options = {}) {
    const result = calculateRisk();
    state.risk = result.risk;
    state.movementFactor = result.movement;
    state.vibrationFactor = result.vibration;
    state.agreement = result.agreement;
    state.lastCheck = stamp();
    state.trend.push({ time: state.lastCheck, risk: state.risk });
    state.trend = state.trend.slice(-MAX_TREND);
    updateSensorStatuses();
    renderAll();
    if (options.forceEvent) addEvent('check', 'Safety check completed', `${options.source || 'Manual check'} · calculated risk ${state.risk}/100`, state.risk >= 70 ? 'critical' : state.risk >= 30 ? 'warning' : 'info');
    if (state.risk >= 30) maybeCreateIncident(state.risk >= 70 ? 'critical' : 'warning', options.source || 'Automatic risk assessment');
    else if (options.forceEvent) addEvent('status', 'Structure within demo baseline', 'No configured risk threshold was exceeded.', 'info');
    saveState();
    if (!options.quiet) toast('Safety check complete', `Calculated structural risk: ${state.risk}/100 (${labelForRisk(state.risk).toLowerCase()}).`, state.risk >= 70 ? 'critical' : state.risk >= 30 ? 'warning' : 'success');
  }
  function maybeCreateIncident(severity, source) {
    const openMatching = state.incidents.find(i => i.severity === severity && i.status !== 'resolved' && Date.now() - new Date(i.createdAt).getTime() < 120000);
    if (openMatching) {
      openMatching.lastSeen = stamp();
      openMatching.occurrences = (openMatching.occurrences || 1) + 1;
      openMatching.description = `${source}: risk score ${state.risk}/100. Repeated readings observed.`;
      addEvent('repeat', 'Repeated risk reading', `${openMatching.id} updated; repeated reading count ${openMatching.occurrences}.`, severity);
      renderIncidents(); saveState(); return openMatching;
    }
    const highest = [...state.sensors].sort((a, b) => (b.movement + b.vibration) - (a.movement + a.vibration))[0];
    const incident = {
      id: uid('INC'), title: severity === 'critical' ? 'Critical structural movement' : 'Abnormal movement detected',
      severity, sensorId: highest ? highest.id : 'NETWORK', building: 'Block A', status: 'open',
      createdAt: stamp(), lastSeen: stamp(), occurrences: 1,
      description: `${source}: risk score ${state.risk}/100. ${highest ? `${highest.id} (${highest.name}) recorded the highest combined reading.` : 'Sensor network risk threshold exceeded.'}`
    };
    state.incidents.unshift(incident);
    state.incidents = state.incidents.slice(0, 50);
    addEvent('alert', 'Incident generated', `${incident.id} · ${incident.title} · ${incident.sensorId}`, severity);
    renderIncidents(); saveState();
    toast(severity === 'critical' ? 'Critical incident generated' : 'Warning incident generated', `${incident.id} · ${incident.sensorId}. Notification status: simulated only.`, severity);
    return incident;
  }
  function triggerSOS() {
    const sos = { id: uid('SOS'), title: 'Simulated person-in-distress SOS', severity: 'critical', sensorId: 'SOS-BEACON', building: 'Block A', status: 'open', createdAt: stamp(), lastSeen: stamp(), occurrences: 1, description: 'Demo distress beacon signal received. No real person location or emergency dispatch is connected.' };
    state.incidents.unshift(sos);
    addEvent('sos', 'SOS signal received', `${sos.id} · simulated distress beacon · no real dispatch`, 'critical');
    renderIncidents(); saveState();
    toast('Simulated SOS received', 'A demo distress signal was added to the incident queue. No real rescue team was contacted.', 'critical');
  }
  function acknowledgeIncident(id) {
    const item = state.incidents.find(i => i.id === id);
    if (!item || item.status !== 'open') return;
    item.status = 'acknowledged'; item.acknowledgedAt = stamp();
    addEvent('ack', 'Incident acknowledged', `${item.id} acknowledged by demo operator.`, item.severity === 'critical' ? 'critical' : 'warning');
    renderIncidents(); renderMetrics(); saveState(); toast('Incident acknowledged', `${item.id} marked as acknowledged.`, 'success');
  }
  function resolveIncident(id) {
    const item = state.incidents.find(i => i.id === id);
    if (!item || item.status === 'resolved') return;
    item.status = 'resolved'; item.resolvedAt = stamp();
    addEvent('resolved', 'Incident marked resolved', `${item.id} closed in the demo interface. This does not verify real-world safety.`, 'info');
    renderIncidents(); renderMetrics(); saveState(); toast('Incident resolved', `${item.id} moved to resolved status.`, 'success');
  }
  function activeIncidents() { return state.incidents.filter(i => i.status !== 'resolved'); }
  function renderMetrics() {
    $('#metricSensors').textContent = String(state.sensors.filter(s => s.online).length).padStart(2, '0');
    $('#metricRisk').textContent = state.risk;
    $('#riskChip').textContent = labelForRisk(state.risk);
    $('#riskChip').className = `risk-chip ${levelForRisk(state.risk)}`;
    $('#metricIncidents').textContent = String(activeIncidents().length).padStart(2, '0');
    const critical = activeIncidents().filter(i => i.severity === 'critical').length;
    $('#incidentFoot').textContent = critical ? `${critical} critical incident${critical === 1 ? '' : 's'} active` : activeIncidents().length ? 'Review open incidents' : 'No active critical alerts';
    $('#lastCheck').textContent = state.lastCheck ? new Date(state.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';
    $('#navAlertCount').textContent = activeIncidents().length;
    $('#navAlertCount').classList.toggle('show', activeIncidents().length > 0);
    $('#incidentCountBadge').textContent = activeIncidents().length;
    $('#sensorOnlineLabel').textContent = `${state.sensors.filter(s => s.online).length} / ${state.sensors.length} reporting`;
  }
  function renderRisk() {
    const score = state.risk, level = levelForRisk(score);
    const color = score >= 70 ? 'var(--red)' : score >= 30 ? 'var(--amber)' : 'var(--green)';
    $('#riskGauge').style.background = `conic-gradient(${color} ${score * 3.6}deg, #263943 ${score * 3.6}deg 360deg)`;
    $('#gaugeValue').textContent = score;
    $('#gaugeChip').textContent = `${labelForRisk(score)} RISK`;
    $('#gaugeChip').className = `risk-chip ${level}`;
    $('#riskHeadline').textContent = score >= 70 ? 'Critical movement detected' : score >= 50 ? 'Elevated structural risk' : score >= 30 ? 'Movement needs review' : 'Structure stable';
    $('#riskDescription').textContent = score >= 70 ? 'Critical demo threshold exceeded. Review the incident queue immediately.' : score >= 30 ? 'One or more simulated readings exceed the configured demo baseline.' : 'Current simulated readings are within the demo baseline.';
    $('#riskFoot').textContent = score >= 30 ? 'Threshold exceeded · review recommended' : 'Within demo baseline';
    $('#factorMovement').textContent = `${state.movementFactor}%`;
    $('#factorVibration').textContent = `${state.vibrationFactor}%`;
    $('#factorAgreement').textContent = `${state.agreement}%`;
    $('#barMovement').style.width = `${state.movementFactor}%`;
    $('#barVibration').style.width = `${state.vibrationFactor}%`;
    $('#barAgreement').style.width = `${state.agreement}%`;
    $('#chartCurrent').textContent = `${score} / 100`;
  }
  function renderSensors() {
    $('#sensorList').innerHTML = state.sensors.map(s => `<button class="sensor-row ${s.status}${state.selectedSensor === s.id ? ' selected' : ''}" data-sensor-row="${s.id}" aria-label="Select sensor ${s.id}"><span class="sensor-indicator"></span><span class="sensor-row-info"><strong>${s.id} · ${escapeHTML(s.name)}</strong><small>${escapeHTML(s.floor)} · ${s.online ? 'Online' : 'Offline'}</small></span><span class="sensor-reading"><strong>${s.movement.toFixed(1)} mm</strong><small>movement</small></span></button>`).join('');
    $$('.sensor-node').forEach(node => {
      const sensor = state.sensors.find(s => s.id === node.dataset.node);
      if (!sensor) return;
      node.setAttribute('class', `sensor-node ${sensor.status}${state.selectedSensor === sensor.id ? ' selected' : ''}`);
      node.setAttribute('aria-label', `View ${sensor.id}, ${sensor.status}, movement ${sensor.movement.toFixed(1)} millimeters`);
    });
  }
  function renderIncidents() {
    const list = $('#incidentList');
    const sorted = [...state.incidents].sort((a, b) => {
      const rank = i => i.status === 'resolved' ? 3 : i.severity === 'critical' ? 0 : i.status === 'open' ? 1 : 2;
      return rank(a) - rank(b) || new Date(b.createdAt) - new Date(a.createdAt);
    });
    const shown = state.allIncidentsView ? sorted : sorted.slice(0, 4);
    if (!shown.length) {
      list.innerHTML = '<div class="empty-state"><span>✓</span><strong>All clear</strong><p>No active incidents. Trigger a scenario to test the response workflow.</p></div>';
    } else {
      list.innerHTML = shown.map(i => {
        const time = new Date(i.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const statusLabel = i.status === 'open' ? 'OPEN' : i.status === 'acknowledged' ? 'ACKNOWLEDGED' : 'RESOLVED';
        return `<div class="incident-item ${i.severity}"><span class="incident-severity"></span><div class="incident-main"><strong>${escapeHTML(i.title)}</strong><p>${escapeHTML(i.description)}</p><div class="incident-meta"><span>${escapeHTML(i.id)}</span><span>${escapeHTML(i.sensorId)}</span><span>${time}</span>${i.occurrences > 1 ? `<span>${i.occurrences} readings</span>` : ''}</div><div class="incident-buttons">${i.status === 'open' ? `<button class="mini-action" data-incident-action="ack" data-id="${i.id}">Acknowledge</button>` : ''}${i.status !== 'resolved' ? `<button class="mini-action" data-incident-action="resolve" data-id="${i.id}">Mark resolved</button>` : ''}<button class="mini-action" data-incident-action="details" data-id="${i.id}">Details</button></div></div><span class="incident-status ${i.status}">${statusLabel}</span></div>`;
      }).join('');
    }
    $('#viewAllIncidents').textContent = state.allIncidentsView ? 'Show recent ↑' : 'View all →';
    renderMetrics();
  }
  function renderTimeline() {
    const body = $('#timelineBody');
    if (!state.events.length) { body.innerHTML = '<tr><td colspan="4" class="table-empty">No events recorded yet. Run a safety check to begin.</td></tr>'; return; }
    body.innerHTML = state.events.slice(0, 16).map(e => {
      const date = new Date(e.time);
      const time = Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const cls = e.status === 'critical' ? 'critical' : e.status === 'warning' ? 'warning' : 'info';
      return `<tr><td>${time}</td><td>${escapeHTML(e.title)}</td><td>${escapeHTML(e.detail)}</td><td><span class="event-status ${cls}">${escapeHTML(String(e.status).toUpperCase())}</span></td></tr>`;
    }).join('');
  }
  function drawChart() {
    const canvas = $('#riskChart');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(250, rect.width), height = Math.max(130, rect.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height);
    const pad = { left: 29, right: 10, top: 10, bottom: 25 }, plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
    [0, 30, 50, 70, 100].forEach(v => {
      const y = pad.top + plotH - (v / 100) * plotH;
      ctx.beginPath(); ctx.strokeStyle = v === 30 || v === 70 ? '#3b4c43' : '#263740'; ctx.setLineDash(v === 30 || v === 70 ? [4, 4] : []); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#708792'; ctx.font = '9px "DM Mono", monospace'; ctx.textAlign = 'right'; ctx.fillText(String(v), pad.left - 7, y + 3);
    });
    const points = state.trend.length ? state.trend : [{ time: new Date().toISOString(), risk: state.risk }];
    const plotted = points.slice(-MAX_TREND);
    const coords = plotted.map((p, i) => ({ x: pad.left + (plotted.length === 1 ? plotW / 2 : i / (plotted.length - 1) * plotW), y: pad.top + plotH - (clamp(p.risk, 0, 100) / 100) * plotH, risk: p.risk }));
    if (coords.length > 1) {
      ctx.beginPath(); coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.lineTo(coords[coords.length - 1].x, pad.top + plotH); ctx.lineTo(coords[0].x, pad.top + plotH); ctx.closePath(); const gradient = ctx.createLinearGradient(0, pad.top, 0, height); gradient.addColorStop(0, '#59d6dc33'); gradient.addColorStop(1, '#59d6dc00'); ctx.fillStyle = gradient; ctx.fill();
    }
    ctx.beginPath(); coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = state.risk >= 70 ? '#ff6b70' : state.risk >= 30 ? '#f5b94f' : '#59d6dc'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    coords.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#142129'; ctx.fill(); ctx.strokeStyle = state.risk >= 70 ? '#ff6b70' : state.risk >= 30 ? '#f5b94f' : '#59d6dc'; ctx.lineWidth = 1.5; ctx.stroke(); });
    ctx.fillStyle = '#708792'; ctx.font = '8px "DM Mono", monospace'; ctx.textAlign = 'center';
    const labels = [0, Math.floor((plotted.length - 1) / 2), plotted.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    labels.forEach(i => { const p = plotted[i]; const x = coords[i].x; const d = new Date(p.time); const label = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); ctx.fillText(label, x, height - 7); });
    $('#chartEmpty').hidden = state.trend.length > 0;
    $('#chartUpdated').textContent = state.lastCheck ? `Updated ${new Date(state.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for first check';
  }
  function renderAll() { renderMetrics(); renderRisk(); renderSensors(); renderIncidents(); renderTimeline(); drawChart(); }
  function toast(title, message, kind = 'success') {
    const region = $('#toastRegion'); const item = document.createElement('div'); item.className = `toast ${kind}`;
    item.innerHTML = `<span class="toast-symbol">${kind === 'critical' ? '!' : kind === 'warning' ? '!' : '✓'}</span><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
    region.appendChild(item); window.setTimeout(() => { item.style.opacity = '0'; item.style.transform = 'translateY(6px)'; window.setTimeout(() => item.remove(), 220); }, 4300);
  }
  function showModal(title, html, eyebrow = 'SYSTEM MESSAGE') {
    state.modalAction = null; $('#modalOk').textContent = 'Got it';
    $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modalEyebrow').textContent = eyebrow;
    const modal = $('#modal'); if (typeof modal.showModal === 'function') modal.showModal(); else alert(`${title}\n\n${$('#modalBody').textContent}`);
  }
  function stopAutoSim(log = true) {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null; state.autoSim = false;
    $('#autoToggleDot').classList.remove('running'); $('#autoToggleText').textContent = 'Start continuous simulation'; $('#autoSimStatus').textContent = 'Paused';
    if (log) { addEvent('simulation', 'Continuous simulation paused', 'Automatic simulated readings are paused.', 'info'); saveState(); }
  }
  function startAutoSim() {
    if (state.timer) window.clearInterval(state.timer);
    state.autoSim = true; $('#autoToggleDot').classList.add('running'); $('#autoToggleText').textContent = 'Pause continuous simulation'; $('#autoSimStatus').textContent = 'Running · every 5 sec';
    addEvent('simulation', 'Continuous simulation started', 'Readings update every five seconds in demo mode.', 'info'); saveState();
    state.timer = window.setInterval(() => {
      state.sensors.forEach(s => {
        const scale = state.scenario === 'critical' ? 1.3 : state.scenario === 'warning' ? 0.7 : 0.25;
        s.movement = +clamp(s.baseMovement + (Math.random() - 0.25) * scale * 2.4, 0.2, state.scenario === 'critical' ? 7.5 : 3.2).toFixed(1);
        s.vibration = +clamp(s.baseVibration + (Math.random() - 0.25) * scale * 3.1, 0.3, state.scenario === 'critical' ? 9 : 4.2).toFixed(1);
        s.updatedAt = stamp();
      });
      updateSensorStatuses();
      const result = calculateRisk(); state.risk = result.risk; state.movementFactor = result.movement; state.vibrationFactor = result.vibration; state.agreement = result.agreement;
      state.lastCheck = stamp(); state.trend.push({ time: state.lastCheck, risk: state.risk }); state.trend = state.trend.slice(-MAX_TREND);
      renderAll();
      if (state.risk >= 30) maybeCreateIncident(state.risk >= 70 ? 'critical' : 'warning', 'Continuous simulation');
      saveState();
    }, 5000);
  }
  function selectSensor(id) {
    const sensor = state.sensors.find(s => s.id === id); if (!sensor) return;
    state.selectedSensor = state.selectedSensor === id ? null : id; renderSensors();
    showModal(`Sensor ${sensor.id}`, `<p><strong>${escapeHTML(sensor.name)}</strong> · ${escapeHTML(sensor.floor)}</p><ul><li>Movement deviation: <strong>${sensor.movement.toFixed(1)} mm</strong></li><li>Vibration index: <strong>${sensor.vibration.toFixed(1)}</strong></li><li>Node status: <strong>${sensor.status.toUpperCase()}</strong></li><li>Last updated: ${new Date(sensor.updatedAt).toLocaleString()}</li></ul><p>These are simulated values. Real-world thresholds and units require sensor calibration and engineering validation.</p>`, 'SENSOR DETAIL');
  }
  function incidentDetails(id) {
    const i = state.incidents.find(item => item.id === id); if (!i) return;
    showModal('Incident details', `<p><strong>${escapeHTML(i.title)}</strong></p><ul><li>Incident ID: ${escapeHTML(i.id)}</li><li>Building: ${escapeHTML(i.building)}</li><li>Sensor / source: ${escapeHTML(i.sensorId)}</li><li>Severity: ${i.severity.toUpperCase()}</li><li>Status: ${i.status.toUpperCase()}</li><li>Created: ${new Date(i.createdAt).toLocaleString()}</li><li>Repeated readings: ${i.occurrences || 1}</li></ul><p>${escapeHTML(i.description)}</p><p><strong>Notification:</strong> Simulated in this prototype. No real emergency service or rescue team has been contacted.</p>`, 'INCIDENT RECORD');
  }
  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportReport() {
    const report = {
      product: 'RESCUE-SENSE OPS', mode: 'SIMULATION ONLY', exportedAt: stamp(), building: 'North Sector · Block A (demo)', riskScore: state.risk, riskLevel: labelForRisk(state.risk),
      sensorReadings: state.sensors.map(s => ({ id: s.id, name: s.name, floor: s.floor, movementMm: s.movement, vibrationIndex: s.vibration, status: s.status, online: s.online, updatedAt: s.updatedAt })),
      incidents: state.incidents, events: state.events, disclaimer: 'Simulated data only. Not a certified structural-safety system.'
    };
    downloadFile(`rescue-sense-report-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(report, null, 2), 'application/json');
    addEvent('export', 'System report exported', 'Downloaded JSON report containing current demo readings, incidents and events.', 'info'); saveState(); toast('Report exported', 'A JSON report of the current simulation was downloaded.', 'success');
  }
  function downloadCSV() {
    const rows = [['timestamp', 'event_id', 'event', 'detail', 'status'], ...state.events.map(e => [e.time, e.id, e.title, e.detail, e.status])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadFile(`rescue-sense-events-${new Date().toISOString().slice(0, 10)}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
    toast('Event log downloaded', 'CSV export created from the current event timeline.', 'success');
  }
  function clearHistory() {
    showModal('Clear event timeline?', '<p>This removes the locally saved event timeline for this prototype. Incident records remain unchanged.</p><p>This action cannot be undone.</p>', 'CONFIRM ACTION');
    $('#modalOk').textContent = 'Clear timeline';
    state.modalAction = () => { state.events = []; renderTimeline(); saveState(); toast('Timeline cleared', 'Event history has been cleared from local storage.', 'success'); };
  }
  function clearResolved() {
    const before = state.incidents.length; state.incidents = state.incidents.filter(i => i.status !== 'resolved');
    if (before === state.incidents.length) { toast('Nothing to clear', 'There are no resolved incidents in the queue.', 'warning'); return; }
    addEvent('cleanup', 'Resolved incidents cleared', `${before - state.incidents.length} resolved incident record(s) removed from the demo queue.`, 'info'); renderIncidents(); saveState(); toast('Resolved incidents cleared', 'Resolved records removed from the incident queue.', 'success');
  }
  function attachEvents() {
    $$('[data-scenario]').forEach(btn => btn.addEventListener('click', () => setScenario(btn.dataset.scenario)));
    $('#runCheckBtn').addEventListener('click', () => runSafetyCheck({ source: 'Manual safety check', forceEvent: true }));
    $('#autoSimToggle').addEventListener('click', () => state.autoSim ? stopAutoSim() : startAutoSim());
    $('#sosBtn').addEventListener('click', triggerSOS);
    $('#exportBtn').addEventListener('click', exportReport);
    $('#downloadHistoryBtn').addEventListener('click', downloadCSV);
    $('#clearHistoryBtn').addEventListener('click', clearHistory);
    $('#clearResolvedBtn').addEventListener('click', clearResolved);
    $('#viewAllIncidents').addEventListener('click', () => { state.allIncidentsView = !state.allIncidentsView; renderIncidents(); });
    $('#incidentList').addEventListener('click', event => {
      const btn = event.target.closest('[data-incident-action]'); if (!btn) return;
      if (btn.dataset.incidentAction === 'ack') acknowledgeIncident(btn.dataset.id);
      if (btn.dataset.incidentAction === 'resolve') resolveIncident(btn.dataset.id);
      if (btn.dataset.incidentAction === 'details') incidentDetails(btn.dataset.id);
    });
    $('#sensorList').addEventListener('click', event => { const row = event.target.closest('[data-sensor-row]'); if (row) selectSensor(row.dataset.sensorRow); });
    $$('.sensor-node').forEach(node => { node.addEventListener('click', () => selectSensor(node.dataset.node)); node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSensor(node.dataset.node); } }); });
    $('#buildingInfoBtn').addEventListener('click', () => showModal('Demo site information', '<p><strong>North Sector · Block A</strong></p><ul><li>Illustrative three-level structure</li><li>Six simulated sensor nodes</li><li>Movement and vibration readings are generated in the browser</li><li>No real GPS location, sensor hardware, emergency dispatch or validated engineering model is connected</li></ul><p>The building drawing is schematic and is not to scale.</p>', 'SITE DETAILS'));
    $('#dismissBanner').addEventListener('click', () => { $('.demo-banner').hidden = true; state.bannerVisible = false; });
    $('#modalClose').addEventListener('click', () => { if ($('#modal').open) $('#modal').close(); });
    $('#modalOk').addEventListener('click', () => { const action = state.modalAction; state.modalAction = null; if (action) action(); if ($('#modal').open) $('#modal').close(); $('#modalOk').textContent = 'Got it'; });
    $('#modal').addEventListener('close', () => { state.modalAction = null; $('#modalOk').textContent = 'Got it'; });
    $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $$('.nav-link').forEach(link => link.addEventListener('click', () => {
      $$('.nav-link').forEach(a => a.classList.toggle('active', a === link));
      $('#crumbTitle').textContent = link.textContent.trim().replace(/^◫|^▦|^⚑|^◷/, '').trim();
      $('#sidebar').classList.remove('open');
    }));
    document.addEventListener('click', event => {
      if (window.innerWidth <= 950 && $('#sidebar').classList.contains('open') && !$('#sidebar').contains(event.target) && !$('#menuToggle').contains(event.target)) $('#sidebar').classList.remove('open');
    });
    window.addEventListener('resize', () => window.requestAnimationFrame(drawChart));
    window.addEventListener('beforeunload', () => { if (state.timer) window.clearInterval(state.timer); saveState(); });
  }
  function startClock() {
    const update = () => { $('#liveClock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); };
    update(); window.setInterval(update, 1000);
  }
  function initialize() {
    loadSavedHistory(); attachEvents(); startClock();
    const result = calculateRisk(); state.risk = result.risk; state.movementFactor = result.movement; state.vibrationFactor = result.vibration; state.agreement = result.agreement;
    if (!state.trend.length) state.trend.push({ time: stamp(), risk: state.risk });
    renderAll();
    if (state.events.length) addEvent('session', 'Dashboard session started', 'Prototype loaded; historical demo events restored from this browser when available.', 'info');
    else addEvent('session', 'Dashboard initialized', 'Simulation environment ready. No physical sensors are connected.', 'info');
    saveState();
    window.requestAnimationFrame(drawChart);
  }
  document.addEventListener('DOMContentLoaded', initialize);
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

async function sendSensorReadingsToBackend() {
  try {
    const snapshot = window.RescueSense.getSnapshot();

    const results = await Promise.all(
      snapshot.sensors.map(sensor => {
        const riskLevel =
          snapshot.risk >= 70 ? "Critical" :
          snapshot.risk >= 30 ? "Warning" : "Normal";

        return apiRequest("/sensors", {
          method: "POST",
          body: JSON.stringify({
            sensor_id: sensor.id,
            reading: sensor.movement,
            risk_level: riskLevel
          })
        });
      })
    );

    console.log(
      "Sensor readings saved to Flask:",
      results.length
    );
  } catch (error) {
    console.error("Could not save sensor readings:", error);
  }
}

  return response.json();
}
  // Backend integration seam for a future Flask service. Not called in this frontend-only build.
  // Replace the local simulation data source with API calls such as GET /api/sensors and POST /api/checks.
  window.RescueSense = {
    getSnapshot: () => JSON.parse(JSON.stringify({ risk: state.risk, sensors: state.sensors, incidents: state.incidents, events: state.events })),
    runSafetyCheck,
    setScenario,
    acknowledgeIncident,
    resolveIncident,
    sendSensorReadingsToBackend,
    API_BASE_URL: '/api'
  };
})();
