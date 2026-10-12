import { useEffect, useRef, useState } from 'react';
import CarArt from './CarArt.jsx';
import Icon from './Icon.jsx';

// The selected car, which you can turn by dragging the car (or its knob).
export default function CarPlayground({ car }) {
  const stage = useRef(null);
  const [rot, setRot] = useState(0);
  const [smooth, setSmooth] = useState(false);
  const drag = useRef(null);

  useEffect(() => setRot(0), [car?.id]);

  const angleAt = (e) => {
    const box = stage.current.getBoundingClientRect();
    return (Math.atan2(e.clientY - (box.top + box.height / 2), e.clientX - (box.left + box.width / 2)) * 180) / Math.PI;
  };

  const onDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSmooth(false);
    drag.current = angleAt(e) - rot;
  };
  const onMove = (e) => {
    if (drag.current !== null) setRot(angleAt(e) - drag.current);
  };
  const onUp = () => (drag.current = null);

  const turn = (deg) => {
    setSmooth(true);
    setRot((r) => (deg === null ? 0 : r + deg));
  };

  if (!car) return null;

  return (
    <div className="playground card">
      <div className="playground-head">
        <div>
          <div className="eyebrow">Selected car</div>
          <h3>{car.name}</h3>
        </div>
        <span className="plate">{car.plate || 'NO PLATE'}</span>
      </div>

      <div className="stage" ref={stage}>
        <div className="stage-grid" />
        <div
          className={`toy ${smooth ? 'smooth' : ''}`}
          style={{ transform: `translate(-50%, -50%) rotate(${rot}deg)` }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          title="Drag to turn the car"
        >
          <div className="rotate-handle"><span /></div>
          {car.photo ? (
            <img src={car.photo} alt={car.name} draggable={false} />
          ) : (
            <CarArt style={car.style} paint={car.paint} interior={car.interior} title={car.name} />
          )}
        </div>
        <div className="stage-hint">Drag to turn</div>
      </div>

      <div className="toy-controls">
        <button className="chip" onClick={() => turn(-90)} title="Turn left">
          <Icon name="rotateLeft" size={14} /> Turn left
        </button>
        <button className="chip" onClick={() => turn(90)} title="Turn right">
          <Icon name="rotateRight" size={14} /> Turn right
        </button>
        <button className="chip" onClick={() => turn(null)}>Reset</button>
      </div>

      <dl className="car-facts">
        <div><dt>Model</dt><dd>{[car.year, car.make, car.model].filter(Boolean).join(' ') || '—'}</dd></div>
        <div><dt>Color</dt><dd>{car.color || '—'}</dd></div>
        <div><dt>Interior</dt><dd>{car.interior || '—'}</dd></div>
        <div>
          <dt>Insurance</dt>
          <dd>
            {car.insurance?.length ? (
              <a href={car.insurance[car.insurance.length - 1].url} target="_blank" rel="noreferrer" className="inline-link">
                View proof <Icon name="external" size={13} />
              </a>
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
