import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  gameIds: { id: string; title: string }[];
};

function useLSBoolean(key: string, fallback: boolean) {
  const [val, setVal] = React.useState<boolean>(() => {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  });
  React.useEffect(() => { localStorage.setItem(key, val ? '1' : '0'); }, [key, val]);
  return [val, setVal] as const;
}

export default function SettingsModal({ open, onClose, gameIds }: Props) {
  const [soundOn, setSoundOn] = useLSBoolean('soundOn', true);
  const [warmupOn, setWarmupOn] = useLSBoolean('warmupOn', true);
  const [hintsMap, setHintsMap] = React.useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const g of gameIds) {
      const k = `hintsOn:${g.id}`;
      const raw = localStorage.getItem(k);
      o[g.id] = raw === null ? true : raw === '1';
    }
    return o;
  });

  const setHints = (id: string, v: boolean) => {
    setHintsMap(prev => {
      const next = { ...prev, [id]: v };
      localStorage.setItem(`hintsOn:${id}`, v ? '1' : '0');
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <header className="modal-header">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="modal-body">
          <section>
            <h4>General</h4>
            <label className="row">
              <input type="checkbox" checked={soundOn} onChange={e=>setSoundOn(e.target.checked)} />
              <span>Sound effects</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={warmupOn} onChange={e=>setWarmupOn(e.target.checked)} />
              <span>Warmup (preload SVGs)</span>
            </label>
          </section>

          <section>
            <h4>Hints</h4>
            {gameIds.map(g => (
              <label key={g.id} className="row">
                <input
                  type="checkbox"
                  checked={hintsMap[g.id]}
                  onChange={e => setHints(g.id, e.target.checked)}
                />
                <span>{g.title}</span>
              </label>
            ))}
          </section>
        </div>

        <footer className="modal-footer">
          <button className="btn" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}

