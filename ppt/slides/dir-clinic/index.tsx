import type { CSSProperties, ReactNode } from 'react';
import type { DesignSystem, Page, SlideMeta } from '@open-slide/core';
import cuexSymbol from '../../../assets/brand/cuex-symbol.svg';
import doctorImage from '../../../assets/captures/live-holding-doctor.png';
import withdrawnDecision from '../../../assets/captures/live-withdrawn-decisions.png';

const sansUrl = new URL('../../../assets/fonts/NotoSansSC-VF.ttf', import.meta.url).href;
const serifUrl = new URL('../../../assets/fonts/NotoSerifSC-VF.ttf', import.meta.url).href;
const instrumentUrl = new URL('../../../assets/fonts/InstrumentSerif-Regular.ttf', import.meta.url).href;
const styles = `
@font-face { font-family: 'CueX Clinic Sans'; src: url('${sansUrl}') format('truetype'); font-style: normal; font-weight: 100 900; font-display: swap; }
@font-face { font-family: 'CueX Clinic Serif'; src: url('${serifUrl}') format('truetype'); font-style: normal; font-weight: 200 900; font-display: swap; }
@font-face { font-family: 'CueX Clinic Latin'; src: url('${instrumentUrl}') format('truetype'); font-style: normal; font-weight: 400; font-display: swap; }
.cuex-clinic-wide, .cuex-clinic-wide * { box-sizing: border-box; }
.cuex-clinic-wide h1, .cuex-clinic-wide h2, .cuex-clinic-wide p { margin: 0; }
`;

if (typeof document !== 'undefined') {
  let style = document.getElementById('osd-styles-dir-clinic');
  if (!style) {
    style = document.createElement('style');
    style.id = 'osd-styles-dir-clinic';
    document.head.appendChild(style);
  }
  if (style.textContent !== styles) style.textContent = styles;
}

export const design: DesignSystem = {
  palette: { bg: '#ecede8', text: '#1b221f', accent: '#285f50' },
  fonts: {
    display: '"CueX Clinic Serif", serif',
    body: '"CueX Clinic Sans", sans-serif',
  },
  typeScale: { hero: 84, body: 30 },
  radius: 0,
};

const muted = '#56625c';
const rule = '#c8cec6';
const wideScale = 1920 / 2050;

function Wide({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#dbe0d9' }}>
      <section
        className="cuex-wide cuex-clinic-wide"
        style={{
          width: 2050, height: 574, flex: '0 0 2050px', position: 'relative',
          transform: `scale(${wideScale})`, transformOrigin: 'center',
          background: 'var(--osd-bg)', color: 'var(--osd-text)',
          fontFamily: 'var(--osd-font-body)', overflow: 'hidden',
        }}
      >
        {children}
      </section>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 16 : 20 }}>
      <img src={cuexSymbol} alt="" style={{ width: compact ? 38 : 48, height: compact ? 38 : 48 }} />
      <span style={{ fontFamily: '"CueX Clinic Latin", serif', fontSize: compact ? 48 : 64, lineHeight: 1, letterSpacing: '-0.035em' }}>CueX</span>
    </div>
  );
}

const coverHeading: CSSProperties = {
  fontFamily: 'var(--osd-font-display)', fontSize: 'var(--osd-size-hero)',
  fontWeight: 600, lineHeight: 1.22, letterSpacing: '-0.045em',
};

const Cover: Page = () => (
  <Wide>
    <div style={{ position: 'absolute', left: 68, top: 54 }}><Brand /></div>
    <div style={{ position: 'absolute', left: 68, top: 173, zIndex: 2 }}>
      <h1 style={coverHeading}>医药代表的<br />临场应对训练</h1>
      <p style={{ marginTop: 26, color: muted, fontSize: 'var(--osd-size-body)', lineHeight: 1.45 }}>
        背熟资料，也要接得住医生的追问。
      </p>
    </div>

    <div style={{ position: 'absolute', left: 1100, top: 0, width: 880, height: 574 }}>
      <img
        src={doctorImage}
        alt="CueX 演练中的虚拟医生"
        style={{ position: 'absolute', width: 674, height: 873, right: 38, top: -108, maxWidth: 'none', clipPath: 'inset(2px)' }}
      />
      <p style={{ position: 'absolute', left: 4, top: 358, fontFamily: 'var(--osd-font-display)', fontSize: 38, fontWeight: 500, lineHeight: 1.35 }}>
        “先停一下。”
      </p>
      <div style={{ position: 'absolute', left: 5, top: 420, width: 74, height: 2, background: '#8b9990' }} />
    </div>

    <div style={{ position: 'absolute', left: 68, bottom: 54, display: 'flex', alignItems: 'baseline', gap: 28 }}>
      <span style={{ fontSize: 25, fontWeight: 600 }}>记性好了一点</span>
      <span style={{ fontSize: 23, color: muted }}>路皓然　任逸康</span>
    </div>
    <p style={{ position: 'absolute', right: 68, bottom: 56, fontSize: 22, color: muted }}>AI + 医疗健康</p>
  </Wide>
);

