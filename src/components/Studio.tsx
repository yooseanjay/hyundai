// 꾸미기 스튜디오: 색상 · 얼굴(표정·얼굴 빛·이름)만, 바꾸는 즉시 3D에 반영
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CarProfile } from '../api/types';
import type { MockCarConfig } from '../api/mockVehicle';
import { colorsOf, findModelById, HYUNDAI_MODELS, PAINTS, type BodyColor } from '../data/hyundaiModels';
import { colorOf, EYES, GLOWS, type CharStyle } from '../game/style';
import { drawFace } from '../three/face';

export type StudioTab = 'color' | 'face';
const TABS: [StudioTab, string][] = [['face', '표정'], ['color', '색상']];
interface Props {
  car: CarProfile;
  look: CharStyle;
  onLook: (patch: Partial<CharStyle>) => void;
  /** 데모(시뮬레이터)일 때만: 차종(3D 모델 있는 4종) · 이름 바꾸기 */
  config?: MockCarConfig;
  onConfig?: (c: MockCarConfig) => void;
  tab: StudioTab;
  onTab: (t: StudioTab) => void;
  preview: ReactNode;
  footer?: ReactNode;
}

export function Studio({ car, look, onLook, config, onConfig, tab, onTab, preview, footer }: Props) {
  const modelId = config?.modelId ?? car.modelId;
  const color: BodyColor = colorOf(look, car.bodyColor, modelId);
  const model = findModelById(modelId ?? '');
  const [name, setName] = useState(car.nickname);
  useEffect(() => setName(car.nickname), [car.nickname]);

  return (
    <section className="screen studio">
      <div className="studio-stage">
        {preview}
        <div className="studio-tag">
          <span className="eyebrow-ai">MY {model?.isNew ? 'NEW ' : ''}HYUNDAI</span>
          <b>{car.nickname}</b>
          <span className="cap">{model?.name ?? car.model} · {PAINTS[color]?.name}</span>
        </div>
      </div>

      <div className="studio-tabs" role="tablist" aria-label="꾸미기">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => onTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'color' && (
        <div className="studio-panel">
          {config && onConfig && (
            <div className="chip-row studio-models" role="radiogroup" aria-label="차종">
              {HYUNDAI_MODELS.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={m.id === modelId}
                  className={`chip ${m.id === modelId ? 'on' : ''}`}
                  onClick={() => {
                    if (m.id === modelId) return;
                    onConfig({ ...config, modelId: m.id, fuel: m.fuels[0], color: m.color });
                    onLook({ color: m.color });
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <div className="paint-grid">
            {colorsOf(modelId).map((c) => (
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
