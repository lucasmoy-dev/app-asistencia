/*
 * db.js — capa de datos (IndexedDB)
 *
 * Por qué IndexedDB y no localStorage: localStorage tiene un límite real de
 * ~5MB por sitio y solo guarda texto. 450 fotos de alumnos, aunque se
 * comprimen antes de guardarse, no entran ahí (ver imageUtils.js). IndexedDB
 * guarda Blobs binarios de forma asíncrona (no traba la pantalla) y su
 * límite real es un porcentaje del espacio libre del teléfono (cientos de MB
 * como mínimo), que sí alcanza.
 *
 * Todo lo que toca la base de datos devuelve Promises. No hay dependencias
 * externas: es la API nativa del navegador envuelta a mano.
 */

const DB_NAME = 'asistencia-app-db';
const DB_VERSION = 1;

const STORE_GROUPS = 'groups';
const STORE_STUDENTS = 'students';
const STORE_ATTENDANCE = 'attendance';
const STORE_NOTES = 'notes';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_GROUPS)) {
        db.createObjectStore(STORE_GROUPS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_STUDENTS)) {
        const students = db.createObjectStore(STORE_STUDENTS, { keyPath: 'id' });
        students.createIndex('byGroup', 'groupId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_ATTENDANCE)) {
        // id = `${studentId}|${date}` -> garantiza que nunca choquen dos
        // alumnos de distintos grupos, ni dos registros del mismo alumno
        // el mismo día. El groupId se guarda igual como campo para poder
        // filtrar por grupo+mes sin tener que resolver cada studentId.
        const attendance = db.createObjectStore(STORE_ATTENDANCE, { keyPath: 'id' });
        attendance.createIndex('byDate', 'date', { unique: false });
        attendance.createIndex('byStudent', 'studentId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const notes = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        notes.createIndex('byStudent', 'studentId', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña abierta.'));
  });
  return dbPromise;
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Operación cancelada.'));
  });
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback para navegadores viejos sin crypto.randomUUID.
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Convierte errores de cuota de IndexedDB en un mensaje entendible. */
function friendlyStorageError(err) {
  const name = err && err.name;
  if (name === 'QuotaExceededError' || name === 'QuotaExceededErrorSAI') {
    return new Error(
      'El teléfono se quedó sin espacio de almacenamiento para guardar esto. ' +
      'Hacé una copia de seguridad desde Ajustes y liberá espacio en el teléfono.'
    );
  }
  return err;
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

const DEFAULT_GROUPS = [
  { id: 'grp-prim-1', name: '1° Primaria', level: 'primario', order: 0 },
  { id: 'grp-prim-2', name: '2° Primaria', level: 'primario', order: 1 },
  { id: 'grp-prim-3', name: '3° Primaria', level: 'primario', order: 2 },
  { id: 'grp-sec-1', name: '1° Secundaria', level: 'secundario', order: 3 },
  { id: 'grp-sec-2', name: '2° Secundaria', level: 'secundario', order: 4 },
];

/** Crea los 5 grupos por defecto solo si la base está vacía (primer uso). */
async function ensureSeedGroups() {
  const groups = await getGroups();
  if (groups.length > 0) return;
  const t = await tx([STORE_GROUPS], 'readwrite');
  const store = t.objectStore(STORE_GROUPS);
  for (const g of DEFAULT_GROUPS) store.put(g);
  await txDone(t);
}

async function getGroups() {
  const t = await tx([STORE_GROUPS], 'readonly');
  const all = await reqToPromise(t.objectStore(STORE_GROUPS).getAll());
  return all.sort((a, b) => a.order - b.order);
}

async function getGroup(id) {
  const t = await tx([STORE_GROUPS], 'readonly');
  return reqToPromise(t.objectStore(STORE_GROUPS).get(id));
}

async function saveGroup(group) {
  try {
    const t = await tx([STORE_GROUPS], 'readwrite');
    t.objectStore(STORE_GROUPS).put(group);
    await txDone(t);
  } catch (err) {
    throw friendlyStorageError(err);
  }
}

async function addGroup(name, level) {
  const groups = await getGroups();
  const maxOrder = groups.reduce((m, g) => Math.max(m, g.order), -1);
  const group = { id: uuid(), name, level, order: maxOrder + 1 };
  await saveGroup(group);
  return group;
}

/** Borra un grupo. Se niega si todavía tiene alumnos (evita perder datos por accidente). */
async function deleteGroup(id) {
  const students = await getStudentsByGroup(id);
  if (students.length > 0) {
    throw new Error('Este grupo todavía tiene alumnos. Moveelos a otro grupo o borralos antes de eliminar el grupo.');
  }
  const t = await tx([STORE_GROUPS], 'readwrite');
  t.objectStore(STORE_GROUPS).delete(id);
  await txDone(t);
}

// ---------------------------------------------------------------------------
// Alumnos
// ---------------------------------------------------------------------------

async function getStudentsByGroup(groupId) {
  const t = await tx([STORE_STUDENTS], 'readonly');
  const idx = t.objectStore(STORE_STUDENTS).index('byGroup');
  const all = await reqToPromise(idx.getAll(IDBKeyRange.only(groupId)));
  return all.sort((a, b) =>
    (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es')
  );
}

async function getAllStudents() {
  const t = await tx([STORE_STUDENTS], 'readonly');
  return reqToPromise(t.objectStore(STORE_STUDENTS).getAll());
}

async function getStudent(id) {
  const t = await tx([STORE_STUDENTS], 'readonly');
  return reqToPromise(t.objectStore(STORE_STUDENTS).get(id));
}

/**
 * student: { groupId, firstName, lastName, photoBlob (Blob|null) }
 * Devuelve el registro creado con su id nuevo.
 */
async function addStudent(student) {
  const record = {
    id: uuid(),
    groupId: student.groupId,
    firstName: student.firstName,
    lastName: student.lastName,
    photoBlob: student.photoBlob || null,
    createdAt: Date.now(),
  };
  try {
    const t = await tx([STORE_STUDENTS], 'readwrite');
    t.objectStore(STORE_STUDENTS).put(record);
    await txDone(t);
  } catch (err) {
    throw friendlyStorageError(err);
  }
  return record;
}

async function updateStudent(student) {
  try {
    const t = await tx([STORE_STUDENTS], 'readwrite');
    t.objectStore(STORE_STUDENTS).put(student);
    await txDone(t);
  } catch (err) {
    throw friendlyStorageError(err);
  }
}

async function deleteStudent(id) {
  const t = await tx([STORE_STUDENTS, STORE_ATTENDANCE, STORE_NOTES], 'readwrite');
  t.objectStore(STORE_STUDENTS).delete(id);

  const attIdx = t.objectStore(STORE_ATTENDANCE).index('byStudent');
  const attKeys = await reqToPromise(attIdx.getAllKeys(IDBKeyRange.only(id)));
  for (const k of attKeys) t.objectStore(STORE_ATTENDANCE).delete(k);

  const noteIdx = t.objectStore(STORE_NOTES).index('byStudent');
  const noteKeys = await reqToPromise(noteIdx.getAllKeys(IDBKeyRange.only(id)));
  for (const k of noteKeys) t.objectStore(STORE_NOTES).delete(k);

  await txDone(t);
}

/** Crea varios alumnos de una sola vez a partir de una lista de nombres (importación masiva). */
async function bulkAddStudents(groupId, entries) {
  const t = await tx([STORE_STUDENTS], 'readwrite');
  const store = t.objectStore(STORE_STUDENTS);
  const created = [];
  for (const entry of entries) {
    const record = {
      id: uuid(),
      groupId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      photoBlob: null,
      createdAt: Date.now(),
    };
    store.put(record);
    created.push(record);
  }
  await txDone(t);
  return created;
}

// ---------------------------------------------------------------------------
// Asistencia
// ---------------------------------------------------------------------------

function attendanceId(studentId, date) {
  return `${studentId}|${date}`;
}

/** status: 'present' | 'absent' | null (null = borra el registro, queda "sin marcar") */
async function setAttendance(studentId, groupId, date, status) {
  const t = await tx([STORE_ATTENDANCE], 'readwrite');
  const store = t.objectStore(STORE_ATTENDANCE);
  const id = attendanceId(studentId, date);
  if (status === null) {
    store.delete(id);
  } else {
    store.put({ id, studentId, groupId, date, status, updatedAt: Date.now() });
  }
  await txDone(t);
}

/** Devuelve un Map studentId -> 'present'|'absent' para un grupo y fecha dados. */
async function getAttendanceForGroupDate(groupId, date) {
  const t = await tx([STORE_ATTENDANCE], 'readonly');
  const idx = t.objectStore(STORE_ATTENDANCE).index('byDate');
  const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(date)));
  const map = new Map();
  for (const r of rows) {
    if (r.groupId === groupId) map.set(r.studentId, r.status);
  }
  return map;
}

