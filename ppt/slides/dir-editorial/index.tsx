import type { CSSProperties, ReactNode } from 'react';
import type { DesignSystem, Page, SlideMeta } from '@open-slide/core';
import cuexSymbol from '../../../assets/brand/cuex-symbol.svg';
import doctor from '../../../assets/captures/live-withdrawn-doctor.png';
import withdrawnDecisions from '../../../assets/captures/live-withdrawn-decisions.png';
import sansFont from '../../../assets/fonts/NotoSansSC-VF.ttf';
import interFont from '../../../assets/fonts/Inter-VF.ttf';

export const design: DesignSystem = {
  palette: { bg: '#f1f0e9', text: '#181c19', accent: '#bb3e25' },
  fonts: {
    display: '"CueX Editorial Inter", "CueX Editorial Sans", sans-serif',
    body: '"CueX Editorial Sans", sans-serif',
  },
  typeScale: { hero: 100, body: 32 },
  radius: 0,
};

const fontCss = `
@font-face { font-family: 'CueX Editorial Sans'; src: url('${sansFont}') format('truetype'); font-weight: 100 900; font-style: normal; font-display: block; }
@font-face { font-family: 'CueX Editorial Inter'; src: url('${interFont}') format('truetype'); font-weight: 100 900; font-style: normal; font-display: block; }
`;
if (typeof document !== 'undefined') {
  let style = document.getElementById('osd-webfont-dir-editorial');
  if (!style) {
    style = document.createElement('style');
    style.id = 'osd-webfont-dir-editorial';
    document.head.appendChild(style);
  }
  if (style.textContent !== fontCss) style.textContent = fontCss;
}

const absolute = (left: number, top: number): CSSProperties => ({ position: 'absolute', left, top });

function WideCanvas({ children, background }: { children: ReactNode; background?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#242623', position: 'relative' }}>
      <section className="cuex-wide" style={{
        position: 'absolute', width: 2050, height: 574, left: '50%', top: '50%',
        transform: 'translate(-50%, -50%) scale(0.9365853658536586)',
        transformOrigin: 'center center', boxSizing: 'border-box',
        background: background || 'var(--osd-bg)', color: 'var(--osd-text)',
        fontFamily: 'var(--osd-font-body)',
      }}>
        {children}
      </section>
    </div>
  );
}

function Brand({ left, top, light = false, small = false }: { left: number; top: number; light?: boolean; small?: boolean }) {
  return (
    <div style={{ ...absolute(left, top), display: 'flex', alignItems: 'center', gap: small ? 12 : 18 }}>
      <img src={cuexSymbol} alt="CueX" style={{ width: small ? 38 : 60, height: small ? 38 : 60 }} />
      <span style={{ fontFamily: 'var(--osd-font-display)', fontSize: small ? 32 : 57, lineHeight: 1, letterSpacing: '-2px', fontWeight: 800, color: light ? '#fff6e9' : 'var(--osd-text)' }}>CueX</span>
    </div>
  );
}

const Cover: Page = () => (
  <WideCanvas background="var(--osd-accent)">
    <Brand left={62} top={49} light />
    <div style={{ ...absolute(621, 65), fontSize: 22, fontWeight: 500, color: '#f3d6c9', letterSpacing: '1px' }}>AI + 医疗健康 / 信达生物 · 销售培训</div>

    <h1 style={{ ...absolute(61, 173), margin: 0, fontFamily: 'var(--osd-font-display)', fontSize: 'var(--osd-size-hero)', fontWeight: 850, lineHeight: 1.13, letterSpacing: '-5px', color: '#fff6e9', whiteSpace: 'nowrap' }}>一句话，接住变化。</h1>
    <p style={{ ...absolute(66, 328), margin: 0, fontSize: 39, fontWeight: 650, lineHeight: 1.3, color: '#fff6e9', letterSpacing: '1px' }}>医药代表的临场应对训练</p>
    <p style={{ ...absolute(66, 397), margin: 0, fontSize: 'var(--osd-size-body)', lineHeight: 1.5, color: '#f3d6c9' }}>背熟资料，仍可能接不住医生的追问。</p>

    <div style={{ ...absolute(66, 484), width: 1196, height: 1, background: '#f4d1c2', opacity: 0.5 }} />
    <p style={{ ...absolute(66, 505), margin: 0, fontSize: 24, color: '#fff6e9', lineHeight: 1.3 }}>记性好了一点</p>
    <p style={{ ...absolute(640, 505), margin: 0, fontSize: 24, color: '#fff6e9', lineHeight: 1.3 }}>队长 路皓然<span style={{ padding: '0 30px', opacity: 0.45 }}>/</span>队员 任逸康</p>

    <figure style={{ ...absolute(1326, 0), width: 724, height: 574, margin: 0, background: '#e8e9e3', overflow: 'hidden' }}>
      <img src={doctor} alt="CueX 演示回放中的医生：已放下追问" style={{ width: 724, height: 878, objectFit: 'cover', position: 'absolute', top: -105, left: 0 }} />
      <figcaption style={{ position: 'absolute', left: 38, bottom: 27, fontSize: 22, letterSpacing: '0.4px', color: '#4e5750', background: '#eceee7', padding: '7px 12px' }}>CueX 演练界面 · 演示回放</figcaption>
    </figure>
  </WideCanvas>
);

