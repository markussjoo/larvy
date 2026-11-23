/** PDF and Image text extraction and Swedish-first, high-resolution dual-language OCR. */
export const PDF_IMPORT_VERSION = '4.10.38';

export function assetUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const base = window.location.pathname.startsWith('/larvy') ? '/larvy' : '';
  return base + (path.startsWith('/') ? path : '/' + path);
}

export async function loadPdfReader() {
  const url = typeof window !== 'undefined'
    ? new URL(assetUrl('/pdf-reader-' + PDF_IMPORT_VERSION + '.mjs'), window.location.origin).href
    : '/pdf-reader-' + PDF_IMPORT_VERSION + '.mjs';
  return import(/* webpackIgnore: true */ /* @vite-ignore */ url);
}

type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
type OcrResult = {
  data: {
    text: string;
    confidence: number;
    blocks?: {
      paragraphs: {
        lines: {
          bbox: { x0: number; y0: number; x1: number; y1: number };
          words: OcrWord[];
        }[];
      }[];
    }[] | null;
  };
};

type OcrWorker = {
  reinitialize: (language: string) => Promise<any>;
  recognize: (image: HTMLCanvasElement, options: any, output?: any) => Promise<OcrResult>;
  terminate: () => Promise<any>;
};

type HSegment = { y: number; x0: number; x1: number; len: number };
type VCol = { x: number; y0: number; y1: number };
type CanvasLayoutAnalysis = {
  cleanedCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  hSegments: HSegment[];
  vCols: VCol[];
  tableY0: number;
  tableY1: number;
};

/**
 * Analyzes an OCR canvas for printed horizontal fill-in lines, full-width writing lines,
 * and table grid borders, and creates a cleaned copy where thin rules and gray box shading
 * are removed so Tesseract reads every word cleanly.
 */
