/**
 * Numbers in Chinese text, as digits or as spoken numerals ("七十五", "两万").
 * Used to check that a spoken line does not invent a figure.
 */
const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

/**
 * Value of a numeral run such as 七十五 (75) or 两万 (20000).
 * A run counts only when it starts with digit+unit or 十+digit. That keeps "一下", "十分", "万一" out.
 */
function parseNumeral(run: string): number | null {
  if (!/^(?:[一二两三四五六七八九][十百千万]|十[一二三四五六七八九])/.test(run)) return null;
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of run) {
    if (ch in CN_DIGIT) digit = CN_DIGIT[ch];
    else if (ch === '万') {
      section = (section + digit) * 10000;
      total += section;
      section = 0;
      digit = 0;
    } else {
      const unit = CN_UNIT[ch];
      section += (digit || (unit === 10 ? 1 : 0)) * unit;
      digit = 0;
    }
  }
  return total + section + digit;
}

/** Every number in the text as a canonical string: "75", "6.2", "20000". */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(/\d+(?:\.\d+)?/g) ?? []) out.push(String(Number(m)));
  for (const run of text.match(/[零〇一二两三四五六七八九十百千万]+/g) ?? []) {
    const v = parseNumeral(run);
    if (v !== null) out.push(String(v));
  }
  return out;
}
