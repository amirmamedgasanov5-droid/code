import React from 'react';
import {
  AbsoluteFill, Sequence, interpolate, useCurrentFrame, random, staticFile,
  delayRender, continueRender, Easing,
} from 'remotion';

export const TOTAL = 1500;
const S = {s1: [0, 180], s2: [180, 480], s3: [480, 690], s4: [690, 1260], s5: [1260, 1500]} as const;

// ---------- fonts ----------
const fontHandle = delayRender('fonts');
Promise.all([
  new FontFace('Amiri', `url(${staticFile('amiri.woff2')})`, {weight: '400'}).load(),
  new FontFace('RubikC', `url(${staticFile('rubik500.woff2')})`, {weight: '500', unicodeRange: 'U+0400-04FF'}).load(),
  new FontFace('RubikC', `url(${staticFile('rubik700.woff2')})`, {weight: '700', unicodeRange: 'U+0400-04FF'}).load(),
  new FontFace('RubikC', `url(${staticFile('rubik500l.woff2')})`, {weight: '500', unicodeRange: 'U+0000-00FF'}).load(),
  new FontFace('RubikC', `url(${staticFile('rubik700l.woff2')})`, {weight: '700', unicodeRange: 'U+0000-00FF'}).load(),
]).then((fs) => { fs.forEach((f) => document.fonts.add(f)); continueRender(fontHandle); })
  .catch(() => continueRender(fontHandle));

const SANS = "RubikC, 'Rubik', sans-serif";
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// ---------- faceless figures ----------
type FigProps = {
  kind: 'man' | 'woman'; x: number; y?: number; s?: number; face?: 1 | -1;
  lean?: number; armF?: number; armB?: number; dy?: number;
};
const SKIN = '#e9bb94';

const Arm: React.FC<{sx: number; ang: number; color: string; z?: number}> = ({sx, ang, color}) => (
  <g transform={`translate(${sx},-345) rotate(${ang})`}>
    <line x1="0" y1="0" x2="0" y2="150" stroke={color} strokeWidth="40" strokeLinecap="round" />
    <circle cx="0" cy="168" r="21" fill={SKIN} />
  </g>
);

const Figure: React.FC<FigProps> = ({kind, x, y = 0, s = 1, face = 1, lean = 0, armF = -8, armB = 8, dy = 0}) => {
  const man = kind === 'man';
  const cloth = man ? '#f1ece0' : '#7b4a8f';
  const clothDark = man ? '#d8d1bf' : '#5f3673';
  return (
    <g transform={`translate(${x},${y + dy}) scale(${s * face},${s}) rotate(${lean})`}>
      <ellipse cx="0" cy="6" rx="130" ry="14" fill="#000" opacity="0.15" />
      <Arm sx={-70} ang={armB} color={clothDark} />
      {man ? (
        <path d="M-72,-385 Q-95,-385 -98,-325 L-112,0 L112,0 L98,-325 Q95,-385 72,-385 Z" fill={cloth} />
      ) : (
        <path d="M-72,-385 Q-95,-385 -100,-320 L-140,0 L140,0 L100,-320 Q95,-385 72,-385 Z" fill={cloth} />
      )}
      {man ? <rect x="-8" y="-385" width="70" height="8" fill="none" /> : <path d="M-100,-150 Q0,-120 100,-150 L106,-120 Q0,-90 -106,-120 Z" fill="#f2c9d8" opacity="0.9" />}
      <rect x="-18" y="-410" width="36" height="40" fill={SKIN} />
      {man ? (
        <>
          <circle cx="0" cy="-445" r="58" fill={SKIN} />
          <path d="M-52,-420 Q-48,-345 14,-350 Q62,-354 58,-425 Q4,-392 -52,-420Z" fill="#3a2a20" />
          <path d="M-58,-452 A58 58 0 0 1 58,-452 Q0,-470 -58,-452Z" fill="#2f7a63" />
        </>
      ) : (
        <>
          <path d="M-78,-440 A78 78 0 0 1 78,-440 L116,-318 Q0,-285 -116,-318 Z" fill="#c24f78" />
          <ellipse cx="16" cy="-436" rx="40" ry="48" fill={SKIN} />
        </>
      )}
      <Arm sx={70} ang={armF} color={cloth} />
    </g>
  );
};

