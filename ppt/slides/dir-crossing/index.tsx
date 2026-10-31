import type { CSSProperties, ReactNode } from 'react';
import type { DesignSystem, Page, SlideMeta } from '@open-slide/core';
import cuexSymbol from '../../../assets/brand/cuex-symbol.svg';
import doctor from '../../../assets/captures/live-holding-doctor.png';
import transcript from '../../../assets/captures/live-holding-transcript.png';
import withdrawn from '../../../assets/captures/live-withdrawn-decisions.png';
import sans from '../../../assets/fonts/NotoSansSC-VF.ttf';
import instrument from '../../../assets/fonts/InstrumentSerif-Regular.ttf';

export const design: DesignSystem = {
  palette: { bg: '#07080b', text: '#f2f0eb', accent: '#FF7A2F' },
  fonts: { display: 'CueXCrossingSerif, serif', body: 'CueXCrossingSans, sans-serif' },
  typeScale: { hero: 78, body: 30 },
  radius: 0,
};

const lavender = '#8E8CFF';
const muted = '#b0b1ba';
const scale = 1920 / 2050;

const fontCss = `
@font-face { font-family: CueXCrossingSans; src: url('${sans}') format('truetype'); font-weight: 100 900; font-style: normal; font-display: block; }
@font-face { font-family: CueXCrossingSerif; src: url('${instrument}') format('truetype'); font-weight: 400; font-style: normal; font-display: block; }
.cuex-crossing-wide, .cuex-crossing-wide * { box-sizing: border-box; }
.cuex-crossing-wide h1, .cuex-crossing-wide h2, .cuex-crossing-wide p { margin: 0; }
`;
if (typeof document !== 'undefined') {
  const id = 'osd-styles-dir-crossing';
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement('style');
    element.id = id;
    document.head.appendChild(element);
  }
  if (element.textContent !== fontCss) element.textContent = fontCss;
}

function Wide({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#07080b' }}>
      <section
        className="cuex-wide cuex-crossing-wide"
        style={{
          position: 'absolute', width: 2050, height: 574,
          left: '50%', top: '50%', transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)',
          fontFamily: 'var(--osd-font-body)', overflow: 'hidden',
        }}
      >{children}</section>
    </div>
  );
}

function Text({ children, style }: { children: ReactNode; style: CSSProperties }) {
  return <div style={{ position: 'absolute', ...style }}>{children}</div>;
}

const Cover: Page = () => (
  <Wide>
    <Text style={{ left: 64, top: 42, fontSize: 22, color: muted, letterSpacing: 0.4 }}>
      AI + 医疗健康　信达生物销售培训
    </Text>

    {/* The inherited symbol is enlarged as the composition, without redrawing the logo. */}
    <Text style={{ left: 62, top: 66, fontSize: 250, lineHeight: 1.1, fontFamily: 'var(--osd-font-display)', letterSpacing: -10 }}>
      Cue
    </Text>
    <img src={cuexSymbol} alt="X" style={{ position: 'absolute', left: 407, top: 2, width: 390, height: 390 }} />

    <Text style={{ left: 68, top: 335, fontSize: 30, color: muted, letterSpacing: 1 }}>
      医药代表的
    </Text>
    <Text style={{ left: 64, top: 380, fontSize: 78, lineHeight: 1.15, fontWeight: 580, letterSpacing: -1.5 }}>
      临场应对训练
    </Text>
    <Text style={{ left: 68, top: 510, fontSize: 23, color: '#d4d3d9' }}>
      记性好了一点　　路皓然 / 任逸康
    </Text>

    <div style={{ position: 'absolute', left: 954, top: 67, width: 1032, height: 377, display: 'flex', background: '#e9eae3', overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: 450, height: 377, overflow: 'hidden', flexShrink: 0 }}>
        <img src={doctor} alt="CueX 实际演练界面：医生正在听，准备插话" style={{ position: 'absolute', width: 450, height: 'auto', left: 0, top: -19 }} />
      </div>
      <div style={{ position: 'relative', width: 582, height: 377, borderLeft: '1px solid #bfc2bb', overflow: 'hidden' }}>
        <img src={transcript} alt="CueX 实际对话现场，代表偏离医生关切" style={{ position: 'absolute', width: 582, height: 'auto', left: 0, top: 0 }} />
      </div>
    </div>
    <Text style={{ left: 954, top: 465, fontSize: 30, lineHeight: 1.5, letterSpacing: -0.4 }}>
      背熟资料，仍可能接不住医生的追问。
    </Text>
    <Text style={{ left: 956, top: 518, fontSize: 20, color: muted }}>
      实际界面 · 确定性演示回放 · ANSHU-3 为虚构训练案例
    </Text>
  </Wide>
);

