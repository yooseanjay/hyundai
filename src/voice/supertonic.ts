// 무료 오픈소스 음성 AI: Supertonic 2 (Supertone Inc.) — 한국어 남성 5종 · 여성 5종
// - 코드: Supertone 공식 웹 예제(helper.js, MIT)를 TypeScript로 옮기고 다듬음
// - 모델: supertone-oss-archive/supertonic-2 (OpenRAIL-M 라이선스) — 고정 버전으로 Hugging Face에서 직접 내려받음
// - 브라우저 안에서 실행 (WebGPU 또는 WebAssembly) → 서버·API 키·요금 없음
// - 처음 한 번 약 267MB 다운로드 후 브라우저 저장소(Cache Storage)에 보관
import * as ort from 'onnxruntime-web';

const REV = '7edbcd0bba8cd579100a353a9e0b2b49cad7c875';
const BASE = `https://huggingface.co/supertone-oss-archive/supertonic-2/resolve/${REV}`;
const CACHE = 'supertonic-2-' + REV.slice(0, 8);

// onnxruntime 실행 파일(wasm)은 CDN에서 (번들 용량 절약)
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
ort.env.wasm.numThreads = 1; // GitHub Pages는 교차 출처 격리가 없어 멀티스레드 불가

import type { VoiceId } from './voiceList';
export type { VoiceId };

type Progress = (loadedMB: number, totalMB: number, label: string) => void;

// ---------- 다운로드 + 캐시 ----------
async function cachedBytes(path: string, onBytes?: (n: number) => void): Promise<ArrayBuffer> {
  const url = `${BASE}/${path}`;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      onBytes?.(buf.byteLength);
      return buf;
    }
  } catch {
    cache = null; // 사생활 보호 모드 등에서는 캐시 없이
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`모델 다운로드 실패 (${res.status})`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onBytes?.(value.length);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  try { await cache?.put(url, new Response(out.slice().buffer)); } catch { /* 저장 공간 부족 등 */ }
  return out.buffer;
}

const cachedJson = async (path: string) => JSON.parse(new TextDecoder().decode(await cachedBytes(path)));

/** 이미 내려받아 둔 상태인지 (다운로드 안내 표시용) */
export async function isDownloaded() {
  try {
    const c = await caches.open(CACHE);
    return !!(await c.match(`${BASE}/onnx/vector_estimator.onnx`)) && !!(await c.match(`${BASE}/onnx/vocoder.onnx`));
  } catch {
    return false;
  }
}

// ---------- 텍스트 처리 ----------
class UnicodeProcessor {
  constructor(private indexer: number[]) {}

  ids(text: string, lang: string) {
    const t = this.preprocess(text, lang);
    const row: number[] = [];
    for (let j = 0; j < t.length; j++) {
      const cp = t.codePointAt(j)!;
      row.push(cp < this.indexer.length ? this.indexer[cp] : -1);
    }
    return row;
  }

  private preprocess(text: string, lang: string) {
    let t = text.normalize('NFKD');
    t = t.replace(/[\p{Extended_Pictographic}‍️]/gu, '');
    const rep: Record<string, string> = { '–': '-', '‑': '-', '—': '-', _: ' ', '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'", '[': ' ', ']': ' ', '|': ' ', '/': ' ', '#': ' ', '→': ' ', '←': ' ', '~': ' ', '…': '.' };
    for (const [k, v] of Object.entries(rep)) t = t.split(k).join(v);
    t = t.replace(/[♥☆♡©\\]/g, '');
    t = t.replace(/ ([,.!?;:'])/g, '$1');
    t = t.replace(/"{2,}/g, '"').replace(/'{2,}/g, "'");
    t = t.replace(/\s+/g, ' ').trim();
    if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(t)) t += '.';
    return `<${lang}>${t}</${lang}>`;
  }
}

function chunk(text: string, maxLen: number) {
  const out: string[] = [];
  let cur = '';
  for (const s of text.trim().split(/(?<=[.!?])\s+/)) {
    if (cur.length + s.length + 1 <= maxLen) cur += (cur ? ' ' : '') + s;
    else { if (cur) out.push(cur); cur = s; }
  }
  if (cur) out.push(cur);
  return out;
}

function gauss() {
  const u1 = Math.max(1e-4, Math.random());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
}

// ---------- 엔진 ----------
interface Style { ttl: ort.Tensor; dp: ort.Tensor }

class Supertonic {
  private styles = new Map<VoiceId, Style>();
  constructor(
    private cfg: any,
    private text: UnicodeProcessor,
    private dp: ort.InferenceSession,
    private enc: ort.InferenceSession,
    private est: ort.InferenceSession,
    private voc: ort.InferenceSession,
    readonly provider: string,
  ) {}

  get sampleRate(): number { return this.cfg.ae.sample_rate; }

  async style(id: VoiceId): Promise<Style> {
    const hit = this.styles.get(id);
    if (hit) return hit;
    const j = await cachedJson(`voice_styles/${id}.json`);
    const s = {
      ttl: new ort.Tensor('float32', Float32Array.from(j.style_ttl.data.flat(Infinity)), j.style_ttl.dims),
      dp: new ort.Tensor('float32', Float32Array.from(j.style_dp.data.flat(Infinity)), j.style_dp.dims),
    };
    this.styles.set(id, s);
    return s;
  }

  private async inferOne(sentence: string, style: Style, steps: number, speed: number): Promise<Float32Array> {
    const ids = this.text.ids(sentence, 'ko');
    const L = ids.length;
    const textIds = new ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, L]);
    const textMask = new ort.Tensor('float32', new Float32Array(L).fill(1), [1, 1, L]);

    const { duration } = await this.dp.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
    const dur = (duration.data as Float32Array)[0] / speed;
    const { text_emb } = await this.enc.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });

