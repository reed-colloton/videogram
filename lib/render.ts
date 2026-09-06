import type { Slide } from './deck';
function lines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.split(/\s+/)) {
      const pieces: string[] = [];
      let piece = '';
      for (const char of token) {
        if (piece && ctx.measureText(piece + char).width > width) {
          pieces.push(piece);
          piece = char;
        } else piece += char;
      }
      if (piece) pieces.push(piece);
      for (const word of pieces) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > width && line) {
          result.push(line);
          line = word;
        } else line = next;
      }
    }
    if (line) result.push(line);
  }
  return result;
}
function block(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  font: number,
  color: string,
  maxLines: number,
  weight = 400,
) {
  let size = font;
  let wrapped: string[];
  do {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    wrapped = lines(ctx, text, width);
    if (wrapped.length <= maxLines) break;
    size -= 1;
  } while (size > 12);
  ctx.fillStyle = color;
  wrapped
    .slice(0, maxLines)
    .forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.18));
  return Math.min(wrapped.length, maxLines) * size * 1.18;
}
export function drawSlide(
  canvas: HTMLCanvasElement,
  slide: Slide,
  index: number,
  count: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not render the slides.');
  canvas.width = 1280;
  canvas.height = 720;
  const dark = index === 0 || index === count - 1;
  const bg = dark ? '#142b28' : index % 2 ? '#e8efdf' : '#e5eaec';
  const fg = dark ? '#f2f8ed' : '#263e32';
  const muted = dark ? '#aac0b4' : '#65766a';
  const accent = dark ? '#c9f476' : '#50782d';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = '16px Arial';
  ctx.fillStyle = muted;
  ctx.fillText('videogram / explained', 54, 42);
  ctx.textAlign = 'right';
  ctx.fillText(
    `${String(index + 1).padStart(2, '0')} — ${String(count).padStart(2, '0')}`,
    1226,
    42,
  );
  ctx.textAlign = 'left';
  block(ctx, slide.eyebrow, 54, 193, 590, 15, accent, 1, 600);
  const titleHeight = block(ctx, slide.title, 54, 235, 650, 67, fg, 3, 500);
  block(ctx, slide.body, 54, 255 + titleHeight, 560, 21, muted, 3);
  if (index === 0) {
    const centerX = 975,
      centerY = 366;
    ctx.strokeStyle = dark ? '#385246' : '#cddbc2';
    ctx.lineWidth = 1;
    for (const radius of [94, 158, 222]) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    const points = [
      [805, 435],
      [975, 260],
      [1145, 435],
    ];
    ctx.setLineDash([5, 8]);
    ctx.strokeStyle = '#789980';
    ctx.beginPath();
    ctx.moveTo(...(points[0] as [number, number]));
    ctx.lineTo(...(points[1] as [number, number]));
    ctx.lineTo(...(points[2] as [number, number]));
    ctx.lineTo(...(points[0] as [number, number]));
    ctx.stroke();
    ctx.setLineDash([]);
    points.forEach(([x, y], i) => {
      ctx.fillStyle = i === 1 ? '#c9f476' : '#234236';
      ctx.beginPath();
      ctx.roundRect(x - 29, y - 29, 58, 58, 13);
      ctx.fill();
      ctx.strokeStyle = '#82a661';
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = '22px Arial';
      ctx.fillStyle = i === 1 ? '#264025' : '#c9f476';
      ctx.fillText(String(i + 1).padStart(2, '0'), x, y - 12);
      ctx.font = '17px Arial';
      const label = lines(ctx, slide.points[i], 145);
      ctx.fillStyle = muted;
      label.slice(0, 3).forEach((l, n) => ctx.fillText(l, x, y + 45 + n * 21));
      ctx.textAlign = 'left';
    });
  } else {
    slide.points.forEach((point, i) => {
      const y = 215 + i * 103;
      ctx.fillStyle = dark ? '#203d31' : '#f7faf1';
      ctx.beginPath();
      ctx.roundRect(785, y, 435, 81, 13);
      ctx.fill();
      ctx.strokeStyle = dark ? '#3b5845' : '#d1ddc8';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = '16px Arial';
      ctx.fillText(`0${i + 1}`, 806, y + 31);
      block(ctx, point, 850, y + 27, 345, 24, fg, 2, 400);
    });
  }
  ctx.font = '12px Arial';
  ctx.fillStyle = muted;
  ctx.fillText('A SMALL EXPLANATION. A BIGGER PICTURE.', 54, 664);
  ctx.font = '600 32px Arial';
  ctx.fillStyle = accent;
  ctx.textAlign = 'right';
  ctx.fillText('vg ↗', 1226, 647);
  ctx.textAlign = 'left';
}
