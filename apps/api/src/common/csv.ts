/**
 * Minimal RFC 4180 CSV writer. Values are stringified, quotes doubled, and any
 * value that contains a separator, quote or newline is wrapped in quotes.
 */
export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: Array<CsvColumn<T>>, rows: T[]): string {
  const lines = [columns.map((column) => cell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(column.value(row))).join(','));
  }
  // A BOM keeps Excel on Windows from mangling Thai text.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function csvFileName(prefix: string, from?: string, to?: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const start = from ? from.slice(0, 10) : 'all';
  const end = to ? to.slice(0, 10) : stamp;
  return `${prefix}-${start}-to-${end}.csv`;
}
