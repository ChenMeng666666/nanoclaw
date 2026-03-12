import { describe, expect, it } from 'vitest';

import { sanitizeWebContent, validateUserInput } from './security.js';

describe('sanitizeWebContent', () => {
  it('removes script blocks and javascript protocol', () => {
    const input =
      '<div>safe</div><script>alert(1)</script><a href="javascript:alert(2)">x</a>';
    const output = sanitizeWebContent(input);

    expect(output).not.toContain('<script>');
    expect(output).not.toContain('javascript:');
    expect(output).toContain('<a href="alert(2)">x</a>');
  });

  it('removes inline event handlers', () => {
    const input =
      '<img src="x" onerror="alert(1)" /><button onclick=test()>go</button>';
    const output = sanitizeWebContent(input);

    expect(output).not.toContain('onerror=');
    expect(output).not.toContain('onclick=');
  });
});

describe('validateUserInput', () => {
  it('accepts normal text with hyphen', () => {
    const result = validateUserInput('今天讨论 SQL-优化和索引');
    expect(result.valid).toBe(true);
  });

  it('accepts normal text containing double dashes', () => {
    const result = validateUserInput('请查看 --help 参数说明');
    expect(result.valid).toBe(true);
  });

  it('rejects classic SQL injection pattern', () => {
    const result = validateUserInput("name' OR 1=1 --");
    expect(result.valid).toBe(false);
  });

  it('rejects xss inline event with single quote payload', () => {
    const result = validateUserInput("<img src=x onerror='alert(1)'>");
    expect(result.valid).toBe(false);
  });
});
