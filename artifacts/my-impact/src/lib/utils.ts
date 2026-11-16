import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Short money label for chart axes: "£450k" below a million, "£1.4m" from a
 * million up, so axis ticks stay readable for large organisations.
 */
export function formatAxisCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  return `£${(value / 1000).toFixed(0)}k`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB').format(value)
}
