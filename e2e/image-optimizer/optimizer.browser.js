import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertMetadataSafeChecklistImage } from "../../functions/src/checklistImagePrivacy.js";
import { syntheticChecklistPng } from "../../security/syntheticChecklistImages.mjs";

const artifactRoot = path.resolve(".superpowers/sdd/2026-10-13-checklist-multi-photo-v1/optimizer-benchmarks");
const expected = [
  ["R","G","B","Y"], ["G","R","Y","B"], ["Y","B","G","R"], ["B","Y","R","G"],
  ["R","B","G","Y"], ["B","R","Y","G"], ["Y","G","B","R"], ["G","Y","R","B"],
];
const colors = {R:[238,32,32],G:[32,204,32],B:[32,32,238],Y:[238,238,32]};
// Generated once from a known-sRGB Chromium Canvas with the four same corner
// colors. Test fixture publication keeps just its VP8 pixel stream; production
// never removes an unknown SOURCE color profile. Both browsers decode it here.
const simpleWebp=Buffer.from("UklGRpAAAABXRUJQVlA4IIQAAADwBwCdASpgAEAAPhkKhEEhBatnAAQAYSghwAZdMgvwD8ANUK4B+AH6wf0DnDNAuwH6wf0DP+wSqteS79lmOg/hriByxIuuOwAA/pQwRGKGAi5dx7j2bJFMaHyOwoJT9zeoCOKgAW1iv700U2KPuX6Oc+xDPi2bonEQY+EVPJiC3AAAAAA=","base64");
const requests = new WeakMap();
const label = rgb => Object.keys(colors).sort((a,b)=>colors[a].reduce((n,v,i)=>n+(v-rgb[i])**2,0)-colors[b].reduce((n,v,i)=>n+(v-rgb[i])**2,0))[0];
test.beforeEach(async ({page}) => {
  const urls=[]; requests.set(page,urls); page.on("request",request=>urls.push(request.url()));
  await page.goto("/e2e/image-optimizer/index.html");
  await page.waitForFunction(()=>!!window.optimizerHarness);
});
test.afterEach(async({page})=>{
  expect(requests.get(page).every(url=>url.startsWith("http://127.0.0.1:4207/")||url.startsWith("blob:")||url.startsWith("data:"))).toBe(true);
});
for (let orientation=1;orientation<=8;orientation++) {
  test(`native EXIF orientation ${orientation} applied once and stripped`, async ({page}) => {
    const result=await page.evaluate(async orientation=>{
      const h=window.optimizerHarness, source=await h.orientationPhoto(orientation);
      const start=performance.now(), result=await h.optimizeChecklistImage(source);
      return { ...await h.sampleCorners(result.blob), bytes:Array.from(new Uint8Array(await result.blob.arrayBuffer())),
        originalBytes:result.originalBytes,optimizedBytes:result.optimizedBytes,type:result.contentType,elapsedMs:performance.now()-start };
    },orientation);
    expect(result.width).toBe(orientation>=5?64:96); expect(result.height).toBe(orientation>=5?96:64);
    expect(result.corners.map(label)).toEqual(expected[orientation-1]);
    result.corners.forEach((rgb,i)=>rgb.forEach((v,j)=>expect(Math.abs(v-colors[expected[orientation-1][i]][j])).toBeLessThan(35)));
    expect(result.optimizedBytes).toBeLessThanOrEqual(result.originalBytes); expect(result.elapsedMs).toBeLessThan(20_000);
    assertMetadataSafeChecklistImage(Buffer.from(result.bytes),result.type);
  });
}
for (const kind of ["label","low-light","surface-damage","camera-jpeg"]) {
  test(`synthetic ${kind} bytes, detail and screenshot benchmark`, async ({page},testInfo)=>{
    const result=await page.evaluate(async kind=>{
      const h=window.optimizerHarness, source=await h.createSyntheticPhoto(kind,kind==="camera-jpeg"?"image/jpeg":"image/png");
      const start=performance.now(), result=await h.optimizeChecklistImage(source), elapsedMs=performance.now()-start;
      await h.comparePhotos(source,result.blob,kind);
      return {sourceBytes:source.size,sourceWidth:kind==="camera-jpeg"?4000:2600,sourceHeight:kind==="camera-jpeg"?3000:1800,optimizedBytes:result.optimizedBytes,
        width:result.width,height:result.height,contentType:result.contentType,elapsedMs,
        sourceType:source.type,sourceQuality:source.type==="image/jpeg"?0.95:"lossless",source:await h.serializedBlob(source), output:await h.serializedBlob(result.blob)};
    },kind);
    expect(result.width).toBe(1920); expect(result.height).toBe(kind==="camera-jpeg"?1440:1329); expect(result.optimizedBytes).toBeLessThanOrEqual(result.sourceBytes);
    expect(result.elapsedMs).toBeLessThan(20_000); assertMetadataSafeChecklistImage(Buffer.from(result.output,"base64"),result.contentType);
    const folder=path.join(artifactRoot,testInfo.project.name); await mkdir(folder,{recursive:true});
    await writeFile(path.join(folder,`${kind}-source.${result.sourceType==="image/jpeg"?"jpg":"png"}`),Buffer.from(result.source,"base64"));
    await writeFile(path.join(folder,`${kind}-optimized.jpg`),Buffer.from(result.output,"base64"));
    await page.screenshot({path:path.join(folder,`${kind}-comparison.png`),fullPage:true});
    const fields=["sourceBytes","sourceWidth","sourceHeight","sourceType","sourceQuality","optimizedBytes","width","height","contentType","elapsedMs"];
    await writeFile(path.join(folder,`${kind}.csv`),`${fields.join(",")}\n${fields.map(key=>result[key]).join(",")}\n`);
  });
}
test("efficient small PNG remains exact and metadata-free when JPEG would enlarge it",async({page})=>{
  const sourceBytes=syntheticChecklistPng(68);
  assertMetadataSafeChecklistImage(sourceBytes,"image/png");
  const result=await page.evaluate(async bytes=>{
    const source=new Blob([new Uint8Array(bytes)],{type:"image/png"});
    const optimized=await window.optimizerHarness.optimizeChecklistImage(source);
    return {type:optimized.contentType,width:optimized.width,height:optimized.height,originalBytes:source.size,
      optimizedBytes:optimized.optimizedBytes,source:Array.from(new Uint8Array(await source.arrayBuffer())),output:Array.from(new Uint8Array(await optimized.blob.arrayBuffer()))};
  },Array.from(sourceBytes));
  expect(result.type).toBe("image/png");expect(result.width).toBe(1);expect(result.height).toBe(1);
  expect(result.optimizedBytes).toBe(result.originalBytes);expect(result.output).toEqual(result.source);
  assertMetadataSafeChecklistImage(Buffer.from(result.output),result.type);
});
test("native metadata-free WebP decodes and remains exact if JPEG would enlarge it",async({page})=>{
  assertMetadataSafeChecklistImage(simpleWebp,"image/webp");
  const result=await page.evaluate(async bytes=>{
    const source=new Blob([new Uint8Array(bytes)],{type:"image/webp"});
    const result=await window.optimizerHarness.optimizeChecklistImage(source);
    return {...await window.optimizerHarness.sampleCorners(result.blob),originalBytes:result.originalBytes,optimizedBytes:result.optimizedBytes,type:result.contentType,bytes:Array.from(new Uint8Array(await result.blob.arrayBuffer()))};
  },Array.from(simpleWebp));
  expect(result.width).toBe(96);expect(result.height).toBe(64);expect(result.optimizedBytes).toBeLessThanOrEqual(result.originalBytes);
  expect(result.type).toBe("image/webp");expect(Buffer.from(result.bytes)).toEqual(simpleWebp);
  expect(result.corners.map(label)).toEqual(["R","G","B","Y"]);
  assertMetadataSafeChecklistImage(Buffer.from(result.bytes),result.type);
});
// Current phones: 24 MP (5712x4284), 48 MP (8064x6048) and 50 MP (8160x6120),
// often with depth, HDR or motion data appended after the picture.
for (const [width,height,trailer] of [[5712,4284,0],[8064,6048,0],[8160,6120,0],[5712,4284,200_000]]) {
  test(`current phone photo ${width}x${height}${trailer?" with appended data":""} is reduced and saved clean`,async({page})=>{
    const result=await page.evaluate(async({width,height,trailer})=>{
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d");
      const gradient=context.createLinearGradient(0,0,width,height);
      gradient.addColorStop(0,"#d94f30");gradient.addColorStop(0.5,"#f2e8c9");gradient.addColorStop(1,"#1f5f8b");
      context.fillStyle=gradient;context.fillRect(0,0,width,height);
      for(let i=0;i<400;i++){context.fillStyle=`hsl(${i*37%360} 60% 50%)`;context.fillRect((i*811)%width,(i*577)%height,180,120);}
      const picture=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.92));
      canvas.width=0;canvas.height=0;
      const source=new Blob(trailer?[picture,new Uint8Array(trailer).fill(7)]:[picture],{type:"image/jpeg"});
      const start=performance.now(),optimized=await window.optimizerHarness.optimizeChecklistImage(source);
      return {sourceBytes:source.size,optimizedBytes:optimized.optimizedBytes,width:optimized.width,height:optimized.height,type:optimized.contentType,
        elapsedMs:performance.now()-start,output:await window.optimizerHarness.serializedBlob(optimized.blob)};
    },{width,height,trailer});
    expect(result.width).toBe(1920);expect(result.height).toBe(1440);expect(result.type).toBe("image/jpeg");
    expect(result.optimizedBytes).toBeLessThan(result.sourceBytes);expect(result.optimizedBytes).toBeLessThan(5*1024*1024);
    expect(result.elapsedMs).toBeLessThan(20_000);
    assertMetadataSafeChecklistImage(Buffer.from(result.output,"base64"),result.type);
  });
}
// A messaging-app copy or an edited photo is small and heavily compressed, so
// re-encoding makes it larger. It was refused; it must be saved, clean.
test("small heavily compressed photo that grows when re-encoded is still saved clean",async({page})=>{
  const result=await page.evaluate(async()=>{
    const width=1600,height=1200,canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d");
    for(let i=0;i<6000;i++){context.fillStyle=`hsl(${i*47%360} ${40+i%50}% ${30+i%45}%)`;context.fillRect((i*811)%width,(i*577)%height,40+i%60,30+i%40);}
    const picture=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.3));
    canvas.width=0;canvas.height=0;
    const source=new Blob([picture,new Uint8Array(64).fill(7)],{type:"image/jpeg"});
    const optimized=await window.optimizerHarness.optimizeChecklistImage(source);
    return {sourceBytes:source.size,optimizedBytes:optimized.optimizedBytes,width:optimized.width,height:optimized.height,type:optimized.contentType,
      output:await window.optimizerHarness.serializedBlob(optimized.blob)};
  });
  expect(result.sourceBytes).toBeLessThan(1024*1024);
  expect(result.optimizedBytes).toBeGreaterThan(result.sourceBytes);expect(result.optimizedBytes).toBeLessThan(5*1024*1024);
  expect(result.width).toBe(1600);expect(result.height).toBe(1200);expect(result.type).toBe("image/jpeg");
  assertMetadataSafeChecklistImage(Buffer.from(result.output,"base64"),result.type);
});