function Behavior({ left, condition, action, detail, accent = false }: { left: number; condition: string; action: string; detail: string; accent?: boolean }) {
  return (
    <div style={{ ...absolute(left, 199), width: 588 }}>
      <div style={{ fontSize: 28, fontWeight: 500, lineHeight: 1.3, color: '#636b62' }}>{condition}</div>
      <div style={{ marginTop: 13, fontSize: 58, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-2px', color: accent ? 'var(--osd-accent)' : 'var(--osd-text)' }}>{action}</div>
      <div style={{ marginTop: 15, fontSize: 28, fontWeight: 400, lineHeight: 1.4 }}>{detail}</div>
    </div>
  );
}

const Interaction: Page = () => (
  <WideCanvas>
    <div style={{ ...absolute(0, 0), width: 2050, height: 155, background: 'var(--osd-accent)' }} />
    <h2 style={{ ...absolute(60, 34), margin: 0, fontFamily: 'var(--osd-font-display)', color: '#fff6e9', fontSize: 88, fontWeight: 850, lineHeight: 1.15, letterSpacing: '-4px' }}>听、问、撤。</h2>
    <p style={{ ...absolute(697, 66), margin: 0, fontSize: 32, lineHeight: 1.4, color: '#fff6e9' }}>让对话，跟得上关切的变化。</p>
    <Brand left={1819} top={60} light small />

    <Behavior left={64} condition="回应关切时" action="继续听" detail="留出完整回应的空间。" />
    <div style={{ ...absolute(688, 203), width: 1, height: 127, background: '#bfc4ba' }} />
    <Behavior left={732} condition="持续偏离时" action="适时追问" detail="把话题带回医生的关切。" />
    <div style={{ ...absolute(1356, 203), width: 1, height: 127, background: '#bfc4ba' }} />
    <Behavior left={1401} condition="主动补答时" action="撤销追问" detail="撤回尚未说出口的追问。" accent />

    <div style={{ ...absolute(64, 365), display: 'flex', alignItems: 'center', gap: 13, fontSize: 22, color: '#626b61' }}>
      <span style={{ width: 8, height: 8, background: 'var(--osd-accent)' }} />
      实际演示界面 / 主动补答后，候选追问撤销
    </div>
    <figure style={{ ...absolute(54, 405), margin: 0, width: 1942, height: 119, overflow: 'hidden' }}>
      <img src={withdrawnDecisions} alt="实际产品界面：System 1 判断代表正在自行补答；System 2 的候选追问已撤销，依据失效" style={{ position: 'absolute', width: 1942, height: 'auto', left: 0, top: -70 }} />
    </figure>
    <p style={{ ...absolute(64, 539), margin: 0, fontSize: 20, lineHeight: 1.2, color: '#697168' }}>确定性演示回放；非实时模型性能测试。临床材料为虚构示例。</p>
  </WideCanvas>
);

export const meta: SlideMeta = {
  title: 'C · 一句话，接住变化',
  createdAt: '2026-10-31T20:37:25.733Z',
};

export const notes: (string | undefined)[] = [
  '大家好，我们是“记性好了一点”，我是路皓然，队友是任逸康。CueX 做医药代表的临场应对训练。背熟资料之后，一旦医生突然追问，能不能先停下原稿、听懂关切，再选择准确的信息回应？我们把这个临场变化，变成可以反复练习的对话。',
  'CueX 的交互有三个动作：你在回应关切，它继续听；你持续偏离，它会追问；如果你主动补答，它会撤销还没有说出口的追问。下方是现有产品的实际界面，展示候选追问已经撤销。这里展示的是确定性演示回放，不是实时模型性能测试；演示里的临床研究和数据都是虚构示例。',
];

export default [Cover, Interaction] satisfies Page[];
