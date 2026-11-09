import { describe, expect, it } from '@jest/globals';

import { PulseColors as C } from '../pulse-theme';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const AA = 4.5;

describe('color tokens', () => {
  it.each([C.background, C.surface, C.surfaceRaised])('keeps text readable on %s', background => {
    for (const foreground of [C.text, C.textMuted, C.accent, C.danger]) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('keeps labels readable on accent buttons', () => {
    expect(contrast(C.onAccent, C.accent)).toBeGreaterThanOrEqual(AA);
  });
});
