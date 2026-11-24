import { Vector3 } from 'three';
import { propagate } from '../vendor/satellite.js/7.1.0/satellite.es.js';
import { orbitalPose, preparePositionTle, inertialMetres } from './modelViewerEarth.js';
import { attachmentAt, missionEnd, PAIR_DISTANCE_KM, serviceAttachments } from './lifeExtensionCatalog.js';
import { sampleOrbitRevolution } from './orbit/selectedOrbitCurve.js';
import { WGS84_A_KM, WGS84_B_KM } from './SatelliteConstantLoader.js';

const fmt = new Intl.NumberFormat('en',{maximumFractionDigits:1});

export function pairMeasurement(poses) {
    const delta = poses[1].position.clone().sub(poses[0].position);
    const metres = delta.length();
    const speed = metres > .0001 ? delta.dot(poses[1].velocity.clone().sub(poses[0].velocity))/metres : null;
    return {delta, metres, speed, text:metres < .0001 ? '0 km' : metres < 100 ? '< 0.1 km' : fmt.format(metres/1000)+' km',
        trend:speed === null ? 'Same TLE position' : Math.abs(speed) < .05 ? 'Nearly steady' :
            (speed < 0 ? 'Closing' : 'Moving apart')+' · '+fmt.format(Math.abs(speed))+' m/s'};
}

export function earthOccludes(eye, point, center) {
    const scale = new Vector3(1/WGS84_A_KM,1/WGS84_B_KM,1/WGS84_A_KM).multiplyScalar(.001);
    const p = eye.clone().sub(center).multiply(scale);
    const d = point.clone().sub(eye).multiply(scale);
    const length = d.lengthSq();
    if (!length) return false;
    const t = Math.max(0,Math.min(1,-p.dot(d)/length));
    return p.addScaledVector(d,t).lengthSq() < 1;
}

export function prepareComparison(data, attachments = serviceAttachments) {
    const records = new Map();
    for (const item of [...data.objects,...(data.related || [])]) {
        try {
            if (!/^\d+$/.test(item.key)) throw Error(item.name+' has no independent TLE.');
            records.set(item.key,{item,elements:preparePositionTle(item.key,item.row,data.source)});
        } catch (error) { records.set(item.key,{item,error:error.message}); }
    }
    const pastMissions = attachments.filter(record => missionEnd(record) && data.objects.every(item =>
        item.key === record.host.key || item.key === record.vehicle.key))
        .sort((a,b) => Date.parse(missionEnd(b))-Date.parse(missionEnd(a)));
    return {objects:data.objects,records,attachments,pastMissions};
}

export function comparisonAt(prepared, date) {
    const {records,attachments,objects} = prepared;
    const orbits = new Map(), errors = [], conflicts = new Set();
    function orbitFor(item) {
        if (!orbits.has(item.key)) {
            const record = records.get(item.key);
            let orbit;
            try {
                if (!record?.elements) throw Error(record?.error || 'No published TLE for '+item.name+'.');
                orbit = {...record,pose:orbitalPose(record.elements,date,item.key)};
            } catch (cause) { orbit = {item,error:cause.message}; }
            orbits.set(item.key,orbit);
        }
        return orbits.get(item.key);
    }
    const systems = objects.map(item => {
        const observed = orbitFor(item);
        let attachment = attachmentAt(item.key,+date,attachments);
        if (attachment?.kind === 'MEV') {
            const a=orbitFor(attachment.host).pose, b=orbitFor(attachment.vehicle).pose;
            if (a && b && a.position.distanceTo(b.position)>PAIR_DISTANCE_KM*1000) {
                conflicts.add(attachment);
                attachment=undefined;
            }
        }
        const host = attachment?.host || item;
        let reference = orbitFor(host);
        if (!reference.pose && attachment?.kind === 'MEV') {
            const servicer = orbitFor(attachment.vehicle);
            if (servicer.pose) reference = servicer;
        }
        if (!reference.pose && !errors.includes(reference.error)) errors.push(reference.error);
        const label = attachment ? host.name+' + '+attachment.vehicle.name : item.name;
        return {item,host,attachment,observed,reference,label,key:host.key};
    });
    const shared = !!systems[0].attachment && systems[0].attachment===systems[1].attachment;
    const status = shared ? (systems[0].attachment.kind==='MEP' ? 'Pod attached' : 'Docked') : '';
    const ended = !shared && prepared.pastMissions.find(record=>Date.parse(missionEnd(record))<=+date);
    const warnings = [...conflicts].map(r=>r.host.name+' and '+r.vehicle.name+' have published TLE positions more than '+PAIR_DISTANCE_KM+' km apart. Showing their independent orbits.');
    const result = {systems,shared,status,ended,warnings,timeMs:+date};
    if (errors.length) return {...result,errors};
    const poses = systems.map(system=>system.reference.pose);
    return {...result,poses,measurement:pairMeasurement(poses)};
}

export function comparisonOrbitPath(elements, epochMs) {
    const periodMinutes = 2*Math.PI/elements.satrec.no;
    if (!(Number.isFinite(periodMinutes) && periodMinutes>0)) return [];
    return sampleOrbitRevolution(epochMs,periodMinutes,360,true,time => {
        const position=propagate(elements.satrec,new Date(time))?.position;
        if (!position) return null;
        const point = inertialMetres(position);
        return Number.isFinite(point.lengthSq()) && point.length() >= WGS84_B_KM*1000 ? point : null;
    });
}

export function needsLocator(diameterPx, previous) {
    return diameterPx < (previous ? 12 : 6);
}