export function analyzeAndCleanWorkbookCanvas(source: HTMLCanvasElement): CanvasLayoutAnalysis {
  const sw = source.width;
  const sh = source.height;
  const cleanedCanvas = document.createElement('canvas');
  cleanedCanvas.width = sw;
  cleanedCanvas.height = sh;
  const ctx = cleanedCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { cleanedCanvas: source, width: sw, height: sh, hSegments: [], vCols: [], tableY0: Infinity, tableY1: -Infinity };
  }

  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, sw, sh);
  const data = imageData.data;
  const lum = new Uint8Array(sw * sh);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lum[p] = l;
    // Whiten light-gray box backgrounds (e.g., shaded table headers & word banks) while keeping dark text crisp
    if (l > 152) {
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  }

  const isDarkOrig = (x: number, y: number) => lum[y * sw + x] < 205;
  const strokeMaxThickness = Math.max(5, Math.round(sh * 0.0035));

  // 1. Detect horizontal rule segments (inline blank lines, full-width writing lines, table row borders)
  const minSegLen = Math.max(40, Math.round(sw * 0.052));
  const rawHSegments: HSegment[] = [];
  for (let y = 8; y < sh - 8; y++) {
    let run = 0, x0 = 0;
    for (let x = 0; x < sw; x++) {
      let thin = false;
      if (isDarkOrig(x, y)) {
        let vCount = 0;
        for (let dy = -strokeMaxThickness; dy <= strokeMaxThickness; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < sh && isDarkOrig(x, ny)) vCount++;
        }
        if (vCount <= strokeMaxThickness) thin = true;
      }
      if (thin) {
        if (run === 0) x0 = x;
        run++;
      } else {
        if (run >= minSegLen) rawHSegments.push({ y, x0, x1: x - 1, len: run });
        run = 0;
      }
    }
    if (run >= minSegLen) rawHSegments.push({ y, x0, x1: sw - 1, len: run });
  }

  const hSegments: HSegment[] = [];
  for (const seg of rawHSegments) {
    const existing = hSegments.find(
      c => Math.abs(c.y - seg.y) <= strokeMaxThickness + 2 && !(seg.x1 < c.x0 - 20 || seg.x0 > c.x1 + 20)
    );
    if (existing) {
      existing.x0 = Math.min(existing.x0, seg.x0);
      existing.x1 = Math.max(existing.x1, seg.x1);
      existing.len = existing.x1 - existing.x0;
      existing.y = Math.round((existing.y + seg.y) / 2);
    } else {
      hSegments.push({ ...seg });
    }
  }

  // 2. Detect table grid (repeating wide horizontal lines + at least 3 vertical column borders)
  const wideH = hSegments.filter(s => s.len > sw * 0.42).sort((a, b) => a.y - b.y);
  let tableY0 = Infinity;
  let tableY1 = -Infinity;
  let vCols: VCol[] = [];

  if (wideH.length >= 4) {
    const candidateY0 = wideH[0].y;
    const candidateY1 = wideH[wideH.length - 1].y;
    const tableH = candidateY1 - candidateY0;
    if (tableH > sh * 0.12) {
      const rawVCols: number[] = [];
      for (let x = 8; x < sw - 8; x++) {
        let darkCount = 0;
        for (let y = candidateY0; y <= candidateY1; y++) {
          if (isDarkOrig(x, y)) darkCount++;
        }
        if (darkCount > tableH * 0.52) rawVCols.push(x);
      }
      const clusteredV: number[] = [];
      for (const x of rawVCols) {
        if (!clusteredV.length || x - clusteredV[clusteredV.length - 1] > Math.max(15, Math.round(sw * 0.015))) {
          clusteredV.push(x);
        }
      }
      if (clusteredV.length >= 3) {
        tableY0 = candidateY0 - 10;
        tableY1 = candidateY1 + 10;
        vCols = clusteredV.map(x => ({ x, y0: candidateY0, y1: candidateY1 }));
      }
    }
  }

  // 3. Erase horizontal rule segments from cleanedCanvas (keeping vertical character strokes intact)
  const eraseHalf = Math.max(2, Math.round(strokeMaxThickness * 0.5));
  for (const seg of rawHSegments) {
    for (let x = seg.x0; x <= seg.x1; x++) {
      let vCount = 0;
      for (let dy = -strokeMaxThickness; dy <= strokeMaxThickness; dy++) {
        const ny = seg.y + dy;
        if (ny >= 0 && ny < sh && lum[ny * sw + x] < 145) vCount++;
      }
      if (vCount <= Math.max(3, strokeMaxThickness - 1)) {
        for (let dy = -eraseHalf; dy <= eraseHalf; dy++) {
          const ny = seg.y + dy;
          if (ny >= 0 && ny < sh) {
            const idx = (ny * sw + x) * 4;
            data[idx] = data[idx + 1] = data[idx + 2] = 255;
          }
        }
      }
    }
  }

  // 4. Erase vertical table/box borders from cleanedCanvas
  const minVLen = Math.max(35, Math.round(sh * 0.032));
  for (let x = 8; x < sw - 8; x++) {
    let run = 0, y0 = 0;
    for (let y = 0; y < sh; y++) {
      if (isDarkOrig(x, y)) {
        if (run === 0) y0 = y;
        run++;
      } else {
        if (run >= minVLen) {
          for (let yy = y0; yy < y; yy++) {
            let hCount = 0;
            for (let dx = -strokeMaxThickness; dx <= strokeMaxThickness; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < sw && lum[yy * sw + nx] < 145) hCount++;
            }
            if (hCount <= Math.max(3, strokeMaxThickness - 1)) {
              for (let dx = -eraseHalf; dx <= eraseHalf; dx++) {
                const nx = x + dx;
                if (nx >= 0 && nx < sw) {
                  const idx = (yy * sw + nx) * 4;
                  data[idx] = data[idx + 1] = data[idx + 2] = 255;
                }
              }
            }
          }
        }
        run = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return { cleanedCanvas, width: sw, height: sh, hSegments, vCols, tableY0, tableY1 };
}

/**
 * Reconstructs structured workbook text from Tesseract OCR word bounding boxes and detected
 * visual layout elements (inline blank lines, full-width writing lines below prompts, and table columns).
 */
export function reconstructStructuredOcrText(ocrResult: OcrResult, layout: CanvasLayoutAnalysis): string {
  const { width: sw, height: sh, hSegments, vCols, tableY0, tableY1 } = layout;
  const ocrLines = ocrResult.data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines)) || [];
  if (!ocrLines.length) return ocrResult.data.text.normalize('NFC').trim();

  const isTable = vCols.length >= 3;
  const nonTableH = hSegments.filter(s => !(isTable && s.y >= tableY0 && s.y <= tableY1));
  const outLines: string[] = [];

  for (let i = 0; i < ocrLines.length; i++) {
    const line = ocrLines[i];
    const lineWords = (line.words || []).filter(w => w.text && w.text.trim());
    if (!lineWords.length) continue;
    const ly0 = line.bbox.y0;
    const ly1 = line.bbox.y1;
    const lh = Math.max(12, ly1 - ly0);

    // CASE A: Table Row inside detected table grid
    if (isTable && ly0 >= tableY0 && ly1 <= tableY1) {
      const numCols = vCols.length - 1;
      const cells: string[][] = Array.from({ length: numCols }, () => []);
      for (const w of lineWords) {
        const cleanWord = w.text.replace(/^[|[\]:;]+|[|[\]:;]+$/g, '').trim();
        if (!cleanWord || cleanWord === 'ee') continue;
        const wx = (w.bbox.x0 + w.bbox.x1) / 2;
        let colIdx = -1;
        for (let c = 0; c < numCols; c++) {
          if (wx >= vCols[c].x - 14 && wx <= vCols[c + 1].x + 14) {
            colIdx = c;
            break;
          }
        }
        if (colIdx >= 0) cells[colIdx].push(cleanWord);
      }
      if (cells.some(c => c.length > 0)) {
        outLines.push('| ' + cells.map(c => c.join(' ') || '____').join(' | ') + ' |');
      }
      continue;
    }

    // CASE B: Normal or Gap Exercise Line
    // Find inline blank segments on this line (y near baseline, length < 45% of page width)
    const lineHSegs = nonTableH.filter(
      s => s.y >= ly0 + lh * 0.3 && s.y <= ly1 + lh * 0.75 && s.len < sw * 0.45
    );
    const emptyBlankSegs: HSegment[] = [];
    for (const seg of lineHSegs) {
      const overlappingWords = lineWords.filter(w => {
        const overlap = Math.min(w.bbox.x1, seg.x1) - Math.max(w.bbox.x0, seg.x0);
        return overlap > Math.min(w.bbox.x1 - w.bbox.x0, seg.len) * 0.35;
      });
      if (overlappingWords.length === 0) {
        emptyBlankSegs.push(seg);
      }
    }

    type LineToken = { type: 'word' | 'blank'; x0: number; x1: number; text: string };
    const items: LineToken[] = [];
    for (const w of lineWords) {
      items.push({ type: 'word', x0: w.bbox.x0, x1: w.bbox.x1, text: w.text });
    }
    for (const seg of emptyBlankSegs) {
      items.push({ type: 'blank', x0: seg.x0, x1: seg.x1, text: '____' });
    }
    items.sort((a, b) => a.x0 - b.x0);

    const finalTokens: string[] = [];
    for (let k = 0; k < items.length; k++) {
      const cur = items[k];
      if (k > 0) {
        const prev = items[k - 1];
        const gap = cur.x0 - prev.x1;
        const isHeaderRef =
          cur.text === 'Språkvägen' ||
          prev.text === 'huvudsats' ||
          prev.text === 'Konjunktioner' ||
          prev.text === 'Prepositioner';
        const isWordBankRow =
          lineWords.length <= 6 &&
          lineWords.some(w => w.text === 'och') &&
          lineWords.some(w => w.text === 'men');
        const isChoiceRow =
          lineWords[0]?.text?.toLowerCase() === 'spår' ||
          /^[\[\]|LI()]+$/.test(prev.text);

        if (
          cur.type === 'word' &&
          prev.type === 'word' &&
          gap > Math.max(sw * 0.06, lh * 2.4) &&
          !isHeaderRef &&
          !isWordBankRow &&
          !isChoiceRow &&
          ly0 < sh * 0.9
        ) {
          finalTokens.push('____');
        }
      }
      if (cur.type === 'blank') {
        if (finalTokens[finalTokens.length - 1] !== '____') finalTokens.push('____');
      } else {
        finalTokens.push(cur.text);
      }
    }

    // Format Word Bank box row: e.g. [och | så | men | för]
    if (
      lineWords.length >= 3 &&
      lineWords.length <= 6 &&
      lineWords.some(w => w.text === 'och') &&
      lineWords.some(w => w.text === 'men')
    ) {
      const wbWords = lineWords.map(w => w.text.replace(/[|[\]]/g, '').trim()).filter(Boolean);
      outLines.push('[' + wbWords.join(' | ') + ']');
      continue;
    }

    outLines.push(finalTokens.join(' '));

    // Check for standalone full-width writing line directly BELOW this text line
    const nextLy0 = i + 1 < ocrLines.length ? ocrLines[i + 1].bbox.y0 : sh;
    const fullLineBelow = nonTableH.find(
      s => s.len > sw * 0.45 && s.y > ly1 + 4 && s.y < nextLy0 - 4
    );
    if (fullLineBelow) {
      const hasTextOnFullLine = ocrLines.some(
        (ol, idx) => idx !== i && Math.abs(ol.bbox.y1 - fullLineBelow.y) <= Math.max(18, lh * 0.7)
      );
      if (!hasTextOnFullLine) {
        outLines.push('____');
      }
    }
  }

  return outLines.join('\n').normalize('NFC').trim();
}

