import { useEffect, useMemo } from 'react';

const CARS = ['🚗', '🚙', '🏎️', '🚕', '🚓', '🛻', '🚘'];
const DURATION_MS = 20_000;

// Dance mode: the page shifts through colors, cards wiggle, and cars rain
// down. Stops by itself after 20 seconds, or with the Stop button / Escape.
export default function DanceParty({ onStop }) {
  const drops = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        car: CARS[i % CARS.length],
        left: Math.random() * 100,
        size: 22 + Math.random() * 30,
        duration: 3.5 + Math.random() * 4,
        delay: -Math.random() * 7,
        sway: (Math.random() - 0.5) * 160,
      })),
    [],
  );

  useEffect(() => {
    document.documentElement.classList.add('dancing');
    const timer = setTimeout(onStop, DURATION_MS);
    const onKey = (e) => e.key === 'Escape' && onStop();
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('dancing');
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onStop]);

  return (
    <>
      <div className="disco-lights" aria-hidden="true" />
      <div className="car-rain" aria-hidden="true">
        {drops.map((d) => (
          <span
            key={d.id}
            style={{
              left: `${d.left}%`,
              fontSize: d.size,
              animationDuration: `${d.duration}s`,
              animationDelay: `${d.delay}s`,
              '--sway': `${d.sway}px`,
            }}
          >
            {d.car}
          </span>
        ))}
      </div>
      <button className="primary stop-dance" onClick={onStop}>
        Stop dancing
      </button>
    </>
  );
}
