// Code 39 (chiffres) : meme encodage que le site (stockfrontweb/src/lib/barcode.js). 'n' = etroit, 'w' = large.
const PATTERNS: Record<string, string> = {
  0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn',
  '*': 'nwnnwnwnn',
};

export function code39(value: string, narrow = 1, wide = 2.5): { bars: { x: number; w: number }[]; width: number; digits: string } {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  const text = `*${digits}*`;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of text) {
    const pattern = PATTERNS[ch];
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === 'w' ? wide : narrow;
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    }
    x += narrow;
  }
  return { bars, width: x - narrow, digits };
}
