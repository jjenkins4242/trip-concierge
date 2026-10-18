import { useState } from 'preact/hooks';
import { supabase, errMsg } from '../lib/supabase.js';
import { Icon } from './ui.jsx';

export function Auth({ inviteCode }) {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('tc.hasAccount') ? 'signin' : 'join'; } catch { return 'join'; } });
  const [f, setF] = useState({ name: '', email: '', password: '', code: inviteCode || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = k => e => setF({ ...f, [k]: e.currentTarget.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (mode === 'join') {
        const { error } = await supabase.rpc('register_traveler', { p_email: f.email, p_password: f.password, p_name: f.name, p_code: f.code });
        if (error) throw error;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
      if (error) throw error;
      try { localStorage.setItem('tc.hasAccount', '1'); } catch {}
    } catch (e2) {
      const m = errMsg(e2);
      setErr(/invalid login/i.test(m) ? (mode === 'signin' ? 'No account matches that email and password. First time here? Tap "Create account" above.' : 'Account created, but sign-in failed. Try Sign in.') : m);
    } finally { setBusy(false); }
  }

  return (
    <div class="auth">
      <div class="auth-hero">
        <div class="stamp">CONCIERGE<span>✦ est. 2026 ✦</span></div>
        <h1>Your trip,<br /><em>beautifully handled.</em></h1>
        <p class="muted">Places near you, routes with things to see on the way, a shared calendar and one photo album for the two of you, updated live on both phones.</p>
      </div>
      <form class="card auth-card" onSubmit={submit}>
        <div class="seg">
          <button type="button" class={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>Create account</button>
          <button type="button" class={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>Sign in</button>
        </div>
        {mode === 'join' && (
          <>
            <label>Invite code<input value={f.code} onInput={up('code')} placeholder="PARIS-XXXXX" autocapitalize="characters" required /></label>
            <label>Your first name<input value={f.name} onInput={up('name')} placeholder="Jay" autocomplete="given-name" required /></label>
          </>
        )}
        <label>Email<input type="email" value={f.email} onInput={up('email')} autocomplete="email" inputmode="email" required /></label>
        <label>Password<input type="password" value={f.password} onInput={up('password')} minlength={6} autocomplete={mode === 'join' ? 'new-password' : 'current-password'} required />
          {mode === 'join' && <small class="muted">At least 6 characters. You'll stay signed in on this phone.</small>}
        </label>
        {err && <div class="err">{err}</div>}
        <button class="btn primary big" disabled={busy}>{busy ? 'One moment…' : mode === 'join' ? 'Create my account' : 'Sign in'} <Icon name="chevron" /></button>
      </form>
    </div>
  );
}
