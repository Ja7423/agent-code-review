import { describe, expect, it } from 'vitest';
import { isAllowedHost, isAllowedOrigin, secretsMatch } from './requestGuard.ts';

describe('isAllowedHost', () => {
  it('accepts loopback hosts on our port', () => {
    expect(isAllowedHost('127.0.0.1:4100', 4100)).toBe(true);
    expect(isAllowedHost('localhost:4100', 4100)).toBe(true);
    expect(isAllowedHost('LOCALHOST:4100', 4100)).toBe(true);
  });

  it('rejects other ports, missing hosts and rebinding domains', () => {
    expect(isAllowedHost('127.0.0.1:4101', 4100)).toBe(false);
    expect(isAllowedHost(undefined, 4100)).toBe(false);
    expect(isAllowedHost('evil.example:4100', 4100)).toBe(false);
    expect(isAllowedHost('127.0.0.1.evil.example:4100', 4100)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it('accepts our own origin only', () => {
    expect(isAllowedOrigin('http://127.0.0.1:4100', 4100)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4100', 4100)).toBe(true);
    expect(isAllowedOrigin('https://127.0.0.1:4100', 4100)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173', 4100)).toBe(false);
    expect(isAllowedOrigin('http://evil.example', 4100)).toBe(false);
    expect(isAllowedOrigin('null', 4100)).toBe(false);
    expect(isAllowedOrigin(undefined, 4100)).toBe(false);
  });
});

describe('secretsMatch', () => {
  it('compares secrets exactly', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true);
    expect(secretsMatch('abd', 'abc')).toBe(false);
    expect(secretsMatch('ab', 'abc')).toBe(false);
    expect(secretsMatch(undefined, 'abc')).toBe(false);
  });
});
