import * as THREE from 'three';
import { eciToGeodetic, gstime, json2satrec, propagate, twoline2satrec } from '../vendor/satellite.js/7.1.0/satellite.es.js';
import { isHistoricalTrackedRecord } from './trackedObjectCatalog.js';
import { uniqueModelNorad } from './satelliteModelResolver.js';
import { EARTH_RADIUS_KM } from './SatelliteConstantLoader.js';
import { selectedSatelliteOrbitalFrameQuaternion } from './sceneFrame.js';
import { freshnessStatus } from './domain/orbitalPolicy.js';
import { validateTlePair } from './domain/catalogValidation.js';
import { loadPublishedTles } from './publishedTleCatalog.js';
import { geodeticToEcfKm } from './orbit/orbitLinkGeometry.js';
import { publishedBeam, PublishedBeamLayer, showBeamNotice } from './publishedBeamFootprints.js';

const radius = EARTH_RADIUS_KM*1000;
function globePoint(lon, lat, heightKm = 0) {
    const ecf = geodeticToEcfKm(lat,lon,heightKm);
    return new THREE.Vector3(ecf.x,ecf.z,-ecf.y).multiplyScalar(1000);
}

export function physicalEarthGeometry() {
    const geometry = new THREE.SphereGeometry(radius,96,64);
    const positions = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
        const p = globePoint((uv.getX(i)-.5)*360, (uv.getY(i)-.5)*180);
        positions.setXYZ(i,p.x,p.y,p.z);
    }
    geometry.computeBoundingSphere();
    return geometry;
}

export function createPhysicalEarth(redraw) {
    const earth = new THREE.Mesh(physicalEarthGeometry(), new THREE.MeshBasicMaterial({color: 0x486583, toneMapped: false}));
    earth.name = 'Earth at propagated UTC';
    earth.material.map = new THREE.TextureLoader().load('textures/earthmap1k.jpg', texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        earth.material.color.set(0xffffff);
        earth.material.needsUpdate = true;
        redraw();
    });
    return earth;
}

export function preparePositionTle(id, row, source) {
    if (!row || String(row.norad_id) !== id) throw Error('No published TLE for NORAD '+id+'.');
    const checked = validateTlePair(row.tle_line1, row.tle_line2, {expected_norad_id:id});
    if (!checked.valid) throw Error('The published TLE for NORAD '+id+' failed validation.');
    const {line1,line2,epoch} = checked.value;
    return {satrec:twoline2satrec(line1,line2), epoch, line1, line2, orbit:row.orbit_class || 'UNKNOWN', source};
}

async function elementsFor(id, view, selectedSet, record, fixedUtc) {
    const flight = view?.elements?.find(item=>item.id===id);
    const flightTle = flight?.line1 && flight.line2 && preparePositionTle(id,
        {norad_id:id, orbit_class:'GEO', tle_line1:flight.line1, tle_line2:flight.line2}, view.source);
    if (flightTle && fixedUtc) return flightTle;
    const omm = selectedSet?.omm;
    let selected;
    if (String(omm?.NORAD_CAT_ID) === id) {
        const satrec = json2satrec(omm);
        if (satrec && !satrec.error && Number.isFinite(satrec.no)) {
            selected = {satrec, epoch: selectedSet.epoch || omm.EPOCH, line1: selectedSet.line1, line2: selectedSet.line2,
                omm, source: selectedSet.source || 'Published GP catalog', orbit: record?.orbit_class || 'UNKNOWN'};
        }
    }
    if (selected?.line1 && selected.line2 && !flightTle && !fixedUtc) return selected;
    let published = flightTle;
    if (!published) {
        try {
            const catalog = await loadPublishedTles();
            published = preparePositionTle(id, catalog.records.get(id), catalog.source);
        } catch (error) {
            if (selected) return selected;
            throw error;
        }
    }
    if (!selected) return published;
    const a = Date.parse(selected.epoch), b = Date.parse(published.epoch);
    // TLE fractions of a day and OMM timestamps can round the same epoch to adjacent milliseconds.
    if (Math.abs(a - b) <= 1) return fixedUtc ? published : { ...selected, line1: published.line1, line2: published.line2 };
    if (fixedUtc) {
        const instant = Date.parse(fixedUtc);
        return Math.abs(instant - a) <= Math.abs(instant - b) ? selected : published;
    }
    return a > b ? selected : published;
}

export function inertialMetres(v) {
    return new THREE.Vector3(v.x,v.z,-v.y).multiplyScalar(1000);
}