/** Marca como presentes a todos los studentIds que todavía no tengan estado ese día. */
async function markAllPresent(groupId, date, studentIds) {
  const existing = await getAttendanceForGroupDate(groupId, date);
  const t = await tx([STORE_ATTENDANCE], 'readwrite');
  const store = t.objectStore(STORE_ATTENDANCE);
  for (const sid of studentIds) {
    if (existing.has(sid)) continue;
    store.put({
      id: attendanceId(sid, date),
      studentId: sid,
      groupId,
      date,
      status: 'present',
      updatedAt: Date.now(),
    });
  }
  await txDone(t);
}

/** Fechas (YYYY-MM-DD) del mes indicado que tienen algún registro para ese grupo. */
async function getAttendanceDatesForMonth(groupId, year, month) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = `${year}-${String(month + 1).padStart(2, '0')}-31`;
  const t = await tx([STORE_ATTENDANCE], 'readonly');
  const idx = t.objectStore(STORE_ATTENDANCE).index('byDate');
  const rows = await reqToPromise(idx.getAll(IDBKeyRange.bound(from, to)));
  const byDate = new Map(); // date -> {present, absent}
  for (const r of rows) {
    if (r.groupId !== groupId) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, { present: 0, absent: 0 });
    byDate.get(r.date)[r.status] += 1;
  }
  return byDate;
}

