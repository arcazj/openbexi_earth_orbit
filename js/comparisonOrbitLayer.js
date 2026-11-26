import * as THREE from 'three';
import { comparisonOrbitPath } from './comparisonOrbit.js';
import { disposeObject } from './spacecraftMesh.js';

export function createComparisonOrbitLayer(scene) {
    const tracks = [];
    function clear(i) {
        if (!tracks[i]) return;
        tracks[i].group.removeFromParent();
        disposeObject(tracks[i].group);
        tracks[i] = null;
    }
    function sample(system,index,timeMs) {
        const {elements,pose} = system.reference;
        const segments = comparisonOrbitPath(elements,timeMs);
        const group = new THREE.Group();
        group.name = 'Orbit of '+system.label;
        const origin = pose.position.clone();
        for (const points of segments) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point=>point.clone().sub(origin)));
            const dash = origin.length()*.07;
            const material = index === 0 ? new THREE.LineBasicMaterial({color:0xffc46b}) :
                new THREE.LineDashedMaterial({color:0x79dcff,dashSize:dash,gapSize:dash*.7});
            material.toneMapped = material.depthWrite = false;
            const line = new THREE.Line(geometry,material);
            if (index) line.computeLineDistances();
            line.renderOrder = index+1;
            group.add(line);
        }
        return {elements,timeMs,segments,group,origin};
    }
    return {
        update(outcome,visible,frameOrbits=false) {
            const systems = outcome.poses ? (outcome.shared ? outcome.systems.slice(0,1) : outcome.systems) : [];
            const segments = [];
            for (let i=0;i<2;i++) {
                if ((!visible && !frameOrbits) || !systems[i]) {clear(i);continue;}
                const system = systems[i];
                const track = tracks[i];
                const maxAge = Math.min(30000,60000*2*Math.PI/system.reference.elements.satrec.no/720);
                if (!track || track.elements!==system.reference.elements || Math.abs(outcome.timeMs-track.timeMs)>maxAge) {
                    clear(i);
                    tracks[i] = sample(system,i,outcome.timeMs);
                }
                tracks[i].group.position.copy(tracks[i].origin).sub(outcome.poses[0].position);
                if (!visible) tracks[i].group.removeFromParent();
                else if (!tracks[i].group.parent) scene.add(tracks[i].group);
                segments.push(...tracks[i].segments);
            }
            return segments;
        },
        dispose() {clear(0);clear(1);}
    };
}