export function formatTlePosition({latitude,longitude,height}) {
    const degrees=THREE.MathUtils.radToDeg;
    return Math.abs(degrees(latitude)).toFixed(4)+'° '+(latitude<0 ? 'S' : 'N')+', '+
        Math.abs(degrees(longitude)).toFixed(4)+'° '+(longitude<0 ? 'W' : 'E')+
        ' · WGS84 altitude '+height.toLocaleString('en',{minimumFractionDigits:1,maximumFractionDigits:1})+' km';
}

export function orbitalPose(elements, date, id, orientation = {}) {
    const freshness = freshnessStatus(elements.epoch, elements.orbit, date.toISOString()).status;
    if (freshness !== 'FRESH') throw Error('The TLE for NORAD '+id+' is '+freshness.toLowerCase()+' at the selected UTC.');
    const state = propagate(elements.satrec, date);
    if (!state?.position || !state.velocity) throw Error('Orbit propagation unavailable.');
    // Rotate the inertial frame into Three's Y-up globe frame. East at Greenwich
    // points toward -Z in the map's UVs. A rotation preserves spacecraft handedness.
    const position = inertialMetres(state.position);
    const velocity = inertialMetres(state.velocity);
    const attitude = selectedSatelliteOrbitalFrameQuaternion(new THREE.Quaternion(), position, velocity, {
        ...orientation,
        modelAxisMapping: id === '25544' ? 'x-velocity-y-nadir-z-negative-crosstrack' :
            elements.orbit === 'GEO' ? 'x-negative-crosstrack-y-velocity-z-nadir' : 'x-velocity-y-crosstrack-z-nadir'
    });
    if (!attitude || !Number.isFinite(position.length()) || position.length() <= radius) throw Error('Orbital frame unavailable.');
    const rotation = gstime(date);
    return {position, velocity, attitude, rotation, geodetic:eciToGeodetic(state.position,rotation)};
}