function Behavior({ left, cue, action, detail, divided = false }: { left: number; cue: string; action: string; detail: string; divided?: boolean }) {
  return (
    <div style={{ position: 'absolute', left, top: 92, width: 405, height: 200, paddingLeft: divided ? 32 : 0, borderLeft: divided ? `1px solid ${rule}` : 'none' }}>
      <p style={{ fontSize: 28, color: muted, lineHeight: 1.4 }}>{cue}</p>
      <h2 style={{ fontFamily: 'var(--osd-font-display)', fontSize: 52, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.2, marginTop: 17, color: 'var(--osd-accent)' }}>{action}</h2>
      <p style={{ fontSize: 28, lineHeight: 1.5, marginTop: 21 }}>{detail}</p>
    </div>
  );
}

const Interaction: Page = () => (
  <Wide>
    <div style={{ position: 'absolute', left: 68, top: 54 }}><Brand compact /></div>
    <h1 style={{ ...coverHeading, position: 'absolute', left: 68, top: 164, fontSize: 78 }}>
      先听清，<br />再开口。
    </h1>
    <p style={{ position: 'absolute', left: 68, top: 388, fontSize: 'var(--osd-size-body)', lineHeight: 1.5, color: muted }}>
      回应的时机，<br />跟着对话改变。
    </p>

    <Behavior left={660} cue="正在回应关切" action="继续听" detail="让有效回应说完整" />
    <Behavior left={1085} cue="持续偏离关切" action="追问" detail="把话题带回医生的问题" divided />
    <Behavior left={1538} cue="代表主动补答" action="撤销追问" detail="收回尚未说出口的追问" divided />

    <p style={{ position: 'absolute', left: 660, top: 302, fontSize: 24, color: muted, lineHeight: 1.4 }}>
      输出前再复核，候选追问不会自动进入对话。
    </p>
    <div style={{ position: 'absolute', left: 660, top: 347, width: 1322, height: 173, overflow: 'hidden', border: `1px solid ${rule}` }}>
      <img
        src={withdrawnDecision}
        alt="真实演示界面：代表主动补答后，候选追问显示已撤销、依据失效"
        style={{ position: 'absolute', width: 2838, maxWidth: 'none', height: 'auto', left: -1435, top: -102 }}
      />
    </div>
    <p style={{ position: 'absolute', left: 68, bottom: 54, fontSize: 20, color: muted }}>演示回放；临床案例为虚构。</p>
  </Wide>
);

export const meta: SlideMeta = {
  title: 'CueX · 诊室里的停顿',
  createdAt: '2026-10-31T20:37:12.611Z',
};

export const notes: (string | undefined)[] = [
  '我们是“记性好了一点”，路皓然、任逸康。CueX 训练的是医药代表面对追问时的临场应对：停下原稿，听懂医生真正关心什么，重选信息，再准确回应。屏幕中的虚拟医生来自我们的实际演练产品。',
  '请看这三个瞬间。代表正在回应关切时，医生继续听；代表持续偏离时，医生才追问；如果代表已经主动补答，系统会在输出前复核，把还没说出口的追问撤销。底部是真实产品演示回放的候选撤销画面。当前主分支提供确定性的 68 秒演示，不能把这个录制演示说成实时模型基准测试。ANSHU-3 及案例研究数据为虚构演示数据。',
];

export default [Cover, Interaction] satisfies Page[];
