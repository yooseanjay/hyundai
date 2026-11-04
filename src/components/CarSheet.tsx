// 데모 모드용 "내 차 고르기" 시트: 현대차 전 라인업 · 연료 · 색 · 이름
import { useMemo, useState } from 'react';
import type { MockCarConfig } from '../api/mockVehicle';
import { BODY_COLORS, FUEL_LABEL, HYUNDAI_MODELS, SEGMENTS, findModelById, type Segment } from '../data/hyundaiModels';
import { CarCharacter } from './CarCharacter';

export function CarSheet({ initial, onSave, onClose }: { initial: MockCarConfig; onSave: (c: MockCarConfig) => void; onClose: () => void }) {
  const [cfg, setCfg] = useState<MockCarConfig>(initial);
  const [seg, setSeg] = useState<Segment | '전체'>('전체');
  const [q, setQ] = useState('');
  const model = findModelById(cfg.modelId);

  const list = useMemo(
    () => HYUNDAI_MODELS.filter((m) => (seg === '전체' || m.segment === seg) && (!q || m.name.includes(q) || m.aliases?.some((a) => a.includes(q.toLowerCase())))),
    [seg, q],
  );

  const pick = (id: string) => {
    const m = findModelById(id)!;
    setCfg((c) => ({
      ...c,
      modelId: id,
      fuel: m.fuels.includes(c.fuel) ? c.fuel : m.fuels[0],
      color: m.color,
      nickname: c.nickname && c.nickname !== findModelById(c.modelId)?.name && c.nickname !== '오닉이' ? c.nickname : m.name,
    }));
  };

  return (
    <div className="modal sheet-modal" onClick={onClose}>
      <section className="sheet-panel" onClick={(e) => e.stopPropagation()} aria-label="내 차 고르기">
        <div className="sheet-grip" />
        <div className="sheet-preview">
          <CarCharacter mood="happy" cosmetic="none" color={cfg.color} size={170} />
          <div>
            <p className="t-caption">내 차</p>
            <p className="t-title">{model?.name}</p>
            <p className="t-caption">{FUEL_LABEL[cfg.fuel]} · {model?.codes[0]}</p>
          </div>
        </div>

        <label className="field-label t-label muted">캐릭터 이름</label>
        <input className="text-input" value={cfg.nickname} maxLength={12} onChange={(e) => setCfg({ ...cfg, nickname: e.target.value })} placeholder="예: 오닉이" />

        <label className="field-label t-label muted">차종 ({HYUNDAI_MODELS.length}종)</label>
        <input className="text-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 차 이름 검색 (예: 아반떼, ioniq)" />
        <div className="chips scroll-x">
          {(['전체', ...SEGMENTS] as const).map((s) => (
            <button key={s} className={`chip ${seg === s ? 'on' : ''}`} onClick={() => setSeg(s)}>{s}</button>
          ))}
        </div>
        <div className="model-grid">
          {list.map((m) => (
            <button key={m.id} className={`model-item ${cfg.modelId === m.id ? 'on' : ''}`} onClick={() => pick(m.id)}>
              <b className="t-label">{m.name}</b>
              <span className="t-caption">{m.segment} · {m.fuels.map((f) => FUEL_LABEL[f]).join('/')}</span>
            </button>
          ))}
          {!list.length && <p className="t-caption">검색 결과가 없어요</p>}
        </div>

        {model && model.fuels.length > 1 && (
          <>
            <label className="field-label t-label muted">연료</label>
            <div className="chips">
              {model.fuels.map((f) => (
                <button key={f} className={`chip ${cfg.fuel === f ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, fuel: f })}>{FUEL_LABEL[f]}</button>
              ))}
            </div>
          </>
        )}

        <label className="field-label t-label muted">차 색상</label>
        <div className="swatches">
          {BODY_COLORS.map((c) => (
            <button key={c.id} className={`swatch ${cfg.color === c.id ? 'on' : ''}`} style={{ background: c.hex }} onClick={() => setCfg({ ...cfg, color: c.id })} aria-label={c.name} title={c.name} />
          ))}
        </div>

        <button className="btn primary block" onClick={() => onSave({ ...cfg, nickname: cfg.nickname.trim() || model?.name || '우리 차' })}>이 차로 할래요</button>
      </section>
    </div>
  );
}
