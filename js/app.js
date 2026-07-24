import { DB } from './db.js';
import { compressPhoto, initialsFor } from './imageUtils.js';

// ---------------------------------------------------------------------------
// Utilidades chicas
// ---------------------------------------------------------------------------

/** Constructor de DOM seguro: nunca usa innerHTML con texto de usuario, así
 *  un nombre de alumno o una nota con "<script>" o similar nunca se
 *  interpreta como HTML, se muestra como texto plano. */
function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v; // solo para markup estático de confianza (íconos)
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && typeof node[k] !== 'object') {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    } else node.setAttribute(k, v === true ? '' : v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function localDateStr(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseLocalDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(dateStr, delta) { const d = parseLocalDate(dateStr); d.setDate(d.getDate() + delta); return localDateStr(d); }
function formatDateHuman(dateStr) {
  const d = parseLocalDate(dateStr);
  const s = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fullName(s) { return `${s.lastName}, ${s.firstName}`.trim().replace(/^,\s*/, ''); }

let trackedUrls = [];
function trackedObjectURL(blob) {
  const url = URL.createObjectURL(blob);
  trackedUrls.push(url);
  return url;
}
function revokeTrackedUrls() {
  for (const u of trackedUrls) URL.revokeObjectURL(u);
  trackedUrls = [];
}

/** Avatar: foto si existe, si no un círculo con iniciales. Nunca rompe el
 *  layout si photoBlob es null/undefined/corrupto. */
function avatar(student, size = 44) {
  const wrap = h('div', { class: 'avatar', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px` });
  if (student.photoBlob instanceof Blob) {
    const img = h('img', { src: trackedObjectURL(student.photoBlob), alt: '', loading: 'lazy' });
    wrap.appendChild(img);
  } else {
    wrap.classList.add('avatar-fallback');
    wrap.appendChild(document.createTextNode(initialsFor(student.firstName, student.lastName)));
  }
  return wrap;
}

function toast(message, kind = 'info') {
  const container = document.getElementById('toast-container');
  const t = h('div', { class: `toast toast-${kind}` }, [message]);
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, kind === 'error' ? 5000 : 3000);
}

function showFatalError(err) {
  console.error(err);
  toast(err && err.message ? err.message : 'Ocurrió un error inesperado.', 'error');
}

// ---------------------------------------------------------------------------
// Shell: topbar + contenedor principal
// ---------------------------------------------------------------------------

const appEl = document.getElementById('app');
const topbarEl = document.getElementById('topbar');

function setTopbar({ title, onBack, actionLabel, actionIcon, onAction }) {
  topbarEl.replaceChildren();
  const left = h('div', { class: 'topbar-left' },
    onBack ? [h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: onBack }, ['←'])] : []
  );
  const titleEl = h('h1', { class: 'topbar-title' }, [title]);
  const right = h('div', { class: 'topbar-right' },
    onAction ? [h('button', { class: 'icon-btn', 'aria-label': actionLabel || 'Acción', onclick: onAction }, [actionIcon || '⋯'])] : []
  );
  topbarEl.append(left, titleEl, right);
}

function go(hash) { location.hash = hash; }
function replaceRoute(hash) { location.replace('#' + hash); }

function parseRoute() {
  const raw = location.hash.slice(1);
  return raw.split('/').filter(Boolean);
}

async function render() {
  revokeTrackedUrls();
  const parts = parseRoute();
  try {
    if (parts.length === 0) return renderHome();
    if (parts[0] === 'settings') return renderSettings();
    if (parts[0] === 'group' && parts[1]) {
      const groupId = decodeURIComponent(parts[1]);
      if (!parts[2]) return renderGroup(groupId);
      if (parts[2] === 'asistencia') return renderAttendance(groupId, parts[3]);
      if (parts[2] === 'calendario') return renderCalendar(groupId, parts[3], parts[4]);
      if (parts[2] === 'agregar') return renderStudentForm({ groupId });
      if (parts[2] === 'importar') return renderImport(groupId);
    }
    if (parts[0] === 'student' && parts[1]) {
      const studentId = decodeURIComponent(parts[1]);
      if (parts[2] === 'editar') return renderStudentForm({ studentId });
      return renderStudentProfile(studentId);
    }
    return renderNotFound();
  } catch (err) {
    showFatalError(err);
    appEl.replaceChildren(h('div', { class: 'screen' }, [
      h('p', { class: 'empty-state' }, ['Ocurrió un error al mostrar esta pantalla.']),
      h('button', { class: 'btn', onclick: () => go('#/') }, ['Volver al inicio']),
    ]));
  }
}

function renderNotFound() {
  setTopbar({ title: 'No encontrado', onBack: () => go('#/') });
  appEl.replaceChildren(h('div', { class: 'screen' }, [
    h('p', { class: 'empty-state' }, ['Esta pantalla no existe.']),
  ]));
}

// ---------------------------------------------------------------------------
// Pantalla: Inicio (lista de grupos)
// ---------------------------------------------------------------------------

async function renderHome() {
  setTopbar({ title: 'Asistencia', actionIcon: '⚙', actionLabel: 'Ajustes', onAction: () => go('#/settings') });
  appEl.replaceChildren(h('div', { class: 'screen' }, [h('p', { class: 'loading' }, ['Cargando…'])]));

  const groups = await DB.getGroups();
  const today = localDateStr();

  const sections = [];
  for (const levelKey of [['secundario', 'Secundario'], ['primario', 'Primario']]) {
    const [level, label] = levelKey;
    const levelGroups = groups.filter((g) => g.level === level);
    if (levelGroups.length === 0) continue;
    const rows = [];
    for (const g of levelGroups) {
      const students = await DB.getStudentsByGroup(g.id);
      let subtitle;
      if (students.length === 0) {
        subtitle = 'Sin alumnos todavía';
      } else {
        const att = await DB.getAttendanceForGroupDate(g.id, today);
        let present = 0, absent = 0;
        for (const status of att.values()) { if (status === 'present') present++; else if (status === 'absent') absent++; }
        const unmarked = students.length - present - absent;
        subtitle = att.size === 0
          ? `${students.length} alumnos · asistencia de hoy sin tomar`
          : `${students.length} alumnos · hoy: ${present} presentes, ${absent} ausentes${unmarked > 0 ? `, ${unmarked} sin marcar` : ''}`;
      }
      rows.push(
        h('button', { class: 'group-card', onclick: () => go(`#/group/${encodeURIComponent(g.id)}`) }, [
          h('div', { class: 'group-card-name' }, [g.name]),
          h('div', { class: 'group-card-sub' }, [subtitle]),
        ])
      );
    }
    sections.push(h('section', { class: 'group-section' }, [
      h('h2', { class: 'section-label' }, [label]),
      h('div', { class: 'group-list' }, rows),
    ]));
  }

  if (groups.length === 0) {
    sections.push(h('p', { class: 'empty-state' }, ['Todavía no hay grupos configurados.']));
  }

  const addGroupForm = h('details', { class: 'add-group-details' }, [
    h('summary', {}, ['+ Agregar otro grupo']),
    buildAddGroupForm(),
  ]);

  appEl.replaceChildren(h('div', { class: 'screen' }, [...sections, addGroupForm]));
}

