import type { ControllerDispatchEvent, DoctorPoseName } from '@cuex/protocol';
import { JevFastDecider } from '../system1/JevFastDecider';
import { PiAgentRunner } from '../system2/PiAgentRunner';

export class TurnController {
  private jev = new JevFastDecider();
  private piAgent = new PiAgentRunner();
  private currentPose: DoctorPoseName = 'listening';
  private readiness = 0;
  private resolvedPoints = new Set<string>();

  async onSpeechChunk(sessionId: string, transcriptDelta: string): Promise<{
    dispatch: ControllerDispatchEvent;
    candidateUpdate?: any;
    verdict?: any;
  }> {
    // 1. 调用 System 1 Jev 快速判定
    const verdict = await this.jev.evaluate({
      sessionId,
      activeConcernId: 'concern-01',
      unresolvedPoints: [
        { id: 'c1', label: '75 岁以上' },
        { id: 'c2', label: 'eGFR 30–60' },
        { id: 'c3', label: 'eGFR < 30' },
      ].filter((p) => !this.resolvedPoints.has(p.id)),
      recentSpeechDigest: transcriptDelta,
      dialogueHistoryDigest: '',
    });

    // 更新关切完成度
    if (verdict.resolvedPointIds) {
      verdict.resolvedPointIds.forEach((id) => this.resolvedPoints.add(id));
    }

    let actionType: 'idle' | 'nod' | 'interrupt_speak' | 'withdraw_question' = 'idle';
    let textToSpeak: string | undefined;
    let candidateId: string | undefined;

    const candidate = this.piAgent.getActiveCandidate();

    // 2. Controller 核心输出前复核（Turn Arbitration）
    if (verdict.verdict === 'drifting') {
      if (!candidate || candidate.phase === 'idle') {
        // 偏离开始，通知 PiAgent 准备追问
        await this.piAgent.onTriggerPrepare('concern-01', verdict.diagnosticReason);
        this.currentPose = 'listening';
      } else if (candidate.phase === 'ready') {
        // 追问已就绪，医生身体前倾进入 holding，准备开口
        this.currentPose = 'holding';
        this.readiness = Math.min(1, this.readiness + 0.35);

        if (this.readiness >= 1) {
          // 决策开口追问
          this.currentPose = 'asking';
          actionType = 'interrupt_speak';
          textToSpeak = candidate.draftText;
          candidateId = candidate.id;
          this.piAgent.markCandidateSpoken(candidate.id);
        }
      }
    } else if (verdict.verdict === 'on_topic') {
      if (candidate && (candidate.phase === 'ready' || candidate.phase === 'drafting')) {
        // 代表自主修正！Controller 执行输出前复核：追问依据不再成立，静默撤销追问！
        this.currentPose = 'withdrawing';
        actionType = 'withdraw_question';
        candidateId = candidate.id;
        this.piAgent.markCandidateWithdrawn(candidate.id);
        this.readiness = 0;
      } else {
        this.currentPose = 'listening';
        this.readiness = 0;
        if (verdict.resolvedPointIds.length > 0) {
          actionType = 'nod';
        }
      }
    }

    const dispatch: ControllerDispatchEvent = {
      sessionId,
      timestamp: Date.now(),
      pose: this.currentPose,
      readiness: this.readiness,
      action: {
        type: actionType,
        textToSpeak,
        candidateId,
      },
      concernProgress: {
        concernId: 'concern-01',
        resolvedCount: this.resolvedPoints.size,
        totalPoints: 3,
        isFullyResolved: this.resolvedPoints.size >= 3,
      },
    };

    return {
      dispatch,
      verdict,
      candidateUpdate: this.piAgent.getActiveCandidate(),
    };
  }
}
