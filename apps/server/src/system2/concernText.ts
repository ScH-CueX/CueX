/**
 * Which part of a dialogue, and which spoken line, belongs to which concern.
 * The dialogue is sequential: the doctor raises a concern, the rep answers, the doctor raises the next one.
 * A turn is matched to a concern by the character pairs only that concern uses, so no word list is needed per pack.
 */
import type { DialogueTurn, ScenarioPack } from '../contracts';

type Concern = ScenarioPack['scenario']['concerns'][number];

export function bigramSet(text: string): Set<string> {
  const s = text.replace(/[\s，。、；：？！,.;:?!“”"'（）()…]/g, '');
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

const concernGrams = (c: Concern): Set<string> => bigramSet([c.title, ...c.points.flatMap((p) => [p.label, p.anchorQuestion])].join(''));

const ownCache = new WeakMap<ScenarioPack, Map<string, Set<string>>>();
/** Per concern id: the character pairs that appear in that concern's text and in no other concern's text. */
export function ownGrams(pack: ScenarioPack): Map<string, Set<string>> {
  let own = ownCache.get(pack);
  if (!own) {
    const all = pack.scenario.concerns.map((c) => [c.id, concernGrams(c)] as const);
    own = new Map(all.map(([id, grams]) => [id, new Set([...grams].filter((g) => !all.some(([other, og]) => other !== id && og.has(g))))]));
    ownCache.set(pack, own);
  }
  return own;
}

/**
 * The turns of `history` that belong to one concern. A doctor turn that clearly raises a concern (two or more of that
 * concern's own character pairs) starts that concern's segment, and the rep's turns stay in the segment they answer.
 * Before the first match the dialogue belongs to the first concern, because the opening line raises it.
 */
export function turnsAboutConcern(pack: ScenarioPack, concernId: string, history: DialogueTurn[]): DialogueTurn[] {
  const concerns = pack.scenario.concerns;
  const own = ownGrams(pack);
  let current = concerns[0]?.id;
  return history.filter((turn) => {
    if (turn.who === 'doctor') {
      const grams = bigramSet(turn.text);
      let best = 1;
      for (const c of concerns) {
        const hits = [...grams].filter((g) => own.get(c.id)?.has(g)).length;
        if (hits > best) {
          best = hits;
          current = c.id;
        }
      }
    }
    return current === concernId;
  });
}

/**
 * Character pairs of a line that belong only to other concerns, when the line says almost nothing about the target concern
 * (at most two of its own pairs). A non-empty result means the line follows the dialogue instead of the task.
 */
export function offTargetTerms(line: string, pack: ScenarioPack, concernId: string): string[] {
  const own = ownGrams(pack);
  const mine = own.get(concernId);
  if (!mine) return [];
  const grams = bigramSet(line);
  if ([...grams].filter((g) => mine.has(g)).length > 2) return [];
  const foreign = new Set<string>();
  for (const [id, set] of own) if (id !== concernId) for (const g of set) foreign.add(g);
  const hits = [...grams].filter((g) => foreign.has(g));
  return hits.length >= 3 ? hits : [];
}