export function createModelEarthView({scene, camera, controls, axes, grid, viewportWidth, redraw}) {
    const earthBox = document.getElementById('modelEarth');
    const footprint = document.getElementById('modelFootprint');
    const notice = document.getElementById('modelBeamNotice');
    const status = document.getElementById('modelEarthStatus');
    const cameras = document.getElementById('earthCameraControls');
    const locationText = document.getElementById('modelOrbitPosition');
    const cameraDistance = document.getElementById('modelCameraDistance');
    const tleDetails = document.getElementById('modelPositionTle');
    const cameraButtons = [...cameras.querySelectorAll('[data-earth-camera]')];
    const studioButtons = ['toggleAxesBtn','toggleGridBtn'].map(id => document.getElementById(id));
    const atlasFacingCamera = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), -Math.PI/2);
    let earth, marker, layer, active, timer, serial = 0, cameraMode = 'inspect', followBehind = false;
    let wantsFootprint = false;
    function objects() {
        if (earth) return;
        earth = createPhysicalEarth(redraw);
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
        marker = new THREE.Points(geometry, new THREE.PointsMaterial({color: 0xffcf78, size: 7, sizeAttenuation: false, toneMapped: false}));
        marker.name = 'Selected spacecraft location';
        layer = new PublishedBeamLayer(earth, (lon,lat) => globePoint(lon,lat,1));
    }
    function updateFootprint() {
        const enabled = Boolean(active?.id && earthBox.checked);
        footprint.disabled = !enabled;
        if (!earthBox.checked) wantsFootprint = false;
        footprint.checked = enabled && wantsFootprint;
        const beam = enabled && footprint.checked ? publishedBeam(active.id, active.view) : null;
        layer?.set(beam);
        showBeamNotice(notice, beam, enabled && footprint.checked ? 'No published beam in this catalog for the selected spacecraft.' : '');
    }
    function reset() {
        serial++;
        clearInterval(timer);
        if (active) {
            const {root, saved} = active;
            active = null;
            scene.remove(earth, marker);
            root.position.copy(saved.position);
            root.quaternion.copy(saved.quaternion);
            root.scale.copy(saved.scale);
            root.updateMatrixWorld(true);
            axes.visible = saved.axes;
            grid.visible = saved.grid;
            studioButtons.forEach(button => { button.disabled = false; });
            camera.position.copy(saved.eye);
            camera.up.copy(saved.up);
            camera.near = saved.near;
            camera.far = saved.far;
            camera.fov = saved.fov;
            camera.updateProjectionMatrix();
            controls.target.copy(saved.target);
            controls.update();
        }
        if (!earthBox.checked) cameraMode = 'inspect';
        updateFootprint();
        cameras.hidden = true;
        status.textContent = '';
        status.hidden = true;
        locationText.hidden = tleDetails.hidden = true;
        cameraDistance.hidden = true;
        tleDetails.open = false;
        tleDetails.querySelector('pre').textContent = locationText.textContent = '';
    }
    controls.addEventListener('start', () => {
        if (!active) return;
        followBehind = false;
        cameraButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
    });
    function reportCameraDistance() {
        if (!active) return;
        const meters = camera.position.length();
        const range = meters < 1000 ? Math.round(meters)+' m' : Math.round(meters/1000).toLocaleString('en')+' km';
        const distanceToEarth = camera.position.distanceTo(earth.position);
        const arc = distanceToEarth > radius ? ' · Earth spans about '+
            THREE.MathUtils.radToDeg(2*Math.asin(radius/distanceToEarth)).toFixed(1)+'°' : '';
        const label = 'Camera to spacecraft '+range+arc;
        if (cameraDistance.textContent !== label) cameraDistance.textContent = label;
        cameraDistance.hidden = false;
    }
    controls.addEventListener('change', reportCameraDistance);
    function preset(mode = cameraMode) {
        if (!active) return false;
        cameraMode = mode;
        followBehind = mode === 'inspect';
        cameraButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.earthCamera === cameraMode));
        });
        const aspect = Math.max(.12, viewportWidth()/window.innerHeight);
        if (controls.enableDamping) {
            controls.enableDamping = false;
            controls.update();
            controls.enableDamping = true;
        }
        camera.fov = active.saved.fov;
        const radial = earth.position.clone().normalize().negate();
        const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
        marker.visible = cameraMode === 'overview' && !active.root.isPoints;
        if (cameraMode === 'overview') {
            const side = new THREE.Vector3().crossVectors(radial, new THREE.Vector3(0,1,0));
            if (side.lengthSq() < .001) side.crossVectors(radial, new THREE.Vector3(1,0,0));
            side.normalize();
            const half = (earth.position.length()+radius)/2;
            controls.target.copy(radial).multiplyScalar(-half);
            camera.up.copy(radial);
            const distance = Math.max(half/tan, radius/(tan*aspect))*1.22+radius;
            camera.position.copy(controls.target).addScaledVector(side,distance);
            camera.near = Math.min(radius/1000,distance/10000);
            camera.far = distance+half*5;
        } else {
            controls.target.set(0,0,0);
            camera.up.set(0,1,0);
            if (Math.abs(radial.y) > .999) camera.up.set(0,0,1);
            // Move the observer back far enough to see the limb around a GEO craft.
            // Earth, the spacecraft and their separation keep their physical dimensions.
            const limb = Math.asin(radius/earth.position.length());
            const limbFraming = Math.min(active.diameter*6, active.diameter/(1.65*Math.tan(limb)));
            const distance = Math.max(limbFraming, active.diameter*.66/(tan*Math.min(1,aspect)),1);
            camera.position.copy(radial).multiplyScalar(distance);
            camera.near = Math.max(.005,distance/2000);
            camera.far = earth.position.length()+radius*3+distance;
        }
        camera.updateProjectionMatrix();
        controls.update();
        reportCameraDistance();
        redraw();
        return true;
    }
    function activate(root, scaleInfo, id, view) {
        objects();
        active = {root, id, view, diameter: scaleInfo.originalDiameter, saved: {
            position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone(),
            axes: axes.visible, grid: grid.visible, eye: camera.position.clone(), up: camera.up.clone(),
            near: camera.near, far: camera.far, fov: camera.fov, target: controls.target.clone()
        }};
        // Undo the studio's cosmetic normalization. Both objects use metres.
        root.scale.divideScalar(scaleInfo.displayScale);
        root.position.divideScalar(scaleInfo.displayScale);
        root.updateMatrixWorld(true);
        axes.visible = grid.visible = false;
        studioButtons.forEach(button => { button.disabled = true; });
        scene.add(earth, marker);
        cameras.hidden = false;
    }
    function showReference(root, scaleInfo, entry) {
        activate(root, scaleInfo, null, null);
        const asset = entry.files.glb || entry.files.obj || entry.id;
        const altitudeKm = asset.startsWith('leo/') ? 550 : asset.startsWith('meo/') ? 20200 : 35786;
        earth.name = 'Reference Earth at stated altitude';
        const radial = active.saved.eye.clone().sub(active.saved.target).normalize();
        earth.position.copy(radial).multiplyScalar(-(radius+altitudeKm*1000));
        earth.quaternion.copy(camera.quaternion).multiply(atlasFacingCamera);
        preset('inspect');
        updateFootprint();
        const label = asset === 'geo/mep.glb' ? 'The standalone pod' : 'This model';
        status.textContent = 'True-scale Earth · Reference altitude '+altitudeKm.toLocaleString('en')+
            ' km. '+label+' has no selected NORAD orbit. Position and pointing are illustrative.';
    }
    function applyPose(pose, date) {
        active.root.quaternion.copy(pose.attitude);
        const host = active.root.userData.attachedHostFrame;
        if (host) {
            active.root.quaternion.multiply(new THREE.Quaternion().fromArray(host.quaternion).invert());
            active.root.position.fromArray(host.position).applyQuaternion(active.root.quaternion).negate();
        }
        active.root.updateMatrixWorld(true);
        earth.position.copy(pose.position).negate();
        earth.rotation.set(0,pose.rotation,0);
        locationText.hidden = false;
        locationText.textContent = date.toISOString().slice(0,19).replace('T',' ')+' UTC · '+formatTlePosition(pose.geodetic);
    }
    async function refresh({root, entry, member, view, scaleInfo, elements: selectedSet}) {
        reset();
        if (!earthBox.checked || !entry) return;
        const token = serial;
        status.hidden = false;
        if (member?.record && (isHistoricalTrackedRecord(member.record) || (!selectedSet?.omm && member.record.metadata_only))) {
            status.textContent = 'Position unavailable for this catalog record.';
            return;
        }
        if (!root) { status.textContent = 'A loaded spacecraft model is required.'; return; }
        const params = new URLSearchParams(location.search);
        const selected = member?.norad || uniqueModelNorad(entry);
        const attachment = view?.shownPair ? view.attachment : null;
        let id = attachment?.host.key || selected;
        if (!id) {
            showReference(root, scaleInfo, entry);
            return;
        }
        status.textContent = 'Loading orbital elements for NORAD '+id+'…';
        try {
            const fixedUtc = params.get('at');
            const date = new Date(fixedUtc || Date.now());
            if (!Number.isFinite(date.getTime())) throw Error('Invalid orbit time.');
            const orientation = {};
            for (const axis of ['yawDeg','pitchDeg','rollDeg']) {
                const value = Number(params.get(axis));
                if (Number.isFinite(value) && value !== 0 && Math.abs(value) <= 360) orientation[axis] = value;
            }
            let elements, pose;
            try {
                elements = await elementsFor(id,view,selectedSet,member?.record,fixedUtc);
                pose = orbitalPose(elements,date,id,orientation);
            } catch (error) {
                if (attachment?.kind!=='MEV' || !view.elements.some(e=>e.id===attachment.vehicle.key && e.status==='fresh')) throw error;
                id=attachment.vehicle.key;
                elements=await elementsFor(id,view,selectedSet,member?.record,fixedUtc);
                pose=orbitalPose(elements,date,id,orientation);
            }
            if (token !== serial) return;
            activate(root, scaleInfo, selected || id, view);
            root.position.set(0,0,0);
            earth.name = 'Earth at propagated UTC';
            applyPose(pose,date);
            preset();
            updateFootprint();
            tleDetails.hidden = false;
            tleDetails.querySelector('summary').textContent = elements.line1 ? 'Position TLE' : 'Position OMM';
            tleDetails.querySelector('pre').textContent = elements.line1 ? elements.line1+'\n'+elements.line2 : JSON.stringify(elements.omm, null, 2);
            const timeLabel = fixedUtc ? 'Orbit snapshot '+date.toISOString().slice(0,19).replace('T',' ')+' UTC' : 'Live SGP4 orbit';
            const reference = attachment && (id===attachment.host.key ? attachment.host.name : attachment.vehicle.name);
            status.textContent = 'NORAD '+id+' · '+timeLabel+(reference ? ' · Assembly orbit from '+reference : '')+' · True-scale WGS84 Earth · '+elements.source+(elements.line1 ? ' · TLE epoch ' : ' · OMM epoch ')+elements.epoch+
                (root.isPoints ? ' · Position marker.' : Object.keys(orientation).length
                    ? ' · Modeled attitude with app rotation offsets.' : ' · Modeled Earth-pointing attitude.');
            if (!fixedUtc) timer = setInterval(() => {
                if (token !== serial) return;
                try {
                    const now = new Date();
                    const next = orbitalPose(elements,now,id,orientation);
                    applyPose(next,now);
                    if (followBehind) {
                        camera.position.copy(next.position.clone().setLength(camera.position.distanceTo(controls.target)));
                        controls.update();
                    }
                    redraw();
                } catch (error) {
                    reset();
                    status.hidden = false;
                    status.textContent = error.message;
                }
            }, 1000);
        } catch (error) {
            if (token === serial) {
                reset();
                status.hidden = false;
                status.textContent = error.message;
            }
        }
    }
    footprint.addEventListener('change', () => {
        wantsFootprint = footprint.checked;
        updateFootprint();
    });
    cameras.addEventListener('click', event => {
        const button = event.target.closest('[data-earth-camera]');
        if (button) preset(button.dataset.earthCamera);
    });
    return {refresh, reset, preset, get active() { return Boolean(active); }};
}