function buildAddGroupForm() {
  const nameInput = h('input', { type: 'text', placeholder: 'Nombre del grupo (ej: 4° Primaria)', maxlength: 60 });
  const levelSelect = h('select', {}, [
    h('option', { value: 'primario' }, ['Primario']),
    h('option', { value: 'secundario' }, ['Secundario']),
  ]);
  const btn = h('button', { class: 'btn btn-secondary' }, ['Crear grupo']);
  const form = h('form', { class: 'inline-form' }, [nameInput, levelSelect, btn]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { toast('Ponele un nombre al grupo.', 'error'); return; }
    btn.disabled = true;
    try {
      await DB.addGroup(name, levelSelect.value);
      toast('Grupo creado.', 'success');
      render();
    } catch (err) {
      showFatalError(err);
    } finally {
      btn.disabled = false;
    }
  });
  return form;
}

// ---------------------------------------------------------------------------
// Pantalla: Roster de un grupo
// ---------------------------------------------------------------------------

async function renderGroup(groupId) {
  const group = await DB.getGroup(groupId);
  if (!group) return renderNotFound();

  setTopbar({ title: group.name, onBack: () => go('#/'), actionIcon: '✎', actionLabel: 'Renombrar grupo', onAction: () => renameGroupPrompt(group) });
  appEl.replaceChildren(h('div', { class: 'screen' }, [h('p', { class: 'loading' }, ['Cargando…'])]));

  const students = await DB.getStudentsByGroup(groupId);

  const actions = h('div', { class: 'action-row' }, [
    h('button', { class: 'btn', onclick: () => go(`#/group/${encodeURIComponent(groupId)}/asistencia/${localDateStr()}`) }, ['📋 Tomar asistencia']),
    h('button', { class: 'btn btn-secondary', onclick: () => go(`#/group/${encodeURIComponent(groupId)}/calendario`) }, ['📅 Calendario']),
  ]);

  const searchInput = h('input', { type: 'search', placeholder: `Buscar en ${students.length} alumnos…`, class: 'search-input' });
  const listEl = h('div', { class: 'student-list' });

  function renderList(filterText) {
    const q = (filterText || '').trim().toLowerCase();
    const filtered = q
      ? students.filter((s) => fullName(s).toLowerCase().includes(q))
      : students;
    listEl.replaceChildren();
    if (filtered.length === 0) {
      listEl.appendChild(h('p', { class: 'empty-state' }, [
        students.length === 0 ? 'Todavía no hay alumnos en este grupo.' : 'Sin resultados.',
      ]));
      return;
    }
    for (const s of filtered) {
      listEl.appendChild(
        h('button', { class: 'student-row', onclick: () => go(`#/student/${encodeURIComponent(s.id)}`) }, [
          avatar(s),
          h('span', { class: 'student-row-name' }, [fullName(s)]),
        ])
      );
    }
  }
  searchInput.addEventListener('input', () => renderList(searchInput.value));
  renderList('');

  const bottomActions = h('div', { class: 'action-row' }, [
    h('button', { class: 'btn btn-secondary', onclick: () => go(`#/group/${encodeURIComponent(groupId)}/agregar`) }, ['+ Agregar alumno']),
    h('button', { class: 'btn btn-secondary', onclick: () => go(`#/group/${encodeURIComponent(groupId)}/importar`) }, ['⇪ Importar lista']),
  ]);

  const deleteGroupBtn = students.length === 0
    ? h('button', { class: 'btn btn-danger-outline', onclick: () => deleteGroupFlow(group) }, ['Eliminar este grupo'])
    : null;

  appEl.replaceChildren(h('div', { class: 'screen' }, [
    actions,
    searchInput,
    listEl,
    bottomActions,
    deleteGroupBtn,
  ]));
}