    const chunkSize = this.cfg.ae.base_chunk_size * this.cfg.ttl.chunk_compress_factor;
    const dim = this.cfg.ttl.latent_dim * this.cfg.ttl.chunk_compress_factor;
    const T = Math.floor((Math.floor(dur * this.sampleRate) + chunkSize - 1) / chunkSize);
    let xt = new Float32Array(dim * T);
    for (let i = 0; i < xt.length; i++) xt[i] = gauss();
    const latentMask = new ort.Tensor('float32', new Float32Array(T).fill(1), [1, 1, T]);
    const total = new ort.Tensor('float32', new Float32Array([steps]), [1]);

    for (let step = 0; step < steps; step++) {
      const out = await this.est.run({
        noisy_latent: new ort.Tensor('float32', xt, [1, dim, T]),
        text_emb, style_ttl: style.ttl, latent_mask: latentMask, text_mask: textMask,
        current_step: new ort.Tensor('float32', new Float32Array([step]), [1]),
        total_step: total,
      });
      xt = Float32Array.from(out.denoised_latent.data as Float32Array);
    }
    const { wav_tts } = await this.voc.run({ latent: new ort.Tensor('float32', xt, [1, dim, T]) });
    return wav_tts.data as Float32Array;
  }

  /** 문장 → 음성 파형 (Float32, 모노) */
  async synthesize(text: string, voice: VoiceId, opts: { speed?: number; steps?: number } = {}) {
    const style = await this.style(voice);
    const parts = chunk(text, 120);
    const gap = new Float32Array(Math.floor(0.25 * this.sampleRate));
    const pieces: Float32Array[] = [];
    for (const [i, p] of parts.entries()) {
      if (i) pieces.push(gap);
      pieces.push(await this.inferOne(p, style, opts.steps ?? 5, opts.speed ?? 1.05));
    }
    const len = pieces.reduce((a, p) => a + p.length, 0);
    const wav = new Float32Array(len);
    let o = 0;
    for (const p of pieces) { wav.set(p, o); o += p.length; }
    return wav;
  }
}

let engine: Promise<Supertonic> | null = null;

/** 모델 불러오기 (한 번만). onProgress로 다운로드 진행률 */
export function loadSupertonic(onProgress?: Progress): Promise<Supertonic> {
  if (engine) return engine;
  engine = (async () => {
    const files: [string, number, string][] = [
      ['onnx/duration_predictor.onnx', 1.5, '길이 예측'],
      ['onnx/text_encoder.onnx', 27.4, '글자 이해'],
      ['onnx/vector_estimator.onnx', 132.5, '목소리 생성'],
      ['onnx/vocoder.onnx', 101.4, '소리 만들기'],
    ];
    const total = files.reduce((a, f) => a + f[1], 0);
    let done = 0;
    const cfg = await cachedJson('onnx/tts.json');
    const text = new UnicodeProcessor(await cachedJson('onnx/unicode_indexer.json'));
    const bufs: ArrayBuffer[] = [];
    for (const [path, , label] of files) {
      bufs.push(await cachedBytes(path, (n) => { done += n / 1e6; onProgress?.(Math.min(done, total), total, label); }));
    }
    const hasGpu = 'gpu' in navigator;
    const make = (provider: string) => Promise.all(bufs.map((b) => ort.InferenceSession.create(new Uint8Array(b), { executionProviders: [provider], graphOptimizationLevel: 'all' })));
    let provider = hasGpu ? 'webgpu' : 'wasm';
    let s: ort.InferenceSession[];
    try {
      s = await make(provider);
    } catch {
      provider = 'wasm';
      s = await make(provider);
    }
    return new Supertonic(cfg, text, s[0], s[1], s[2], s[3], provider);
  })();
  engine.catch(() => { engine = null; }); // 실패하면 다음에 다시 시도
  return engine;
}

export function isLoaded() {
  return engine !== null;
}
