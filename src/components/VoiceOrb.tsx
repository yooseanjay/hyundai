// 음성 AI의 얼굴: 파랗게 빛나는 구. 듣거나 말할 때 소리 크기에 맞춰 커지고 밝아진다.
import { useEffect, useRef } from 'react';
import { voiceLevel } from '../voice/level';

export function VoiceOrb({ size, phase, active }: { size: number; phase?: string; active?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      smooth += (voiceLevel.v - smooth) * 0.25;
      voiceLevel.v *= 0.88;
      ref.current?.style.setProperty('--lv', smooth.toFixed(3));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span ref={ref} className={`orb phase-${phase ?? 'idle'} ${active ? 'active' : ''}`} style={{ ['--s' as string]: `${size}px` }} aria-hidden>
      <span className="orb-core" />
      <span className="orb-swirl" />
      <span className="orb-shine" />
    </span>
  );
}
