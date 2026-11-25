import { describe, expect, it } from 'vitest';
import { buildPromptPayPayload, crc16ccitt, parsePromptPayPayload, PromptPayError } from '@tabletap/shared';

describe('crc16ccitt', () => {
  it('matches the CRC-16/CCITT-FALSE check value for "123456789"', () => {
    // Standard check value: 0x29B1.
    expect(crc16ccitt('123456789')).toBe('29B1');
  });
});

describe('PromptPay payload', () => {
  it('builds a mobile-number payload that parses back identically', () => {
    const payload = buildPromptPayPayload({
      target: { id: '0812345678' },
      amount: '100',
      reference: 'BILL-SATHORN-1',
    });
    const parsed = parsePromptPayPayload(payload);
    expect(parsed.payloadFormat).toBe('01');
    expect(parsed.promptPayIdType).toBe('MOBILE');
    expect(parsed.promptPayId).toBe('0066812345678');
    expect(parsed.currency).toBe('764');
    expect(parsed.country).toBe('TH');
    expect(parsed.amount).toBe('100.00');
    expect(parsed.crc).toHaveLength(4);
  });

  it('supports a 13-digit national ID', () => {
    const payload = buildPromptPayPayload({ target: { id: '1234567890123' }, amount: '55.50' });
    expect(parsePromptPayPayload(payload).promptPayIdType).toBe('NATIONAL_ID');
  });

  it('supports a 15-digit e-wallet id', () => {
    const payload = buildPromptPayPayload({ target: { id: '123456789012345' }, amount: '1.00' });
    expect(parsePromptPayPayload(payload).promptPayIdType).toBe('EWALLET');
  });

  it('rejects an unknown id length', () => {
    expect(() => buildPromptPayPayload({ target: { id: '123' }, amount: '10.00' })).toThrow(PromptPayError);
  });

  it('rejects a non-positive amount', () => {
    expect(() => buildPromptPayPayload({ target: { id: '0812345678' }, amount: '0' })).toThrow(
      PromptPayError,
    );
  });

  it('detects a tampered amount because the CRC no longer matches', () => {
    const payload = buildPromptPayPayload({ target: { id: '0812345678' }, amount: '100.00' });
    const tampered = payload.replace('5406100.00', '5406100.01');
    expect(() => parsePromptPayPayload(tampered)).toThrow(/CRC mismatch/);
  });

  it('detects a tampered recipient', () => {
    const payload = buildPromptPayPayload({ target: { id: '0812345678' }, amount: '100.00' });
    const tampered = payload.replace('0066812345678', '0066812345679');
    expect(() => parsePromptPayPayload(tampered)).toThrow(PromptPayError);
  });

  it('rejects a non-THB payload', () => {
    const payload = buildPromptPayPayload({ target: { id: '0812345678' }, amount: '100.00' });
    const tampered = payload.replace('5303764', '5303840');
    expect(() => parsePromptPayPayload(tampered)).toThrow(/CRC mismatch|Currency/);
  });

  it('formats the amount to exactly two decimals', () => {
    const payload = buildPromptPayPayload({ target: { id: '0812345678' }, amount: '9.5' });
    expect(parsePromptPayPayload(payload).amount).toBe('9.50');
  });
});
