/**
 * Prompt text for the doctor persona and the small fact search used by the lookup_facts tool.
 */
import type { FollowupRequest, PackFact, ScenarioPack } from '../contracts';
import { memoryBullets, type DoctorRecord } from './doctors';

const STYLE_TEXT: Record<string, string> = {
  rigorous: '作风严谨，爱抠数据和适用范围',
  impatient: '时间紧，说话直接',
  exploratory: '愿意听新思路，但要看证据',
};

export type RetrievalMode = 'inline' | 'tool';

const MAX_PROFILE_CHARS = 2000;

/** Persona part shared by every System 2 prompt: who the doctor is, and the impression left by recent reps. */
export function personaParts(pack: ScenarioPack, doctorRecord?: DoctorRecord): string[] {
  const { doctor } = pack.scenario;
  const profile = doctorRecord?.profile.trim().slice(0, MAX_PROFILE_CHARS) ?? '';
  const memory = doctorRecord ? memoryBullets(doctorRecord.memory) : [];
  const parts = [
    profile
      ? `你是${doctor.name}，${doctor.department}${doctor.title}。人物档案如下。`
      : `你是${doctor.name}，${doctor.department}${doctor.title}。${STYLE_TEXT[doctor.style] ?? ''}。${doctor.note}`,
  ];
  if (profile) parts.push(`<人物档案>\n${profile}\n</人物档案>`);
  // Demo policy: every visitor is a new rep, so the impressions steer what the doctor presses on and are never quoted.
  if (memory.length > 0) parts.push(`<你对近来来访代表的印象>\n${memory.map((m) => `- ${m.replace(/^\d{4}-\d{2}-\d{2}\s*/, '')}`).join('\n')}\n</你对近来来访代表的印象>`);
  if (pack.scenario.expertRules?.length) parts.push(`<沟通训练参考，仅作为交流策略，不能改变医疗事实>\n${JSON.stringify(pack.scenario.expertRules)}\n</沟通训练参考，仅作为交流策略，不能改变医疗事实>`);
  return parts;
}

export function factsBlock(pack: ScenarioPack): string {
  return `<资料>\n${pack.facts.map((f) => `- ${formatFact(f)}`).join('\n')}\n</资料>`;
}

export function buildSystemPrompt(pack: ScenarioPack, mode: RetrievalMode, doctorRecord?: DoctorRecord): string {
  const { productName } = pack.scenario;
  const steps =
    mode === 'tool'
      ? '先调用 lookup_facts 查资料（可查多次），再调用一次 submit_followup 提交。不要输出别的文字。'
      : '完成后只调用一次 submit_followup 提交，不要输出别的文字。';
  const parts = personaParts(pack, doctorRecord);
  parts.push(
    `你正在门诊听医药代表介绍${productName}。代表还没答到你的关切时，你要先备好一句追问，等合适时机再说。`,
    '',
    '要求：',
    '1. 只说一句口语化中文，不超过 40 个汉字。档案对句长、语气另有要求的，按档案。直接追问，不寒暄，不解释。',
    '2. 这句话要能直接念出来：范围写“30 到 60”，比较写“低于”“以上”，不用符号、括号和引号，不用书面语。',
    '3. 只能依据“资料”里的事实，指标、人群和数字用资料里的原词，不换说法。资料里没有的数字和结论一律不要说，也不要替代表回答。',
    '4. 追问要对准“尚未回答的要点”，不要重复代表已经说过的内容。',
    '5. 印象只决定追问的角度和语气，例如没答清的要点可以追得更紧。印象不是事实来源，不要复述日期，也不要说“上次”“上回”这类话：眼前的代表是第一次见你。',
    `6. ${steps}`,
  );
  return parts.join('\n');
}

export function buildUserPrompt(req: FollowupRequest, mode: RetrievalMode): string {
  const concern = req.pack.scenario.concerns.find((c) => c.id === req.concernId);
  const points = (concern?.points ?? []).filter((p) => req.unresolvedPointIds.includes(p.id));
  const lines: string[] = [];
  lines.push(`【关切】${concern?.title ?? req.concernId}`);
  lines.push('【尚未回答的要点】');
  for (const p of points) lines.push(`- ${p.id} ${p.label}：${p.anchorQuestion}`);
  if (mode === 'inline') {
    lines.push('【资料】');
    for (const f of req.pack.facts) lines.push(`- ${f.id}：${f.text}（${f.source}）`);
  }
  if (req.history.length > 0) {
    lines.push('【已说出的对话】');
    for (const t of req.history.slice(-6)) lines.push(`${t.who === 'doctor' ? '医生' : '代表'}：${t.text}`);
  }
  lines.push(`【代表自提出关切后说的话】${req.repSpeechSinceConcern || '（还没说）'}`);
  lines.push(`【现在要备追问的原因】${req.reason}`);
  return lines.join('\n');
}

/** Character bigrams. Works for Chinese text without a word segmenter. */
function bigrams(text: string): Set<string> {
  const s = text.replace(/[\s，。、；：？！,.;:?!（）()]/g, '');
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Top-k facts by shared bigrams with the query. A pack has tens of facts, so a scan is enough. */
export function searchFacts(facts: PackFact[], query: string, k = 3): PackFact[] {
  const q = bigrams(query);
  const scored = facts.map((f) => {
    const fb = bigrams(`${f.id} ${f.text} ${f.source}`);
    let hit = 0;
    for (const g of q) if (fb.has(g)) hit++;
    return { f, hit };
  });
  const best = scored.filter((s) => s.hit > 0).sort((a, b) => b.hit - a.hit);
  return (best.length > 0 ? best : scored).slice(0, k).map((s) => s.f);
}

export function formatFact(f: PackFact): string {
  return `${f.id}：${f.text}（${f.source}）`;
}
