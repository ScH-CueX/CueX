import type { JevDecisionRequest, JevDecisionResponse } from '@cuex/protocol';

/**
 * System 1: Jev-like 极速判定器
 * 特征：<100ms 响应，输出严格受控的 TypeSafe 结构，专注于“当下是否切题”、“是否该打断”
 */
export class JevFastDecider {
  async evaluate(req: JevDecisionRequest): Promise<JevDecisionResponse> {
    const start = performance.now();
    const text = req.recentSpeechDigest.trim();

    // 简单语义规则快速推导（可无缝替换为微模型 API / Jev 权重服务）
    let verdict: JevDecisionResponse['verdict'] = 'on_topic';
    let action: JevDecisionResponse['action'] = 'listen';
    let resolvedPointIds: string[] = [];
    let reason = '正在回应关切';

    const hasAge = /75|七十五|八十|高龄|老年/i.test(text);
    const hasEgfr = /eGFR|肾功能|30|60/i.test(text);
    const hasEndpoint = /主要终点|收缩压|降压|不良反应|上市后/i.test(text);

    if (hasEndpoint && !hasAge && !hasEgfr) {
      verdict = 'drifting';
      action = 'prepare_followup';
      reason = '转向主要终点与安全性，高龄与肾功能亚组未提及';
    } else if (hasAge || hasEgfr) {
      verdict = 'on_topic';
      action = 'listen';
      if (hasAge) resolvedPointIds.push('c1');
      if (hasEgfr) resolvedPointIds.push('c2', 'c3');
      reason = '代表正在直接说明高龄与肾功能亚组情况';
    }

    const latencyMs = Math.round(performance.now() - start);

    return {
      requestId: `jev-${Date.now()}`,
      verdict,
      action,
      confidence: 0.94,
      resolvedPointIds,
      diagnosticReason: reason,
      latencyMs,
      timestamp: Date.now(),
    };
  }
}
