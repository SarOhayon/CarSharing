import Icon from './Icon.jsx';

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;

// File slot for attaching proof (tickets, schedules, screenshots) to a request.
export function ProofPicker({ files, onChange, onError }) {
  const add = (list) => {
    const next = [...files];
    for (const f of list) {
      if (next.length >= MAX_FILES) return onError?.(`Up to ${MAX_FILES} files`);
      if (f.size > MAX_BYTES) return onError?.(`${f.name} is over 15 MB`);
      if (!/^image\//.test(f.type) && f.type !== 'application/pdf') return onError?.(`${f.name}: only photos and PDFs`);
      next.push(f);
    }
    onChange(next);
  };

  return (
    <div className="proof-picker">
      <span className="label">
        Proof <span className="hint">optional — a ticket, schedule or screenshot helps it get approved</span>
      </span>
      <label className="proof-drop">
        <Icon name="paperclip" size={16} />
        <span>{files.length ? 'Add another file' : 'Attach photos or PDFs'}</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = '';
          }}
        />
      </label>
      {files.length > 0 && (
        <div className="proof-chips">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="proof-chip">
              <Icon name={f.type === 'application/pdf' ? 'file' : 'image'} size={14} />
              <span className="proof-name">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <Icon name="x" size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Links to proof already attached to a request.
export function ProofLinks({ item }) {
  if (!item.proof?.length) return null;
  return (
    <div className="proof-chips">
      {item.proof.map((p) => (
        <a key={p.id} className="proof-chip" href={`/api/requests/${item.id}/proof/${p.id}`} target="_blank" rel="noreferrer">
          <Icon name="paperclip" size={13} />
          <span className="proof-name">{p.name}</span>
        </a>
      ))}
    </div>
  );
}

export function requestFormData({ carId, start, end, note, files, reapplyOf }) {
  const fd = new FormData();
  fd.append('carId', carId);
  fd.append('start', new Date(start).toISOString());
  fd.append('end', new Date(end).toISOString());
  fd.append('note', note || '');
  fd.append('request', 'true');
  if (reapplyOf) fd.append('reapplyOf', reapplyOf);
  for (const f of files || []) fd.append('proof', f);
  return fd;
}
