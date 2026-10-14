// Procedural synthetic fixtures only. Never camera/customer/property data.
const blobFromCanvas = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
export function serializedBlob(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onload=()=>resolve(reader.result.split(",")[1]); reader.onerror=reject; reader.readAsDataURL(blob);
  });
}
async function raster(blob) {
  const image = new Image(), url = URL.createObjectURL(blob);
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas;
  } finally { image.removeAttribute("src"); URL.revokeObjectURL(url); }
}
export async function sampleCorners(blob) {
  const canvas = await raster(blob), context = canvas.getContext("2d");
  const corners = [[0.15,0.15],[0.85,0.15],[0.15,0.85],[0.85,0.85]].map(([x,y]) => [...context.getImageData(Math.floor(canvas.width*x), Math.floor(canvas.height*y), 1, 1).data].slice(0,3));
  const result = { corners, width: canvas.width, height: canvas.height };
  canvas.width = 0; canvas.height = 0; return result;
}
export async function orientationPhoto(orientation) {
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 64;
  const context = canvas.getContext("2d");
  for (const [color,x,y] of [["#ee2020",0,0],["#20cc20",48,0],["#2020ee",0,32],["#eeee20",48,32]]) {
    context.fillStyle = color; context.fillRect(x,y,48,32);
  }
  const encoded = await blobFromCanvas(canvas, "image/jpeg", 1);
  canvas.width = 0; canvas.height = 0;
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  // EXIF: little-endian TIFF with exactly one SHORT orientation tag.
  const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);
  return new Blob([bytes.slice(0,2), exif, bytes.slice(2)], { type:"image/jpeg" });
}
export async function createSyntheticPhoto(kind, type = "image/png") {
  const canvas = document.createElement("canvas");
  canvas.width = kind === "camera-jpeg" ? 4000 : 2600;
  canvas.height = kind === "camera-jpeg" ? 3000 : 1800;
  const context = canvas.getContext("2d");
  context.scale(canvas.width / 2600, canvas.height / 1800);
  context.fillStyle = kind === "low-light" ? "#17191c" : "#e1ddd3"; context.fillRect(0,0,2600,1800);
  if (kind === "label" || kind === "camera-jpeg") {
    context.fillStyle = "#faf7ec"; context.fillRect(250,180,2100,1420);
    context.fillStyle = "#161616";
    context.font = "bold 74px sans-serif"; context.fillText("SYNTHETIC INSPECTION LABEL",330,340);
    context.font = "32px monospace";
    ["Batch DEMO-1234 • Inspect corners and seals", "Fine text: 0O 1Il 8B 23456789", "Fictitious household item / no personal details", "Label size 32px, reduced to approx 24px"].forEach((line,i) => context.fillText(line,330,440+i*64));
    for(let i=0;i<150;i++){ context.fillRect(330+i*10,850,2+(i%4),330); }
    context.font = "24px monospace"; context.fillText("Fine print: synthetic sample 2026 / revision 81",330,1330);
  } else if (kind === "low-light") {
    const light = context.createRadialGradient(1200,850,20,1200,850,1400); light.addColorStop(0,"#45413c"); light.addColorStop(1,"#111318");
    context.fillStyle = light; context.fillRect(0,0,2600,1800);
    context.fillStyle = "#56524a"; context.fillRect(430,480,640,810);
    context.strokeStyle = "#777060"; context.lineWidth = 5; context.strokeRect(430,480,640,810);
    context.fillStyle = "#293d48"; context.fillRect(1250,700,640,350);
    context.strokeStyle = "#5a6970"; context.lineWidth = 4; context.strokeRect(1250,700,640,350);
    context.fillStyle = "#929080"; context.font="42px sans-serif"; context.fillText("SYNTHETIC LOW LIGHT",660,1480);
  } else {
    context.fillStyle = "#bcb5a8"; context.fillRect(180,150,2240,1490);
    for (let i=0;i<95;i++) { context.strokeStyle = i%2 ? "#cbc4b7" : "#a9a295"; context.lineWidth=2; context.beginPath(); context.moveTo(180,160+i*15); context.lineTo(2420,160+i*15); context.stroke(); }
    context.strokeStyle="#34312b"; context.lineWidth=4; context.beginPath(); context.moveTo(700,420); context.lineTo(930,640); context.lineTo(1100,590); context.lineTo(1310,840); context.lineTo(1460,1190); context.stroke();
    context.strokeStyle="#ece7dd"; context.lineWidth=2; context.beginPath(); context.moveTo(780,720); context.lineTo(1910,470); context.stroke();
    context.fillStyle="#71624d"; context.beginPath(); context.ellipse(1650,1120,200,100,0.2,0,Math.PI*2); context.fill();
    context.fillStyle="#262626"; context.font="42px sans-serif"; context.fillText("SYNTHETIC SURFACE DAMAGE",530,1550);
  }
  // Deterministic low-amplitude sensor/texture noise makes all three synthetic
  // examples approximate real raster detail while staying reproducible.
  const pixels = context.getImageData(0,0,canvas.width,canvas.height); let seed=81;
  for(let i=0;i<pixels.data.length;i+=4){ seed=(Math.imul(seed,1664525)+1013904223)>>>0; const delta=(seed>>>28)-7;
    for(let channel=0;channel<3;channel++) pixels.data[i+channel]=Math.max(0,Math.min(255,pixels.data[i+channel]+delta)); }
  context.putImageData(pixels,0,0);
  const blob = await blobFromCanvas(canvas,type,0.95); canvas.width=0; canvas.height=0; return blob;
}
export async function comparePhotos(source, output, caption) {
  const container = document.querySelector("#comparison");
  for (const image of container.querySelectorAll("img")) URL.revokeObjectURL(image.src);
  container.replaceChildren();
  for(const [blob,label] of [[source,"Source"],[output,"Optimized"]]) {
    const figure=document.createElement("figure"), image=document.createElement("img"), title=document.createElement("figcaption");
    const loaded=new Promise((resolve,reject)=>{ image.onload=resolve; image.onerror=reject; });
    image.src=URL.createObjectURL(blob); title.textContent=`${label} • ${caption} • ${blob.size} bytes`;
    figure.append(title,image); container.append(figure); await loaded;
  }
}