const Interaction: Page = () => (
  <Wide>
    <div style={{ position: 'absolute', left: 64, top: 42, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'var(--osd-font-display)', fontSize: 41, lineHeight: 1 }}>Cue</span>
      <img src={cuexSymbol} alt="X" style={{ width: 38, height: 38 }} />
    </div>
    <Text style={{ left: 64, top: 127, fontSize: 'var(--osd-size-hero)', lineHeight: 1.25, fontWeight: 560, letterSpacing: -1.4 }}>
      准备好的追问，<br />也能及时撤回。
    </Text>
    <Text style={{ left: 68, top: 357, fontSize: 'var(--osd-size-body)', lineHeight: 1.6, color: '#c7c8cf' }}>
      回应关切时继续听，持续偏离时追问；<br />
      主动补答时，撤销尚未说出口的追问。
    </Text>
    <Text style={{ left: 68, top: 515, fontSize: 20, color: muted }}>
      实际界面 · 确定性演示回放 · ANSHU-3 为虚构训练案例
    </Text>

    <div style={{ position: 'absolute', left: 956, top: 55, width: 1030, height: 234 }}>
      <Text style={{ left: 0, top: 17, fontSize: 24, color: 'var(--osd-accent)' }}>System 1</Text>
      <Text style={{ left: 0, top: 53, fontSize: 30 }}>高频小判断</Text>
      <Text style={{ left: 0, top: 151, fontSize: 24, color: lavender }}>System 2</Text>
      <Text style={{ left: 0, top: 187, fontSize: 30 }}>并行准备追问</Text>

      <svg viewBox="0 0 440 230" aria-label="判断与准备在输出前汇合" style={{ position: 'absolute', left: 218, top: 0, width: 440, height: 230, overflow: 'visible' }}>
        <path d="M12 38 L386 208" fill="none" stroke="#FF7A2F" strokeWidth="10" strokeLinecap="round" />
        <path d="M12 208 L386 38" fill="none" stroke="#8E8CFF" strokeWidth="10" strokeLinecap="round" />
      </svg>

      <div style={{ position: 'absolute', left: 701, top: 59, width: 329, borderTop: '1px solid #54555e', borderBottom: '1px solid #54555e', padding: '18px 0 22px' }}>
        <div style={{ fontSize: 23, color: muted, marginBottom: 9 }}>Controller</div>
        <div style={{ fontSize: 36, fontWeight: 500 }}>输出前复核</div>
      </div>
    </div>

    {/* Crop the actual System 2 panel, retaining its withdrawn status and crossed-out question. */}
    <div style={{ position: 'absolute', left: 956, top: 326, width: 1030, height: 162, overflow: 'hidden', background: '#e9eae3' }}>
      <img src={withdrawn} alt="实际界面：System 2 候选追问已撤销，依据失效；原追问显示删除线" style={{ position: 'absolute', width: 2194, maxWidth: 'none', height: 'auto', left: -1101, top: -77 }} />
    </div>
    <Text style={{ left: 956, top: 508, fontSize: 26, color: '#d4d3d9' }}>
      候选与真实对话分离。补答已到，追问止步。
    </Text>
  </Wide>
);

export const meta: SlideMeta = {
  title: 'CueX · 两道思考的交点',
  createdAt: '2026-10-31T20:37:21.542Z',
};

export const notes: (string | undefined)[] = [
  '大家好，我们是“记性好了一点”，我是路皓然，队友是任逸康。CueX 面向医药代表的临场应对训练：背熟资料以后，还要在医生追问时停下原稿，听懂关切，重新选择信息并准确回应。画面来自实际产品中的确定性演示回放，ANSHU-3 是虚构训练案例，不代表临床研究或实时模型基准。',
  '这一页看一个细节：系统准备好了追问，也不意味着必须说出来。System 1 持续做小判断，System 2 并行准备候选，Controller 在输出前复核。如果代表还在回应关切，就继续听；持续偏离时再追问。当代表主动补答，原来追问的依据已经失效，系统会撤销尚未说出口的候选。右下是真实界面里的已撤销状态。演示呈现这一交互逻辑，并不是实时模型的性能或训练效果证明。',
];

export default [Cover, Interaction] satisfies Page[];
