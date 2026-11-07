"use strict";
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..", "frontend");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cyber-pulse-preview-"));
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
function zip(entries) {
  const parts=[], central=[]; let offset=0;
  for(const [name,content] of entries) {
    const n=Buffer.from(name), data=Buffer.from(content);
    let crc=0xffffffff;
    for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
    crc=(crc^0xffffffff)>>>0;
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    parts.push(h,n,data);central.push(c,n);offset+=h.length+n.length+data.length;
  }
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.reduce((a,b)=>a+b.length,0),12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,...central,end]);
}
const epub=zip([
  ["META-INF/container.xml",'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'],
  ["book.opf",'<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Demo</dc:title></metadata><manifest><item id="page" href="page.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="page"/></spine></package>'],
  ["page.xhtml",'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>demo</title></head><body><img src="cover.png" alt="Cover"/><h1>Prima pagina</h1><script>window.parent.bad=1</script></body></html>'],
  ["cover.png",image],
]);
function pdf() {
  const stream="BT /F1 20 Tf 40 300 Td (Prima pagina) Tj ET\n";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${stream.length} >>\nstream\n${stream}endstream`];
  let out="%PDF-1.4\n";const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(out);out+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;for(const n of offsets.slice(1))out+=`${String(n).padStart(10,"0")} 00000 n \n`;
  return Buffer.from(out+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
const html=`<!doctype html><html><head><meta charset="utf-8"><style>:root{--surface:#fff;--surface-muted:#eee;--text:#222;--text-muted:#555;--border:#aaa;--accent:#1765ca;--accent-soft:#ddf;--radius:12px;--header-height:56px}*{box-sizing:border-box}body{font-family:sans-serif}</style><script>window.CyberPulseAuth={getUser:()=>({uid:"fake"})}</script><script defer src="/assets/js/modules/library.js"></script></head><body><main id="home"><div id="home-page"></div></main></body></html>`;
const server=http.createServer((req,res)=>{
  if(req.url==="/"){res.writeHead(200,{"Content-Type":"text/html"});return res.end(html);}
  if(req.url==="/test.epub")return res.end(epub);
  if(req.url==="/test.pdf")return res.end(pdf());
  const file=path.join(root,decodeURIComponent(req.url.split("?")[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.writeHead(200,{"Content-Type":"text/javascript"});res.end(data);});
});
const sleep=(n)=>new Promise(r=>setTimeout(r,n));
async function main(){
  const chromePath = process.env.CHROME_PATH || (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "google-chrome");
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const chrome=spawn(chromePath,["--headless","--disable-gpu","--disable-background-networking","--no-first-run","--remote-debugging-port=0",`--user-data-dir=${profile}`,`${origin}/`],{stdio:"ignore"});
  try{
    let launchError;
    chrome.on("error",error=>{launchError=error;});
    let pages;
    for(let i=0;i<80;i++){
      if(launchError) throw launchError;
      try{
        const port=fs.readFileSync(path.join(profile,"DevToolsActivePort"),"utf8").split("\n")[0];
        pages=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
        if(pages.some(p=>p.url.startsWith(origin))) break;
      }catch{await sleep(250);}
    }
    const target=pages?.find(p=>p.url.startsWith(origin));if(!target)throw Error("Browser not ready");
    const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});await sleep(2500);
    let id=0;function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;const listener=e=>{const m=JSON.parse(e.data);if(m.id!==n)return;ws.removeEventListener("message",listener);m.error?reject(Error(m.error.message)):resolve(m.result);};ws.addEventListener("message",listener);ws.send(JSON.stringify({id:n,method,params}));});}
    async function run(expression){const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
    await run(`(async()=>{for(let i=0;i<100;i++){if(location.origin===${JSON.stringify(origin)} && document.readyState==="complete" && window.CyberPulseLibrary)return;await new Promise(r=>setTimeout(r,100));}throw Error("Page not ready: "+location.href+" "+document.title);})()`);
    const result=await run(`(async()=>{
      const wait=async(f,label)=>{for(let i=0;i<240;i++){if(f())return;await new Promise(r=>setTimeout(r,50));}throw Error("Timeout: "+label)};
      const req=indexedDB.open("cyber-pulse-library",3);
      const db=await new Promise((resolve,reject)=>{req.onupgradeneeded=()=>["books","folders","history"].forEach(n=>req.result.createObjectStore(n,{keyPath:"id"}));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      const data=[{id:"epub",title:"EPUB test",name:"test.epub",type:"epub",file:await(await fetch("/test.epub")).blob()},{id:"pdf",title:"PDF test",name:"test.pdf",type:"pdf",file:await(await fetch("/test.pdf")).blob()},{id:"bad",title:"PDF guasto",name:"bad.pdf",type:"pdf",file:new Blob(["invalid pdf"])}];
      const tx=db.transaction("books","readwrite");data.forEach(f=>tx.objectStore("books").put({...f,size:f.file.size,added:Date.now(),author:"",year:""}));await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=()=>j(tx.error)});
      const progress=JSON.stringify({epub:{ch:1,frac:.5,pct:50,updated:1},pdf:{page:3,updated:1}});localStorage.setItem("cyber-pulse.library.state",progress);
      window.CyberPulseLibrary.open();await wait(()=>document.querySelectorAll(".lb-book").length===3,"shelf");
      await wait(()=>[...document.querySelectorAll(".lb-book")].some(e=>e.querySelector(".lb-name")?.textContent==="PDF test" && e.querySelector(".lb-cover img")?.naturalWidth),"PDF thumbnail");
      const epubCard=[...document.querySelectorAll(".lb-book")].find(e=>e.querySelector(".lb-name")?.textContent==="EPUB test");
      const badCard=[...document.querySelectorAll(".lb-book")].find(e=>e.querySelector(".lb-name")?.textContent==="PDF guasto");
      badCard.querySelector(".lb-preview-button").click();
      await wait(()=>document.querySelector(".lb-first-preview [role=status]")?.textContent.startsWith("Impossibile"),"invalid PDF error");
      document.querySelector(".lb-first-preview-header button").click();
      await wait(()=>!document.querySelector(".lb-first-preview"),"close invalid PDF");
      epubCard.querySelector(".lb-preview-button").click();
      await wait(()=>document.querySelector(".lb-first-preview iframe")?.contentDocument?.querySelector("img")?.complete,"EPUB image");
      const frame=document.querySelector(".lb-first-preview iframe");
      const cover=frame.contentDocument.querySelector("img");if(!cover.naturalWidth)throw Error("EPUB cover failed to load");
      if(frame.getAttribute("sandbox")!=="allow-same-origin")throw Error("incorrect sandbox");
      if(window.bad)throw Error("EPUB script executed");
      if(!frame.contentDocument.querySelector('meta[http-equiv="Content-Security-Policy"]'))throw Error("missing CSP");
      document.querySelector(".lb-first-preview-header button").click();
      await wait(()=>!document.querySelector(".lb-first-preview"),"close");
      epubCard.querySelector('.lb-actions [aria-label^="Modifica"]').click();
      await wait(()=>document.querySelector(".lb-tools[open] .lb-preview-button"),"rename preview");
      document.querySelector(".lb-tools .lb-preview-button").click();
      await wait(()=>document.querySelector(".lb-first-preview iframe")?.contentDocument?.querySelector("img")?.naturalWidth,"rename EPUB cover");
      document.querySelector(".lb-first-preview-header button").click();
      await wait(()=>!document.querySelector(".lb-first-preview"),"close rename preview");
      document.querySelector(".lb-tools").close();
      await wait(()=>document.querySelector(".lb-book .lb-preview-button"),"shelf restored");
      document.querySelector('[aria-label="Impostazioni della Libreria"]').click();
      await wait(()=>document.querySelector(".lb-settings-dialog[open]"),"settings");
      [...document.querySelectorAll(".lb-settings-dialog button")].find(b=>b.textContent.includes("Scaffale")).click();
      await wait(()=>document.querySelector('.lb-settings-dialog select[aria-label="Vista dello scaffale"]'),"shelf settings");
      const select=document.querySelector('.lb-settings-dialog select[aria-label="Vista dello scaffale"]');select.value="folders";select.dispatchEvent(new Event("change",{bubbles:true}));
      document.querySelector(".lb-settings-close").click();
      await wait(()=>document.querySelector(".lb-row-folder"),"folder");
      document.querySelector(".lb-row-folder").click();
      await wait(()=>[...document.querySelectorAll(".lb-row")].some(e=>e.querySelector('[aria-label="Apri PDF test"] .lb-row-thumb img')?.naturalWidth),"folder PDF cover");
      [...document.querySelectorAll(".lb-row .lb-preview-button")].find(b=>b.getAttribute("aria-label").includes("EPUB test")).click();
      await wait(()=>document.querySelector(".lb-first-preview iframe")?.contentDocument?.querySelector("img")?.naturalWidth,"folder EPUB cover");
      document.querySelector(".lb-first-preview-header button").click();
      await wait(()=>!document.querySelector(".lb-first-preview"),"close folder preview");
      for (const [value, width] of [["small",32],["medium",40],["large",64]]) {
        const size=document.querySelector('select[aria-label="Dimensione copertine"]');
        if(!size)throw Error("Folder cover size control missing");
        size.value=value;size.dispatchEvent(new Event("change",{bubbles:true}));
        await wait(()=>document.querySelector(".lb-row-thumb")?.getBoundingClientRect().width===width && document.activeElement?.getAttribute("aria-label")==="Dimensione copertine", "cover size "+value);
        const saved=JSON.parse(localStorage.getItem("cyber-pulse.library.prefs"));
        if(saved.coverSize!==value)throw Error("Cover size not saved: "+value);
      }
      if(localStorage.getItem("cyber-pulse.library.state")!==progress)throw Error("Progress changed");
      return "PASS real EPUB images in grid, rename and folder views; PDF thumbnails and errors; folder cover sizes; sandbox and unchanged progress";
    })()`);
    console.log(result);
    await send("Emulation.setDeviceMetricsOverride",{width:320,height:700,deviceScaleFactor:1,mobile:true});
    const mobile=await run(`(()=>{
      const row=document.querySelector(".lb-row:has(.lb-row-thumb)");
      const cover=row.querySelector(".lb-row-thumb").getBoundingClientRect();
      const title=row.querySelector(".lb-row-text").getBoundingClientRect();
      const controls=[...row.querySelectorAll("button")].map(b=>b.getBoundingClientRect());
      if(cover.width!==64||title.width<35||controls.some(r=>r.left<0||r.right>innerWidth)||document.documentElement.scrollWidth>innerWidth)
        throw Error("Folder row overflow at 320px");
      return "PASS 320px folder row with large covers";
    })()`);
    console.log(mobile);
    await send("Page.reload");
    await sleep(1500);
    const restored=await run(`(async()=>{
      const wait=async(f,label)=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,50));}throw Error("Timeout: "+label)};
      await wait(()=>window.CyberPulseLibrary && document.readyState==="complete","reload");
      window.CyberPulseLibrary.open();
      await wait(()=>document.querySelector(".lb-row-folder"),"restored folder");
      document.querySelector(".lb-row-folder").click();
      await wait(()=>document.querySelector(".lb-row-thumb"),"restored books");
      if(document.querySelector(".lb-row-thumb").getBoundingClientRect().width!==64
        || document.querySelector('select[aria-label="Dimensione copertine"]').value!=="large") throw Error("Cover size not restored");
      document.querySelector('[aria-label="Impostazioni della Libreria"]').click();
      await wait(()=>document.querySelector(".lb-settings-dialog[open]"),"settings");
      [...document.querySelectorAll(".lb-settings-dialog button")].find(b=>b.textContent.includes("Scaffale")).click();
      await wait(()=>document.querySelector('.lb-settings-dialog select[aria-label="Dimensione copertine"]'),"cover settings");
      if(document.querySelector('.lb-settings-dialog select[aria-label="Dimensione copertine"]').value!=="large")throw Error("Size settings out of sync");
      const view=document.querySelector('.lb-settings-dialog select[aria-label="Vista dello scaffale"]');
      view.value="flat";view.dispatchEvent(new Event("change",{bubbles:true}));
      document.querySelector(".lb-settings-close").click();
      await wait(()=>document.querySelector(".lb-grid"),"grid");
      if(document.querySelector(".lb-grid").style.getPropertyValue("--lb-cover-min")!=="220px")throw Error("Grid size not shared");
      return "PASS cover size persisted and shared with settings and grid";
    })()`);
    console.log(restored);
    ws.close();
  }finally{
    chrome.kill();
    server.close();
    await sleep(1000);
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