async function getAttendanceHistoryForStudent(studentId, limit = 30) {
  const t = await tx([STORE_ATTENDANCE], 'readonly');
  const idx = t.objectStore(STORE_ATTENDANCE).index('byStudent');
  const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(studentId)));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

async function getNotesForStudent(studentId) {
  const t = await tx([STORE_NOTES], 'readonly');
  const idx = t.objectStore(STORE_NOTES).index('byStudent');
  const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(studentId)));
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

async function addNote(studentId, date, text) {
  const note = { id: uuid(), studentId, date, text, createdAt: Date.now() };
  try {
    const t = await tx([STORE_NOTES], 'readwrite');
    t.objectStore(STORE_NOTES).put(note);
    await txDone(t);
  } catch (err) {
    throw friendlyStorageError(err);
  }
  return note;
}

async function deleteNote(id) {
  const t = await tx([STORE_NOTES], 'readwrite');
  t.objectStore(STORE_NOTES).delete(id);
  await txDone(t);
}

// ---------------------------------------------------------------------------
// Copia de seguridad (export / import) — única red de contención dado que
// no hay servidor: si el teléfono se rompe o se pierde, esto es lo único
// que puede recuperar 450 fotos y un año de asistencia.
// ---------------------------------------------------------------------------

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); // data:...;base64,....
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function base64ToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function exportAllData(onProgress) {
  const [groups, students, attendanceRows, notesRows] = await Promise.all([
    getGroups(),
    getAllStudents(),
    (async () => {
      const t = await tx([STORE_ATTENDANCE], 'readonly');
      return reqToPromise(t.objectStore(STORE_ATTENDANCE).getAll());
    })(),
    (async () => {
      const t = await tx([STORE_NOTES], 'readonly');
      return reqToPromise(t.objectStore(STORE_NOTES).getAll());
    })(),
  ]);

  const studentsOut = [];
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    studentsOut.push({
      id: s.id,
      groupId: s.groupId,
      firstName: s.firstName,
      lastName: s.lastName,
      photoBase64: s.photoBlob ? await blobToBase64(s.photoBlob) : null,
      createdAt: s.createdAt,
    });
    if (onProgress) onProgress(i + 1, students.length);
  }

  return {
    appId: 'asistencia-app',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    groups,
    students: studentsOut,
    attendance: attendanceRows,
    notes: notesRows,
  };
}

