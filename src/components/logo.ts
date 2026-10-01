/** Tamaño máximo del logo guardado (se reduce para no llenar el almacenamiento del navegador). */
const MAX_WIDTH = 480;
const MAX_HEIGHT = 160;
const MAX_SVG_BYTES = 200 * 1024;
export const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
    img.src = src;
  });
}

/**
 * Convierte el archivo del logo en un data URL listo para guardar: los SVG se guardan tal cual
 * y las imágenes PNG/JPG/WebP se reducen a un máximo de 480×160 px (conservando la transparencia).
 */
export async function prepareLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen (PNG, JPG, SVG o WebP).");
  if (file.size > MAX_LOGO_FILE_BYTES) throw new Error("La imagen supera los 5 MB. Usa una versión más liviana.");
  const dataUrl = await readAsDataUrl(file);
  if (file.type === "image/svg+xml") {
    if (file.size > MAX_SVG_BYTES) throw new Error("El SVG supera los 200 KB. Usa una versión más liviana o un PNG.");
    await loadImage(dataUrl);
    return dataUrl;
  }
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth, MAX_HEIGHT / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
