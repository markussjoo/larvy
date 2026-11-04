/** PDF text extraction and Swedish-first, high-resolution OCR. */
export const PDF_IMPORT_VERSION='4.10.38';
export async function loadPdfReader(){const path='/pdf-reader-'+PDF_IMPORT_VERSION+'.mjs';return import(/* @vite-ignore */ path)}
type OcrWord={text:string;confidence:number};
type OcrResult={data:{text:string;confidence:number;blocks?:{paragraphs:{lines:{bbox:{x0:number;y0:number;x1:number;y1:number};words:OcrWord[]}[]}[]}[]|null}};
type OcrWorker={recognize:(image:HTMLCanvasElement,options:any,output?:any)=>Promise<OcrResult>;terminate:()=>Promise<any>};
// Keep this cache separate: older browser caches contain the smaller integer model.
const OCR_LANG_PATH='https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best';
export function extractPdfText(items:any[]):string{
 let text='',previous:any=null;
 for(const item of items){
  if(typeof item?.str!=='string')continue;
  const str=item.str,combining=/^[\u0300-\u036f]+$/.test(str);
  if(previous&&text&&!/\s$/.test(text)&&!/^\s/.test(str)&&!combining){
   const p=previous.transform,t=item.transform;
   if(Array.isArray(p)&&Array.isArray(t)){
    const height=Math.max(Math.abs(t[3]||0),Math.abs(p[3]||0),1);
    const newLine=Math.abs(t[5]-p[5])>height*.55;
    if(newLine)text+='\n';else if(t[4]-(p[4]+(previous.width||0))>height*.12)text+=' ';
   }else text+=' ';
  }
  text+=str;if(item.hasEOL)text+='\n';if(!combining)previous=item;
 }
 return text.normalize('NFC').trim();
}
export function needsOcr(text:string,items:any[]){
 const glyphs=items.filter(i=>typeof i?.str==='string'&&i.str.trim());
 return text.replace(/\s/g,'').length<20||/[\ufffd\ue000-\uf8ff]/.test(text)||glyphs.length>30&&glyphs.filter(i=>i.str.trim().length===1).length/glyphs.length>.7;
}
export function ocrViewport(base:{width:number;height:number}){
 // 300 dpi for an A4 page; bounded memory for mobile browsers.
 const scale=Math.min(300/72,4200/Math.max(base.width,base.height),Math.sqrt(10000000/(base.width*base.height)));
 return {scale,dpi:Math.round(scale*72)};
}
function contrastCopy(source:HTMLCanvasElement){
 const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Webbläsaren kunde inte förbereda OCR-bilden.');ctx.drawImage(source,0,0);
 const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data,hist=new Uint32Array(256);
 for(let i=0;i<data.length;i+=16)hist[Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])]++;
 const samples=Math.ceil(data.length/16);let sum=0,low=0,high=255;
 for(let i=0;i<256;i++){sum+=hist[i];if(sum>=samples*.01){low=i;break}}
 sum=0;for(let i=255;i>=0;i--){sum+=hist[i];if(sum>=samples*.01){high=i;break}}
 const range=high-low;
 // No hard threshold or erosion: both can erase the dots/ring in å, ä and ö.
 for(let i=0;i<data.length;i+=4){const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2];const value=range>30&&range<210?Math.max(0,Math.min(255,(gray-low)*255/range)):gray;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255}
 ctx.putImageData(image,0,0);return canvas;
}
function words(result:OcrResult){return result.data.blocks?.flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words)))||[]}
function uncertain(result:OcrResult){return words(result).filter(w=>w.text.replace(/[^\p{L}]/gu,'').length>=2&&w.confidence<75).length}
function resultScore(result:OcrResult){return result.data.text.trim()?(Number(result.data.confidence)||0)-Math.min(15,uncertain(result)*2):-1}
function singleColumn(result:OcrResult){const lines=result.data.blocks?.flatMap(b=>b.paragraphs.flatMap(p=>p.lines))||[];return !lines.some((a,i)=>lines.slice(i+1).some(b=>Math.min(a.bbox.y1,b.bbox.y1)-Math.max(a.bbox.y0,b.bbox.y0)>Math.min(a.bbox.y1-a.bbox.y0,b.bbox.y1-b.bbox.y0)*.5&&(a.bbox.x1<b.bbox.x0||b.bbox.x1<a.bbox.x0)))}
function better(candidate:OcrResult,current:OcrResult){return candidate.data.text.replace(/\s/g,'').length>=current.data.text.replace(/\s/g,'').length*.85&&resultScore(candidate)>resultScore(current)}
export async function readPdfText(bytes:Uint8Array,reader:any,onProgress:(page:number,total:number)=>void=()=>{},options:{forceOcr?:boolean;onOcrProgress?:(message:string)=>void}={}){
 const task=reader.getDocument({data:bytes,isEvalSupported:false,standardFontDataUrl:'/pdf-fonts/',cMapUrl:'/pdf-cmaps/',cMapPacked:true});
 let worker:OcrWorker|undefined;let currentPage=0,total=0,ocrPages=0;
 const status=(message:string)=>options.onOcrProgress?.(message);
 try{
  const pdf=await task.promise;total=pdf.numPages;
  if(total>100)throw Error('PDF-filen får innehålla högst 100 sidor. Dela upp filen.');
  const pages:string[]=[];let length=0;
  for(let i=1;i<=total;i++){
   currentPage=i;onProgress(i,total);const page=await pdf.getPage(i);
   try{
    const content=await page.getTextContent();const items=Array.isArray(content.items)?content.items:[];
    let text=extractPdfText(items);
    if(options.forceOcr||needsOcr(text,items)){
     if(++ocrPages>25)throw Error('Högst 25 sidor kan texttolkas med OCR per import. Dela upp PDF-filen.');
     if(!worker){
      status('Läser in noggrann OCR · svensk språkmodell…');
      const {createWorker}=await import('tesseract.js');
      // Swedish is primary, so a/ä/å and o/ö are not competing with English dictionaries.
      // The Swedish model also recognizes Latin text in English passages.
      let failed=false;let timer:ReturnType<typeof setTimeout>|undefined;let rejectStartup:(error:unknown)=>void=()=>{};const startupError=new Promise<never>((_,reject)=>{rejectStartup=reject});
      const loading=createWorker('swe',1,{
       workerPath:'/ocr-worker-6.0.1.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
       langPath:OCR_LANG_PATH,cachePath:'larvy-ocr-swe-best-v2',
       logger:(event:any)=>{if(event.status==='recognizing text')status(`Texttolkar sida ${currentPage} av ${total} · ${Math.round((event.progress||0)*100)} %`)},
       errorHandler:(error:any)=>rejectStartup(error),
      });
      loading.then(w=>{if(failed)void w.terminate()},()=>{});
      try{worker=await Promise.race([loading,startupError,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('OCR timeout')),90000)})])}
      catch{failed=true;throw Error('OCR kunde inte startas. Kontrollera internetanslutningen och försök igen. Det noggrannare språkstödet laddas ner första gången.')}
      finally{if(timer)clearTimeout(timer)}
     }
     status(`Texttolkar sida ${i} av ${total}…`);
     const base=page.getViewport({scale:1});const {scale,dpi}=ocrViewport(base);
     const viewport=page.getViewport({scale});const canvas=document.createElement('canvas');const border=20;
     canvas.width=Math.ceil(viewport.width)+border*2;canvas.height=Math.ceil(viewport.height)+border*2;
     try{
      const context=canvas.getContext('2d');if(!context)throw Error('Webbläsaren kan inte skapa en bild för OCR.');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:context,viewport,transform:[1,0,0,1,border,border],background:'rgb(255,255,255)'}).promise;
      const params={rotateAuto:true,tessedit_pageseg_mode:'3',user_defined_dpi:String(dpi),preserve_interword_spaces:'1'};
      let result=await worker.recognize(canvas,params,{blocks:true});
      if(result.data.confidence<85||uncertain(result)>0){
       status(`Texttolkar med förbättrad bild · sida ${i} av ${total}…`);
       const column=singleColumn(result),enhanced=column?canvas:contrastCopy(canvas);
       try{
        const layout=column?'6':'3';
        const retry=await worker.recognize(enhanced,{...params,tessedit_pageseg_mode:layout,thresholding_method:column?'1':'2'},{blocks:true});
        if(better(retry,result))result=retry;
        if(column&&uncertain(result)>0){
         const alternative=await worker.recognize(canvas,{...params,tessedit_pageseg_mode:'6',thresholding_method:'2'},{blocks:true});
         if(better(alternative,result))result=alternative;
        }
       }finally{if(enhanced!==canvas){enhanced.width=0;enhanced.height=0}}
      }
      const recognized=result.data.text.normalize('NFC').trim();if(recognized)text=recognized;
     }finally{canvas.width=0;canvas.height=0}
    }
    length+=text.length+2;if(length>150000)throw Error('PDF-texten är för lång. Dela upp filen.');pages.push(text);
   }finally{page.cleanup()}
  }
  const text=pages.join('\n\n').trim();if(!text)throw Error('Ingen text kunde tolkas i PDF-filen. Prova en tydligare skanning eller skriv texten manuellt.');return text;
 }catch(error){
  if((error as Error)?.name==='PasswordException')throw Error('PDF-filen är lösenordsskyddad. Ladda upp en upplåst kopia.');
  if((error as Error)?.name==='InvalidPDFException')throw Error('PDF-filen kunde inte läsas. Kontrollera att filen är en giltig PDF eller spara om den som PDF.');
  throw error;
 }finally{try{await worker?.terminate()}catch{}try{await task.destroy()}catch{}}
}
