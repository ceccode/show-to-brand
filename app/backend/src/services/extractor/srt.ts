export type SrtCue = {
  index: number;
  start?: string;
  end?: string;
  text: string;
};

const timeRe = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/;

export function parseSrt(content: string): SrtCue[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const cues: SrtCue[] = [];
  let i = 0;
  while (i < lines.length) {
    // index line
    const indexLine = lines[i].trim();
    if (!indexLine) { i++; continue; }
    const idx = parseInt(indexLine, 10);
    if (Number.isNaN(idx)) { i++; continue; }
    i++;
    // time line
    let start: string | undefined;
    let end: string | undefined;
    const m = timeRe.exec(lines[i] || '');
    if (m) {
      start = m[1];
      end = m[2];
      i++;
    }
    // text lines
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      buf.push(lines[i]);
      i++;
    }
    // skip blank separator
    while (i < lines.length && lines[i].trim() === '') i++;
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    cues.push({ index: idx, start, end, text });
  }
  return cues;
}
