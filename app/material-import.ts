import { storeDemoFile, type LessonFile, validLessonFile } from "./lesson-files";
import { loadPdfReader, readPdfData, readPdfText, readImageText, assetUrl, PDF_IMPORT_VERSION } from "./pdf-import";
import { parseRawTextToAiWorkbook, convertAiJsonToLessonNodes } from "./ai-pdf-parser";
import { encodeLesson } from "./lesson-format";

export type CollectedMaterial = {
  name: string;
  attachment: LessonFile;
  text?: string;
  warning?: string;
  isAiJson?: boolean;
  images?: { src: string; alt: string }[];
};

export async function uploadMaterial(file: File, demo: boolean): Promise<LessonFile> {
  if (file.size > 15 * 1024 * 1024) throw Error("Filen får vara högst 15 MB.");
  if (demo) return storeDemoFile(file);
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/lesson-files", { method: "POST", body: form });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw Error("Servern kunde inte ta emot filen. Försök igen.");
  }
  if (!response.ok) throw Error(data.error || "Filen kunde inte laddas upp.");
  if (!validLessonFile(data.file)) throw Error("Servern returnerade inte en giltig bilaga.");
  return data.file;
}

export async function extractMaterialData(file: File, onProgress: (message: string) => void = () => {}, isAiMode = false): Promise<{ text: string | null; images?: { src: string; alt: string }[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  let text: string;
  let images: { src: string; alt: string }[] = [];

  const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif"].includes(ext);

  if (ext === "pdf" || file.type === "application/pdf" || header === "%PDF-") {
    onProgress(isAiMode ? "AI-analyserar PDF-struktur & övningar…" : "Läser PDF…");
    const reader = await loadPdfReader();
    reader.GlobalWorkerOptions.workerSrc = assetUrl("/pdf-worker-" + PDF_IMPORT_VERSION + ".mjs");
    const pdfResult = await readPdfData(
      new Uint8Array(await file.arrayBuffer()),
      reader,
      (page, total) => onProgress(isAiMode ? `AI-tolkar PDF · sida ${page} av ${total}` : `Läser PDF · sida ${page} av ${total}`),
      { onOcrProgress: onProgress, extractImages: isAiMode }
    );
    text = pdfResult.text;
    images = pdfResult.images;
  } else if (isImage) {
    onProgress(isAiMode ? "AI/OCR-tolkar bild till interaktiv grammatikövning…" : "Texttolkar bild med OCR · svenska och engelska…");
    text = await readImageText(file, onProgress);
    // Include the original image as an insertable picture
    try {
      const canvas = document.createElement("canvas");
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej();
        img.src = url;
      });
      const maxDim = 900;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL("image/jpeg", 0.75);
        if (b64.length <= 480000) {
          images.push({ src: b64, alt: file.name.replace(/\.[^.]+$/, "") });
        }
      }
      canvas.width = 0;
      canvas.height = 0;
      URL.revokeObjectURL(url);
    } catch {}
  } else if (ext === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    onProgress("Läser Word-dokument…");
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (["txt", "md", "csv", "tsv", "json", "xml", "log"].includes(ext)) {
    onProgress("Läser text…");
    text = await file.text();
  } else if (ext === "html" || ext === "htm") {
    onProgress("Tolkar interaktiv HTML och arbetsbok…");
    const rawHtml = await file.text();
    const doc = new DOMParser().parseFromString(rawHtml, "text/html");

    const inputs = doc.querySelectorAll("input");
    inputs.forEach(input => {
      const answer = input.getAttribute("data-answer") || input.placeholder || "";
      const replacementText = answer ? ` [${input.placeholder || "svar"}|${answer}] ` : " ____ ";
      const textNode = doc.createTextNode(replacementText);
      input.parentNode?.replaceChild(textNode, input);
    });

    doc.querySelectorAll("script,style,nav,footer,#check-btn,#reset-btn,#feedback-message").forEach(n => n.remove());
    text = doc.body.innerText || doc.body.textContent || "";
  } else {
    return { text: null };
  }

  text = text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n").trim();
  if (!text && images.length === 0) throw Error("Ingen läsbar text eller bild hittades i filen.");

  if (isAiMode && text) {
    onProgress("AI strukturerar till exakt grammatik-JSON…");
    const aiData = parseRawTextToAiWorkbook(text);
    return { text: JSON.stringify(aiData), images };
  }

  if (text && text.length > 150000) throw Error("Texten är för lång för en lektion. Dela upp materialet.");
  return { text, images };
}

export async function extractMaterialText(file: File, onProgress: (message: string) => void = () => {}, isAiMode = false): Promise<string | null> {
  const result = await extractMaterialData(file, onProgress, isAiMode);
  return result.text;
}

export async function collectMaterial(file: File, demo: boolean, onProgress: (message: string) => void, isAiMode = false): Promise<CollectedMaterial> {
  onProgress(isAiMode ? "Laddar upp PDF för AI-inläsning…" : "Laddar upp originalfil…");
  const attachment = await uploadMaterial(file, demo);
  try {
    const data = await extractMaterialData(file, onProgress, isAiMode);
    return { name: file.name, attachment, ...(data.text ? { text: data.text } : {}), images: data.images, isAiJson: isAiMode };
  } catch (error) {
    return {
      name: file.name,
      attachment,
      warning: "Originalfilen är sparad som bilaga. " + (error instanceof Error ? error.message : "Texttolkningen kunde inte slutföras.")
    };
  }
}
