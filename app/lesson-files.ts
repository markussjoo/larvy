export type LessonFile = { id: string; name: string; size: number; demo?: boolean };
const MAX_MEDIA_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB limit for local/demo media files

export function validLessonFile(file: any): file is LessonFile {
  return (
    !!file &&
    typeof file.id === 'string' &&
    /^[a-f0-9-]{36}$/.test(file.id) &&
    typeof file.name === 'string' &&
    file.name.length > 0 &&
    file.name.length <= 250 &&
    Number.isSafeInteger(file.size) &&
    file.size >= 0 &&
    file.size <= MAX_MEDIA_SIZE &&
    (file.demo === undefined || typeof file.demo === 'boolean')
  );
}

export function inferMediaMimeType(name: string, fallbackType?: string): string {
  if (fallbackType && /^(audio|video)\/[a-zA-Z0-9.+-]+$/.test(fallbackType)) return fallbackType;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    flac: 'audio/flac',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    ogv: 'video/ogg'
  };
  return map[ext] || fallbackType || 'application/octet-stream';
}

const memoryDemoFiles = new Map<string, Blob>();
const memoryBlobUrls = new Map<string, string>();

export function getImmediateDemoFileUrl(id: string): string {
  const existing = memoryBlobUrls.get(id);
  if (existing) return existing;
  const blob = memoryDemoFiles.get(id);
  if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const url = URL.createObjectURL(blob);
      memoryBlobUrls.set(id, url);
      return url;
    } catch {}
  }
  return '';
}

function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('larvy-demo-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(Error('Webbläsaren kan inte spara bilagor. Kontrollera lagringsinställningarna.'));
  });
}

function persistFileToIndexedDB(id: string, file: File, mimeType: string, name: string): void {
  if (typeof indexedDB === 'undefined') return;
  file
    .arrayBuffer()
    .then(async buffer => {
      const memBlob = new Blob([buffer], { type: mimeType });
      memoryDemoFiles.set(id, memBlob);
      if (!memoryBlobUrls.has(id) && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          memoryBlobUrls.set(id, URL.createObjectURL(memBlob));
        } catch {}
      }
      const db = await openFiles();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put({ buffer, type: mimeType, name }, id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(Error('Filen kunde inte sparas i webbläsaren.'));
          tx.onabort = () => reject(Error('Filen kunde inte sparas.'));
        });
      } finally {
        db.close();
      }
    })
    .catch(() => {});
}

export function storeDemoFileSync(file: File): LessonFile {
  const id = crypto.randomUUID();
  const name = file.name.slice(0, 250) || 'fil';
  const mimeType = inferMediaMimeType(name, file.type);
  const clonedBlob = new Blob([file], { type: mimeType });
  memoryDemoFiles.set(id, clonedBlob);
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      memoryBlobUrls.set(id, URL.createObjectURL(clonedBlob));
    } catch {}
  }
  persistFileToIndexedDB(id, file, mimeType, name);
  return { id, name, size: file.size, demo: true };
}

export async function storeDemoFile(file: File): Promise<LessonFile> {
  return storeDemoFileSync(file);
}

export async function readDemoFile(id: string): Promise<Blob> {
  const mem = memoryDemoFiles.get(id);
  if (mem) return mem;
  const db = await openFiles();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('files').objectStore('files').get(id);
      req.onsuccess = () => {
        const res = req.result;
        if (res instanceof Blob) {
          memoryDemoFiles.set(id, res);
          resolve(res);
          return;
        }
        if (res && res.buffer instanceof ArrayBuffer) {
          const blob = new Blob([res.buffer], { type: res.type || 'application/octet-stream' });
          memoryDemoFiles.set(id, blob);
          resolve(blob);
          return;
        }
        reject(Error('Demofilen finns inte i den här webbläsaren. Ladda upp den igen.'));
      };
      req.onerror = () => reject(Error('Filen kunde inte öppnas.'));
    });
  } finally {
    db.close();
  }
}