function renameGroupPrompt(group) {
  const name = window.prompt('Nuevo nombre del grupo:', group.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { toast('El nombre no puede estar vacío.', 'error'); return; }
  DB.saveGroup({ ...group, name: trimmed })
    .then(() => { toast('Grupo renombrado.', 'success'); render(); })
    .catch(showFatalError);
}

async function deleteGroupFlow(group) {
  if (!window.confirm(`¿Eliminar el grupo "${group.name}"? Esta acción no se puede deshacer.`)) return;
  try {
    await DB.deleteGroup(group.id);
    toast('Grupo eliminado.', 'success');
    go('#/');
  } catch (err) {
    showFatalError(err);
  }
}

// ---------------------------------------------------------------------------
// Pantalla: Tomar asistencia (por grupo y fecha)
// ---------------------------------------------------------------------------

async function renderAttendance(groupId, dateStr) {
  if (!dateStr) return replaceRoute(`/group/${encodeURIComponent(groupId)}/asistencia/${localDateStr()}`);

  const group = await DB.getGroup(groupId);
  if (!group) return renderNotFound();

  setTopbar({ title: group.name, onBack: () => go(`#/group/${encodeURIComponent(groupId)}`) });
  appEl.replaceChildren(h('div', { class: 'screen' }, [h('p', { class: 'loading' }, ['Cargando…'])]));

  const students = await DB.getStudentsByGroup(groupId);
  const attendance = await DB.getAttendanceForGroupDate(groupId, dateStr);

  const dateNav = h('div', { class: 'date-nav' }, [
    h('button', { class: 'icon-btn', onclick: () => go(`#/group/${encodeURIComponent(groupId)}/asistencia/${addDays(dateStr, -1)}`) }, ['‹']),
    h('div', { class: 'date-nav-label' }, [formatDateHuman(dateStr)]),
    h('button', { class: 'icon-btn', onclick: () => go(`#/group/${encodeURIComponent(groupId)}/asistencia/${addDays(dateStr, 1)}`) }, ['›']),
  ]);
  const todayBtn = dateStr !== localDateStr()
    ? h('button', { class: 'btn-link', onclick: () => go(`#/group/${encodeURIComponent(groupId)}/asistencia/${localDateStr()}`) }, ['Ir a hoy'])
    : null;

  const summaryEl = h('div', { class: 'attendance-summary' });
  function updateSummary(map) {
    let present = 0, absent = 0;
    for (const status of map.values()) { if (status === 'present') present++; else if (status === 'absent') absent++; }
    const unmarked = students.length - present - absent;
    // Nota: replaceChildren() nativo, a diferencia del helper h(), NO ignora
    // los argumentos null (los convierte en texto "null"), así que hay que
    // filtrarlos antes de pasarlos.
    summaryEl.replaceChildren(
      ...[
        h('span', { class: 'summary-present' }, [`✓ ${present} presentes`]),
        h('span', { class: 'summary-absent' }, [`✕ ${absent} ausentes`]),
        unmarked > 0 ? h('span', { class: 'summary-unmarked' }, [`${unmarked} sin marcar`]) : null,
      ].filter(Boolean)
    );
  }
  updateSummary(attendance);

  const markAllBtn = h('button', { class: 'btn btn-secondary' }, ['Marcar todos presentes']);
  markAllBtn.addEventListener('click', async () => {
    markAllBtn.disabled = true;
    try {
      await DB.markAllPresent(groupId, dateStr, students.map((s) => s.id));
      const fresh = await DB.getAttendanceForGroupDate(groupId, dateStr);
      for (const s of students) setRowState(s.id, fresh.get(s.id) || null);
      updateSummary(fresh);
      toast('Marcados como presentes los que no tenían estado.', 'success');
    } catch (err) {
      showFatalError(err);
    } finally {
      markAllBtn.disabled = false;
    }
  });

  const rowStateSetters = new Map();
  function setRowState(studentId, status) {
    const setter = rowStateSetters.get(studentId);
    if (setter) setter(status);
  }

  const listEl = h('div', { class: 'student-list' });
  if (students.length === 0) {
    listEl.appendChild(h('p', { class: 'empty-state' }, ['No hay alumnos para marcar asistencia en este grupo.']));
  }
  for (const s of students) {
    const presentBtn = h('button', { class: 'toggle-btn toggle-present', 'aria-label': 'Presente' }, ['P']);
    const absentBtn = h('button', { class: 'toggle-btn toggle-absent', 'aria-label': 'Ausente' }, ['A']);

    function applyVisual(status) {
      presentBtn.classList.toggle('active', status === 'present');
      absentBtn.classList.toggle('active', status === 'absent');
    }
    rowStateSetters.set(s.id, applyVisual);
    applyVisual(attendance.get(s.id) || null);

    async function toggle(target) {
      const current = attendance.get(s.id) || null;
      const next = current === target ? null : target;
      presentBtn.disabled = true; absentBtn.disabled = true;
      try {
        await DB.setAttendance(s.id, groupId, dateStr, next);
        attendance.set(s.id, next);
        if (next === null) attendance.delete(s.id);
        applyVisual(next);
        updateSummary(attendance);
      } catch (err) {
        showFatalError(err);
      } finally {
        presentBtn.disabled = false; absentBtn.disabled = false;
      }
    }
    presentBtn.addEventListener('click', () => toggle('present'));
    absentBtn.addEventListener('click', () => toggle('absent'));

    listEl.appendChild(h('div', { class: 'student-row student-row-attendance' }, [
      h('button', { class: 'student-row-main', onclick: () => go(`#/student/${encodeURIComponent(s.id)}`) }, [
        avatar(s),
        h('span', { class: 'student-row-name' }, [fullName(s)]),
      ]),
      h('div', { class: 'toggle-group' }, [presentBtn, absentBtn]),
    ]));
  }

  appEl.replaceChildren(h('div', { class: 'screen' }, [
    dateNav, todayBtn, summaryEl, markAllBtn, listEl,
  ]));
}

// ---------------------------------------------------------------------------
// Pantalla: Calendario mensual por grupo
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

async function renderCalendar(groupId, yearParam, monthParam) {
  const group = await DB.getGroup(groupId);
  if (!group) return renderNotFound();

  const now = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth(); // 0-indexed
  if (Number.isNaN(year) || Number.isNaN(month) || month < 0 || month > 11) {
    return replaceRoute(`/group/${encodeURIComponent(groupId)}/calendario/${now.getFullYear()}/${now.getMonth()}`);
  }

  setTopbar({ title: `Calendario · ${group.name}`, onBack: () => go(`#/group/${encodeURIComponent(groupId)}`) });
  appEl.replaceChildren(h('div', { class: 'screen' }, [h('p', { class: 'loading' }, ['Cargando…'])]));

  const monthLabel = new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const datesMap = await DB.getAttendanceDatesForMonth(groupId, year, month);

  function prevMonth() { return month === 0 ? [year - 1, 11] : [year, month - 1]; }
  function nextMonth() { return month === 11 ? [year + 1, 0] : [year, month + 1]; }

  const nav = h('div', { class: 'date-nav' }, [
    h('button', { class: 'icon-btn', onclick: () => { const [y, m] = prevMonth(); go(`#/group/${encodeURIComponent(groupId)}/calendario/${y}/${m}`); } }, ['‹']),
    h('div', { class: 'date-nav-label' }, [monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)]),
    h('button', { class: 'icon-btn', onclick: () => { const [y, m] = nextMonth(); go(`#/group/${encodeURIComponent(groupId)}/calendario/${y}/${m}`); } }, ['›']),
  ]);

  const weekHeader = h('div', { class: 'calendar-grid calendar-weekdays' },
    WEEKDAY_LABELS.map((w) => h('div', { class: 'calendar-weekday' }, [w])));

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayCells = [];
  for (let i = 0; i < startOffset; i++) dayCells.push(h('div', { class: 'calendar-day calendar-day-empty' }));
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const info = datesMap.get(dateStr);
    const isToday = dateStr === localDateStr();
    const cell = h('button', {
      class: `calendar-day${info ? ' calendar-day-has-data' : ''}${isToday ? ' calendar-day-today' : ''}`,
      onclick: () => go(`#/group/${encodeURIComponent(groupId)}/asistencia/${dateStr}`),
    }, [
      h('span', {}, [String(day)]),
      info ? h('span', { class: 'calendar-dot' }) : null,
    ]);
    dayCells.push(cell);
  }
  const grid = h('div', { class: 'calendar-grid' }, dayCells);

  appEl.replaceChildren(h('div', { class: 'screen' }, [
    nav,
    weekHeader,
    grid,
    h('p', { class: 'hint-text' }, ['Tocá un día para tomar o revisar la asistencia de esa fecha.']),
  ]));
}

