/**
 * Minimal ESC/POS builder for 80 mm thermal printers.
 *
 * Text is encoded to TIS-620 (the Thai code page most receipt printers expose as
 * code page 18). Characters outside Latin-1 and Thai become "?" rather than
 * producing broken bytes. Width calculations ignore Thai combining marks so the
 * columns line up even though the printer combines them.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const THAI_MIN = 0x0e01;
const THAI_MAX = 0x0e5b;
const COMBINING = new Set([
  0x0e31, 0x0e34, 0x0e35, 0x0e36, 0x0e37, 0x0e38, 0x0e39, 0x0e3a, 0x0e47, 0x0e48, 0x0e49, 0x0e4a,
  0x0e4b, 0x0e4c, 0x0e4d, 0x0e4e,
]);

export class EscPos {
  constructor(width = 42) {
    this.width = width;
    this.chunks = [Buffer.from([ESC, 0x40])]; // initialise
    this.encoding([ESC, 0x74, 18]); // Thai code page
    this.align('left');
  }

  encoding(bytes) {
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  align(value) {
    const code = value === 'center' ? 1 : value === 'right' ? 2 : 0;
    this.encoding([ESC, 0x61, code]);
    return this;
  }

  bold(on = true) {
    this.encoding([ESC, 0x45, on ? 1 : 0]);
    return this;
  }

  double(on = true) {
    this.encoding([GS, 0x21, on ? 0x11 : 0x00]);
    return this;
  }

  text(value) {
    this.chunks.push(encodeTis620(String(value)));
    return this;
  }

  line(value = '') {
    this.text(value);
    this.chunks.push(Buffer.from([LF]));
    return this;
  }

  rule(char = '-') {
    return this.line(char.repeat(this.width));
  }

  /** Two columns with the right side flush to the paper width. */
  columns(left, right) {
    const leftWidth = this.width - displayWidth(String(right));
    const text = String(left);
    const padded =
      displayWidth(text) > leftWidth - 1 ? truncate(text, leftWidth - 2) + ' ' : pad(text, leftWidth);
    return this.line(padded + String(right));
  }

  feed(lines = 3) {
    this.encoding([ESC, 0x64, Math.max(0, Math.min(255, lines))]);
    return this;
  }

  cut() {
    this.encoding([GS, 0x56, 66, 0x00]);
    return this;
  }

  build() {
    return Buffer.concat(this.chunks);
  }
}

export function encodeTis620(text) {
  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === 0x0a) {
      bytes.push(LF);
      continue;
    }
    if (code === 0x0d) continue;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    if (code >= THAI_MIN && code <= THAI_MAX) {
      bytes.push(0xa1 + (code - THAI_MIN));
      continue;
    }
    if (code === 0x0e3f) {
      // Thai baht sign
      bytes.push(0xdf);
      continue;
    }
    bytes.push(0x3f);
  }
  return Buffer.from(bytes);
}

export function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (!COMBINING.has(code)) width += 1;
  }
  return width;
}

export function pad(text, width) {
  const current = displayWidth(text);
  return current >= width ? text : text + ' '.repeat(width - current);
}

export function truncate(text, width) {
  let out = '';
  let current = 0;
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (!COMBINING.has(code)) {
      if (current >= width) break;
      current += 1;
    }
    out += char;
  }
  return out;
}

export function money(value) {
  const number = Number(value ?? 0);
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