// Keep this cache separate: older browser caches contain the smaller integer model.
const OCR_LANG_PATH = 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best';

export type PdfExtractResult = {
  text: string;
  images: { src: string; alt: string }[];
};

export async function extractImagesFromPdfPage(page: any, maxImages = 3): Promise<{ src: string; alt: string }[]> {
  const images: { src: string; alt: string }[] = [];
  try {
    const ops = await page.getOperatorList();
    const fns = ops.fnArray;
    const args = ops.argsArray;
    // Count how many image XObjects are on this page
    const imageOpsCount = fns.filter((fn: number) => fn === 85 || fn === 86).length;
    for (let i = 0; i < fns.length && images.length < maxImages; i++) {
      // 85 is paintImageXObject, 86 is paintInlineImageXObject
      if (fns[i] === 85 || fns[i] === 86) {
        const objId = args[i][0];
        if (typeof objId === 'string' && page.objs?.has?.(objId)) {
          const imgData = await new Promise<any>(resolve => {
            page.objs.get(objId, (data: any) => resolve(data));
          });
          if (imgData && imgData.data && imgData.width > 60 && imgData.height > 60) {
            const w = imgData.width;
            const h = imgData.height;
            // Skip full-page scanned A4 background image when it is the single full-page scan
            const aspect = h / Math.max(1, w);
            if (imageOpsCount === 1 && w >= 1200 && h >= 1600 && aspect >= 1.25 && aspect <= 1.6) {
              continue;
            }
            const canvas = document.createElement('canvas');
            // Downscale for compact storage
            const scale = Math.min(1, 900 / Math.max(w, h));
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = w;
              tempCanvas.height = h;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                const imgDataObj = tempCtx.createImageData(w, h);
                // Handle RGB or RGBA
                if (imgData.data.length === w * h * 4) {
                  imgDataObj.data.set(imgData.data);
                } else if (imgData.data.length === w * h * 3) {
                  let j = 0;
                  for (let k = 0; k < imgData.data.length; k += 3) {
                    imgDataObj.data[j] = imgData.data[k];
                    imgDataObj.data[j + 1] = imgData.data[k + 1];
                    imgDataObj.data[j + 2] = imgData.data[k + 2];
                    imgDataObj.data[j + 3] = 255;
                    j += 4;
                  }
                } else if (imgData.data.length === w * h) {
                  // Grayscale
                  let j = 0;
                  for (let k = 0; k < imgData.data.length; k++) {
                    const g = imgData.data[k];
                    imgDataObj.data[j] = g;
                    imgDataObj.data[j + 1] = g;
                    imgDataObj.data[j + 2] = g;
                    imgDataObj.data[j + 3] = 255;
                    j += 4;
                  }
                }
                tempCtx.putImageData(imgDataObj, 0, 0);
                ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
                tempCanvas.width = 0;
                tempCanvas.height = 0;

                const base64 = canvas.toDataURL('image/jpeg', 0.75);
                if (base64.length <= 480000) {
                  images.push({ src: base64, alt: 'Bild från PDF' });
                }
              }
            }
            canvas.width = 0;
            canvas.height = 0;
          }
        }
      }
    }
  } catch {}
  return images;
}

