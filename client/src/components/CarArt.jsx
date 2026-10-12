// Side-view illustrations used until an admin uploads a real photo.
const SHAPES = {
  sedan: {
    body: 'M20,120 Q20,96 52,90 L122,82 Q152,50 202,46 Q262,43 302,76 L352,86 Q382,92 382,112 L382,126 Q382,133 372,133 L30,133 Q20,133 20,120 Z',
    glass: 'M138,82 Q162,57 202,53 Q246,51 286,79 Z',
    pillars: ['M214,52 L210,82'],
    wheels: [96, 308],
    aero: true,
  },
  crossover: {
    body: 'M20,124 Q20,96 50,88 L112,78 Q146,40 202,36 Q266,34 312,72 L354,82 Q382,88 382,110 L382,127 Q382,135 372,135 L30,135 Q20,135 20,124 Z',
    glass: 'M128,79 Q156,48 202,45 Q252,44 294,75 Z',
    pillars: ['M216,45 L212,79'],
    wheels: [96, 308],
    aero: true,
  },
  boxy: {
    body: 'M30,128 L30,38 Q30,30 38,30 L292,30 Q300,30 302,38 L312,82 L372,86 Q382,87 382,97 L382,128 Q382,135 374,135 L38,135 Q30,135 30,128 Z',
    glass: 'M42,40 L290,40 L299,80 L42,80 Z',
    pillars: ['M110,40 L110,80', 'M180,40 L180,80', 'M244,40 L246,80'],
    wheels: [100, 304],
    spare: true,
    flat: true,
  },
  suv: {
    body: 'M18,128 L18,82 Q18,71 30,69 L64,62 L98,34 Q103,29 112,29 L284,29 Q300,29 310,41 L336,73 L370,80 Q384,84 384,100 L384,128 Q384,136 374,136 L28,136 Q18,136 18,128 Z',
    glass: 'M102,39 L282,39 Q293,39 300,48 L320,72 L72,72 Z',
    pillars: ['M160,39 L156,72', 'M228,39 L226,72'],
    wheels: [98, 312],
    grille: true,
  },
};

export default function CarArt({ style = 'sedan', paint = '#7c8188', interior, className, title }) {
  const s = SHAPES[style] || SHAPES.sedan;
  const gid = `g-${style}-${paint.slice(1)}`;
  const red = interior && /red/i.test(interior);
  return (
    <svg viewBox="0 0 400 170" className={className} role="img" aria-label={title || 'Car'}>
      <defs>
        <linearGradient id={`${gid}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={`${gid}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cfe3f5" />
          <stop offset="1" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <ellipse cx="200" cy="158" rx="180" ry="9" fill="#000" opacity="0.18" />
      {s.spare && (
        <g>
          <circle cx="22" cy="100" r="22" fill="#1f2937" />
          <circle cx="22" cy="100" r="12" fill={paint} stroke="#111" strokeWidth="2" />
        </g>
      )}
      <path d={s.body} fill={paint} />
      <path d={s.body} fill={`url(#${gid}-shine)`} />
      <path d={s.glass} fill={`url(#${gid}-glass)`} opacity="0.92" />
      {red && (
        <g fill="#b91c1c" opacity="0.9">
          <rect x={s.flat ? 150 : 160} y="58" width="18" height="22" rx="5" />
          <rect x={s.flat ? 252 : 240} y="56" width="18" height="24" rx="5" />
        </g>
      )}
      {s.pillars.map((d) => (
        <path key={d} d={d} stroke={paint} strokeWidth="7" />
      ))}
      {/* door seams and handles */}
      <path d={`M${s.wheels[0] + 70},${s.flat ? 86 : 86} L${s.wheels[0] + 66},128`} stroke="#000" strokeOpacity="0.25" strokeWidth="1.5" />
      <rect x={s.wheels[0] + 90} y="98" width="18" height="4" rx="2" fill="#000" opacity="0.25" />
      <rect x={s.wheels[1] - 70} y="98" width="18" height="4" rx="2" fill="#000" opacity="0.25" />
      {/* lights */}
      <rect x={s.flat ? 368 : 366} y={s.flat ? 92 : 96} width="14" height="8" rx="4" fill="#fef9c3" />
      <rect x="18" y={s.flat ? 92 : 98} width="10" height="9" rx="3" fill="#ef4444" />
      {s.grille && <rect x="372" y="88" width="10" height="26" rx="3" fill="#cbd5e1" />}
      {s.wheels.map((x) => (
        <g key={x}>
          <circle cx={x} cy="133" r="29" fill="#0b0f19" />
          <circle cx={x} cy="133" r="18" fill={s.aero ? '#374151' : '#cbd5e1'} />
          {[0, 72, 144, 216, 288].map((a) => (
            <rect
              key={a}
              x={x - 2}
              y="117"
              width="4"
              height="16"
              rx="2"
              fill={s.aero ? '#6b7280' : '#94a3b8'}
              transform={`rotate(${a} ${x} 133)`}
            />
          ))}
          <circle cx={x} cy="133" r="5" fill="#111827" />
        </g>
      ))}
    </svg>
  );
}
