/*
 * imageUtils.js — compresión de fotos antes de guardarlas.
 *
 * Una foto de cámara pesa 3-8MB. Guardar eso tal cual x 450 alumnos serían
 * varios GB y además tardaría en dibujarse cada vez que se abre una lista.
 * Por eso toda foto se redibuja en un <canvas> más chico y se vuelve a
 * codificar como JPEG antes de guardarse. El resultado típico: 20-60KB.
 *
 * Todo es asíncrono a propósito: en un teléfono viejo, procesar una foto
 * puede tardar uno o dos segundos, y no queremos congelar la pantalla
 * mientras tanto (por eso el llamador debe mostrar un indicador de carga).
 */

const MAX_DIMENSION = 480; // px, lado más largo
const JPEG_QUALITY = 0.75;

/**
 * Recibe un File (de <input type="file">) y devuelve un Blob JPEG
 * redimensionado. Lanza un error entendible si el archivo no es una imagen
 * válida o si el navegador no pudo procesarla.
 */
export async function compressPhoto(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('El archivo elegido no es una foto válida.');
  }

  const bitmap = await loadAsBitmap(file);
  try {
    const { width, height } = fitDimensions(bitmap.width, bitmap.height, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la foto en este navegador.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) {
      throw new Error('No se pudo comprimir la foto. Probá con otra imagen.');
    }
    return blob;
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

function fitDimensions(w, h, maxDim) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  if (w >= h) {
    return { width: maxDim, height: Math.round((h / w) * maxDim) };
  }
  return { width: Math.round((w / h) * maxDim), height: maxDim };
}

async function loadAsBitmap(file) {
  // createImageBitmap es más rápido y no bloquea, pero no existe en todos
  // los navegadores viejos: si falla, hay un camino alternativo con Image().
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // sigue al fallback
    }
  }
  return loadAsImageElement(file);
}

function loadAsImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen elegida.'));
    };
    img.src = url;
  });
}

/** Genera iniciales (ej. "JP") para mostrar como avatar cuando no hay foto. */
export function initialsFor(firstName, lastName) {
  const a = (firstName || '').trim().charAt(0);
  const b = (lastName || '').trim().charAt(0);
  return (a + b).toUpperCase() || '?';
}
