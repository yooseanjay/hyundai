// 보안 3단계 · 잠금 화면: PIN이 맞아야 금고 키가 풀리고 앱(일기·대화·차량 상태)이 열린다
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { MAX_FAILS, PIN_RULE, unlockWithPin } from '../security';

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [, tick] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [waitUntil]);

  const wait = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!PIN_RULE.test(pin) || busy || wait) return;
    setBusy(true);
    const r = await unlockWithPin(pin);
    setBusy(false);
    setPin('');
    if (r.ok) return onUnlock();
    if (r.wiped) {
      setMsg(`PIN을 ${MAX_FAILS}번 틀려서 보호를 위해 기록을 모두 지웠어요.`);
      setTimeout(() => location.reload(), 2500);
      return;
    }
    setWaitUntil(Date.now() + r.waitMs);
    setMsg(r.left <= 5 ? `PIN이 달라요. ${r.left}번 더 틀리면 기록이 지워져요.` : 'PIN이 달라요.');
  }

  return (
    <main className="app lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <span className="lock-icon"><LockKeyhole size={26} /></span>
        <h1 className="h1">잠겨 있어요</h1>
        <p className="body muted">일기 · 대화 · 차량 상태는 이 기기에서 암호화되어 있어요.<br />PIN을 입력하면 열려요.</p>
        <input
          ref={input} className="pin-input" type="password" inputMode="numeric" autoComplete="off" pattern="\d*"
          maxLength={8} value={pin} aria-label="PIN" placeholder="••••••"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn primary" disabled={!PIN_RULE.test(pin) || busy || wait > 0}>
          {busy ? '확인 중…' : wait ? `${wait}초 뒤에 다시` : '열기'}
        </button>
        {msg && <p className="cap" role="alert">{msg}</p>}
        <p className="cap lock-foot">AES-256-GCM · PBKDF2 310,000회 · 키는 이 기기 밖으로 나가지 않아요</p>
      </form>
    </main>
  );
}
