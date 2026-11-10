// 보안 3단계 · 내 정보 보호 설정: 저장 암호화 상태, PIN 잠금, 내 데이터 완전 삭제(키 파기)
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { disablePin, enablePin, eraseEverything, PIN_RULE, vault } from '../security';

type Step = 'idle' | 'new' | 'confirm';

export default function SecurityPanel() {
  const [mode, setMode] = useState(vault.mode);
  const [step, setStep] = useState<Step>('idle');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function next(e: React.FormEvent) {
    e.preventDefault();
    if (!PIN_RULE.test(pin)) return setMsg('숫자 6~8자리로 정해 주세요.');
    if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return setMsg('너무 쉬운 PIN이에요. 다른 숫자로 해 주세요.');
    if (step === 'new') { setFirst(pin); setPin(''); setStep('confirm'); return setMsg('한 번 더 입력해 주세요.'); }
    if (pin !== first) { setPin(''); setStep('new'); return setMsg('두 PIN이 달라요. 처음부터 다시 입력해 주세요.'); }
    setBusy(true);
    try {
      await enablePin(pin);
      setMode('pin'); setStep('idle'); setMsg('PIN 잠금을 켰어요. 기록을 새 키로 다시 암호화했어요.');
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false); setPin(''); setFirst('');
    }
  }

  async function off() {
    if (!confirm('PIN 잠금을 끌까요? 기록은 계속 이 기기에서 암호화돼요.')) return;
    setBusy(true);
    await disablePin();
    setBusy(false); setMode('device'); setMsg('PIN 잠금을 껐어요.');
  }

  async function erase() {
    if (!confirm('일기·대화 설정·차량 기록을 모두 지울까요?\n암호 키를 파기하므로 되돌릴 수 없어요.')) return;
    await eraseEverything();
  }

  return (
    <section className="card security-panel" aria-label="내 정보 보호">
      <span className="card-head"><b className="label"><ShieldCheck size={16} /> 내 정보 보호</b><em className="badge">AES-256</em></span>
      <ul className="sec-list cap">
        <li>일기 · 차량 상태 · 주차 위치 · 설정은 이 기기에서만 <b>암호화</b>해 저장해요{vault.persistent ? '' : ' (지금은 저장 없이 이번 실행에만)'}.</li>
        <li>AI에게 보내는 말에서 전화번호 · 주민번호 · 차량번호 · 상세 위치는 <b>자동으로 가려요</b>.</li>
        <li>현대 계정 토큰은 브라우저에 오지 않고, 본인 차량만 조회돼요.</li>
      </ul>

      {step === 'idle' ? (
        <div className="row-center sec-actions">
          {mode === 'pin' ? (
            <>
              <button className="btn sm outline" disabled={busy} onClick={() => { setStep('new'); setMsg(''); }}>PIN 바꾸기</button>
              <button className="btn sm outline" disabled={busy} onClick={off}>PIN 잠금 끄기</button>
              <button className="btn sm outline" onClick={() => vault.lock()}>지금 잠그기</button>
            </>
          ) : (
            <button className="btn sm primary" onClick={() => { setStep('new'); setMsg(''); }}>PIN 잠금 켜기</button>
          )}
        </div>
      ) : (
        <form className="sec-form" onSubmit={next}>
          <input
            className="pin-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} autoFocus
            aria-label={step === 'new' ? '새 PIN' : 'PIN 확인'} placeholder={step === 'new' ? '새 PIN (숫자 6~8자리)' : 'PIN 한 번 더'}
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          <div className="row-center sec-actions">
            <button type="button" className="btn sm outline" onClick={() => { setStep('idle'); setPin(''); setFirst(''); setMsg(''); }}>취소</button>
            <button className="btn sm primary" disabled={busy}>{busy ? '암호화 중…' : step === 'new' ? '다음' : '저장'}</button>
          </div>
        </form>
      )}
      {msg && <p className="cap" role="status">{msg}</p>}
      <button className="btn text sec-erase" onClick={erase}>내 데이터 완전 삭제</button>
    </section>
  );
}
