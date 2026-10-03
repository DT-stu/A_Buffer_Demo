"use strict";

const canvas = document.getElementById("sceneCanvas");
const context = canvas.getContext("2d", { alpha:false });
const sideCanvas = document.getElementById("sideCanvas");
const sideContext = sideCanvas.getContext("2d");
const WIDTH=canvas.width, HEIGHT=canvas.height, BACKGROUND=[102,112,120], PROJECTION_DISTANCE=500;
let objects=[], mode="z", selectedIndex=0, lastABuffer=[], inspectedPixel={x:250,y:175}, sideCameraAngle=0;

const ui={
  zMode:document.getElementById("zMode"), aMode:document.getElementById("aMode"),
  toggle:document.getElementById("toggleMode"), reset:document.getElementById("resetScene"),
  modeLabel:document.getElementById("modeLabel"), modeExplanation:document.getElementById("modeExplanation"), objectControls:document.getElementById("objectControls"),
  debug:document.getElementById("debugPanel"), pixelTitle:document.getElementById("pixelTitle"),
  samples:document.getElementById("sampleDetails"), cameraAngle:document.getElementById("cameraAngle"),
  cameraAngleValue:document.getElementById("cameraAngleValue"), cameraLeft:document.getElementById("cameraLeft"),
  cameraRight:document.getElementById("cameraRight")
};

const meshes={
  cube:{
    vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    faces:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[1,2,6],[1,6,5],[0,4,7],[0,7,3]]
  },
  pyramid:{
    vertices:[[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1],[0,-1.25,0]],
    faces:[[0,2,1],[0,3,2],[0,1,4],[1,2,4],[2,3,4],[3,0,4]]
  },
  octahedron:{
    vertices:[[0,-1.25,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1.25,0]],
    faces:[[0,2,1],[0,3,2],[0,4,3],[0,1,4],[5,1,2],[5,2,3],[5,3,4],[5,4,1]]
  },
  prism:{
    vertices:[[-1,1,-1],[1,1,-1],[0,-1,-1],[-1,1,1],[1,1,1],[0,-1,1]],
    faces:[[0,2,1],[3,4,5],[0,1,4],[0,4,3],[1,2,5],[1,5,4],[2,0,3],[2,3,5]]
  }
};

function createScene(){
  objects=[
    {name:"Red cube",mesh:"cube",x:190,y:145,size:72,color:[238,72,74],alpha:.42,depth:.22},
    {name:"Green pyramid",mesh:"pyramid",x:285,y:145,size:78,color:[55,205,123],alpha:.44,depth:.62},
    {name:"Blue octahedron",mesh:"octahedron",x:225,y:210,size:76,color:[54,130,246],alpha:.48,depth:.42},
    {name:"Yellow prism",mesh:"prism",x:300,y:205,size:72,color:[250,205,65],alpha:.40,depth:.78}
  ];
  selectedIndex=0; buildObjectControls();
}

function buildObjectControls(){
  ui.objectControls.innerHTML=objects.map((o,i)=>`
    <section class="object-card${i===selectedIndex?" active":""}" data-index="${i}" style="--object-color:rgb(${o.color.join(",")})">
      <div class="object-card-head"><strong>${o.name}</strong><span class="position-output">x ${o.x} · y ${o.y}</span></div>
      <div class="compact-control"><label for="depth-${i}">Depth</label><input id="depth-${i}" data-property="depth" type="range" min="0.05" max="0.95" step="0.01" value="${o.depth}"><output>${o.depth.toFixed(2)}</output></div>
      <div class="compact-control"><label for="alpha-${i}">Alpha</label><input id="alpha-${i}" data-property="alpha" type="range" min="0.05" max="1" step="0.01" value="${o.alpha}"><output>${o.alpha.toFixed(2)}</output></div>
      <div class="move-controls"><span>Move</span><button type="button" data-move="left">←</button><button type="button" data-move="up">↑</button><button type="button" data-move="down">↓</button><button type="button" data-move="right">→</button></div>
    </section>`).join("");
}

