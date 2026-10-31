import dialogue from './dialogue.json';
import timing from './dialogue-timing.json';
import {FPS} from '../theme';

// All scene timing is derived from dialogue-timing.json.
// After replacing voice files, run `npm run audio:timing` and every cue, state change and scene length follows.

export type LineId = keyof typeof timing;
export type Speaker = 'doctor' | 'rep';
type Line = {id: LineId; speaker: Speaker; text: string};

export const LINES = Object.fromEntries(
  (dialogue.lines as unknown as Line[]).map((line) => [line.id, line]),
) as Record<LineId, Line>;

export const sec = (s: number) => Math.round(s * FPS);

const PAUSE = /[，。；：？！、]/;
const charWeight = (ch: string) => (PAUSE.test(ch) ? 2.2 : ch === '…' ? 1.6 : 1);

export type Cue = {
  id: LineId;
  speaker: Speaker;
  text: string;
  chars: string[];
  from: number; // scene-local frame where the audio starts
  dur: number; // full audio length in frames
  play: number; // frames actually played (shorter when the speaker is interrupted)
  end: number;
  cut: boolean;
  charAt: number[]; // cue-local frame where each character is spoken
};

export const makeCue = (id: LineId, fromSec: number, cutSec?: number): Cue => {
  const line = LINES[id];
  const dur = sec(timing[id]);
  const play = cutSec === undefined ? dur : Math.min(dur, sec(cutSec));
  const chars = Array.from(line.text);
  const weights = chars.map(charWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const charAt = weights.map((w) => {
    const at = Math.round((acc / total) * dur);
    acc += w;
    return at;
  });
  const from = sec(fromSec);
  return {id, speaker: line.speaker, text: line.text, chars, from, dur, play, end: from + play, cut: cutSec !== undefined, charAt};
};

// Scene-local frame at which `phrase` has been fully spoken.
export const phraseEnd = (cue: Cue, phrase: string): number => {
  const start = cue.text.indexOf(phrase);
  if (start < 0) throw new Error(`Phrase "${phrase}" not found in ${cue.id}`);
  const endIdx = start + Array.from(phrase).length;
  return cue.from + (endIdx < cue.chars.length ? cue.charAt[endIdx] : cue.dur);
};

export type Track<T> = ReadonlyArray<readonly [number, T]>;

export const at = <T,>(track: Track<T>, frame: number): T => {
  let value = track[0][1];
  for (const [f, v] of track) {
    if (frame >= f) value = v;
    else break;
  }
  return value;
};

export const since = <T,>(track: Track<T>, frame: number): number => {
  let start = track[0][0];
  for (const [f] of track) {
    if (frame >= f) start = f;
    else break;
  }
  return start;
};

export const firstAt = <T,>(track: Track<T>, value: T): number | undefined => track.find(([, v]) => v === value)?.[0];

export type ConcernState = 'none' | 'open' | 'responding' | 'resolved';
export type Verdict = 'idle' | 'unrelated' | 'responding' | 'resolved';
export type CandState = 'none' | 'retrieving' | 'drafting' | 'ready' | 'spoken' | 'withdrawn';
export type CtrlState = 'idle' | 'waiting' | 'speak' | 'hold' | 'cancel';

export type Plan = {
  concernLabel: string;
  concern: Track<ConcernState>;
  verdict: Track<Verdict>;
  candidate: {text: string; condition: string; source: string; track: Track<CandState>};
  controller: {track: Track<CtrlState>; ringStart: number; ringFire: number};
};

export type Mark = {cue: LineId; phrase: string; color: 'cue' | 'ok'; from: number};

// ---------- Highlight 01: the doctor asks again before the rep finishes ----------
export const H01 = (() => {
  const ask = makeCue('d_ask', 1.7);
  const pitch = makeCue('r_pitch', 6.7, 5.6);
  const follow = makeCue('d_followup', 6.7 + 5.35);
  const concernAt = phraseEnd(ask, '相关治疗');
  const judged = phraseEnd(pitch, '多中心设计');
  const ready = phraseEnd(pitch, '结果也显示出了');
  const fire = follow.from - sec(0.2);
  const plan: Plan = {
    concernLabel: '既往治疗情况',
    concern: [[0, 'none'], [concernAt, 'open']],
    verdict: [[0, 'idle'], [judged, 'unrelated'], [follow.from + sec(0.4), 'idle']],
    candidate: {
      text: LINES.d_followup.text,
      condition: '关切仍未回应',
      source: '研究入组条件',
      track: [[0, 'none'], [judged + sec(0.1), 'retrieving'], [judged + sec(0.6), 'drafting'], [ready, 'ready'], [follow.from, 'spoken']],
    },
    controller: {track: [[0, 'idle'], [ready, 'waiting'], [fire, 'speak'], [follow.from + sec(1.6), 'idle']], ringStart: ready, ringFire: fire},
  };
  const marks: Mark[] = [{cue: 'd_ask', phrase: '之前接受过相关治疗', color: 'cue', from: concernAt}];
  return {cues: [ask, pitch, follow], plan, marks, titleHold: sec(1.3), panelIn: sec(1.5), interrupt: follow.from, duration: follow.end + sec(1.1)};
})();

// ---------- Highlight 02: the prepared follow-up is withdrawn ----------
export const H02 = (() => {
  const context = makeCue('d_ask', -8); // already said in the same opening; shown, not played
  const P0 = 2.8;
  const pitch = makeCue('r_pitch_short', P0);
  const answer = makeCue('r_answer', P0 + timing.r_pitch_short + 0.3);
  const cont = makeCue('d_continue', answer.end / FPS + 0.35);
  const judged = phraseEnd(pitch, '多中心设计');
  const ready = pitch.end - sec(0.15);
  const responding = phraseEnd(answer, '我先回答');
  const resolved = phraseEnd(answer, '未接受相关治疗');
  const withdraw = resolved + sec(0.25);
  const plan: Plan = {
    concernLabel: '既往治疗情况',
    concern: [[0, 'open'], [responding, 'responding'], [resolved, 'resolved']],
    verdict: [[0, 'idle'], [judged, 'unrelated'], [responding, 'responding'], [resolved, 'resolved']],
    candidate: {
      text: LINES.d_followup.text,
      condition: '关切仍未回应',
      source: '研究入组条件',
      track: [[0, 'none'], [judged + sec(0.1), 'retrieving'], [judged + sec(0.5), 'drafting'], [ready, 'ready'], [withdraw, 'withdrawn']],
    },
    controller: {
      track: [[0, 'idle'], [ready, 'waiting'], [responding, 'hold'], [withdraw, 'cancel'], [withdraw + sec(1.4), 'idle']],
      ringStart: ready,
      ringFire: ready + sec(2.3),
    },
  };
  const marks: Mark[] = [
    {cue: 'd_ask', phrase: '之前接受过相关治疗', color: 'cue', from: -1},
    {cue: 'r_answer', phrase: '此前未接受相关治疗', color: 'ok', from: resolved},
  ];
  const hero = cont.end + sec(0.25);
  return {cues: [context, pitch, answer, cont], plan, marks, rewind: sec(1.4), titleHold: sec(0.9), withdraw, hero, duration: hero + sec(3.3)};
})();

// ---------- Highlight 04: review the moment, then try again ----------
export const H04 = (() => {
  const rephrase = makeCue('d_rephrase', 6.9);
  const retry = makeCue('r_retry', rephrase.end / FPS + 0.25);
  const ok = makeCue('d_ok', retry.end / FPS + 0.25);
  const concernAt = phraseEnd(rephrase, '治疗过以后');
  const responding = phraseEnd(retry, '纳入的是');
  const resolved = phraseEnd(retry, '未接受相关治疗');
  const plan: Plan = {
    concernLabel: '既往治疗情况',
    concern: [[0, 'none'], [concernAt, 'open'], [responding, 'responding'], [resolved, 'resolved']],
    verdict: [[0, 'idle'], [responding, 'responding'], [resolved, 'resolved'], [ok.end, 'idle']],
    candidate: {text: '', condition: '', source: '', track: [[0, 'none']]},
    controller: {track: [[0, 'idle']], ringStart: 0, ringFire: 1},
  };
  const marks: Mark[] = [
    {cue: 'd_rephrase', phrase: '还没有接受过相关治疗', color: 'cue', from: concernAt},
    {cue: 'r_retry', phrase: '此前未接受相关治疗', color: 'ok', from: resolved},
  ];
  const review = {titleHold: sec(1.2), uiIn: sec(1.2), scrubFrom: sec(1.5), scrubTo: sec(2.5), cardIn: sec(2.6), press: sec(5.9), collapse: sec(6.2), stageIn: sec(6.6)};
  return {cues: [rephrase, retry, ok], plan, marks, review, resolved, duration: ok.end + sec(0.8)};
})();

export const PROLOGUE_DURATION = sec(7.5);
export const ARCH_DURATION = sec(12);
export const TOTAL = sec(90);

const fixed = [PROLOGUE_DURATION, H01.duration, H02.duration, ARCH_DURATION, H04.duration];
const OUTRO_DURATION = TOTAL - fixed.reduce((a, b) => a + b, 0);
if (OUTRO_DURATION < sec(9)) throw new Error(`Outro too short: ${OUTRO_DURATION} frames`);

export type SceneId = 'prologue' | 'h01' | 'h02' | 'arch' | 'h04' | 'outro';
const order: [SceneId, number][] = [
  ['prologue', PROLOGUE_DURATION],
  ['h01', H01.duration],
  ['h02', H02.duration],
  ['arch', ARCH_DURATION],
  ['h04', H04.duration],
  ['outro', OUTRO_DURATION],
];
let cursor = 0;
export const SCENES = order.map(([id, dur]) => {
  const scene = {id, from: cursor, dur};
  cursor += dur;
  return scene;
});

// Global frames where a voice is playing, used to duck the music bed.
const voiced: Partial<Record<SceneId, Cue[]>> = {h01: H01.cues, h02: H02.cues, h04: H04.cues};
export const VOICE_INTERVALS = SCENES.flatMap((scene) =>
  (voiced[scene.id] ?? []).filter((c) => c.from >= 0).map((c) => [scene.from + c.from, scene.from + c.end] as const),
);
