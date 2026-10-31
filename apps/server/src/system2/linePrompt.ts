/**
 * Prompts for the doctor's spoken lines: opening, retry and closing.
 * These run on their own agent, so nothing here is shared with the follow-up prompt except the persona and the facts.
 *
 * Pronouns: in the instructions "你" is the doctor and "他" is the rep. In the spoken line it is the other way round,
 * the doctor says "我" and calls the rep "你". Every hint about how to say something is therefore written as the doctor's
 * own words ("我回头再看"), so the model cannot copy a wrong pronoun into the line.
 */
import type { DialogueTurn, DoctorLineRequest, ScenarioPack } from '../contracts';
import type { DoctorRecord } from './doctors';
import { turnsAboutConcern } from './concernText';
import { factsBlock, personaParts } from './prompt';

type Concern = ScenarioPack['scenario']['concerns'][number];

export const MAX_LINE_CHARS = 45;
const MAX_TURNS = 12;
const MAX_TURN_CHARS = 200;

/** Delivery of this one line. A real doctor is not equally sharp every time, and the choice differs per call. */
const TONES: Record<DoctorLineRequest['kind'], string[]> = {
  opening: ['平和，像随口一问', '干脆，直奔主题', '带点质疑，想听实据', '放缓一点，像在斟酌'],
  retry: ['干脆，直奔没答到的地方', '带点质疑，想听实据', '耐着性子，换个更具体的问法'],
  closing: ['平和，像随口说', '干脆，句子短', '放缓一点，像在斟酌'],
};

/** Rough target length in characters. A short spoken line sounds like a senior doctor; the hard limit is in the agent. */
const LENGTH_HINT: Record<DoctorLineRequest['kind'], number> = { opening: 30, retry: 28, closing: 24 };

/**
 * How this one line is built. Each move is an intent, not a sentence: the model copies any sentence it is shown,
 * and ten visitors would then hear the same words.
 */
const MOVES = {
  opening: [
    '先交代一下我门诊里哪类患者多（只说高龄、肾功能不好），再把问题抛出来。',
    '不铺垫，一句话问到“哪些患者能用、研究覆盖到没有”。',
    '先让他知道我这边时间紧，再问。',
    '先交代你对这类患者用药很谨慎的原因，再问。',
    '表明你对这个药是认真做过功课的，再问。',
    '用反问的口气，问这个研究有没有把我门诊里的这类患者纳进去。',
    '先表个态：这个药好不好，我要看证据。再问。',
  ],
  retry: [
    '先用半句话接住他实际说过的一个具体内容（只接，不评价），再把没答到的问题问出来。',
    '换个角度重问：从我门诊里一位具体的患者说起（高龄、肾功能不好，不写年龄数字）。',
    '点明还有哪一点我没听到，再问。点明的话用你自己的话说，不要说成固定句式。',
    '换一种更具体的问法重问：只问人数，或只问能不能用。',
    '先说我明白他讲的是另一个方面，再把话拉回我关心的那一点。',
  ],
  restart: [
    '换个角度重新抛出这个关切：从我门诊里一位具体的患者说起（高龄、肾功能不好，不写年龄数字）。',
    '一句话重新问，换掉上一次的问法和切入点。',
    '只问其中一类患者，比上一次问得更具体。',
    '先说这一块我还想再核实一下，再问。',
  ],
  closing: [
    '收尾：道个谢，把资料的去向交代一句。',
    '收尾：交代一句外面还有人候诊，就此结束。',
    '收尾：交代你回头会自己对一遍数据，需要时再联系他。',
    '收尾：请他把资料的页码或出处发过来。',
    '收尾：简短道谢，交代你接下来要做的一件事。',
  ],
} as const;

/** How the doctor picks up the rep's last answer when moving on. Always acknowledging, in one form, is itself a script. */
const ACK_FORMS = [
  '用半句话直接承接他说的那个点，把那个点当话头，不要写成“你刚才……，那……”。',
  '先用一个很短的应声（比如“嗯”“好”）再问，不复述他的内容。',
  '不接话，直接问这个关切。',
] as const;

/**
 * The closing line is prefetched when the last concern starts, so its dialogue stops before that concern is answered.
 * It always acknowledges something the rep really said, picked at random from the rep's sentences, so it never locks onto
 * the latest point (the only one the model sees at the end of the history).
 */
