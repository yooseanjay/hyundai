// 꾸미기 스튜디오: 차종 · 색상 · 얼굴 · 액세서리를 한 화면에서, 바꾸는 즉시 3D에 반영
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, LockKeyhole, type LucideIcon } from 'lucide-react';
import type { CarProfile } from '../api/types';
import type { MockCarConfig } from '../api/mockVehicle';
import { BODY_COLORS, FUEL_LABEL, HYUNDAI_MODELS, findModelById, type BodyColor, type HyundaiModel } from '../data/hyundaiModels';
import { COSMETICS, type CosmeticId, type Progress } from '../game/progress';
import { colorOf, EYES, GLOWS, type CharStyle } from '../game/style';
import { drawFace } from '../three/face';

export type StudioTab = 'model' | 'color' | 'face' | 'acc';
const TABS: [StudioTab, string][] = [['model', '차종'], ['color', '색상'], ['face', '얼굴'], ['acc', '액세서리']];
const FILTERS = ['전체', 'NEW', '전기차', 'SUV', '세단', '경차', 'N', '밴·트럭'] as const;
type Filter = (typeof FILTERS)[number];
const fit = (m: HyundaiModel, f: Filter) =>
  f === '전체' ? true
  : f === 'NEW' ? !!m.isNew
  : f === '전기차' ? m.fuels.includes('ev') || m.fuels.includes('hydrogen')
  : f === '밴·트럭' ? m.segment === 'MPV' || m.segment === '상용'
  : f === '세단' ? m.segment === '세단' || m.id === 'ioniq6'
  : f === 'SUV' ? m.segment === 'SUV' || ['ioniq5', 'ioniq9', 'nexo'].includes(m.id)
  : m.segment === f;

interface Props {
  car: CarProfile;
  progress: Progress;
  look: CharStyle;
  onLook: (patch: Partial<CharStyle>) => void;
  onEquip: (id: CosmeticId) => void;
  /** 데모(시뮬레이터)일 때만: 차종·연료·이름 바꾸기 */
  config?: MockCarConfig;
  onConfig?: (c: MockCarConfig) => void;
  icons: Record<CosmeticId, LucideIcon | null>;
  tab: StudioTab;
  onTab: (t: StudioTab) => void;
  preview: ReactNode;
  footer?: ReactNode;
}

