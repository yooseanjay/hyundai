// 차량 SDK 콘솔 (주소에 ?vehicle) — 내 기능을 만들기 전에 차에서 무엇이 읽히고 · 움직이고 · 구독되는지 바로 확인하는 개발 화면
//  - 차 앱(안드로이드) 안: 실제 Pleos Vehicle SDK 를 부름 (제어는 개발용 debug APK 에서만)
//  - 개발 서버 ?fakecar: 가짜 차(src/pleos/fakeVehicle.ts)
//  - 그냥 브라우저: 연결 없음 안내만

import { useEffect, useMemo, useRef, useState } from 'react';
import { inPleosApp, nativeCaps } from '../pleos/native';
import {
  callVehicle, onVehicleEvent, userParams, vehicleSchema,
  type MethodSchema, type ParamSchema, type VehicleSchema, type MethodKind,
} from '../pleos/vehicle';

interface Result { ok: boolean; text: string; at: number }
interface Log { at: number; tone: 'ok' | 'err' | 'event' | 'info'; text: string }

const KIND_LABEL: Record<MethodKind, string> = { get: '읽기', set: '제어', register: '구독', unregister: '구독 해제', capability: '지원 여부' };
const KIND_ORDER: MethodKind[] = ['get', 'set', 'register', 'capability'];

const show = (v: unknown): string => {
  if (v === undefined) return '—';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};
const clock = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour12: false });

