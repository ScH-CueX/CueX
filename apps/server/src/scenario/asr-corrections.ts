import type { AsrCorrection } from '../contracts';

/**
 * Misrecognitions of ANSHU terms by the deployed streaming zh model (sherpa-onnx zipformer on the Windows box).
 * Every rule comes from recorded output: macOS Tingting through the live server, plus the earlier bench runs.
 * The model writes numbers as Chinese numerals and never emits Latin letters, so "eGFR" comes back as a Chinese guess.
 * Rules run in order, on partials and finals alike. Each one is anchored on the words around the garble.
 */
export const ANSHU_ASR_CORRECTIONS: AsrCorrection[] = [
  // eGFR 30 到 60. Seen: 克瑞三十到六十 (every run), X分三十到六十 and X 二三十到六十 (earlier bench runs).
  { pattern: '(?:克瑞|[Xx] ?[二分]?)三十到六十', replacement: 'eGFR 30到60' },
  // eGFR below 30. Seen: 反正低于三十 (every run), 盖着小于三十, 可能低于三十 (earlier bench run).
  // Only at the start of a clause and before 的患者, so a "反正" or "可能" inside other speech stays.
  { pattern: '(?<![^，。、；\\s])(?:反正|盖着|可能)(?<cmp>低于|小于)三十(?=的患者)', replacement: 'eGFR$<cmp>30' },
  // 亚组. Seen: 亚足 and 亚祖分析. 亚足联 (the football body) is left alone.
  { pattern: '亚[足祖](?!联)', replacement: '亚组' },
  // 安舒平. Seen: 班舒平 (every run), and 班舒平足比对照组 for 安舒平组比对照组. 安淑平 and 安淑萍 are in the brief but never appeared in my runs.
  { pattern: '班舒平|安淑[平萍]', replacement: '安舒平' },
  { pattern: '(?<=安舒平)足(?=比对照)', replacement: '组' },
  // 收缩压 and 毫米汞柱. Seen: 诊室收缩呀, 毫米拱柱.
  { pattern: '收缩呀', replacement: '收缩压' },
  { pattern: '毫米拱柱', replacement: '毫米汞柱' },
];
