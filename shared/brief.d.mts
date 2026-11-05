export type Brief = {
  reference: string;
  createdAt: string;
  productName: string;
  tagline?: string;
  estimate: { low: number; high: number; weeks: [number, number]; monthly: number; lines: { label: string; amount: number }[] };
  summary: [string, string][];
  contact?: { name?: string; email?: string; phone?: string; company?: string; notes?: string };
  usdRate?: number;
  owner?: { name?: string; email?: string };
};
export function pdfText(value: unknown): string;
export function pdfMoney(naira: number): string;
export function briefPdf(brief: Brief): Uint8Array;
