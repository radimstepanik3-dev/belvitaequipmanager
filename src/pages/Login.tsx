import { useState } from 'react';
import { cloud } from '../lib/backend';
import { Button, Field, Input } from '../components/ui';
import { Logo } from '../components/Layout';
import { errorMessage } from '../lib/util';

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloud) return;
    setBusy(true);
    setMsg(null);
    const { error } = await cloud.client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg({ text: error.message === 'Invalid login credentials' ? 'Nesprávný e-mail nebo heslo.' : error.message });
    else onLoggedIn();
  };

  const reset = async () => {
    if (!cloud || !email) return setMsg({ text: 'Vyplňte e-mail.' });
    try {
      const { error } = await cloud.client.auth.resetPasswordForEmail(email, { redirectTo: location.href });
      if (error) throw error;
      setMsg({ text: 'Odkaz pro nastavení hesla byl odeslán na e-mail.', ok: true });
    } catch (e) {
      setMsg({ text: errorMessage(e) });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-2xl bg-slate-800 p-6 shadow-xl">
        <Logo />
        <p className="text-sm text-slate-300">Přihlaste se svým firemním účtem.</p>
        <Field label="E-mail">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Heslo">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {msg && <div className={msg.ok ? 'text-sm text-emerald-400' : 'text-sm text-rose-400'}>{msg.text}</div>}
        <Button variant="primary" className="w-full" busy={busy}>
          Přihlásit
        </Button>
        <div className="flex justify-between text-xs">
          <button type="button" className="text-slate-400 hover:text-white" onClick={reset}>
            Zapomenuté heslo
          </button>
        </div>
      </form>
    </div>
  );
}
