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

type OcrWord = { text: string; confidence: number };
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
    for (let i = 0; i < fns.length && images.length < maxImages; i++) {
      // 85 is paintImageXObject, 86 is paintInlineImageXObject
      if (fns[i] === 85 || fns[i] === 86) {
        const objId = args[i][0];
        if (typeof objId === 'string' && page.objs?.has?.(objId)) {
          const imgData = await new Promise<any>(resolve => {
            page.objs.get(objId, (data: any) => resolve(data));
          });
          if (imgData && imgData.data && imgData.width > 50 && imgData.height > 50) {
            const canvas = document.createElement('canvas');
            const w = imgData.width;
            const h = imgData.height;
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
  const params = {
    rotateAuto: true,
    tessedit_pageseg_mode: '3',
    preserve_interword_spaces: '1'
  };

  // Recognize Swedish first (protecting å, ä, ö)
  await worker.reinitialize('swe');
  let result = await worker.recognize(canvas, params, { blocks: true });

  if (result.data.confidence < 85 || uncertain(result) > 0) {
    status('Optimerar kontrast och tolkar bild…');
    const column = singleColumn(result), enhanced = column ? canvas : contrastCopy(canvas);
    try {
      const layout = column ? '6' : '3';
      const retry = await worker.recognize(enhanced, {
        ...params,
        tessedit_pageseg_mode: layout,
        thresholding_method: column ? '1' : '2'
      }, { blocks: true });
      if (better(retry, result)) result = retry;
      if (column && uncertain(result) > 0) {
        const alternative = await worker.recognize(canvas, {
          ...params,
          tessedit_pageseg_mode: '6',
          thresholding_method: '2'
        }, { blocks: true });
        if (better(alternative, result)) result = alternative;
      }
    } finally {
      if (enhanced !== canvas) {
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
    const english = await worker.recognize(canvas, params, { blocks: true });
    const detected = languageScores(english.data.text);
    if (english.data.text.trim() && detected.english > detected.swedish &&
        english.data.text.replace(/\s/g, '').length >= result.data.text.replace(/\s/g, '').length * 0.85) {
      result = english;
    }
  }

  return result.data.text.normalize('NFC').trim();
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

            // If it is a full-page scan without text or images, capture a clean thumbnail/illustration if needed
            if (options.extractImages && allImages.length === 0) {
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
