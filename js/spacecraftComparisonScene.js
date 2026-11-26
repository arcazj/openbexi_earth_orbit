import * as THREE from 'three';
import { createPhysicalEarth } from './modelViewerEarth.js';
import { WGS84_A_KM } from './SatelliteConstantLoader.js';
import { resolveSatelliteModel } from './satelliteModelResolver.js';
import { disposeObject, loadGlb, loadGlbGroup, loadObjMtl } from './spacecraftMesh.js';
import { PublishedBeamLayer } from './publishedBeamFootprints.js';
import { geodeticToEcfKm } from './orbit/orbitLinkGeometry.js';

import { earthOccludes, needsLocator } from './comparisonOrbit.js';
import { createComparisonOrbitLayer } from './comparisonOrbitLayer.js';
import { createComparisonCamera } from './comparisonCamera.js';
import { mountAttachment } from './spacecraftAttachmentMesh.js';
import { fullOrbitCameraFrame } from './orbit/selectedOrbitCurve.js';

export { pairMeasurement, prepareComparison, comparisonAt, earthOccludes } from './comparisonOrbit.js';
export { formatTlePosition } from './modelViewerEarth.js';

const R = WGS84_A_KM * 1000;
const up = new THREE.Vector3(0,1,0);
const present = (value, min, max) => Math.max(min, Math.min(max, value));
function perpendicular(axis, preferred) {
    const dir = preferred.clone().addScaledVector(axis,-axis.dot(preferred));
    if (dir.lengthSq() > 1e-8) return dir.normalize();
    return new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < .9 ? up : new THREE.Vector3(1,0,0)).normalize();
}

let modelLibrary;
async function getLibrary() {
    modelLibrary ??= (async () => {
        for (const path of ['api/display-satellite-models','json/display_satellite_models.json']) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    const library = await response.json();
                    if (Array.isArray(library.models)) return library;
                }
            } catch { /* A static deployment carries the same model manifest. */ }
        }
        throw Error('Model catalog unavailable.');
    })().catch(error => {modelLibrary=null; throw error;});
    return modelLibrary;
}

async function hardware(item, library) {
    const manifest = library || await getLibrary();
    const asset = item.model || (item.key.startsWith('model:') ? item.key.slice(6) :
        resolveSatelliteModel(item.row || {norad_id:item.key,satellite_name:item.name}).assetId);
    const entry = manifest.models.find(model => model.id === asset);
    if (!entry) return null;
    const manager = new THREE.LoadingManager();
    const path = manifest.basePath || 'obj/';
    const model = entry.type === 'glb-group' ? await loadGlbGroup(entry,manager,path) :
        entry.files.glb ? await loadGlb(entry,manager,path) : await loadObjMtl(entry,manager,[],path);
    return model;
}

async function systemHardware(system, library) {
    const {item, host, attachment} = system;
    const members = attachment ? [host,attachment.vehicle] : [item];
    const loaded = await Promise.all(members.map(member =>
        hardware(member.key === item.key ? {...member,...item} : member,library).catch(()=>null)));
    const [base, guest] = loaded;
    const model = base || guest;
    if (!model) return {note:'Geometry unavailable for '+system.label+'.'};
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    let note = '';
    if (attachment) {
        if (!base || !guest) note='Geometry unavailable for '+members[base ? 1 : 0].name+'.';
        else if (!mountAttachment(base,guest,attachment,host.key)) {
            disposeObject(guest);
            note='Attachment interface unavailable for '+system.label+'.';
        }
    }
    model.position.sub(center);
    bounds.setFromObject(model);
    const sphere=bounds.getBoundingSphere(new THREE.Sphere());
    model.name=system.label;
    model.userData.comparisonMembers=attachment && !note ? members.map(member=>member.key) : [members[base ? 0 : 1].key];
    return {model,size:Math.max(.01,sphere.radius+sphere.center.length()),note};
}

