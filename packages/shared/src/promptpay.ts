/**
 * PromptPay QR (EMVCo Merchant Presented Mode) payload generation.
 *
 * The payload is generated locally and is a legitimate PromptPay payload: it is
 * what a Thai banking app reads to pre-fill a transfer. Generating a payload is
 * NOT a payment. TableTap always keeps the payment in AWAITING_CONFIRMATION
 * until a cashier (or a properly verified PSP webhook) confirms the money
 * arrived.
 *
 * References: EMVCo "QR Code Payment Markers" and the Thai PromptPay
 * specification (Tag 29 merchant account, AID A000000677010111, currency 764).
 */

export const PROMPTPAY_AID = 'A000000677010111';
export const THB_CURRENCY_CODE = '764';

export type PromptPayIdType = 'MOBILE' | 'NATIONAL_ID' | 'EWALLET';

export interface PromptPayTarget {
  /** Raw configured value: 10-digit mobile, 13-digit national ID, 15-digit e-wallet. */
  id: string;
  type?: PromptPayIdType;
}

export interface PromptPayPayloadInput {
  target: PromptPayTarget;
  /** Amount in THB as a decimal string with at most 2 decimals. */
  amount: string | null;
  /** Optional reference shown in some banking apps (EMVCo tag 62, subtag 05). */
  reference?: string;
}

export class PromptPayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptPayError';
  }
}

/** EMVCo TLV: 2-digit id, 2-digit length, value. */
export function tlv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) throw new PromptPayError(`Invalid TLV id: ${id}`);
  if (value.length > 99) throw new PromptPayError(`TLV value too long for id ${id}`);
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, xorout 0. */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function normalisePromptPayId(raw: string): { id: string; type: PromptPayIdType } {
  const digits = raw.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) {
    return { id: `0066${digits.slice(1)}`, type: 'MOBILE' };
  }
  if (/^\d{13}$/.test(digits)) {
    return { id: digits, type: 'NATIONAL_ID' };
  }
  if (/^\d{15}$/.test(digits)) {
    return { id: digits, type: 'EWALLET' };
  }
  throw new PromptPayError(
    'PromptPay ID must be a 10-digit mobile number, 13-digit national ID, or 15-digit e-wallet ID',
  );
}

function merchantAccountInfo(rawId: string): string {
  const { id, type } = normalisePromptPayId(rawId);
  const subtag = type === 'MOBILE' ? '01' : type === 'NATIONAL_ID' ? '02' : '03';
  return tlv('29', tlv('00', PROMPTPAY_AID) + tlv(subtag, id));
}

function normaliseAmount(amount: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new PromptPayError('Amount must be a positive decimal with at most 2 fractional digits');
  }
  const [whole, fraction = ''] = amount.split('.');
  const decimals = fraction.padEnd(2, '0');
  const value = `${whole}.${decimals}`;
  if (Number(value) <= 0) throw new PromptPayError('Amount must be greater than zero');
  return value;
}

/**
 * Build a PromptPay payload. Passing `amount: null` produces a reusable
 * "any amount" QR, which TableTap does not use for bills (a bill QR must carry
 * its exact amount) but which is useful for static counter signage.
 */
export function buildPromptPayPayload({ target, amount, reference }: PromptPayPayloadInput): string {
  const amountField = amount === null ? '' : tlv('54', normaliseAmount(amount));
  const referenceField =
    reference && reference.trim().length > 0 ? tlv('62', tlv('05', reference.trim().slice(0, 25))) : '';

  const body = [
    tlv('00', '01'), // payload format indicator
    tlv('01', amount === null ? '11' : '12'), // 11 reusable, 12 one-time
    merchantAccountInfo(target.id),
    tlv('53', THB_CURRENCY_CODE),
    amountField,
    tlv('58', 'TH'),
    referenceField,
  ].join('');

  const withCrcTag = `${body}6304`;
  return `${withCrcTag}${crc16ccitt(withCrcTag)}`;
}

export interface ParsedPromptPayPayload {
  payloadFormat: string;
  initiation: string;
  promptPayId: string;
  promptPayIdType: PromptPayIdType | 'UNKNOWN';
  currency: string;
  amount: string | null;
  country: string;
  crc: string;
}

function parseTlv(input: string): Map<string, string> {
  const out = new Map<string, string>();
  let index = 0;
  while (index < input.length) {
    const id = input.slice(index, index + 2);
    const lengthRaw = input.slice(index + 2, index + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthRaw)) {
      throw new PromptPayError(`Malformed TLV at offset ${index}`);
    }
    const length = Number(lengthRaw);
    const value = input.slice(index + 4, index + 4 + length);
    if (value.length !== length) throw new PromptPayError(`Truncated TLV ${id}`);
    out.set(id, value);
    index += 4 + length;
  }
  return out;
}

/** Parse and validate a PromptPay payload. Throws PromptPayError on any defect. */
export function parsePromptPayPayload(payload: string): ParsedPromptPayPayload {
  if (payload.length < 20) throw new PromptPayError('Payload too short');
  const crcIndex = payload.lastIndexOf('6304');
  if (crcIndex < 0) throw new PromptPayError('Missing CRC tag 63');
  const expected = payload.slice(crcIndex + 4);
  if (!/^[0-9A-F]{4}$/.test(expected)) throw new PromptPayError('Malformed CRC');
  const actual = crc16ccitt(payload.slice(0, crcIndex + 4));
  if (actual !== expected) throw new PromptPayError(`CRC mismatch: expected ${actual}, found ${expected}`);

  const root = parseTlv(payload.slice(0, crcIndex));
  const format = root.get('00');
  if (format !== '01') throw new PromptPayError('Unsupported payload format indicator');
  const currency = root.get('53');
  if (currency !== THB_CURRENCY_CODE) throw new PromptPayError('Currency is not THB (764)');
  const country = root.get('58');
  if (country !== 'TH') throw new PromptPayError('Country is not TH (Thailand)');

  const merchant = root.get('29');
  if (!merchant) throw new PromptPayError('Missing PromptPay merchant account (tag 29)');
  const merchantTlv = parseTlv(merchant);
  if (merchantTlv.get('00') !== PROMPTPAY_AID) throw new PromptPayError('Unknown merchant AID');

  const mobile = merchantTlv.get('01');
  const nationalId = merchantTlv.get('02');
  const ewallet = merchantTlv.get('03');
  const promptPayId = mobile ?? nationalId ?? ewallet ?? '';
  if (!promptPayId) throw new PromptPayError('Merchant account has no PromptPay identifier');

  return {
    payloadFormat: format,
    initiation: root.get('01') ?? '',
    promptPayId,
    promptPayIdType: mobile ? 'MOBILE' : nationalId ? 'NATIONAL_ID' : ewallet ? 'EWALLET' : 'UNKNOWN',
    currency,
    amount: root.get('54') ?? null,
    country,
    crc: expected,
  };
}

export function isValidPromptPayPayload(payload: string): boolean {
  try {
    parsePromptPayPayload(payload);
    return true;
  } catch {
    return false;
  }
}

/** Display a PromptPay ID in the form customers recognise. */
export function formatPromptPayId(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 13)
    return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
  return digits;
}