const Heart: React.FC<{x: number; y: number; size: number; color?: string; opacity?: number; rot?: number}> = ({x, y, size, color = '#e5446d', opacity = 1, rot = 0}) => (
  <g transform={`translate(${x},${y}) rotate(${rot}) scale(${size / 100})`} opacity={opacity}>
    <path d="M0,30 C-70,-20 -50,-70 -22,-70 C-8,-70 0,-60 0,-50 C0,-60 8,-70 22,-70 C50,-70 70,-20 0,30Z" fill={color} />
  </g>
);

const Bubble: React.FC<{x: number; y: number; text: string; flip?: boolean; scale?: number; color?: string}> = ({x, y, text, flip, scale = 1, color = '#fff'}) => (
  <g transform={`translate(${x},${y}) scale(${scale})`}>
    <path d={flip ? 'M-130,-60 H130 Q160,-60 160,-30 V40 Q160,70 130,70 H40 L60,130 L-20,70 H-130 Q-160,70 -160,40 V-30 Q-160,-60 -130,-60Z' : 'M-130,-60 H130 Q160,-60 160,-30 V40 Q160,70 130,70 H20 L-60,130 L-40,70 H-130 Q-160,70 -160,40 V-30 Q-160,-60 -130,-60Z'} fill={color} stroke="#2a1a1a" strokeWidth="6" />
    <text x="0" y="28" textAnchor="middle" fontFamily={SANS} fontWeight={700} fontSize="92" fill="#d11f2a">{text}</text>
  </g>
);

const Zig: React.FC<{x: number; y: number; size?: number; opacity?: number}> = ({x, y, size = 1, opacity = 1}) => (
  <polyline transform={`translate(${x},${y}) scale(${size})`} points="-30,-40 0,-10 -20,-5 15,35 -5,30 30,70" fill="none" stroke="#ff3b3b" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
);

// ---------- text helpers ----------
const Caption: React.FC<{title: string; sub?: string; color?: string; subColor?: string; top?: number}> = ({title, sub, color = '#2b1d12', subColor = '#5a4430', top = 150}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 20], [0, 1], clamp);
  const ty = interpolate(f, [0, 20], [30, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <div style={{position: 'absolute', top, left: 70, right: 70, textAlign: 'center', opacity: o, transform: `translateY(${ty}px)`, fontFamily: SANS}}>
      <div style={{fontSize: 72, fontWeight: 700, lineHeight: 1.18, color}}>{title}</div>
      {sub && <div style={{fontSize: 42, fontWeight: 500, lineHeight: 1.3, color: subColor, marginTop: 28}}>{sub}</div>}
    </div>
  );
};

const Svg: React.FC<{children: React.ReactNode}> = ({children}) => (
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>{children}</svg>
);

const fadeIO = (f: number, dur: number, fi = 15, fo = 15) =>
  interpolate(f, [0, fi, dur - fo, dur], [0, 1, 1, 0], clamp);

