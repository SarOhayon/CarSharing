import CarArt from '../components/CarArt.jsx';
import { Empty } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function InsurancePage({ cars, me }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Glovebox</div>
        <h1 className="page-title">Insurance & registration</h1>
        <p className="muted">Everyone in the family can open these — handy if you get pulled over or need to file a claim.</p>
      </div>
      <div className="insurance-grid">
        {cars.map((c) => (
          <div key={c.id} className="card pad insurance-card">
            <div className="ins-head">
              <div className="car-thumb">{c.photo ? <img src={c.photo} alt="" /> : <CarArt style={c.style} paint={c.paint} interior={c.interior} />}</div>
              <div>
                <h3>{c.name}</h3>
                <span className="plate">{c.plate || 'NO PLATE'}</span>
              </div>
            </div>
            {c.insurance.length === 0 ? (
              <Empty icon="file" title="No documents yet">{me.isAdmin ? 'Upload them in the Admin tab.' : 'Ask Sarah to upload them.'}</Empty>
            ) : (
              <div className="list">
                {[...c.insurance].reverse().map((d) => (
                  <a key={d.id} className="doc" href={d.url} target="_blank" rel="noreferrer">
                    <span className="doc-icon"><Icon name={d.mime === 'application/pdf' ? 'file' : 'image'} size={20} /></span>
                    <span className="grow">
                      <strong>{d.name}</strong>
                      <small className="muted">
                        Uploaded {new Date(d.uploadedAt).toLocaleDateString()}
                        {d.expires && ` · expires ${d.expires}`}
                      </small>
                    </span>
                    {d.expires && d.expires < today && <span className="pill bad">expired</span>}
                    <Icon name="external" size={16} className="muted" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
