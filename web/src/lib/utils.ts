import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// `text-meta` (13px) is a font-size token from index.css; without this it would be read as a color and lose to `text-xs`.
const twMerge = extendTailwindMerge({ extend: { classGroups: { 'font-size': [{ text: ['meta'] }] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