// ---------------------------------------------------------------------------
// Pantalla: Agregar / editar alumno
// ---------------------------------------------------------------------------

async function renderStudentForm({ groupId, studentId }) {
  let student = null;
  let effectiveGroupId = groupId;
  if (studentId) {
    student = await DB.getStudent(studentId);
    if (!student) return renderNotFound();
    effectiveGroupId = student.groupId;
  }
  const groups = await DB.getGroups();
  const backHash = studentId
    ? `#/student/${encodeURIComponent(studentId)}`
    : `#/group/${encodeURIComponent(groupId)}`;

  setTopbar({ title: student ? 'Editar alumno' : 'Agregar alumno', onBack: () => go(backHash) });

  let pendingBlob = student ? student.photoBlob : null;
  const photoPreview = h('div', { class: 'photo-preview' });
  function refreshPreview() {
    photoPreview.replaceChildren();
    if (pendingBlob instanceof Blob) {
      photoPreview.appendChild(h('img', { src: trackedObjectURL(pendingBlob), alt: 'Foto del alumno' }));
    } else {
      photoPreview.appendChild(h('div', { class: 'photo-preview-empty' }, ['Sin foto']));
    }
  }
  refreshPreview();

  const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'photo-input', style: 'display:none' });
  const processingLabel = h('span', { class: 'hint-text' }, []);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    processingLabel.textContent = 'Procesando foto…';
    try {
      pendingBlob = await compressPhoto(file);
      refreshPreview();
      processingLabel.textContent = '';
    } catch (err) {
      processingLabel.textContent = '';
      showFatalError(err);
    }
  });
  const photoBtn = h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => fileInput.click() }, [
    student && student.photoBlob ? '📷 Cambiar foto' : '📷 Tomar / elegir foto',
  ]);

  const firstNameInput = h('input', { type: 'text', placeholder: 'Nombre', maxlength: 80, value: student ? student.firstName : '', required: true });
  const lastNameInput = h('input', { type: 'text', placeholder: 'Apellido', maxlength: 80, value: student ? student.lastName : '', required: true });

  const groupSelect = h('select', {}, groups.map((g) => h('option', { value: g.id, selected: g.id === effectiveGroupId }, [g.name])));

  const saveBtn = h('button', { type: 'submit', class: 'btn' }, [student ? 'Guardar cambios' : 'Agregar alumno']);

  const form = h('form', { class: 'form-stack' }, [
    photoPreview,
    h('div', { class: 'action-row' }, [photoBtn, fileInput]),
    processingLabel,
    h('label', { class: 'field-label' }, ['Nombre', firstNameInput]),
    h('label', { class: 'field-label' }, ['Apellido', lastNameInput]),
    h('label', { class: 'field-label' }, ['Grupo', groupSelect]),
    saveBtn,
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    if (!firstName || !lastName) {
      toast('Completá nombre y apellido.', 'error');
      return;
    }
    saveBtn.disabled = true;
    try {
      if (student) {
        await DB.updateStudent({ ...student, firstName, lastName, groupId: groupSelect.value, photoBlob: pendingBlob });
        toast('Cambios guardados.', 'success');
        go(`#/student/${encodeURIComponent(student.id)}`);
      } else {
        const created = await DB.addStudent({ firstName, lastName, groupId: groupSelect.value, photoBlob: pendingBlob });
        toast('Alumno agregado.', 'success');
        go(`#/group/${encodeURIComponent(created.groupId)}`);
      }
    } catch (err) {
      showFatalError(err);
      saveBtn.disabled = false;
    }
  });

  appEl.replaceChildren(h('div', { class: 'screen' }, [form]));
}

