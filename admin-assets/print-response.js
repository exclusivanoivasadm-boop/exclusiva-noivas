import {responseLabels} from './responses.js';
export const printCSS = `@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#172620;background:white;font:10pt/1.35 Arial,sans-serif}article{width:190mm}h1{font-size:18pt;margin:0 0 3mm}h2{font-size:12pt;margin:0 0 4mm}p{margin:0 0 3mm}.field{margin:0 0 2mm;overflow-wrap:anywhere;white-space:pre-wrap}.label{font-weight:bold}header{border-bottom:1px solid #aaa;margin-bottom:4mm;padding-bottom:2mm}footer{margin-top:4mm;font-size:8pt;color:#555}@media print{article{width:auto}}`;
export function populatePrint(doc,record){
 doc.documentElement.lang='pt-BR';doc.title='Preparação da visita | Exclusiva Noivas';
 const style=doc.createElement('style');style.textContent=printCSS;doc.head.append(style);
 const article=doc.createElement('article'),header=doc.createElement('header');
 const add=(parent,tag,text,cls)=>{const el=doc.createElement(tag);el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
 add(header,'h1','Exclusiva Noivas');add(header,'h2','Preparação da visita');add(header,'p',record.name||'Noiva');article.append(header);
 for(const [key,label] of Object.entries(responseLabels)){let value=record.answers?.[key];if(Array.isArray(value))value=value.join(' · ');if(typeof value!=='string'||!value.trim())continue;if(key==='eventDate'&&/^\d{4}-\d{2}-\d{2}$/.test(value))value=value.split('-').reverse().join('/');const field=doc.createElement('div');field.className='field';add(field,'span',label+': ','label');add(field,'span',value);article.append(field);}
 add(article,'footer','Uso interno · Exclusiva Noivas · Dados para preparar o atendimento.');doc.body.append(article);return article;
}
let activeFrame=null;
export function clearResponsePrint(){if(activeFrame){activeFrame.remove();activeFrame=null;}}
export async function printResponse(record,isCurrent,notify){
 if(activeFrame||!isCurrent())return;
 const frame=document.createElement('iframe');activeFrame=frame;frame.title='Impressão da preparação';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;';document.body.append(frame);
 try{const doc=frame.contentDocument;const article=populatePrint(doc,record);await doc.fonts?.ready;
 if(!isCurrent()||activeFrame!==frame){clearResponsePrint();return;}
 const probe=doc.createElement('div');probe.style.height='277mm';doc.body.append(probe);const maxHeight=probe.getBoundingClientRect().height;probe.remove();
 if(article.getBoundingClientRect().height>maxHeight){notify('Estas respostas ultrapassam uma página A4. Serão impressas em mais páginas, sem cortar o conteúdo.');window.alert('Estas respostas ultrapassam uma página A4. A impressão continuará em mais páginas, sem cortar o conteúdo.');}
 if(!isCurrent()){clearResponsePrint();return;}
 frame.contentWindow.addEventListener('afterprint',clearResponsePrint,{once:true});frame.contentWindow.focus();frame.contentWindow.print();
 }catch{clearResponsePrint();notify('Não foi possível abrir a impressão. Tente novamente.');}
}