function clearBuffers(){
  const count=WIDTH*HEIGHT;
  return {image:context.createImageData(WIDTH,HEIGHT),depths:new Float32Array(count).fill(Infinity),colors:Array(count),samples:Array.from({length:count},()=>[])};
}

function transformedVertices(object){
  const zCenter=80+object.depth*480;
  return meshes[object.mesh].vertices.map(([x,y,z])=>({x:object.x+x*object.size,y:object.y+y*object.size,z:zCenter+z*object.size*.72}));
}

function projectFront(vertex){
  const scale=PROJECTION_DISTANCE/(PROJECTION_DISTANCE+vertex.z);
  return {x:WIDTH/2+(vertex.x-WIDTH/2)*scale,y:HEIGHT/2+(vertex.y-HEIGHT/2)*scale,z:vertex.z};
}

function shadedColor(color,triangleIndex){
  const shade=.72+(triangleIndex%4)*.075;
  return color.map(c=>Math.min(255,Math.round(c*shade)));
}

function sceneTriangles(){
  const triangles=[];
  objects.forEach((object,objectIndex)=>{
    const world=transformedVertices(object), projected=world.map(projectFront);
    meshes[object.mesh].faces.forEach((face,faceIndex)=>triangles.push({
      points:face.map(i=>projected[i]), color:shadedColor(object.color,faceIndex), alpha:object.alpha,
      name:object.name, objectIndex
    }));
  });
  return triangles;
}

function edgeValue(a,b,x,y){return (b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);}
function isTopLeftEdge(a,b){const dx=b.x-a.x,dy=b.y-a.y;return dy<0||(dy===0&&dx>0);}
function passesEdge(value,topLeft){const epsilon=.000001;return value>epsilon||(Math.abs(value)<=epsilon&&topLeft);}

function rasterizeTriangle(triangle,visit){
  let [a,b,c]=triangle.points;
  const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))), maxX=Math.min(WIDTH-1,Math.ceil(Math.max(a.x,b.x,c.x)));
  const minY=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))), maxY=Math.min(HEIGHT-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  let area=edgeValue(a,b,c.x,c.y);
  if(Math.abs(area)<.001)return;
  if(area<0){[b,c]=[c,b];area=-area;}
  const edge1TopLeft=isTopLeftEdge(b,c),edge2TopLeft=isTopLeftEdge(c,a),edge3TopLeft=isTopLeftEdge(a,b);
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const px=x+.5,py=y+.5;
    const edge1=edgeValue(b,c,px,py),edge2=edgeValue(c,a,px,py),edge3=edgeValue(a,b,px,py);
    if(passesEdge(edge1,edge1TopLeft)&&passesEdge(edge2,edge2TopLeft)&&passesEdge(edge3,edge3TopLeft)){
      const w1=edge1/area,w2=edge2/area,w3=edge3/area;
      // Screen-space weights must interpolate reciprocal distance after perspective projection.
      const inverseDistance=w1/(PROJECTION_DISTANCE+a.z)+w2/(PROJECTION_DISTANCE+b.z)+w3/(PROJECTION_DISTANCE+c.z);
      const depth=1/inverseDistance-PROJECTION_DISTANCE;
      visit(y*WIDTH+x,depth);
    }
  }
}

function blendColor(source,alpha,destination){return source.map((c,i)=>alpha*c+(1-alpha)*destination[i]);}
function writePixel(data,index,color){const p=index*4;data[p]=Math.round(color[0]);data[p+1]=Math.round(color[1]);data[p+2]=Math.round(color[2]);data[p+3]=255;}