export function Studio({ car, progress, look, onLook, onEquip, config, onConfig, icons, tab, onTab, preview, footer }: Props) {
  const [filter, setFilter] = useState<Filter>('전체');
  const color: BodyColor = colorOf(look, car.bodyColor);
  const model = findModelById(config?.modelId ?? car.modelId ?? '');
  const list = HYUNDAI_MODELS.filter((m) => fit(m, filter));
  const [name, setName] = useState(car.nickname);
  useEffect(() => setName(car.nickname), [car.nickname]);

  const pickModel = (m: HyundaiModel) => {
    if (!config || !onConfig) return;
    onConfig({ ...config, modelId: m.id, fuel: m.fuels.includes(config.fuel) ? config.fuel : m.fuels[0] });
  };

  return (
    <section className="screen studio">
      <div className="studio-stage">
        {preview}
        <div className="studio-tag">
          <span className="eyebrow-ai">MY {model?.isNew ? 'NEW ' : ''}HYUNDAI</span>
          <b>{car.nickname}</b>
          <span className="cap">{model?.name ?? car.model} · {BODY_COLORS.find((c) => c.id === color)?.name}</span>
        </div>
      </div>

      <div className="studio-tabs" role="tablist" aria-label="꾸미기">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => onTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'model' && (
        <div className="studio-panel">
          {!config && <p className="cap note">현대 계정에 연결된 실제 차는 차종이 자동으로 정해져요. 색상과 얼굴은 자유롭게 바꿀 수 있어요.</p>}
          <div className="chips scroll-x">
            {FILTERS.map((f) => <button key={f} className={`chip sm ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
          </div>
          <div className="model-cards">
            {list.map((m) => (
              <button key={m.id} className={`model-card ${model?.id === m.id ? 'on' : ''}`} disabled={!config} onClick={() => pickModel(m)}>
                {m.isNew && <em className="new">NEW</em>}
                <b>{m.name}</b>
                <span className="cap">{m.fuels.map((f) => FUEL_LABEL[f]).join(' · ')}</span>
              </button>
            ))}
          </div>
          {config && onConfig && model && model.fuels.length > 1 && (
            <div className="chips">
              {model.fuels.map((f) => <button key={f} className={`chip sm ${config.fuel === f ? 'on' : ''}`} onClick={() => onConfig({ ...config, fuel: f })}>{FUEL_LABEL[f]}</button>)}
            </div>
          )}
        </div>
      )}

      {tab === 'color' && (
        <div className="studio-panel">
          <div className="paint-grid">
            {BODY_COLORS.map((c) => (
              <button key={c.id} className={`paint ${color === c.id ? 'on' : ''}`} onClick={() => onLook({ color: c.id })} aria-label={c.name}>
                <i style={{ background: `radial-gradient(circle at 35% 30%, #ffffff66, transparent 45%), ${c.hex}` }} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'face' && (
        <div className="studio-panel">
          <span className="cap">눈 모양</span>
          <div className="face-grid">
            {EYES.map((e) => (
              <button key={e.id} className={`face-opt ${look.eye === e.id ? 'on' : ''}`} onClick={() => onLook({ eye: e.id })}>
                <FacePreview style={{ ...look, eye: e.id }} />
                <span>{e.name}</span>
              </button>
            ))}
          </div>
          <span className="cap">얼굴 빛</span>
          <div className="glow-row">
            {GLOWS.map((g) => (
              <button key={g.id} className={`glow ${look.glow === g.id ? 'on' : ''}`} style={{ ['--g' as string]: g.hex }} onClick={() => onLook({ glow: g.id })} aria-label={g.name} />
            ))}
            <button className={`chip sm ${look.blush ? 'on' : ''}`} onClick={() => onLook({ blush: !look.blush })}>볼터치 {look.blush ? '켜짐' : '꺼짐'}</button>
          </div>
          {config && onConfig && (
            <>
              <span className="cap">이름</span>
              <input className="text-input" value={name} maxLength={12} onChange={(e) => setName(e.target.value)}
                onBlur={() => { const n = name.trim(); if (n && n !== config.nickname) onConfig({ ...config, nickname: n }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            </>
          )}
        </div>
      )}

      {tab === 'acc' && (
        <div className="studio-panel">
          <div className="closet-grid">
            {COSMETICS.map((c) => {
              const open = c.unlocked(progress);
              const on = progress.equipped === c.id;
              const Icon = icons[c.id];
              return (
                <button key={c.id} disabled={!open} className={`closet-item ${on ? 'on' : ''}`} onClick={() => onEquip(c.id)}>
                  {on && <CircleCheck size={14} className="check" />}
                  <span className="art">{Icon ? <Icon size={28} strokeWidth={1.4} /> : <span className="none-art">없음</span>}</span>
                  <b className="label">{c.name}</b>
                  <span className="cap">{on ? '착용 중' : open ? '보유' : <><LockKeyhole size={10} /> {c.condition.replace(' 달성', '')}</>}</span>
                </button>
              );
            })}
          </div>
          <p className="cap center">함께 달리고 돌봐줄수록 새로운 액세서리가 열려요</p>
        </div>
      )}
      {footer}
    </section>
  );
}

/** 눈 모양 미리보기 (작은 얼굴 화면) */
function FacePreview({ style }: { style: CharStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawFace(ref.current, 'happy', 'none', false, style); }, [style]);
  return <canvas ref={ref} width={512} height={200} className="face-canvas" />;
}
