import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class name joiner. */
export function cnx(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