// ---------- scene 1: calm ----------
const Scene1: React.FC = () => {
  const f = useCurrentFrame();
  const bob = Math.sin(f / 14) * 4;
  const slide = interpolate(f, [0, 50], [60, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg,#ffe9c2 0%,#f9cf94 60%,#e9ad6c 100%)'}}>
      <Svg>
        <circle cx="880" cy="560" r="120" fill="#ffd36b" opacity="0.9" />
        <rect x="0" y="1480" width="1080" height="440" fill="#c98a52" />
        <rect x="0" y="1470" width="1080" height="16" fill="#a86e3d" />
        <rect x="90" y="760" width="230" height="330" rx="14" fill="#fff4dc" stroke="#a86e3d" strokeWidth="10" />
        <line x1="205" y1="760" x2="205" y2="1090" stroke="#a86e3d" strokeWidth="8" />
        <line x1="90" y1="925" x2="320" y2="925" stroke="#a86e3d" strokeWidth="8" />
        <Figure kind="man" x={380 - slide} y={1560} s={1.18} face={1} dy={bob} armF={-18} />
        <Figure kind="woman" x={700 + slide} y={1560} s={1.18} face={-1} dy={-bob} armF={-18} />
        {[0, 1, 2, 3].map((i) => {
          const t = ((f + i * 38) % 150) / 150;
          return <Heart key={i} x={540 + Math.sin(t * 7 + i) * 40} y={1000 - t * 420} size={60 + i * 8} opacity={Math.sin(t * Math.PI)} />;
        })}
      </Svg>
      <Caption title="Они жили вместе, и в доме было тепло" sub="Муж и жена — одна семья" />
    </AbsoluteFill>
  );
};

// ---------- scene 2: argument ----------
const Scene2: React.FC = () => {
  const f = useCurrentFrame();
  const apart = interpolate(f, [0, 70], [0, 1], clamp);
  const shake = Math.sin(f * 1.7) * 6 * apart;
  const lx = 380 - apart * 110, rx = 700 + apart * 110;
  const lean = (Math.sin(f / 5) * 3 + 6) * apart;
  const talkL = Math.floor(f / 24) % 2 === 0;
  const flash = random(`fl${Math.floor(f / 6)}`) > 0.93 ? 0.35 : 0;
  const bubbles = ['!!!', '?!', '#@!', '!!'];
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg,#4a3a48 0%,#34283a 55%,#241b2b 100%)'}}>
      <Svg>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${((f * (0.8 + i * 0.4) + i * 400) % 1500) - 300},${430 + i * 90})`} opacity="0.85">
            <ellipse cx="0" cy="0" rx="190" ry="60" fill="#1b1420" />
            <ellipse cx="-90" cy="20" rx="120" ry="50" fill="#1b1420" />
            <ellipse cx="100" cy="24" rx="130" ry="46" fill="#1b1420" />
          </g>
        ))}
        <rect x="0" y="1480" width="1080" height="440" fill="#2a2030" />
        <Figure kind="man" x={lx + shake} y={1560} s={1.18} face={1} lean={lean} armF={talkL ? -150 : -95 + Math.sin(f / 3) * 12} armB={20} />
        <Figure kind="woman" x={rx - shake} y={1560} s={1.18} face={-1} lean={-lean} armF={!talkL ? -150 : -95 + Math.sin(f / 3) * 12} armB={20} />
        <Zig x={540} y={1100} size={2.2 + Math.sin(f / 4) * 0.3} opacity={0.5 + Math.sin(f / 3) * 0.4} />
        <Zig x={lx + 60} y={1000} size={1.1} opacity={0.9} />
        <Zig x={rx - 60} y={1000} size={1.1} opacity={0.9} />
        {talkL
          ? <Bubble x={lx + 40} y={880} text={bubbles[Math.floor(f / 48) % 4]} scale={1 + Math.sin(f / 2) * 0.04} />
          : <Bubble x={rx - 40} y={880} text={bubbles[(Math.floor(f / 48) + 2) % 4]} flip scale={1 + Math.sin(f / 2) * 0.04} />}
        <rect width="1080" height="1920" fill="#fff" opacity={flash} />
      </Svg>
      <Caption title="Но обиды копились — и мелкие ссоры стали криком" sub="Каждый хотел быть услышанным, но никто не слушал" color="#fff3e0" subColor="#e8cfc0" />
    </AbsoluteFill>
  );
};

// ---------- scene 3: divorce ----------
const Scene3: React.FC = () => {
  const f = useCurrentFrame();
  const apart = interpolate(f, [0, 60], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const split = interpolate(f, [60, 130], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg,#2c3e55 0%,#1c2a3c 100%)'}}>
      <Svg>
        {Array.from({length: 46}).map((_, i) => {
          const x = random(`rx${i}`) * 1080;
          const sp = 18 + random(`rs${i}`) * 14;
          const y = ((f * sp + random(`ry${i}`) * 2200) % 2200) - 150;
          return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 55} stroke="#a9c4e4" strokeWidth="4" opacity="0.45" strokeLinecap="round" />;
        })}
        <rect x="0" y="1480" width="1080" height="440" fill="#17222f" />
        <Figure kind="man" x={420 - apart * 220} y={1560} s={1.18} face={-1} lean={-5 * apart} armF={-4} armB={4} />
        <Figure kind="woman" x={660 + apart * 220} y={1560} s={1.18} face={1} lean={5 * apart} armF={-4} armB={4} />
        <g transform={`translate(540,1010)`}>
          <g transform={`translate(${-split * 70},${split * 40}) rotate(${-split * 18})`}>
            <path d="M0,30 C-70,-20 -50,-70 -22,-70 C-8,-70 0,-60 0,-50 L-12,-20 L8,0 L-10,30 Z" fill="#c43b5b" transform="scale(2.2)" />
          </g>
          <g transform={`translate(${split * 70},${split * 40}) rotate(${split * 18})`}>
            <path d="M0,30 C70,-20 50,-70 22,-70 C8,-70 0,-60 0,-50 L-12,-20 L8,0 L-10,30 Z" fill="#c43b5b" transform="scale(2.2)" />
          </g>
        </g>
      </Svg>
      <Caption title="И однажды прозвучало слово «развод»" sub="Дом, где был смех, замолчал" color="#eef3fa" subColor="#b7c7da" />
    </AbsoluteFill>
  );
};

// ---------- scene 4: ayahs ----------
const AYAHS = [
  {
    ar: 'وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا لِّتَسْكُنُوا إِلَيْهَا وَجَعَلَ بَيْنَكُم مَّوَدَّةً وَرَحْمَةً',
    ru: 'Среди Его знамений то, что Он сотворил для вас супруг из вас самих, чтобы вы обрели в них покой, и установил между вами любовь и милосердие.',
    ref: 'Коран, сура Ар-Рум, 30:21', dur: 165, arSize: 60,
  },
  {
    ar: 'وَعَاشِرُوهُنَّ بِالْمَعْرُوفِ',
    ru: 'Обращайтесь с ними достойно.',
    ref: 'Коран, сура Ан-Ниса, 4:19', dur: 125, arSize: 96,
  },
  {
    ar: 'فَإِمْسَاكٌ بِمَعْرُوفٍ أَوْ تَسْرِيحٌ بِإِحْسَانٍ',
    ru: 'Либо удерживайте их достойным образом, либо отпускайте с добротой.',
    ref: 'Коран, сура Аль-Бакара, 2:229', dur: 140, arSize: 80,
  },
  {
    ar: 'وَالصُّلْحُ خَيْرٌ',
    ru: '…а примирение — лучше.',
    ref: 'Коран, сура Ан-Ниса, 4:128', dur: 140, arSize: 110,
  },
];

const Ornament: React.FC<{y: number}> = ({y}) => (
  <g transform={`translate(540,${y})`} fill="none" stroke="#d9b45a" strokeWidth="4">
    <line x1="-300" y1="0" x2="-40" y2="0" />
    <line x1="40" y1="0" x2="300" y2="0" />
    <rect x="-14" y="-14" width="28" height="28" transform="rotate(45)" fill="#d9b45a" />
  </g>
);

const Ayah: React.FC<{a: typeof AYAHS[number]}> = ({a}) => {
  const f = useCurrentFrame();
  const o = fadeIO(f, a.dur, 20, 18);
  const ty = interpolate(f, [0, 25], [24, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{opacity: o, transform: `translateY(${ty}px)`, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{width: 920, textAlign: 'center'}}>
        <div dir="rtl" lang="ar" style={{fontFamily: 'Amiri, serif', fontSize: a.arSize, lineHeight: 1.9, color: '#f7e7b0'}}>
          ﴿ {a.ar} ﴾
        </div>
        <div style={{height: 56}} />
        <div style={{fontFamily: SANS, fontWeight: 500, fontSize: 46, lineHeight: 1.4, color: '#f4f1ea'}}>«{a.ru}»</div>
        <div style={{fontFamily: SANS, fontWeight: 500, fontSize: 34, color: '#d9b45a', marginTop: 40, letterSpacing: 1}}>{a.ref}</div>
      </div>
    </AbsoluteFill>
  );
};

const Scene4: React.FC = () => {
  const f = useCurrentFrame();
  let start = 0;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 20%,#14504a 0%,#0b2a2c 60%,#071a1d 100%)'}}>
      <Svg>
        {Array.from({length: 70}).map((_, i) => (
          <circle key={i} cx={random(`sx${i}`) * 1080} cy={random(`sy${i}`) * 1920} r={1.5 + random(`sr${i}`) * 3}
            fill="#fff" opacity={0.3 + 0.6 * Math.abs(Math.sin(f / 20 + i))} />
        ))}
        <g transform="translate(540,300)">
          <circle r="90" fill="#f7e7b0" />
          <circle cx="40" cy="-14" r="80" fill="#0e3a3c" />
        </g>
        <rect x="40" y="40" width="1000" height="1840" rx="40" fill="none" stroke="#d9b45a" strokeWidth="4" opacity="0.6" />
        <rect x="64" y="64" width="952" height="1792" rx="30" fill="none" stroke="#d9b45a" strokeWidth="2" opacity="0.4" />
        <Ornament y={1500} />
        <Ornament y={520} />
      </Svg>
      {AYAHS.map((a) => {
        const s = start; start += a.dur;
        return <Sequence key={s} from={s} durationInFrames={a.dur} layout="none"><Ayah a={a} /></Sequence>;
      })}
    </AbsoluteFill>
  );
};

// ---------- scene 5: reconciliation ----------
const Scene5: React.FC = () => {
  const f = useCurrentFrame();
  const near = interpolate(f, [0, 80], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const bob = Math.sin(f / 14) * 4;
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg,#ffe3b8 0%,#fbcf9d 45%,#bfe0c9 100%)'}}>
      <Svg>
        <circle cx="540" cy="700" r="170" fill="#fff2c4" opacity="0.8" />
        <rect x="0" y="1480" width="1080" height="440" fill="#8fc4a1" />
        <Figure kind="man" x={250 + near * 150} y={1560} s={1.18} face={1} dy={bob} armF={-30 - near * 40} />
        <Figure kind="woman" x={830 - near * 150} y={1560} s={1.18} face={-1} dy={-bob} armF={-30 - near * 40} />
        {[0, 1, 2, 3, 4].map((i) => {
          const t = ((f + i * 30) % 150) / 150;
          return <Heart key={i} x={540 + Math.sin(t * 6 + i * 2) * 70} y={1050 - t * 480} size={50 + i * 10} opacity={near * Math.sin(t * Math.PI)} />;
        })}
      </Svg>
      <Caption title="Примирение — лучше" sub="Берегите семью, говорите с добротой и прощайте друг друга" />
    </AbsoluteFill>
  );
};

// ---------- footer ----------
const Footer: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [10, 40], [0, 1], clamp);
  const big = f >= S.s5[0];
  return (
    <div style={{position: 'absolute', bottom: big ? 130 : 70, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: o}}>
      <div style={{
        fontFamily: SANS, fontWeight: 700, fontSize: big ? 46 : 34, letterSpacing: 1.5,
        color: '#fff', background: 'rgba(15,40,38,0.78)', padding: big ? '22px 46px' : '14px 34px',
        borderRadius: 999, border: '3px solid #d9b45a',
      }}>
        Created for the Hidayah channel
      </div>
    </div>
  );
};

// ---------- main ----------
const Fade: React.FC<{dur: number; children: React.ReactNode}> = ({dur, children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: interpolate(f, [0, 12, dur - 12, dur], [0, 1, 1, 0], clamp)}}>{children}</AbsoluteFill>;
};

export const Main: React.FC = () => {
  const scenes: [readonly [number, number], React.ReactNode][] = [
    [S.s1, <Scene1 />], [S.s2, <Scene2 />], [S.s3, <Scene3 />], [S.s4, <Scene4 />], [S.s5, <Scene5 />],
  ];
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {scenes.map(([[a, b], el], i) => (
        <Sequence key={i} from={a} durationInFrames={b - a} layout="none">
          <Fade dur={b - a}>{el}</Fade>
        </Sequence>
      ))}
      <Footer />
    </AbsoluteFill>
  );
};
