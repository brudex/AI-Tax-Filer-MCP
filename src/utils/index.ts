import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique identifier
 */
export function generateUniqueId(): string {
  return uuidv4();
}

/**
 * Format a date to ISO string without milliseconds
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z';
}

/**
 * Format currency number to GHS string
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS'
  }).format(amount);
}

/**
 * Validate tax year
 */
export function isValidTaxYear(year: number): boolean {
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear + 1;
}

/**
 * Clean and format TIN (Tax Identification Number)
 */
export function formatTIN(tin: string): string {
  // Remove all non-alphanumeric characters
  return tin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Calculate tax based on GRA tax brackets (2023)
 */
export function calculateTax(taxableAmount: number): number {
  const brackets = [
    { threshold: 4380, rate: 0 },
    { threshold: 5940, rate: 0.05 },
    { threshold: 8280, rate: 0.10 },
    { threshold: 11880, rate: 0.175 },
    { threshold: 35880, rate: 0.25 },
    { threshold: Infinity, rate: 0.30 }
  ];

  let remainingAmount = taxableAmount;
  let totalTax = 0;
  let previousThreshold = 0;

  for (const bracket of brackets) {
    const taxableInBracket = Math.min(
      Math.max(remainingAmount, 0),
      bracket.threshold - previousThreshold
    );
    totalTax += taxableInBracket * bracket.rate;
    remainingAmount -= taxableInBracket;
    previousThreshold = bracket.threshold;

    if (remainingAmount <= 0) break;
  }

  return totalTax;
}

/**
 * Validate business registration number
 */
export function isValidBusinessRegNumber(regNumber: string): boolean {
  // GRA business registration numbers are typically:
  // - C-XXXXXXXX (Companies)
  // - P-XXXXXXXX (Partnerships)
  // - S-XXXXXXXX (Sole Proprietorships)
  const pattern = /^[CPS]-\d{8}$/;
  return pattern.test(regNumber);
}

/**
 * Get tax period description
 */
export function getTaxPeriod(year: number): string {
  return `January 1, ${year} - December 31, ${year}`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Calculate total deductions
 */
export function calculateTotalDeductions(deductions: Record<string, number>): number {
  return Object.values(deductions).reduce((sum, value) => sum + value, 0);
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return pattern.test(email);
}

/**
 * Validate phone number (Ghana)
 */
export function isValidGhanaPhone(phone: string): boolean {
  // Ghana phone numbers: +233XXXXXXXXX or 0XXXXXXXXX
  const pattern = /^(?:\+233|0)\d{9}$/;
  return pattern.test(phone);
} 