function rasterizeObjectToZBuffer(triangle,buffers){
  rasterizeTriangle(triangle,(pixel,depth)=>{
    if(depth<buffers.depths[pixel]){buffers.depths[pixel]=depth;buffers.colors[pixel]=blendColor(triangle.color,triangle.alpha,BACKGROUND);}
  });
}
function renderWithZBuffer(buffers,triangles){
  triangles.forEach(t=>rasterizeObjectToZBuffer(t,buffers));
  for(let i=0;i<buffers.colors.length;i++)writePixel(buffers.image.data,i,buffers.colors[i]||BACKGROUND);
}
function rasterizeObjectToABuffer(triangle,samples){
  rasterizeTriangle(triangle,(pixel,depth)=>samples[pixel].push({depth,color:[...triangle.color],alpha:triangle.alpha,name:triangle.name,objectIndex:triangle.objectIndex}));
}
function renderWithABuffer(buffers,triangles){
  triangles.forEach(t=>rasterizeObjectToABuffer(t,buffers.samples));
  for(let i=0;i<buffers.samples.length;i++){
    // Alpha blending is order-dependent, so distant fragments must be accumulated first.
    buffers.samples[i].sort((a,b)=>b.depth-a.depth);
    let color=BACKGROUND;
    for(const sample of buffers.samples[i])color=blendColor(sample.color,sample.alpha,color);
    writePixel(buffers.image.data,i,color);
  }
}

function renderScene(){
  const buffers=clearBuffers(),triangles=sceneTriangles();
  if(mode==="z")renderWithZBuffer(buffers,triangles);else renderWithABuffer(buffers,triangles);
  if(mode==="z")triangles.forEach(t=>rasterizeObjectToABuffer(t,buffers.samples));
  lastABuffer=buffers.samples;context.putImageData(buffers.image,0,0);renderSideView();updateControls();
  if(inspectedPixel)updatePixelInspector(inspectedPixel.x,inspectedPixel.y);
}

function renderSideView(){
  const w=sideCanvas.width,h=sideCanvas.height;
  sideContext.clearRect(0,0,w,h);sideContext.fillStyle="#11171c";sideContext.fillRect(0,0,w,h);
  sideContext.fillStyle="#9eabb5";sideContext.font="12px system-ui";sideContext.fillText(`ORBIT CAMERA · ${Math.round(sideCameraAngle)}°`,12,18);
  sideContext.strokeStyle="#53616a";sideContext.beginPath();sideContext.moveTo(42,h-24);sideContext.lineTo(w-20,h-24);sideContext.stroke();
  const sideTriangles=[];
  const radians=sideCameraAngle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  objects.forEach((object,objectIndex)=>{
    const world=transformedVertices(object);
    // Orbiting around Z rotates the camera basis in the XY plane. Z remains the
    // horizontal axis, while the vertical and camera-depth axes rotate together.
    const sidePoints=world.map(v=>{
      const centeredX=v.x-WIDTH/2,centeredY=v.y-HEIGHT/2;
      const viewVertical=-centeredX*sin+centeredY*cos;
      const cameraDepth=centeredX*cos+centeredY*sin;
      return {x:42+(v.z/620)*(w-70),y:h/2+viewVertical*(h-46)/HEIGHT,cameraDepth};
    });
    meshes[object.mesh].faces.forEach((face,faceIndex)=>sideTriangles.push({points:face.map(i=>sidePoints[i]),color:shadedColor(object.color,faceIndex),alpha:Math.max(.28,object.alpha),depth:face.reduce((sum,i)=>sum+sidePoints[i].cameraDepth,0)/3,objectIndex}));
  });
  sideTriangles.sort((a,b)=>b.depth-a.depth);
  for(const triangle of sideTriangles){
    const [a,b,c]=triangle.points;sideContext.beginPath();sideContext.moveTo(a.x,a.y);sideContext.lineTo(b.x,b.y);sideContext.lineTo(c.x,c.y);sideContext.closePath();
    sideContext.fillStyle=`rgba(${triangle.color.join(",")},${triangle.alpha})`;sideContext.fill();sideContext.strokeStyle="rgba(240,245,248,.22)";sideContext.stroke();
  }
  sideContext.fillStyle="#9eabb5";sideContext.fillText("NEAR",43,h-7);sideContext.fillText("FAR",w-42,h-7);
}

