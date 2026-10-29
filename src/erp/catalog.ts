// Simulated ERP data. Prices and seats are fictitious.
export interface CourseOffer { product: string; unit: string; name: string; price: number; seatsLeft: number; nextClass: string }

export const CATALOG: CourseOffer[] = [
  { product: 'hof', unit: 'sp', name: 'Harmonização Facial', price: 7900, seatsLeft: 3, nextClass: '2026-11-14' },
  { product: 'hof', unit: 'rj', name: 'Harmonização Facial', price: 7900, seatsLeft: 6, nextClass: '2026-11-21' },
  { product: 'hof', unit: 'cps', name: 'Harmonização Facial', price: 7600, seatsLeft: 2, nextClass: '2026-11-28' },
  { product: 'intercorrencias', unit: 'online', name: 'Intercorrências (online)', price: 997, seatsLeft: 999, nextClass: '2026-11-01' },
];

export const isCatalogProduct = (product: string): boolean => CATALOG.some((c) => c.product === product);

export const findOffer = (product: string, unit: string): CourseOffer | null =>
  CATALOG.find((c) => c.product === product && c.unit === unit) ?? null;
