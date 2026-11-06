// 현대 엠블럼 (살짝 기운 타원 + 이탤릭 H)을 코드로 그림. SVG(화면)와 3D(캔버스 질감)에 같이 씀
// H의 특징: 왼쪽 기둥은 타원 위쪽 테두리에, 오른쪽 기둥은 아래쪽 테두리에 붙고, 가운데 가로대는 오른쪽 위로 올라감
export const EMBLEM_VIEWBOX = '0 0 100 64';
export const EMBLEM_OVAL = { cx: 50, cy: 32, rx: 46, ry: 29, rotate: -4, stroke: 5 };
export const EMBLEM_H =
  'M37 0 L46.8 0 L35.8 50 L26 50 Z ' + // 왼쪽 기둥 (위 테두리까지)
  'M64.2 14 L74 14 L63 64 L53.2 64 Z ' + // 오른쪽 기둥 (아래 테두리까지)
  'M37.4 39.6 L39 33.6 L63.2 24.6 L61.6 30.6 Z'; // 가로대

/** 3D용: 크롬처럼 빛나는 엠블럼 질감 (배경 투명) */
export function drawEmblem(cv: HTMLCanvasElement) {
  const g = cv.getContext('2d')!;
  const s = cv.width / 100;
  g.clearRect(0, 0, cv.width, cv.height);
  g.save();
  g.scale(s, s);
  const chrome = g.createLinearGradient(0, 0, 0, 64);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.45, '#dde1e6');
  chrome.addColorStop(0.55, '#a3a9b1');
  chrome.addColorStop(1, '#f1f3f5');
  const o = EMBLEM_OVAL;
  const rot = (o.rotate * Math.PI) / 180;
  g.strokeStyle = chrome;
  g.fillStyle = chrome;
  g.lineWidth = o.stroke;
  g.beginPath();
  g.ellipse(o.cx, o.cy, o.rx, o.ry, rot, 0, Math.PI * 2);
  g.stroke();
  // H는 타원 바깥으로 삐져나오지 않게 잘라서 그림
  g.beginPath();
  g.ellipse(o.cx, o.cy, o.rx + o.stroke / 2, o.ry + o.stroke / 2, rot, 0, Math.PI * 2);
  g.clip();
  g.fill(new Path2D(EMBLEM_H));
  g.restore();
}