function closingAck(history: DialogueTurn[], rand: () => number): string {
  const sentences = history
    .filter((t) => t.who === 'rep')
    .flatMap((t) => t.text.split(/[。！？!?；;]/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
  if (sentences.length === 0 || rand() < 0.4) return '这次不认他说过的内容，只收尾。';
  return `用半句话说他讲到了什么（只说讲到了什么，不评价讲得好不好，不复述数据），说完马上收尾。可以说的是这一句：“${clip(pickOne(sentences, rand), 60)}”`;
}

export function pickOne<T>(items: readonly T[], rand: () => number = Math.random): T {
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function transcript(history: DialogueTurn[]): string {
  if (history.length === 0) return '（没有）';
  return history
    .slice(-MAX_TURNS)
    .map((t) => `${t.who === 'doctor' ? '医生' : '代表'}：${clip(t.text, MAX_TURN_CHARS)}`)
    .join('\n');
}

const pointList = (points: Concern['points']) => points.map((p) => `- ${p.label}：${p.anchorQuestion}`).join('\n');

/** The rep has not spoken yet at the opening, so an opening that answers or quotes them cannot be true. */
export const NO_SPEECH_YET = /你说|刚才|你提到|你讲|你们刚|你刚/;
/** The visitor is new every time. These phrases would point at a visit that never happened. */
export const EARLIER_VISIT = /上次|上回|上一次|又来|再次来|之前来|以前来|前几天/;
/** A closing must sound like an ending: thanks, materials left, a later look, the next patient. Acknowledging one point is not one. */
export const CLOSURE = /资料|谢谢|多谢|感谢|辛苦|先到这|就到这|到这儿|到这里|今天就|下一位|后面还有|页码|回头|再联系|再找你|留下|留着|先这样|就这样|不耽误|不打扰|在等|该看诊/;
/** Judging the rep's answers. The closing is written before the last answer is in, so it must not say how the answers went. */
export const EVALUATIVE = /说清楚|说明白|讲清楚|讲明白|讲得|都说到|都讲到|都说过|都讲过|都答|都回答|全说|全讲|很清楚|挺清楚/;
/** Dismissing the rep. A senior doctor can be curt, but the demo should not end by throwing the visitor out. */
export const DISMISSIVE = /你先回去|你回去吧|走吧|你可以走|不送/;

const KIND_RULE: Record<DoctorLineRequest['kind'], string> = {
  opening: '眼前的代表是第一次见你，还没开口。不要说“上次”“上回”“又来”，也不要说“你说”“刚才”。印象只决定你追什么、追多紧，不要提到印象、档案、示范。',
  retry: '这位代表刚试过一轮，可以回应他实际说过的话。要回应就把他说的那个点直接当话头，不要写成“你刚才……，那……”这种句式；也可以不回应，直接问。不要说“听见了”“没听清”“没听懂”，他说的你都听得清楚，用不着说。不要说“上次”“上回”，不要提到印象、档案、示范，印象里的事不是发生过的事。不要说“绕开”“避开”“绕过”“漏了”“躲”，这是指责，诊室里不这么说话。',
  closing: '眼前的代表是第一次见你。不要说“上次”“上回”“又来”。只认下他在这场对话里实际说过的话，不要提到印象、档案、示范。',
};

/** A random subset of the examples that fit the kind. Showing the same two examples every time makes the lines converge on them. */
export function pickExamples(examples: string[], kind: DoctorLineRequest['kind'], rand: () => number = Math.random, count = 3): string[] {
  const fit = kind === 'opening' ? examples.filter((e) => !NO_SPEECH_YET.test(e)) : examples;
  const pool = [...(fit.length > 0 ? fit : examples)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function buildLineSystemPrompt(a: { pack: ScenarioPack; record?: DoctorRecord; kind: DoctorLineRequest['kind']; examples: string[]; recent: string[] }): string {
  const parts = personaParts(a.pack, a.record);
  parts.push(
    `你在门诊接待医药代表，他介绍的是${a.pack.scenario.productName}。下面按任务说一句话。`,
    '',
    '要求：',
    `1. 一句口语化中文，最多 ${MAX_LINE_CHARS} 个汉字，像你本人在诊室里随口说的。不寒暄，不客套，不总结，不解释。档案对句长、语气另有要求的，按档案。`,
    '2. 这句话要能直接念出来：范围写“30 到 60”，比较写“低于”“以上”，不用符号、括号和引号，不用书面语。',
    '3. 只能依据“资料”里的事实。指标、人群和数字用资料里的原词。资料里没有的数字和结论一律不说，代表说错的数字也不要跟着说。说到你门诊里的患者，只用档案写明的情况（高龄、肾功能不好），不要自己加具体指标。',
    `4. ${KIND_RULE[a.kind]}`,
    '5. 每次换一种说法，用你自己的话，不要照搬任务里的措辞。“近来说过的话”里的句子不要重复，也不要只改几个字，里面用过的短语也尽量不再用。“示范”只示范口吻和分寸，不要照抄，也不要沿用它们的开头。不要用“到底”“究竟”这两个词。',
    '6. 说话时自称“我”，对代表称“你”，不说“他”“代表”“医生”。对代表客气但话少，不赶人，不说“你先回去吧”“走吧”。',
    '7. “先停一下”“等一下”是打断正在说话的代表时才用的，开场、重问、收尾都不用。句末要有标点，问句用问号。',
    '8. 只问任务里指定的那个关切。对话里最近聊的可能是别的关切，不要被它带过去。',
    '9. 完成后只调用一次 say 说出这一句话，不要输出别的文字。',
    '',
    factsBlock(a.pack),
  );
  if (a.examples.length > 0) parts.push(`<示范>\n${a.examples.map((e) => `- ${e}`).join('\n')}\n</示范>`);
  if (a.recent.length > 0) parts.push(`<近来说过的话>\n${a.recent.map((e) => `- ${e}`).join('\n')}\n</近来说过的话>`);
  return parts.join('\n');
}

export function buildLineUserPrompt(a: { req: DoctorLineRequest; concern: Concern; rand?: () => number; redo?: { line: string; why: string } }): string {
  const { req, concern } = a;
  const rand = a.rand ?? Math.random;
  const tone = pickOne(TONES[req.kind], rand);
  const out: string[] = [];
  const others = req.pack.scenario.concerns.filter((c) => c.id !== concern.id).map((c) => `“${c.title}”`);
  /** The target comes first and is the only thing the line may be about, whatever the dialogue ended on. */
  const only = `【这次只问这个关切】“${concern.title}”。${others.length ? `不要问${others.join('、')}。对话里最近聊的可能是别的关切，不要被带过去。` : ''}`;

  if (req.kind === 'opening') {
    out.push(
      `【任务】代表刚进门坐下，还没开口，你先开口。把关切“${concern.title}”抛给他，让他知道你要听什么。`,
      only,
      '【你关心的要点】',
      pointList(concern.points),
      `【这次的说法】${pickOne(MOVES.opening, rand)}`,
      `这是一次门诊的第一句话：让他听出你关心的是这个药能用在哪类患者身上。用你自己的话说，不要把“${concern.title}”这几个字原样说出来；点到一类患者（用档案里写的门诊患者情况）就够了。不要问具体的数值、区间或人数，那些等他开口以后再追。他还没说过任何话，不要说“你说”“刚才”“你提到”。`,
    );
  } else if (req.kind === 'retry') {
    const missed = concern.points.filter((p) => req.missedPointIds?.includes(p.id));
    const before = turnsAboutConcern(req.pack, concern.id, req.history);
    const beforeText = before.length > 0 ? transcript(before) : '（上一轮没有谈到这个关切）';
    if (missed.length > 0) {
      out.push(
        `【任务】代表要把关切“${concern.title}”重新来一遍。你换个说法再问一次，重点压在他上一轮没答到的要点。`,
        only,
        '【他上一轮没答到的要点】',
        pointList(missed),
        `【这次的切入点】先压“${pickOne(missed, rand).label}”。`,
        `【这次的说法】${pickOne(MOVES.retry, rand)}`,
        '【上一轮在这个关切上的对话】',
        beforeText,
        '要对着他在这个关切上实际说过的话回应，不要重复你上一轮说过的话，也不要替他答。',
      );
    } else if (req.missedPointIds !== undefined) {
      // The rep answered every point last time and starts this concern again.
      out.push(
        `【任务】代表要把关切“${concern.title}”重新来一遍，他上一轮这个关切的要点都答到了。你换个说法把它重新抛出来，不压某一个点，也不夸他。`,
        only,
        '【你关心的要点】',
        pointList(concern.points),
        `【这次的切入点】从“${pickOne(concern.points, rand).label}”说起。`,
        `【这次的说法】${pickOne(MOVES.restart, rand)}`,
        '【上一轮在这个关切上的对话】',
        beforeText,
        '换掉你上一轮的问法和切入点，不要重复，也不要替他答。',
      );
    } else {
      // The visit moves on to this concern: acknowledge what the rep just finished, then raise this one.
      out.push(
        `【任务】上一个关切聊完了，轮到关切“${concern.title}”。你把它问出来。`,
        only,
        `【怎么接】${pickOne(ACK_FORMS, rand)}不评价，不夸。`,
        '【你关心的要点】',
        pointList(concern.points),
        '【到现在的对话】',
        transcript(req.history),
        '接住的话只提他已经说过的内容；问的必须是这个关切。不要重复你说过的话。',
      );
    }
  } else {
    const last = req.pack.scenario.concerns[req.pack.scenario.concerns.length - 1];
    out.push(
      '【任务】这次门诊要结束了，你说最后一句话收尾。',
      `【到现在的对话】（最后一个关切“${last.title}”可能还没聊完）`,
      transcript(req.history),
      `【最后一个关切】“${last.title}”：它的结果你现在还不知道。不要对它下结论，不要提它的内容，除非代表自己说过。`,
      `【这次的收尾】${pickOne(MOVES.closing, rand)}`,
      `【认下什么】${closingAck(req.history, rand)}`,
      '整句话要让人听出门诊结束了：要有结束这次门诊的话（照【这次的收尾】来，只用这一种，用你自己的话，不要再叠加别的收尾话）。认下的话最多半句，不要只复述最近一个要点。不要再提新问题，不要用问句，不要罗列总结，不要评价他讲得好不好，不要夸张表扬，不要编他没说过的话，不要以“行”开头，不要赶人。',
    );
  }
  out.push(`【长度】尽量 ${LENGTH_HINT[req.kind]} 个字上下，宁短勿长。`, `【语气】${tone}`);
  if (a.redo) out.push(`【上一稿被否掉】“${a.redo.line}”：${a.redo.why}。这次换完全不同的说法。`);
  return out.join('\n');
}