export function extractPdfText(items: any[]): string {
  let text = '', previous: any = null;
  for (const item of items) {
    if (typeof item?.str !== 'string') continue;
    const str = item.str, combining = /^[\u0300-\u036f]+$/.test(str);
    if (previous && text && !/\s$/.test(text) && !/^\s/.test(str) && !combining) {
      const p = previous.transform, t = item.transform;
      if (Array.isArray(p) && Array.isArray(t)) {
        const height = Math.max(Math.abs(t[3] || 0), Math.abs(p[3] || 0), 1);
        const newLine = Math.abs(t[5] - p[5]) > height * 0.55;
        if (newLine) text += '\n';
        else if (t[4] - (p[4] + (previous.width || 0)) > height * 0.12) text += ' ';
      } else text += ' ';
    }
    text += str;
    if (item.hasEOL) text += '\n';
    if (!combining) previous = item;
  }
  return text.normalize('NFC').trim();
}

export function needsOcr(text: string, items: any[]) {
  const glyphs = items.filter(i => typeof i?.str === 'string' && i.str.trim());
  return text.replace(/\s/g, '').length < 20 ||
    /[\ufffd\ue000-\uf8ff]/.test(text) ||
    (glyphs.length > 30 && glyphs.filter(i => i.str.trim().length === 1).length / glyphs.length > 0.7);
}