// ---------------------------------------------------------------------------
// Pantalla: Importar lista de alumnos
// ---------------------------------------------------------------------------

const MAX_IMPORT_LINES = 1000;

function parseRosterLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.includes(',')) {
    const idx = trimmed.indexOf(',');
    const lastName = trimmed.slice(0, idx).trim();
    const firstName = trimmed.slice(idx + 1).trim();
    if (!lastName && !firstName) return null;
    return { firstName: firstName || '(sin nombre)', lastName: lastName || '(sin apellido)' };
  }
  const words = trimmed.split(/\s+/);
  if (words.length === 1) return { firstName: words[0], lastName: '(sin apellido)' };
  const lastName = words[words.length - 1];
  const firstName = words.slice(0, -1).join(' ');
  return { firstName, lastName };
}

async function renderImport(groupId) {
  const group = await DB.getGroup(groupId);
  if (!group) return renderNotFound();

  setTopbar({ title: `Importar a ${group.name}`, onBack: () => go(`#/group/${encodeURIComponent(groupId)}`) });

  const instructions = h('p', { class: 'hint-text' }, [
    'Pegá la lista de alumnos, uno por línea. Formato recomendado: "Apellido, Nombre". ' +
    'Se pueden agregar las fotos después, alumno por alumno. Máximo 1000 líneas por vez.',
  ]);
  const textarea = h('textarea', { rows: 10, placeholder: 'Pérez, Juan\nGómez, María\n...' });
  const previewEl = h('p', { class: 'hint-text' }, []);
  textarea.addEventListener('input', () => {
    const lines = textarea.value.split('\n').slice(0, MAX_IMPORT_LINES);
    const valid = lines.map(parseRosterLine).filter(Boolean);
    previewEl.textContent = `${valid.length} alumno(s) detectado(s).`;
  });

  const submitBtn = h('button', { class: 'btn' }, ['Importar']);
  const form = h('form', { class: 'form-stack' }, [instructions, textarea, previewEl, submitBtn]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lines = textarea.value.split('\n').slice(0, MAX_IMPORT_LINES);
    const entries = lines.map(parseRosterLine).filter(Boolean);
    if (entries.length === 0) {
      toast('No se detectó ningún alumno en el texto pegado.', 'error');
      return;
    }
    submitBtn.disabled = true;
    try {
      await DB.bulkAddStudents(groupId, entries);
      toast(`${entries.length} alumno(s) importado(s).`, 'success');
      go(`#/group/${encodeURIComponent(groupId)}`);
    } catch (err) {
      showFatalError(err);
      submitBtn.disabled = false;
    }
  });

  appEl.replaceChildren(h('div', { class: 'screen' }, [form]));
}

