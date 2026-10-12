import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onColor } from '../util.js';
import Icon from './Icon.jsx';

export function Modal({ title, onClose, children, footer, wide }) {
  // Touch devices fire a synthetic mousedown right after the tap that opened
  // the modal; ignore backdrop presses for a moment so it doesn't close itself.
  const [openedAt] = useState(() => Date.now());
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && Date.now() - openedAt > 400 && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ user, size = 32 }) {
  if (!user) return null;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: user.color, color: onColor(user.color) }}
      title={user.name}
    >
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const t = { id: Math.random(), message, kind };
    setToasts((x) => [...x, t]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function ColorPicker({ value, onChange, palette }) {
  return (
    <div className="color-picker">
      {palette.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch ${value === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
      <label className="swatch custom" title="Custom color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        +
      </label>
    </div>
  );
}

export function Empty({ icon, title, children }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon"><Icon name={icon} size={28} strokeWidth={1.6} /></div>}
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  );
}