export function ocrViewport(base: { width: number; height: number }) {
  // 300 dpi for an A4 page; bounded memory for mobile browsers.
  const scale = Math.min(300 / 72, 4200 / Math.max(base.width, base.height), Math.sqrt(10000000 / (base.width * base.height)));
  return { scale, dpi: Math.round(scale * 72) };
}

function contrastCopy(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('Webbläsaren kunde inte förbereda OCR-bilden.');
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data, hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 16) {
    hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
  }
  const samples = Math.ceil(data.length / 16);
  let sum = 0, low = 0, high = 255;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    if (sum >= samples * 0.01) { low = i; break; }
  }
  sum = 0;
  for (let i = 255; i >= 0; i--) {
    sum += hist[i];
    if (sum >= samples * 0.01) { high = i; break; }
  }
  const range = high - low;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = range > 30 && range < 210 ? Math.max(0, Math.min(255, (gray - low) * 255 / range)) : gray;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function languageScores(text: string) {
  const tokens = text.toLowerCase().match(/\p{L}+/gu) || [];
  const english = new Set(['the', 'and', 'is', 'are', 'with', 'from', 'your', 'you', 'this', 'that', 'to', 'of', 'for', 'not', 'has', 'have', 'will', 'be', 'an', 'it', 'as', 'how', 'which', 'their']);
  const swedish = new Set(['och', 'att', 'det', 'är', 'en', 'ett', 'som', 'med', 'för', 'på', 'till', 'den', 'av', 'inte', 'har', 'kan', 'ska', 'om', 'eller', 'från', 'hur', 'vilken', 'deras']);
  return {
    english: tokens.filter(t => english.has(t)).length,
    swedish: tokens.filter(t => swedish.has(t)).length
  };
}

function words(result: OcrResult) {
  return result.data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))) || [];
}

function uncertain(result: OcrResult) {
  return words(result).filter(w => w.text.replace(/[^\p{L}]/gu, '').length >= 2 && w.confidence < 75).length;
}

function resultScore(result: OcrResult) {
  return result.data.text.trim() ? (Number(result.data.confidence) || 0) - Math.min(15, uncertain(result) * 2) : -1;
}

function singleColumn(result: OcrResult) {
  const lines = result.data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines)) || [];
  return !lines.some((a, i) => lines.slice(i + 1).some(b =>
    Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0) > Math.min(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0) * 0.5 &&
    (a.bbox.x1 < b.bbox.x0 || b.bbox.x1 < a.bbox.x0)
  ));
}

function better(candidate: OcrResult, current: OcrResult) {
  return candidate.data.text.replace(/\s/g, '').length >= current.data.text.replace(/\s/g, '').length * 0.85 &&
    resultScore(candidate) > resultScore(current);
}

export async function createResilientOcrWorker(status: (msg: string) => void): Promise<OcrWorker> {
  status('Läser in noggrann OCR · svenska och engelska…');
  const { createWorker } = await import('tesseract.js');
  
  const workerUrl = assetUrl('/ocr-worker-6.0.1.min.js');
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const loading = createWorker(['swe', 'eng'], 1, {
      workerPath: workerUrl,
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
      langPath: OCR_LANG_PATH,
      cachePath: 'larvy-ocr-swe-eng-best-v3',
      logger: (event: any) => {
        if (event.status === 'recognizing text') {
          status(`Texttolkar · ${Math.round((event.progress || 0) * 100)} %`);
        } else if (event.status === 'loading language traineddata') {
          status('Hämtar språkmodeller för svenska och engelska…');
        }
      }
    });

    const worker = await Promise.race([
      loading,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Lokal worker svarade inte')), 15000);
      })
    ]);
    if (timer) clearTimeout(timer);
    return worker as any;
  } catch {
    if (timer) clearTimeout(timer);
    // Fallback: create worker directly from CDN
    status('Initierar OCR-motor via CDN…');
    const cdnWorker = await createWorker(['swe', 'eng'], 1, {
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
      langPath: OCR_LANG_PATH,
      cachePath: 'larvy-ocr-swe-eng-best-v3',
      logger: (event: any) => {
        if (event.status === 'recognizing text') {
          status(`Texttolkar · ${Math.round((event.progress || 0) * 100)} %`);
        }
      }
    });
    return cdnWorker as any;
  }
}

