import { describe, expect, it } from 'vitest';
import { isNewer } from './version';

describe('isNewer', () => {
  it('compares x.y.z versions numerically', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.6.0', '1.0.0')).toBe(false);
    expect(isNewer('1.0.1', '1.0')).toBe(true);
  });
});
