/** Keep a spoken line short even when a model ignores the length rule. Cut at a sentence end if possible. */
export function clampSpoken(text: string, max = 48): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const cut = Math.max(head.lastIndexOf('？'), head.lastIndexOf('。'), head.lastIndexOf('，'), head.lastIndexOf('?'));
  return cut >= 12 ? head.slice(0, cut + 1) : head;
}

const bigramsOf = (text: string): string[] => {
  const s = text.replace(/[\s，。、；：？！,.;:?!“”"'（）()…]/g, '');
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
};

/** Dice coefficient on character bigrams, 0..1. Two lines with the same words in a slightly different order score high. */
export function bigramDice(a: string, b: string): number {
  const x = bigramsOf(a);
  const y = bigramsOf(b);
  if (x.length === 0 || y.length === 0) return 0;
  const count = new Map<string, number>();
  for (const g of x) count.set(g, (count.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of y) {
    const c = count.get(g) ?? 0;
    if (c > 0) {
      shared++;
      count.set(g, c - 1);
    }
  }
  return (2 * shared) / (x.length + y.length);
}

/** TTS pauses on punctuation. A model sometimes leaves the last clause bare, so close it: a question mark for a question, else a full stop. */
export function ensureEnding(line: string): string {
  const t = line.trim();
  if (!t || /[。？！?!…]$/.test(t)) return t;
  const stripped = t.replace(/[，、；：,;:]+$/, '');
  return /[吗呢么吧]$|怎么|多少|能不能|要不要|有没有|是不是|到底|什么|哪/.test(stripped) ? `${stripped}？` : `${stripped}。`;
}