export async function recognizeCanvasText(worker: OcrWorker, canvas: HTMLCanvasElement, status: (msg: string) => void): Promise<string> {
  // Analyze visual layout (inline blank lines, full-width writing lines below prompts, and table grids)
  // and remove thin borders/gray box shading so OCR accurately reads all words and tables.
  const layout = analyzeAndCleanWorkbookCanvas(canvas);
  const targetCanvas = layout.cleanedCanvas;

  const params = {
    rotateAuto: true,
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1'
  };

  try {
    // Recognize Swedish first (protecting å, ä, ö)
    await worker.reinitialize('swe');
    let result = await worker.recognize(targetCanvas, params, { blocks: true });

    if (result.data.confidence < 85 || uncertain(result) > 0) {
      status('Optimerar kontrast och tolkar bild…');
      const column = singleColumn(result), enhanced = column ? targetCanvas : contrastCopy(targetCanvas);
      try {
        const segMode = column ? '6' : '3';
        const retry = await worker.recognize(enhanced, {
          ...params,
          tessedit_pageseg_mode: segMode,
          thresholding_method: column ? '1' : '2'
        }, { blocks: true });
        if (better(retry, result)) result = retry;
        if (column && uncertain(result) > 0) {
          const alternative = await worker.recognize(targetCanvas, {
            ...params,
            tessedit_pageseg_mode: '6',
            thresholding_method: '2'
          }, { blocks: true });
          if (better(alternative, result)) result = alternative;
        }
      } finally {
        if (enhanced !== targetCanvas) {
          enhanced.width = 0;
          enhanced.height = 0;
        }
      }
    }

    // Detect English vs Swedish
    const language = languageScores(result.data.text);
    if (language.english >= 2 && language.english > language.swedish) {
      status('Texttolkar engelska…');
      await worker.reinitialize('eng');
      const english = await worker.recognize(targetCanvas, params, { blocks: true });
      const detected = languageScores(english.data.text);
      if (english.data.text.trim() && detected.english > detected.swedish &&
          english.data.text.replace(/\s/g, '').length >= result.data.text.replace(/\s/g, '').length * 0.85) {
        result = english;
      }
    }

    return reconstructStructuredOcrText(result, layout);
  } finally {
    if (targetCanvas !== canvas) {
      targetCanvas.width = 0;
      targetCanvas.height = 0;
    }
  }
}

export async function readImageText(file: File, onProgress: (message: string) => void = () => {}): Promise<string> {
  onProgress('Läser bild för texttolkning…');
  const url = URL.createObjectURL(file);
  let worker: OcrWorker | undefined;

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Bilden kunde inte avkodas av webbläsaren.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    const maxDim = 3200;
    let w = img.naturalWidth || img.width || 1200;
    let h = img.naturalHeight || img.height || 1600;
    if (Math.max(w, h) > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Kunde inte initiera canvas för bildbearbetning.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    worker = await createResilientOcrWorker(onProgress);
    const text = await recognizeCanvasText(worker, canvas, onProgress);
    canvas.width = 0;
    canvas.height = 0;

    if (!text) {
      throw new Error('Ingen text kunde tolkas i bilden. Kontrollera att bilden innehåller tydlig text.');
    }
    return text;
  } finally {
    URL.revokeObjectURL(url);
    try { await worker?.terminate(); } catch {}
  }
}

