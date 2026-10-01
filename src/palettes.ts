import type { PaletteId } from "./types";

/** Paletas disponibles para la interfaz (los tokens de cada una están en styles.css). */
export const PALETTES: Record<PaletteId, { name: string; swatches: string[] }> = {
  menta: { name: "Verde menta", swatches: ["#CFF5E3", "#F9FFFE", "#AEE6CD", "#E8F2FF", "#3D6D60"] },
  turquesa: { name: "Turquesa y azul", swatches: ["#52D9CB", "#EDF2F7", "#BFE2FF", "#B2D2ED", "#A3C0D9"] },
};