// ---------------------------------------------------------------------------
// Pantalla: Perfil de alumno (foto, notas, historial)
// ---------------------------------------------------------------------------

async function renderStudentProfile(studentId) {
  const student = await DB.getStudent(studentId);
  if (!student) return renderNotFound();
  const group = await DB.getGroup(student.groupId);

  setTopbar({
    title: fullName(student),
    onBack: () => go(`#/group/${encodeURIComponent(student.groupId)}`),
    actionIcon: '✎',
    actionLabel: 'Editar alumno',
    onAction: () => go(`#/student/${encodeURIComponent(studentId)}/editar`),
  });
  appEl.replaceChildren(h('div', { class: 'screen' }, [h('p', { class: 'loading' }, ['Cargando…'])]));

  const [history, notes] = await Promise.all([
    DB.getAttendanceHistoryForStudent(studentId, 15),
    DB.getNotesForStudent(studentId),
  ]);

  const header = h('div', { class: 'profile-header' }, [
    avatar(student, 96),
    h('div', {}, [
      h('div', { class: 'profile-name' }, [fullName(student)]),
      h('div', { class: 'profile-group' }, [group ? group.name : 'Sin grupo']),
    ]),
  ]);

  const historyList = history.length
    ? h('ul', { class: 'history-list' }, history.map((r) =>
        h('li', {}, [
          h('span', {}, [formatDateHuman(r.date)]),
          h('span', { class: r.status === 'present' ? 'summary-present' : 'summary-absent' }, [r.status === 'present' ? 'Presente' : 'Ausente']),
        ])))
    : h('p', { class: 'empty-state' }, ['Todavía no hay asistencia registrada.']);

  const notesList = h('div', { class: 'notes-list' });
  function renderNotes(list) {
    notesList.replaceChildren();
    if (list.length === 0) {
      notesList.appendChild(h('p', { class: 'empty-state' }, ['Sin notas todavía.']));
      return;
    }
    for (const n of list) {
      const delBtn = h('button', { class: 'icon-btn', 'aria-label': 'Borrar nota' }, ['🗑']);
      delBtn.addEventListener('click', async () => {
        if (!window.confirm('¿Borrar esta nota?')) return;
        try {
          await DB.deleteNote(n.id);
          renderNotes(list.filter((x) => x.id !== n.id));
          toast('Nota borrada.', 'success');
        } catch (err) { showFatalError(err); }
      });
      notesList.appendChild(h('div', { class: 'note-card' }, [
        h('div', { class: 'note-card-header' }, [
          h('span', { class: 'note-date' }, [formatDateHuman(n.date)]),
          delBtn,
        ]),
        h('div', { class: 'note-text' }, [n.text]),
      ]));
    }
  }
  renderNotes(notes);

  const noteInput = h('textarea', { rows: 2, placeholder: 'Escribí una nota o calificación…', maxlength: 500 });
  const addNoteBtn = h('button', { class: 'btn btn-secondary' }, ['Guardar nota']);
  addNoteBtn.addEventListener('click', async () => {
    const text = noteInput.value.trim();
    if (!text) { toast('Escribí algo antes de guardar.', 'error'); return; }
    addNoteBtn.disabled = true;
    try {
      const note = await DB.addNote(studentId, localDateStr(), text);
      noteInput.value = '';
      const fresh = await DB.getNotesForStudent(studentId);
      renderNotes(fresh);
      toast('Nota guardada.', 'success');
    } catch (err) {
      showFatalError(err);
    } finally {
      addNoteBtn.disabled = false;
    }
  });

  const deleteStudentBtn = h('button', { class: 'btn btn-danger-outline' }, ['Eliminar alumno']);
  deleteStudentBtn.addEventListener('click', async () => {
    if (!window.confirm(`¿Eliminar a ${fullName(student)}? Se borrará también su asistencia y notas. Esta acción no se puede deshacer.`)) return;
    try {
      await DB.deleteStudent(studentId);
      toast('Alumno eliminado.', 'success');
      go(`#/group/${encodeURIComponent(student.groupId)}`);
    } catch (err) { showFatalError(err); }
  });

  appEl.replaceChildren(h('div', { class: 'screen' }, [
    header,
    h('h2', { class: 'section-label' }, ['Historial de asistencia']),
    historyList,
    h('button', { class: 'btn-link', onclick: () => go(`#/group/${encodeURIComponent(student.groupId)}/calendario`) }, ['Ver calendario completo →']),
    h('h2', { class: 'section-label' }, ['Notas']),
    notesList,
    h('div', { class: 'form-stack' }, [noteInput, addNoteBtn]),
    h('div', { class: 'danger-zone' }, [deleteStudentBtn]),
  ]));
}