export async function readPdfData(
  bytes: Uint8Array,
  reader: any,
  onProgress: (page: number, total: number) => void = () => {},
  options: { forceOcr?: boolean; onOcrProgress?: (message: string) => void; extractImages?: boolean } = {}
): Promise<PdfExtractResult> {
  const task = reader.getDocument({
    data: bytes,
    isEvalSupported: false,
    standardFontDataUrl: assetUrl('/pdf-fonts/'),
    cMapUrl: assetUrl('/pdf-cmaps/'),
    cMapPacked: true
  });

  let worker: OcrWorker | undefined;
  let currentPage = 0, total = 0, ocrPages = 0;
  const status = (message: string) => options.onOcrProgress?.(message);

  try {
    const pdf = await task.promise;
    total = pdf.numPages;
    if (total > 100) throw Error('PDF-filen får innehålla högst 100 sidor. Dela upp filen.');
    const pages: string[] = [];
    const allImages: { src: string; alt: string }[] = [];
    let length = 0;

    for (let i = 1; i <= total; i++) {
      currentPage = i;
      onProgress(i, total);
      const page = await pdf.getPage(i);
      try {
        // Extract embedded pictures if enabled
        if (options.extractImages && allImages.length < 5) {
          const pageImages = await extractImagesFromPdfPage(page, 5 - allImages.length);
          allImages.push(...pageImages);
        }

        const content = await page.getTextContent();
        const items = Array.isArray(content.items) ? content.items : [];
        let text = extractPdfText(items);

        if (options.forceOcr || needsOcr(text, items)) {
          if (++ocrPages > 25) throw Error('Högst 25 sidor kan texttolkas med OCR per import. Dela upp PDF-filen.');
          if (!worker) {
            worker = await createResilientOcrWorker(status);
          }
          status(`Texttolkar sida ${i} av ${total}…`);
          const base = page.getViewport({ scale: 1 });
          const { scale, dpi } = ocrViewport(base);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const border = 20;
          canvas.width = Math.ceil(viewport.width) + border * 2;
          canvas.height = Math.ceil(viewport.height) + border * 2;
          try {
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw Error('Webbläsaren kan inte skapa en bild för OCR.');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({
              canvasContext: context,
              viewport,
              transform: [1, 0, 0, 1, border, border],
              background: 'rgb(255,255,255)'
            }).promise;

            const recognized = await recognizeCanvasText(worker, canvas, status);
            if (recognized) text = recognized;

            // Only capture a full-page snapshot if no text could be recognized and no images were extracted
            if (options.extractImages && allImages.length === 0 && !text.trim()) {
              const snapCanvas = document.createElement('canvas');
              const snapScale = Math.min(1, 900 / Math.max(viewport.width, viewport.height));
              snapCanvas.width = Math.max(1, Math.round(viewport.width * snapScale));
              snapCanvas.height = Math.max(1, Math.round(viewport.height * snapScale));
              const snapCtx = snapCanvas.getContext('2d');
              if (snapCtx) {
                snapCtx.drawImage(canvas, border, border, viewport.width, viewport.height, 0, 0, snapCanvas.width, snapCanvas.height);
                const b64 = snapCanvas.toDataURL('image/jpeg', 0.75);
                if (b64.length <= 480000) {
                  allImages.push({ src: b64, alt: `Illustration sida ${i}` });
                }
              }
              snapCanvas.width = 0;
              snapCanvas.height = 0;
            }
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }

        length += text.length + 2;
        if (length > 150000) throw Error('PDF-texten är för lång. Dela upp filen.');
        pages.push(text);
      } finally {
        page.cleanup();
      }
    }

    const text = pages.join('\n\n').trim();
    if (!text && allImages.length === 0) throw Error('Ingen text eller bild kunde tolkas i PDF-filen. Prova en tydligare skanning eller skriv texten manuellt.');
    return { text, images: allImages };
  } catch (error) {
    if ((error as Error)?.name === 'PasswordException') throw Error('PDF-filen är lösenordsskyddad. Ladda upp en upplåst kopia.');
    if ((error as Error)?.name === 'InvalidPDFException') throw Error('PDF-filen kunde inte läsas. Kontrollera att filen är en giltig PDF eller spara om den som PDF.');
    throw error;
  } finally {
    try { await worker?.terminate(); } catch {}
    try { await task.destroy(); } catch {}
  }
}

export async function readPdfText(
  bytes: Uint8Array,
  reader: any,
  onProgress: (page: number, total: number) => void = () => {},
  options: { forceOcr?: boolean; onOcrProgress?: (message: string) => void } = {}
) {
  const result = await readPdfData(bytes, reader, onProgress, options);
  return result.text;
}
