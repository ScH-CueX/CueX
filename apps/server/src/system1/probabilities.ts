import type { JevAnswer, JevQuestion } from '../contracts';

export function labelsFor(question: JevQuestion): string[] {
  if (question.kind === 'noul') return ['false', 'true'];
  if (question.kind === 'score') return ['0', '1', '2', '3', '4', '5'];
  if (question.options.length < 2 || question.options.length > 26 || new Set(question.options).size !== question.options.length || question.options.some(x => !x.trim())) {
    throw new Error('choice requires 2–26 distinct non-empty options');
  }
  return question.options;
}

export function answerFromWeights(question: JevQuestion, weights: number[]): JevAnswer {
  const labels = labelsFor(question);
  if (weights.length !== labels.length || weights.some(x => !Number.isFinite(x) || x < 0)) throw new Error('Invalid decision probabilities');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('Decision probabilities have zero mass');
  const probabilities = Object.fromEntries(labels.map((label, i) => [label, weights[i] / sum]));
  const top = labels.reduce((a, b) => probabilities[a] >= probabilities[b] ? a : b);
  const value = question.kind === 'noul' ? probabilities.true : question.kind === 'score' ? labels.reduce((sum, label) => sum + Number(label) * probabilities[label], 0) : probabilities[top];
  return { kind: question.kind, probabilities, value, top };
}