export function createComparisonScene(stage, items, onChange, library, onNotice = ()=>{}) {
    const renderer = new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2));
    renderer.setClearColor(0x060d18);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    stage.prepend(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label','Spacecraft comparison view');
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe4f3ff,0x8995b3,2.1));
    const sun = new THREE.DirectionalLight(0xffefcd,3.2);
    sun.position.set(3,6,5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(42,1,.01,1e9);
    const groups = items.map(() => new THREE.Group());
    const radii = [1,1], meshes = [null,null], signatures = [null,null], notes = ['',''];
    const requests = [0,0];
    const paths = createComparisonOrbitLayer(scene);
    scene.add(...groups);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({color:0x9dc9d5,toneMapped:false}));
    line.frustumCulled = false;
    scene.add(line);
    const tags = [...stage.querySelectorAll('.pair-tag')], leaders = [...stage.querySelectorAll('.pair-leader')];
    const dots = [...stage.querySelectorAll('.pair-dot')], caption = stage.querySelector('.pair-line-value');
    let earth, beamLayer, disposed = false, current, mode, showEarth = true, beam, showOrbits = false;
    let width, height, spin = [0,0], locator=false;
    const cameraControl = createComparisonCamera(canvas, camera, draw, onChange);
    let segments=[];
    function syncHardware(system,index) {
        const signature=system ? (system.attachment || system.item.key) : null;
        if (signatures[index]===signature) return;
        signatures[index]=signature;
        const request=++requests[index];
        const old=meshes[index];
        if (old) {old.removeFromParent();disposeObject(old);}
        meshes[index]=null; radii[index]=1; notes[index]='';
        if (!system) return;
        systemHardware(system,library).then(result=>{
            if (disposed || requests[index]!==request) {disposeObject(result.model);return;}
            notes[index]=result.note || '';
            if (result.model) {
                meshes[index]=result.model;radii[index]=result.size;groups[index].add(result.model);
                cameraControl.refit();
            }
            draw();
        });
    }
    function models() {
        return mode === 'models' || !current?.poses;
    }
    function updateEarth() {
        if (showEarth && current?.poses && !models() && !earth) {
            earth = createPhysicalEarth(draw);
            scene.add(earth);
            beamLayer = new PublishedBeamLayer(earth,(lon,lat) => {
                const p = geodeticToEcfKm(lat,lon,1);
                return new THREE.Vector3(p.x,p.z,-p.y).multiplyScalar(1000);
            });
        }
        if (earth) {
            earth.visible = showEarth && !!current?.poses && !models();
            if (earth.visible) {
                earth.position.copy(current.poses[0].position).negate();
                earth.rotation.y = current.poses[0].rotation;
            }
            beamLayer.set(earth.visible ? beam : null);
        }
    }
    function placeCamera(target,direction,distance,vertical,minimum=0) {
        const range = cameraControl.place(target,direction,distance,vertical || perpendicular(direction,up),minimum);
        camera.near = Math.max(.001,range/1e5);
        camera.far = Math.max(100,range*4, camera.position.length()+(current?.measurement?.metres || 0)*2,
            earth?.visible ? camera.position.distanceTo(earth.position)+2*R : 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
    }
    function drawOrbit() {
        const {poses,measurement:m} = current;
        const coincident = m.metres < .0001;
        const radial = poses[0].position.clone().normalize();
        const hostFirst = current.systems[0].item.key === current.systems[0].host.key;
        const axis = current.shared ? new THREE.Vector3(0,0,hostFirst ? -1 : 1).applyQuaternion(poses[0].attitude) :
            coincident ? poses[0].velocity.clone().normalize() : m.delta.clone().normalize();
        const side = perpendicular(axis,radial);
        const f = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
        const fit = f*Math.min(1,camera.aspect);
        const positions = [new THREE.Vector3(),m.delta];
        const maxSize = Math.max(...radii);
        groups.forEach((group,i) => {
            group.visible = !(i===1 && current.shared);
            group.position.copy(positions[i]);
            group.quaternion.copy(poses[i].attitude);
        });
        const attr = line.geometry.attributes.position;
        attr.setXYZ(1,m.delta.x,m.delta.y,m.delta.z);
        attr.needsUpdate = true;
        line.visible = !coincident;
        if (mode === 'overview') {
            const normal=poses[0].position.clone().cross(poses[0].velocity).normalize();
            const otherNormal=poses[1].position.clone().cross(poses[1].velocity).normalize();
            normal.addScaledVector(otherNormal,normal.dot(otherNormal)<0 ? -1 : 1).normalize();
            const axes=[new THREE.Vector3(R,0,0),new THREE.Vector3(0,R,0),new THREE.Vector3(0,0,R)];
            const extent=[...poses.map(p=>p.position),...axes,...axes.map(p=>p.clone().negate())];
            const frame=fullOrbitCameraFrame([...segments,extent],normal,camera);
            placeCamera(frame.target.sub(poses[0].position),normal,frame.range);
        } else if (mode === 'side') {
            placeCamera(m.delta.clone().multiplyScalar(.5), side,
                Math.max((m.metres*.5+maxSize)/(f*camera.aspect),maxSize/f,3)*1.48+maxSize,
                new THREE.Vector3().crossVectors(side,axis).normalize());
        } else {
            const behindB = mode==='behind-b' || mode==='focus-b';
            const index = !current.shared && behindB ? 1 : 0;
            const close = ['earth','primary','focus-b'].includes(mode);
            const direction = close ? poses[index].position.clone().normalize() : axis.clone().multiplyScalar(behindB ? 1 : -1);
            let distance = Math.max(2,radii[index]*1.55/Math.sin(Math.atan(fit)));
            if (mode === 'earth') distance = Math.max(distance,Math.min(radii[0]*9,radii[0]*.96/Math.tan(Math.asin(R/poses[0].position.length()))));
            placeCamera(positions[index],direction,distance,null,radii[index]*1.08);
        }
        renderer.setViewport(0,0,width,height);
        renderer.render(scene,camera);
        annotate(positions,coincident);
    }
    function projection(p) {
        const ndc = p.clone().project(camera);
        const front = p.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
        let x=Number.isFinite(ndc.x) ? ndc.x : 0, y=Number.isFinite(ndc.y) ? ndc.y : 1;
        const off = !front || Math.abs(x)>1 || Math.abs(y)>1;
        if (!front) {x=-x; y=-y; if (Math.abs(x)+Math.abs(y)<.001) y=-1;}
        if (off) {const max=Math.max(Math.abs(x),Math.abs(y),.001); x/=max; y/=max;}
        const arrow = ['→','↗','↑','↖','←','↙','↓','↘'][(Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8];
        return {x:present((x+1)*width/2,8,width-8), y:present((1-y)*height/2,8,height-8), off, arrow};
    }
    function labelPosition(el,anchorX,anchorY,avoid) {
        const w=el.offsetWidth,h=el.offsetHeight;
        const desiredX=anchorX-w/2;
        const choices=[[desiredX,anchorY]];
        for (const r of avoid) choices.push([desiredX,r.y+r.h+6],[desiredX,r.y-h-6],
            [r.x+r.w+6,anchorY],[r.x-w-6,anchorY]);
        let best,score=Infinity;
        for (const [left,top] of choices) {
            const x=present(left,3,Math.max(3,width-w-3)), y=present(top,3,Math.max(3,height-h-3));
            const overlap=avoid.reduce((sum,r) => sum+Math.max(0,Math.min(x+w,r.x+r.w)-Math.max(x,r.x))*
                Math.max(0,Math.min(y+h,r.y+r.h)-Math.max(y,r.y)),0);
            const cost=overlap*1e6+(desiredX-x)**2+(anchorY-y)**2;
            if (cost<score) {score=cost;best={x,y,w,h};}
        }
        el.style.transform='translate('+best.x+'px,'+best.y+'px)';
        return best;
    }
    function tag(i,p,note,avoid) {
        const el=tags[i], pointer=leaders[i], dot=dots[i];
        el.firstElementChild.textContent = items[i].name;
        el.lastElementChild.textContent = note;
        el.lastElementChild.hidden = !note;
        const rect=labelPosition(el,p.x,p.y+17,avoid);
        const {x,y,w,h}=rect;
        el.setAttribute('aria-label','Focus '+items[i].name+(note ? ' · '+note : ''));
        const endX=present(p.x,x+3,x+w-3), endY=present(p.y,y,y+h);
        const dx=endX-p.x, dy=endY-p.y;
        pointer.style.width=Math.hypot(dx,dy)+'px';
        pointer.style.transform='translate('+p.x+'px,'+p.y+'px) rotate('+Math.atan2(dy,dx)+'rad)';
        dot.style.transform='translate('+p.x+'px,'+p.y+'px)';
        return rect;
    }
    function displayLocator(index,visible) {
        tags[index].hidden=leaders[index].hidden=!visible;
    }
    function annotate(positions,coincident) {
        const pts=positions.map(projection);
        const focalLength=height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
        const size=positions.map((point,i)=>2*focalLength*radii[i]/Math.max(.001,-point.clone().applyMatrix4(camera.matrixWorldInverse).z));
        const target=current.systems[1].item;
        const blocked=!current.shared && earth?.visible && earthOccludes(camera.position,positions[1],earth.position);
        const nearby=current.measurement.metres <= 4*(radii[0]+radii[1]);
        locator=!current.shared && !nearby && (pts[1].off || needsLocator(size[1],locator));
        const showSecondary=Boolean(blocked || locator);
        displayLocator(0,false);
        displayLocator(1,showSecondary);
        for (let i=0;i<2;i++) {
            const dot=dots[i];
            const atOverview=mode==='overview' || mode==='side';
            dot.hidden=i===1 && current.shared || !(i===1 && showSecondary || atOverview && (!meshes[i] || size[i]<6) || !meshes[i] && !pts[i].off);
            dot.style.transform='translate('+pts[i].x+'px,'+pts[i].y+'px)';
        }
        const visibility=blocked ? target.name+' · Not visible behind Earth' : '';
        const avoid=[];
        for (let i=0;i<(current.shared ? 1 : 2);i++) {
            if (pts[i].off || !meshes[i] || size[i]<12 || (i===1 && blocked)) continue;
            avoid.push({x:pts[i].x-size[i]/2,y:pts[i].y-size[i]/2,w:size[i],h:size[i]});
        }
        if (showSecondary) {
            const note=[pts[1].off ? pts[1].arrow+' Outside view' : '',blocked ? 'Not visible behind Earth' : ''].filter(Boolean).join(' · ');
            avoid.push(tag(1,pts[1],note,avoid));
        }
        onNotice(visibility,notes);
        caption.hidden=current.shared;
        if (caption.hidden) return;
        const aligned=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)<24;
        const x=aligned || coincident ? pts[0].x+(pts[0].x>width*.63 ? -1 : 1)*Math.min(76,width*.22) : (pts[0].x+pts[1].x)/2;
        caption.textContent=current.measurement.text;
        labelPosition(caption,x,(pts[0].y+pts[1].y)/2+9,avoid);
    }
    function drawModels() {
        line.visible=false;caption.hidden=true;
        for (let i=0;i<2;i++) {displayLocator(i,false);dots[i].hidden=true;}
        const count=current.shared ? 1 : 2;
        const pane=Math.floor(width/count), f=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
        camera.aspect=pane/height;
        const distance=Math.max(...radii.slice(0,count))*1.25/Math.sin(Math.atan(f*Math.min(1,camera.aspect)));
        placeCamera(new THREE.Vector3(),new THREE.Vector3(1.2,.62,1.45).normalize(),distance);
        renderer.setScissorTest(true);
        for (let i=0;i<count;i++) {
            groups.forEach((group,j)=>{group.visible=i===j;});
            groups[i].position.set(0,0,0);
            groups[i].rotation.set(spin[1],spin[0],0,'YXZ');
            const size=i===count-1 ? width-i*pane : pane;
            camera.aspect=size/height;
            camera.updateProjectionMatrix();
            renderer.setViewport(i*pane,0,size,height);
            renderer.setScissor(i*pane,0,size,height);
            renderer.render(scene,camera);
        }
        renderer.setScissorTest(false);
        renderer.setViewport(0,0,width,height);
        onNotice('',notes);
    }
    function draw() {
        if (disposed || !current) return;
        if (!stage.clientWidth || !stage.clientHeight) return;
        if (width!==stage.clientWidth || height!==stage.clientHeight) {
            width=stage.clientWidth; height=stage.clientHeight;
            renderer.setSize(width,height,false);
            cameraControl.refit();
        }
        camera.aspect=width/height;
        stage.classList.toggle('pair-inspecting',models());
        stage.classList.toggle('pair-shared',!!current.shared);
        segments=paths.update(current,showOrbits && !models(),mode==='overview');
        updateEarth();
        if (models()) drawModels(); else drawOrbit();
    }
    const resize=new ResizeObserver(draw);
    resize.observe(stage);
    function resetCamera(options = {}) {
        mode = null;
        spin = options.spin?.length === 2 && options.spin.every(Number.isFinite) ? options.spin : [0,0];
        cameraControl.reset(options);
    }
    return {
        update(value,view,earthEnabled,selectedBeam,orbitsEnabled=false) {
            if (mode && view!==mode) resetCamera();
            if (current?.shared!==value.shared) cameraControl.refit();
            current=value;mode=view;showEarth=earthEnabled;beam=selectedBeam;showOrbits=orbitsEnabled;
            const systems=value.systems || items.map(item=>({item,host:item,label:item.name}));
            syncHardware(systems[0],0);
            syncHardware(value.shared ? null : systems[1],1);
            draw();
        },
        resetCamera,
        get zoom() {return cameraControl.zoom;},
        get pose() {return cameraControl.pose;},
        get spin() {return [...spin];},
        dispose() {
            disposed=true; resize.disconnect(); cameraControl.dispose(); beamLayer?.clear(); paths.dispose();
            disposeObject(scene); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
        }
    };
}