function defaultArg(p: ParamSchema): string {
  if (p.kind === 'enum') return p.values?.[0] ?? '';
  if (p.kind === 'bool') return 'true';
  if (p.kind === 'int' || p.kind === 'float') return '0';
  return '';
}
function parseArg(p: ParamSchema, raw: string): unknown {
  if (p.kind === 'bool') return raw === 'true';
  if (p.kind === 'int') return Math.round(Number(raw));
  if (p.kind === 'float') return Number(raw);
  if (p.kind === 'int[]') return raw.split(/[,\s]+/).filter(Boolean).map(Number);
  if (p.kind === 'unknown') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

export default function VehicleConsole() {
  const [schema, setSchema] = useState<VehicleSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [args, setArgs] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [subs, setSubs] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const live = inPleosApp();
  const subsRef = useRef(subs);
  subsRef.current = subs;

  const log = (tone: Log['tone'], text: string) => setLogs((l) => [{ at: Date.now(), tone, text }, ...l].slice(0, 300));

  async function load(refresh = false) {
    setLoading(true);
    const s = await vehicleSchema(refresh);
    setSchema(s);
    setLoading(false);
    if (s && !domain) setDomain(Object.keys(s.domains)[0] ?? '');
    if (s) log('info', `함수 목록: 도메인 ${Object.keys(s.domains).length}개 · 함수 ${Object.values(s.domains).reduce((n, m) => n + m.length, 0)}개 · 제어 ${s.control ? '켜짐' : '꺼짐'}`);
  }

  useEffect(() => {
    load();
    const off = onVehicleEvent((e) => {
      const key = `${e.domain}.${e.from.replace(/^register/, 'get')}`;
      log('event', `${e.domain}.${e.from} → ${e.event}(${e.args.map(show).join(', ')})`);
      setResults((r) => ({ ...r, [`${e.domain}.${e.from}`]: { ok: true, text: e.args.map(show).join(', '), at: Date.now() }, ...(r[key] ? { [key]: { ok: true, text: show(e.args[e.args.length - 1]), at: Date.now() } } : {}) }));
    });
    return () => {
      off();
      // 화면을 닫으면 구독도 해제
      subsRef.current.forEach((k) => { const [d, m] = k.split('.'); callVehicle(d, m.replace(/^register/, 'unregister')).catch(() => {}); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const methods = schema?.domains[domain] ?? [];
  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = methods.filter((m) => m.kind !== 'unregister' && (!q || m.name.toLowerCase().includes(q)));
    return KIND_ORDER.map((k) => [k, list.filter((m) => m.kind === k)] as const).filter(([, l]) => l.length);
  }, [methods, filter]);

  const argsFor = (key: string, m: MethodSchema) => {
    const ps = userParams(m);
    const cur = args[key] ?? [];
    return ps.map((p, i) => cur[i] ?? defaultArg(p));
  };

  async function run(m: MethodSchema, d = domain) {
    const key = `${d}.${m.name}`;
    const ps = userParams(m);
    const values = argsFor(key, m).map((raw, i) => parseArg(ps[i], raw));
    const sig = `${key}(${values.map(show).join(', ')})`;
    try {
      if (m.kind === 'register' && subs.has(key)) {
        await callVehicle(d, m.name.replace(/^register/, 'unregister'));
        setSubs((s) => { const n = new Set(s); n.delete(key); return n; });
        log('info', `구독 해제 ${key}`);
        return;
      }
      const v = await callVehicle(d, m.name, values, {
        onLateError: (e) => {
          setResults((r) => ({ ...r, [key]: { ok: false, text: `차가 거절: ${e}`, at: Date.now() } }));
          log('err', `${sig} ✗ 차가 거절: ${e}`);
        },
      });
      if (m.kind === 'register') setSubs((s) => new Set(s).add(key));
      setResults((r) => ({ ...r, [key]: { ok: true, text: show(v), at: Date.now() } }));
      log('ok', `${sig} → ${show(v)}`);
    } catch (e) {
      const msg = (e as Error).message;
      setResults((r) => ({ ...r, [key]: { ok: false, text: msg, at: Date.now() } }));
      log('err', `${sig} ✗ ${msg}`);
    }
  }

  /** 모든 도메인에서 값 없이 부를 수 있는 읽기 + 지원 여부 */
  async function readAll() {
    if (!schema) return;
    setBusy(true);
    let n = 0, fail = 0;
    for (const [d, ms] of Object.entries(schema.domains)) {
      await Promise.all(ms.filter((m) => (m.kind === 'get' || m.kind === 'capability') && userParams(m).length === 0).map(async (m) => {
        const key = `${d}.${m.name}`;
        try {
          const v = await callVehicle(d, m.name);
          setResults((r) => ({ ...r, [key]: { ok: true, text: show(v), at: Date.now() } }));
          n++;
        } catch (e) {
          setResults((r) => ({ ...r, [key]: { ok: false, text: (e as Error).message, at: Date.now() } }));
          fail++;
        }
      }));
    }
    log('info', `전체 읽기: 성공 ${n} · 실패 ${fail}`);
    setBusy(false);
  }

  const caps = nativeCaps();
  const counts = (d: string) => {
    const ms = schema?.domains[d] ?? [];
    const done = ms.filter((m) => results[`${d}.${m.name}`]);
    return { total: ms.filter((m) => m.kind !== 'unregister').length, ok: done.filter((m) => results[`${d}.${m.name}`].ok).length, err: done.filter((m) => !results[`${d}.${m.name}`].ok).length };
  };

  return (
    <div className="vc">
      <style>{CSS}</style>
      <header className="vc-top">
        <b>차량 SDK 콘솔</b>
        <span className={`vc-chip ${live ? 'on' : 'off'}`}>{live ? `연결됨 · ${caps?.app ?? ''}${caps?.engine === 'fake' ? ' (가짜 차)' : ''}` : '차 앱 밖'}</span>
        {schema && <span className={`vc-chip ${schema.ready ? 'on' : 'off'}`}>{schema.ready ? `SDK 준비 · 도메인 ${Object.keys(schema.domains).length}` : 'SDK 시작 안 됨'}</span>}
        {schema && <span className={`vc-chip ${schema.control ? 'warn' : 'off'}`}>{schema.control ? '제어 켜짐 (개발용)' : '제어 꺼짐 (읽기 전용)'}</span>}
        {subs.size > 0 && <span className="vc-chip on">구독 {subs.size}</span>}
        <span className="vc-sp" />
        <button onClick={() => load(true)} disabled={!live}>목록 새로고침</button>
        <button onClick={readAll} disabled={!schema || busy}>{busy ? '읽는 중…' : '전체 읽기'}</button>
        <a href={location.pathname + location.search.replace(/[?&]vehicle\b/, '').replace(/^&/, '?')}>앱으로</a>
      </header>

      {!live ? (
        <div className="vc-empty">
          <p>이 화면은 차 앱(Pleos Connect · 안드로이드) 안에서만 차와 연결돼요.</p>
          <p>개발 중에는 개발 서버 주소에 <code>?fakecar&amp;vehicle</code> 을 붙이면 가짜 차로 모든 기능을 시험할 수 있어요.</p>
        </div>
      ) : loading && !schema ? (
        <div className="vc-empty"><p>차에서 함수 목록을 읽는 중…</p></div>
      ) : !schema ? (
        <div className="vc-empty"><p>차가 대답하지 않아요 (Vehicle SDK 서비스 없음 · 권한 확인).</p></div>
      ) : (
        <div className="vc-body">
          <nav className="vc-domains">
            {Object.keys(schema.domains).map((d) => {
              const c = counts(d);
              return (
                <button key={d} className={d === domain ? 'sel' : ''} onClick={() => setDomain(d)}>
                  <span>{d}</span>
                  <small>{c.ok ? <i className="ok">{c.ok}</i> : null}{c.err ? <i className="err">{c.err}</i> : null}{c.total}</small>
                </button>
              );
            })}
          </nav>

          <main className="vc-methods">
            <input className="vc-filter" placeholder={`${domain} 함수 찾기`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            {grouped.map(([kind, list]) => (
              <section key={kind}>
                <h3>{KIND_LABEL[kind]} <small>{list.length}</small></h3>
                {list.map((m) => {
                  const key = `${domain}.${m.name}`;
                  const ps = userParams(m);
                  const vals = argsFor(key, m);
                  const r = results[key];
                  const blocked = m.kind === 'set' && !schema.control;
                  const subbed = subs.has(key);
                  return (
                    <div key={m.name} className={`vc-row ${m.kind}`}>
                      <code className="vc-name" title={m.params.map((p) => p.type).join(', ')}>{m.name}</code>
                      <span className="vc-args">
                        {ps.map((p, i) => {
                          const set = (v: string) => setArgs((a) => { const n = [...vals]; n[i] = v; return { ...a, [key]: n }; });
                          if (p.kind === 'enum') return <select key={i} value={vals[i]} onChange={(e) => set(e.target.value)} title={p.type}>{p.values?.map((v) => <option key={v}>{v}</option>)}</select>;
                          if (p.kind === 'bool') return <select key={i} value={vals[i]} onChange={(e) => set(e.target.value)}><option>true</option><option>false</option></select>;
                          return <input key={i} value={vals[i]} onChange={(e) => set(e.target.value)} title={p.type} placeholder={p.type}
                            type={p.kind === 'int' || p.kind === 'float' ? 'number' : 'text'} step={p.kind === 'float' ? 0.5 : 1} className={p.kind === 'string' || p.kind === 'unknown' ? 'wide' : ''} />;
                        })}
                      </span>
                      <button className={`vc-run ${subbed ? 'subbed' : ''}`} disabled={blocked} title={blocked ? '제출용(release) APK 는 차 제어를 하지 않아요' : ''} onClick={() => run(m)}>
                        {m.kind === 'register' ? (subbed ? '해제' : '구독') : m.kind === 'set' ? '보내기' : '읽기'}
                      </button>
                      <span className={`vc-res ${r ? (r.ok ? 'ok' : 'err') : ''}`} title={r ? clock(r.at) : ''}>{r ? r.text : ''}</span>
                    </div>
                  );
                })}
              </section>
            ))}
          </main>

          <aside className="vc-log">
            <h3>기록 <button onClick={() => setLogs([])}>지우기</button></h3>
            <ol>
              {logs.map((l, i) => <li key={logs.length - i} className={l.tone}><time>{clock(l.at)}</time>{l.text}</li>)}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}

const CSS = `
.vc { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; background: #0b0d12; color: #e6e8ee;
  font: 14px/1.4 'Pretendard', system-ui, sans-serif; }
.vc button, .vc a { background: #1d2230; color: #e6e8ee; border: 1px solid #2c3345; border-radius: 8px; padding: 6px 12px; font: inherit; cursor: pointer; text-decoration: none; }
.vc button:disabled { opacity: .4; cursor: not-allowed; }
.vc-top { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #1d2230; flex-wrap: wrap; }
.vc-top b { font-size: 17px; margin-right: 6px; }
.vc-sp { flex: 1; }
.vc-chip { padding: 3px 10px; border-radius: 99px; font-size: 12px; background: #1d2230; }
.vc-chip.on { background: #12351f; color: #6ee59a; } .vc-chip.off { color: #9aa3b5; } .vc-chip.warn { background: #3a2a0c; color: #ffc861; }
.vc-empty { margin: auto; max-width: 560px; text-align: center; color: #9aa3b5; padding: 16px; }
.vc-empty code { color: #e6e8ee; }
.vc-body { flex: 1; display: grid; grid-template-columns: 190px 1fr 340px; min-height: 0; }
.vc-domains { overflow-y: auto; padding: 8px; border-right: 1px solid #1d2230; display: flex; flex-direction: column; gap: 2px; }
.vc-domains button { display: flex; justify-content: space-between; align-items: center; border: 0; background: transparent; text-align: left; padding: 7px 10px; }
.vc-domains button.sel { background: #24304a; }
.vc-domains small { color: #6b7488; display: flex; gap: 4px; }
.vc i { font-style: normal; } .vc i.ok { color: #6ee59a; } .vc i.err { color: #ff7a7a; }
.vc-methods { overflow-y: auto; padding: 10px 14px 40px; min-width: 0; }
.vc-filter { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
.vc input, .vc select { background: #141824; color: #e6e8ee; border: 1px solid #2c3345; border-radius: 6px; padding: 5px 8px; font: inherit; }
.vc input[type=number] { width: 72px; } .vc input.wide { width: 160px; }
.vc h3 { margin: 14px 0 6px; font-size: 13px; color: #9aa3b5; font-weight: 600; display: flex; gap: 8px; align-items: center; }
.vc h3 small { color: #5b6377; }
.vc-row { display: grid; grid-template-columns: minmax(220px, 300px) auto 74px 1fr; gap: 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid #141824; }
.vc-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vc-row.set .vc-name { color: #ffc861; } .vc-row.register .vc-name { color: #7fb4ff; } .vc-row.capability .vc-name { color: #9aa3b5; }
.vc-args { display: flex; gap: 4px; flex-wrap: wrap; }
.vc-run.subbed { background: #12351f; border-color: #1f6b3b; }
.vc-res { font: 12px ui-monospace, monospace; color: #9aa3b5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vc-res.ok { color: #6ee59a; } .vc-res.err { color: #ff7a7a; }
.vc-log { border-left: 1px solid #1d2230; display: flex; flex-direction: column; min-height: 0; }
.vc-log h3 { padding: 0 12px; justify-content: space-between; }
.vc-log h3 button { padding: 2px 8px; font-size: 12px; }
.vc-log ol { list-style: none; margin: 0; padding: 0 12px 20px; overflow-y: auto; font: 12px/1.45 ui-monospace, monospace; }
.vc-log li { padding: 3px 0; border-bottom: 1px solid #141824; word-break: break-all; }
.vc-log time { color: #5b6377; margin-right: 6px; }
.vc-log .ok { color: #b9f3cd; } .vc-log .err { color: #ff9a9a; } .vc-log .event { color: #a8ccff; } .vc-log .info { color: #9aa3b5; }
@media (max-width: 900px) {
  .vc-body { grid-template-columns: 1fr; grid-template-rows: auto 1fr 200px; }
  .vc-domains { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid #1d2230; }
  .vc-domains button { flex: none; }
  .vc-row { grid-template-columns: 1fr auto; }
  .vc-log { border-left: 0; border-top: 1px solid #1d2230; }
}
`;
