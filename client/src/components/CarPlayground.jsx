import { useEffect, useRef, useState } from 'react';
import CarArt from './CarArt.jsx';

// A little physics toy: drag the car around, fling it, spin it, flip it.
export default function CarPlayground({ car }) {
  const stage = useRef(null);
  const el = useRef(null);
  const s = useRef({ x: 0, y: 0, rot: 0, scale: 1, fx: 1, fy: 1, vx: 0, vy: 0, vr: 0, dragging: null });
  const raf = useRef(0);
  const [, force] = useState(0);

  const render = () => {
    const { x, y, rot, scale, fx, fy } = s.current;
    if (el.current) el.current.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale * fx}, ${scale * fy})`;
  };

  const animate = () => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      const st = s.current;
      if (st.dragging) return;
      const box = stage.current?.getBoundingClientRect();
      if (!box) return;
      st.x += st.vx;
      st.y += st.vy;
      st.rot += st.vr;
      st.vx *= 0.95;
      st.vy *= 0.95;
      st.vr *= 0.96;
      const limX = box.width / 2 - 50;
      const limY = box.height / 2 - 30;
      if (Math.abs(st.x) > limX) {
        st.x = Math.sign(st.x) * limX;
        st.vx *= -0.7;
        st.vr += st.vy * 0.4;
      }
      if (Math.abs(st.y) > limY) {
        st.y = Math.sign(st.y) * limY;
        st.vy *= -0.7;
        st.vr -= st.vx * 0.4;
      }
      render();
      if (Math.abs(st.vx) + Math.abs(st.vy) + Math.abs(st.vr) > 0.05) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const reset = () => {
    Object.assign(s.current, { x: 0, y: 0, rot: 0, scale: 1, fx: 1, fy: 1, vx: 0, vy: 0, vr: 0 });
    el.current?.classList.add('smooth');
    render();
    setTimeout(() => el.current?.classList.remove('smooth'), 400);
  };

  useEffect(() => {
    reset();
    return () => cancelAnimationFrame(raf.current);
  }, [car?.id]);

  const center = () => {
    const box = stage.current.getBoundingClientRect();
    return { cx: box.left + box.width / 2 + s.current.x, cy: box.top + box.height / 2 + s.current.y };
  };

  const onPointerDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    cancelAnimationFrame(raf.current);
    const st = s.current;
    st.vx = st.vy = st.vr = 0;
    const { cx, cy } = center();
    st.dragging = {
      mode,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
      angle0: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI - st.rot,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const st = s.current;
    const d = st.dragging;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(now - d.lastT, 1);
    if (d.mode === 'move') {
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      st.x += dx;
      st.y += dy;
      st.vx = (dx / dt) * 16;
      st.vy = (dy / dt) * 16;
    } else {
      const { cx, cy } = center();
      const a = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI - d.angle0;
      st.vr = ((a - st.rot) / dt) * 16;
      st.rot = a;
    }
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = now;
    render();
  };

  const onPointerUp = () => {
    const st = s.current;
    if (!st.dragging) return;
    if (performance.now() - st.dragging.lastT > 80) st.vx = st.vy = st.vr = 0;
    st.dragging = null;
    animate();
  };

  const tween = (fn) => {
    el.current?.classList.add('smooth');
    fn(s.current);
    render();
    setTimeout(() => {
      el.current?.classList.remove('smooth');
      animate(); // nudges it back inside the stage if it ended up past an edge
    }, 400);
    force((n) => n + 1);
  };

  const onWheel = (e) => {
    e.preventDefault();
    s.current.rot += e.deltaY * 0.2;
    render();
  };
  useEffect(() => {
    const node = stage.current;
    node?.addEventListener('wheel', onWheel, { passive: false });
    return () => node?.removeEventListener('wheel', onWheel);
  }, []);

  if (!car) return null;

  return (
    <div className="playground card">
      <div className="playground-head">
        <div>
          <div className="eyebrow">Garage toy</div>
          <h3>{car.name}</h3>
        </div>
        <span className="plate">{car.plate || 'NO PLATE'}</span>
      </div>

      <div className="stage" ref={stage} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="stage-grid" />
        <div
          className="toy"
          ref={el}
          onPointerDown={(e) => onPointerDown(e, 'move')}
          onDoubleClick={() => tween((st) => (st.fx *= -1))}
          title="Drag & fling me · double-click to flip · scroll to spin"
        >
          <div className="rotate-handle" onPointerDown={(e) => onPointerDown(e, 'rotate')} title="Drag to rotate">
            <span />
          </div>
          {car.photo ? (
            <img src={car.photo} alt={car.name} draggable={false} />
          ) : (
            <CarArt style={car.style} paint={car.paint} interior={car.interior} title={car.name} />
          )}
        </div>
        <div className="stage-hint">drag · fling · twist the knob</div>
      </div>

      <div className="toy-controls">
        <button className="chip" onClick={() => tween((st) => (st.fx *= -1))} title="Flip horizontally">⇋ Flip</button>
        <button className="chip" onClick={() => tween((st) => (st.fy *= -1))} title="Flip upside down">⇅ Flip</button>
        <button className="chip" onClick={() => tween((st) => (st.rot -= 90))} title="Rotate left">⟲ 90°</button>
        <button className="chip" onClick={() => tween((st) => (st.rot += 90))} title="Rotate right">⟳ 90°</button>
        <button className="chip" onClick={() => tween((st) => (st.scale = Math.min(st.scale + 0.15, 1.8)))}>＋</button>
        <button className="chip" onClick={() => tween((st) => (st.scale = Math.max(st.scale - 0.15, 0.5)))}>－</button>
        <button
          className="chip"
          onClick={() => {
            s.current.vr = 40;
            animate();
          }}
        >
          🌀 Spin
        </button>
        <button className="chip" onClick={reset}>↺ Reset</button>
      </div>

      <dl className="car-facts">
        <div><dt>Model</dt><dd>{[car.year, car.make, car.model].filter(Boolean).join(' ') || '—'}</dd></div>
        <div><dt>Color</dt><dd>{car.color || '—'}</dd></div>
        <div><dt>Interior</dt><dd>{car.interior || '—'}</dd></div>
        <div>
          <dt>Insurance</dt>
          <dd>
            {car.insurance?.length ? (
              <a href={car.insurance[car.insurance.length - 1].url} target="_blank" rel="noreferrer">View proof ↗</a>
            ) : (
              'Not uploaded'
            )}
          </dd>
        </div>
      </dl>
      {car.pickupInstructions && (
        <div className="pickup">
          <dt>Pickup</dt>
          <dd>{car.pickupInstructions}</dd>
        </div>
      )}
    </div>
  );
}
