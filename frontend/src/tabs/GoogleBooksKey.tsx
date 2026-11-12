import { useEffect, useState } from 'react';
import { Card } from './parts.tsx';

interface KeyStatus {
  configured: boolean;
  source: 'env' | 'app' | null;
  last4?: string;
}

const API = '/api/settings/google-books';

async function call<T>(method: string, path = API, body?: unknown): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

function statusLine(s: KeyStatus | null): string {
  if (!s) return 'Loading…';
  if (!s.configured) return 'No key — lookups may hit the shared quota';
  return s.source === 'env' ? 'Key set via .env' : `Key set ✓ (…${s.last4 ?? ''}, from app)`;
}

const STEPS = [
  <>Go to <b>console.cloud.google.com</b> and create or select a project.</>,
  <>APIs &amp; Services → Library → enable <b>Books API</b>.</>,
  <>APIs &amp; Services → Credentials → Create credentials → <b>API key</b>.</>,
  <>Optional: restrict the key to the Books API.</>,
  <>Paste the key below. It starts with <b>AIza</b>.</>,
];

/** ARCHIVES: set the Google Books API key used by the cover lookup (stored server-side; .env wins). The key
 *  is never sent back to the browser: the server only reports whether one is set and its last 4 characters. */
export function GoogleBooksKey() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<KeyStatus>('GET').then((r) => setStatus(r.data), () => setMsg('⚠ server offline'));
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      setMsg(await fn());
    } catch {
      setMsg('⚠ server offline');
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => {
    const r = await call<KeyStatus & { error?: string }>('PUT', API, { key: input });
    if (!r.ok) return `⚠ ${r.data.error ?? 'could not save'}`;
    setStatus(r.data);
    setInput('');
    return 'Saved.';
  });
  const remove = () => run(async () => {
    const r = await call<KeyStatus>('DELETE');
    setStatus(r.data);
    return 'Removed.';
  });
  const test = () => run(async () => {
    const r = await call<{ ok: boolean; message?: string }>('POST', `${API}/test`);
    return r.data.ok ? 'Key works ✓' : `⚠ ${r.data.message ?? 'test failed'}`;
  });

  const steps = (
    <ol className="gbk__steps">
      {STEPS.map((s, i) => <li key={i}>{s}</li>)}
    </ol>
  );

  return (
    <Card title="Google Books API key">
      <div className="gbk">
        <div className="gbk__status">{statusLine(status)}</div>
        {status && !status.configured ? steps : (
          <details className="gbk__details">
            <summary>How to get a key</summary>
            {steps}
          </details>
        )}
        {status?.source === 'env' && <div className="gbk__note">A key in .env takes precedence over one saved here, so saving is disabled. Remove it from .env to manage the key in the app.</div>}
        <input
          className="parts-input"
          type="password"
          autoComplete="off"
          placeholder="AIza…"
          aria-label="Google Books API key"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="gbk__buttons">
          <button className="parts-button" disabled={busy || status?.source === 'env' || input.trim() === ''} onClick={save}>Save</button>
          <button className="parts-button" disabled={busy || status?.source !== 'app'} onClick={remove}>Remove</button>
          <button className="parts-button" disabled={busy || !status?.configured} onClick={test}>Test</button>
        </div>
        {msg && <div className="gbk__msg">{msg}</div>}
      </div>
    </Card>
  );
}