function updateControls(){
  ui.modeLabel.textContent=mode==="z"?"Z-buffer":"A-buffer";ui.zMode.classList.toggle("active",mode==="z");ui.aMode.classList.toggle("active",mode==="a");
  ui.modeExplanation.textContent=mode==="z"
    ?"Keeps only the nearest triangle sample at each pixel. Transparent surfaces behind it are discarded."
    :"Keeps every triangle sample, sorts them from far to near, then alpha-blends every layer over the background.";
  ui.objectControls.querySelectorAll(".object-card").forEach((card,index)=>{
    const object=objects[index];card.classList.toggle("active",index===selectedIndex);card.querySelector(".position-output").textContent=`x ${Math.round(object.x)} · y ${Math.round(object.y)}`;
    for(const property of ["depth","alpha"]){const input=card.querySelector(`[data-property="${property}"]`);input.value=object[property];input.nextElementSibling.value=object[property].toFixed(2);}
  });
}
function setMode(next){mode=next;renderScene();}
function resetScene(){createScene();inspectedPixel={x:250,y:175};sideCameraAngle=0;ui.cameraAngle.value=0;renderScene();}
function setSideCameraAngle(angle){sideCameraAngle=(Number(angle)+360)%360;ui.cameraAngle.value=sideCameraAngle;ui.cameraAngleValue.value=`${Math.round(sideCameraAngle)}°`;renderSideView();}
function moveObject(object,direction){const step=5;if(direction==="left")object.x=Math.max(35,object.x-step);if(direction==="right")object.x=Math.min(WIDTH-35,object.x+step);if(direction==="up")object.y=Math.max(35,object.y-step);if(direction==="down")object.y=Math.min(HEIGHT-35,object.y+step);renderScene();}
function inspectPixel(event){
  const rect=canvas.getBoundingClientRect(),x=Math.min(WIDTH-1,Math.max(0,Math.floor((event.clientX-rect.left)*WIDTH/rect.width))),y=Math.min(HEIGHT-1,Math.max(0,Math.floor((event.clientY-rect.top)*HEIGHT/rect.height)));
  inspectedPixel={x,y};updatePixelInspector(x,y);
}
function updatePixelInspector(x,y){
  const samples=[...lastABuffer[y*WIDTH+x]].sort((a,b)=>b.depth-a.depth);ui.debug.hidden=false;ui.pixelTitle.textContent=`Pixel (${x}, ${y}) · ${samples.length} triangle sample${samples.length===1?"":"s"}`;
  ui.samples.innerHTML=samples.length?`<p>Blend order: far → near</p><div class="samples">${samples.map((s,i)=>`<div class="sample"><span class="chip" style="background:rgb(${s.color.join(",")})"></span><strong>${i+1}. ${s.name}</strong><br>depth ${s.depth.toFixed(1)} · alpha ${s.alpha.toFixed(2)}<br>RGB(${s.color.join(", ")})</div>`).join("")}</div>`:"<p>No shape covers this pixel; only the background is visible.</p>";
}

ui.zMode.addEventListener("click",()=>setMode("z"));ui.aMode.addEventListener("click",()=>setMode("a"));ui.toggle.addEventListener("click",()=>setMode(mode==="z"?"a":"z"));ui.reset.addEventListener("click",resetScene);
ui.objectControls.addEventListener("click",event=>{const card=event.target.closest(".object-card");if(!card)return;selectedIndex=Number(card.dataset.index);const direction=event.target.dataset.move;if(direction)moveObject(objects[selectedIndex],direction);else updateControls();});
ui.objectControls.addEventListener("input",event=>{const property=event.target.dataset.property;if(!property)return;selectedIndex=Number(event.target.closest(".object-card").dataset.index);objects[selectedIndex][property]=Number(event.target.value);renderScene();});
canvas.addEventListener("click",inspectPixel);
canvas.addEventListener("pointermove",inspectPixel);
ui.cameraAngle.addEventListener("input",event=>setSideCameraAngle(event.target.value));
ui.cameraLeft.addEventListener("click",()=>setSideCameraAngle(sideCameraAngle-15));
ui.cameraRight.addEventListener("click",()=>setSideCameraAngle(sideCameraAngle+15));
document.addEventListener("keydown",event=>{if(event.target.matches("input, select"))return;if(event.key==="1")setMode("z");else if(event.key==="2")setMode("a");else if(event.code==="Space"){event.preventDefault();setMode(mode==="z"?"a":"z");}else if(event.key.toLowerCase()==="r")resetScene();else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();moveObject(objects[selectedIndex],event.key.replace("Arrow","").toLowerCase());}});

createScene();renderScene();
