import type { FollowupCandidate, PiAgentCandidateUpdate } from '@cuex/protocol';

/**
 * System 2: 基于 PiAgent 基座的深度认知与候选生成器
 * 异步检索临床指南 Skills 与说明书，生成带触发依据的候选追问
 */
export class PiAgentRunner {
  private activeCandidate: FollowupCandidate | null = null;

  async onTriggerPrepare(concernId: string, basis: string): Promise<FollowupCandidate> {
    const candidateId = `cand-${Date.now()}`;
    const candidate: FollowupCandidate = {
      id: candidateId,
      targetConcernId: concernId,
      phase: 'retrieving',
      draftText: '',
      basis,
      sourceEvidence: 'ANSHU-3 临床亚组分析表 · 第 14 页',
      triggerCondition: '代表持续两段未说明肾功能亚组',
      preparedFromMs: Date.now(),
    };
    this.activeCandidate = candidate;

    // 模拟 PiAgent Skills 检索与推理过程（后台异步）
    setTimeout(() => {
      if (this.activeCandidate?.id === candidateId && this.activeCandidate.phase === 'retrieving') {
        this.activeCandidate.phase = 'drafting';
      }
    }, 600);

    setTimeout(() => {
      if (this.activeCandidate?.id === candidateId && this.activeCandidate.phase === 'drafting') {
        this.activeCandidate.phase = 'ready';
        this.activeCandidate.draftText = '先停一下。七十五岁以上、eGFR 低于 60 的患者，研究里有多少？结论能用在他们身上吗？';
        this.activeCandidate.readyAtMs = Date.now();
      }
    }, 1800);

    return candidate;
  }

  getActiveCandidate(): FollowupCandidate | null {
    return this.activeCandidate;
  }

  markCandidateSpoken(id: string): void {
    if (this.activeCandidate?.id === id) {
      this.activeCandidate.phase = 'spoken';
      this.activeCandidate.fate = 'asked';
      this.activeCandidate.decidedAtMs = Date.now();
    }
  }

  markCandidateWithdrawn(id: string): void {
    if (this.activeCandidate?.id === id) {
      this.activeCandidate.phase = 'withdrawn';
      this.activeCandidate.fate = 'withdrawn';
      this.activeCandidate.decidedAtMs = Date.now();
    }
  }
}
