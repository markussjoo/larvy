/** PDF text extraction with browser-local OCR for scanned pages. */
export const PDF_IMPORT_VERSION='4.10.38';
export async function loadPdfReader(){const path='/pdf-reader-'+PDF_IMPORT_VERSION+'.mjs';return import(/* @vite-ignore */ path)}
type OcrWorker={recognize:(image:HTMLCanvasElement,options:any)=>Promise<{data:{text:string}}>;terminate:()=>Promise<any>};
export async function readPdfText(bytes:Uint8Array,reader:any,onProgress:(page:number,total:number)=>void=()=>{},options:{forceOcr?:boolean;onOcrProgress?:(message:string)=>void}={}){
 const task=reader.getDocument({data:bytes,isEvalSupported:false,standardFontDataUrl:'/pdf-fonts/',cMapUrl:'/pdf-cmaps/',cMapPacked:true});
 let worker:OcrWorker|undefined;let currentPage=0;let total=0;let ocrPages=0;
 const status=(message:string)=>options.onOcrProgress?.(message);
 try{
  const pdf=await task.promise;total=pdf.numPages;
  if(total>100)throw Error('PDF-filen får innehålla högst 100 sidor. Dela upp filen.');
  const pages:string[]=[];let length=0;
  for(let i=1;i<=total;i++){
   currentPage=i;onProgress(i,total);const page=await pdf.getPage(i);
   try{
    const content=await page.getTextContent();
    let text=(Array.isArray(content.items)?content.items:[]).map((item:any)=>typeof item?.str==='string'?item.str+(item.hasEOL?'\n':' '):'').join('').trim();
    if(options.forceOcr||text.replace(/\s/g,'').length<20){
     if(++ocrPages>25)throw Error('Högst 25 sidor kan texttolkas med OCR per import. Dela upp PDF-filen.');
     if(!worker){
      status('Läser in OCR · svenska och engelska…');
      const {createWorker}=await import('tesseract.js');
      try{worker=await createWorker(['swe','eng'],1,{
       workerPath:'/ocr-worker-6.0.1.min.js',
       corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
       logger:(event:any)=>{if(event.status==='recognizing text')status(`Texttolkar sida ${currentPage} av ${total} · ${Math.round((event.progress||0)*100)} %`)},
      })}catch{throw Error('OCR kunde inte startas. Kontrollera internetanslutningen och försök igen. Språkstödet laddas ner första gången.');}
     }
     status(`Texttolkar sida ${i} av ${total}…`);
     const base=page.getViewport({scale:1});
     const scale=Math.min(3,2200/Math.max(base.width,base.height),Math.sqrt(4000000/(base.width*base.height)));
     const viewport=page.getViewport({scale});const canvas=document.createElement('canvas');
     canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
     try{
      const context=canvas.getContext('2d');if(!context)throw Error('Webbläsaren kan inte skapa en bild för OCR.');
      await page.render({canvasContext:context,viewport,background:'rgb(255,255,255)'}).promise;
      const result=await worker.recognize(canvas,{rotateAuto:true});
      const recognized=result.data.text.trim();if(recognized)text=recognized;
     }finally{canvas.width=0;canvas.height=0}
    }
    length+=text.length+2;if(length>150000)throw Error('PDF-texten är för lång. Dela upp filen.');pages.push(text);
   }finally{page.cleanup()}
  }
  const text=pages.join('\n\n').trim();
  if(!text)throw Error('Ingen text kunde tolkas i PDF-filen. Prova en tydligare skanning eller skriv texten manuellt.');
  return text;
 }catch(error){
  if((error as Error)?.name==='PasswordException')throw Error('PDF-filen är lösenordsskyddad. Ladda upp en upplåst kopia.');
  if((error as Error)?.name==='InvalidPDFException')throw Error('PDF-filen kunde inte läsas. Kontrollera att filen är en giltig PDF eller spara om den som PDF.');
  throw error;
 }finally{try{await worker?.terminate()}catch{}try{await task.destroy()}catch{}}
}