// ---------------------------------------------------------------------------
// Pantalla: Ajustes (copia de seguridad, espacio, instalación)
// ---------------------------------------------------------------------------

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

async function renderSettings() {
  setTopbar({ title: 'Ajustes', onBack: () => go('#/') });
  appEl.replaceChildren(h('div', { class: 'screen' }, [h('p', { class: 'loading' }, ['Cargando…'])]));

  const estimate = await DB.getStorageEstimate();
  const storageBlock = h('section', { class: 'settings-section' }, [
    h('h2', { class: 'section-label' }, ['Espacio usado']),
    estimate
      ? h('div', {}, [
          h('div', { class: 'storage-bar' }, [
            h('div', { class: 'storage-bar-fill', style: `width:${Math.min(100, (estimate.usage / Math.max(1, estimate.quota)) * 100)}%` }),
          ]),
          h('p', { class: 'hint-text' }, [
            `${(estimate.usage / (1024 * 1024)).toFixed(1)} MB usados de ${(estimate.quota / (1024 * 1024)).toFixed(0)} MB disponibles en este teléfono.`,
          ]),
        ])
      : h('p', { class: 'hint-text' }, ['Este navegador no informa el espacio usado.']),
  ]);

  const backupProgress = h('p', { class: 'hint-text' }, []);
  const exportBtn = h('button', { class: 'btn' }, ['⬇ Descargar copia de seguridad']);
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    backupProgress.textContent = 'Preparando copia de seguridad…';
    try {
      const data = await DB.exportAllData((done, total) => {
        backupProgress.textContent = `Preparando copia de seguridad… (${done}/${total} fotos)`;
      });
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = localDateStr();
      a.href = url;
      a.download = `asistencia-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      backupProgress.textContent = 'Copia de seguridad descargada. Guardala en Drive, email, etc.';
      toast('Copia de seguridad lista.', 'success');
    } catch (err) {
      backupProgress.textContent = '';
      showFatalError(err);
    } finally {
      exportBtn.disabled = false;
    }
  });

  const importInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  const importBtn = h('button', { class: 'btn btn-secondary' }, ['⬆ Restaurar copia de seguridad']);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    if (!window.confirm('Esto va a REEMPLAZAR todos los datos actuales (grupos, alumnos, asistencia y notas) por los del archivo elegido. ¿Continuar?')) {
      importInput.value = '';
      return;
    }
    backupProgress.textContent = 'Restaurando…';
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('El archivo elegido no es un JSON válido. No se modificó ningún dato.');
      }
      await DB.importAllData(data, (done, total) => {
        backupProgress.textContent = `Restaurando… (${done}/${total} fotos)`;
      });
      backupProgress.textContent = '';
      toast('Datos restaurados correctamente.', 'success');
      go('#/');
    } catch (err) {
      backupProgress.textContent = '';
      showFatalError(err);
    } finally {
      importInput.value = '';
    }
  });

  const backupBlock = h('section', { class: 'settings-section' }, [
    h('h2', { class: 'section-label' }, ['Copia de seguridad']),
    h('p', { class: 'hint-text' }, [
      'Todos los datos (fotos incluidas) se guardan solo en este teléfono. Si el teléfono se pierde o se rompe, ' +
      'se pierden con él. Hacé una copia de seguridad regularmente y guardala en otro lugar (email, Drive, etc.).',
    ]),
    h('div', { class: 'action-row' }, [exportBtn, importBtn, importInput]),
    backupProgress,
  ]);

  const installBlock = h('section', { class: 'settings-section' }, [
    h('h2', { class: 'section-label' }, ['Instalar en el teléfono']),
    h('p', { class: 'hint-text' }, [
      'Instalada, la app abre como cualquier otra y funciona sin señal. En Android: botón "Instalar" abajo, ' +
      'o menú del navegador → "Agregar a pantalla de inicio". En iPhone (Safari): botón Compartir → "Agregar a pantalla de inicio".',
    ]),
    deferredInstallPrompt
      ? h('button', {
          class: 'btn btn-secondary',
          onclick: async () => {
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
          },
        }, ['Instalar app'])
      : null,
  ]);

  const resetBtn = h('button', { class: 'btn btn-danger-outline' }, ['Borrar todos los datos']);
  resetBtn.addEventListener('click', async () => {
    if (!window.confirm('Esto borra TODOS los grupos, alumnos, asistencia y notas de este teléfono. ¿Estás seguro?')) return;
    if (!window.confirm('Última confirmación: esta acción no se puede deshacer. ¿Borrar todo?')) return;
    try {
      await DB.wipeAllData();
      toast('Datos borrados.', 'success');
      go('#/');
    } catch (err) { showFatalError(err); }
  });
  const dangerBlock = h('section', { class: 'settings-section danger-zone' }, [
    h('h2', { class: 'section-label' }, ['Zona de riesgo']),
    resetBtn,
  ]);

  const aboutBlock = h('section', { class: 'settings-section' }, [
    h('h2', { class: 'section-label' }, ['Acerca de']),
    h('p', { class: 'hint-text' }, ['App de asistencia — todos los datos quedan en este dispositivo, no se envían a ningún servidor.']),
  ]);

  appEl.replaceChildren(h('div', { class: 'screen' }, [storageBlock, backupBlock, installBlock, dangerBlock, aboutBlock]));
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function boot() {
  try {
    await DB.ensureSeedGroups();
  } catch (err) {
    showFatalError(new Error('No se pudo iniciar la base de datos local. Probá recargar la página.'));
    console.error(err);
  }
  DB.requestPersistentStorage().catch(() => {});
  window.addEventListener('hashchange', render);
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => console.error('SW registration failed', err));
    });
  }
}

boot();