/** Valida la forma del backup ANTES de tocar nada. Si algo falla, no se borra
 *  ni un solo dato existente: preferimos rechazar un archivo dudoso a
 *  destruir la base actual por un import corrupto o mal intencionado. */
function validateBackupShape(data) {
  if (!data || typeof data !== 'object') throw new Error('El archivo no es una copia de seguridad válida.');
  if (data.appId !== 'asistencia-app') throw new Error('Este archivo no fue generado por esta aplicación.');
  if (!Array.isArray(data.groups) || !Array.isArray(data.students) ||
      !Array.isArray(data.attendance) || !Array.isArray(data.notes)) {
    throw new Error('El archivo de copia de seguridad está incompleto o dañado.');
  }
  for (const g of data.groups) {
    if (typeof g.id !== 'string' || typeof g.name !== 'string') {
      throw new Error('Hay un grupo con datos inválidos en el archivo.');
    }
  }
  for (const s of data.students) {
    if (typeof s.id !== 'string' || typeof s.groupId !== 'string') {
      throw new Error('Hay un alumno con datos inválidos en el archivo.');
    }
  }
}

/** Reemplaza TODOS los datos actuales por los del backup. Se usa una única
 *  transacción por tipo de store para que, si algo falla a mitad de camino,
 *  no quede la base en un estado mezclado. */
async function importAllData(data, onProgress) {
  validateBackupShape(data);

  const studentsWithBlobs = [];
  for (let i = 0; i < data.students.length; i++) {
    const s = data.students[i];
    studentsWithBlobs.push({
      id: s.id,
      groupId: s.groupId,
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      photoBlob: s.photoBase64 ? await base64ToBlob(s.photoBase64) : null,
      createdAt: s.createdAt || Date.now(),
    });
    if (onProgress) onProgress(i + 1, data.students.length);
  }

  const t = await tx([STORE_GROUPS, STORE_STUDENTS, STORE_ATTENDANCE, STORE_NOTES], 'readwrite');
  const gStore = t.objectStore(STORE_GROUPS);
  const sStore = t.objectStore(STORE_STUDENTS);
  const aStore = t.objectStore(STORE_ATTENDANCE);
  const nStore = t.objectStore(STORE_NOTES);

  gStore.clear();
  sStore.clear();
  aStore.clear();
  nStore.clear();

  for (const g of data.groups) gStore.put(g);
  for (const s of studentsWithBlobs) sStore.put(s);
  for (const a of data.attendance) aStore.put(a);
  for (const n of data.notes) nStore.put(n);

  await txDone(t);
}

async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    return navigator.storage.estimate(); // { usage, quota } en bytes
  }
  return null;
}

async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

async function wipeAllData() {
  const t = await tx([STORE_GROUPS, STORE_STUDENTS, STORE_ATTENDANCE, STORE_NOTES], 'readwrite');
  t.objectStore(STORE_GROUPS).clear();
  t.objectStore(STORE_STUDENTS).clear();
  t.objectStore(STORE_ATTENDANCE).clear();
  t.objectStore(STORE_NOTES).clear();
  await txDone(t);
  await ensureSeedGroups();
}

export const DB = {
  ensureSeedGroups,
  getGroups,
  getGroup,
  saveGroup,
  addGroup,
  deleteGroup,
  getStudentsByGroup,
  getAllStudents,
  getStudent,
  addStudent,
  updateStudent,
  deleteStudent,
  bulkAddStudents,
  setAttendance,
  getAttendanceForGroupDate,
  markAllPresent,
  getAttendanceDatesForMonth,
  getAttendanceHistoryForStudent,
  getNotesForStudent,
  addNote,
  deleteNote,
  exportAllData,
  importAllData,
  getStorageEstimate,
  requestPersistentStorage,
  wipeAllData,
  uuid,
};
