import * as THREE from 'three';
import { eciToSceneVector, isFiniteVector3Like } from '../sceneFrame.js';
import { EARTH_SCENE_RADIUS } from '../SatelliteConstantLoader.js';

const PRIMARY_COLOR = 0x27d7e8;
const SECONDARY_COLOR = 0xffad3d;
const CONNECTOR_COLOR = 0xff5f57;
const DEFAULT_MARKER_RADIUS = Math.max(0.035, EARTH_SCENE_RADIUS * 0.006);

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null);
}

export function conjunctionStateVector(event, role) {
    const subject = role === 'primary'
        ? firstDefined(event?.primary, event?.primary_object, {})
        : firstDefined(event?.secondary, event?.secondary_object, {});
    return firstDefined(
        subject?.state_vector,
        subject?.stateVector,
        event?.[`${role}_state`],
        event?.states?.[role],
        event?.[`${role}_state_vector`],
        event?.[`${role}StateVector`],
        null
    );
}

export function statePositionKm(state) {
    return firstDefined(state?.position_km, state?.positionKm, state?.position, null);
}

function scenePoint(positionKm) {
    if (!isFiniteVector3Like(positionKm)) return null;
    return eciToSceneVector(new THREE.Vector3(), positionKm);
}

function trajectoryPoints(samples) {
    if (!Array.isArray(samples)) return [];
    return samples.map(sample => scenePoint(statePositionKm(sample?.state_vector || sample?.stateVector || sample)))
        .filter(Boolean);
}

function replaceLinePoints(line, points) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(points);
    line.visible = points.length >= 2;
}

function disposeObject(object) {
    object?.geometry?.dispose?.();
    if (Array.isArray(object?.material)) object.material.forEach(material => material?.dispose?.());
    else object?.material?.dispose?.();
}

export function createConjunctionVisualization(scene, options = {}) {
    if (!scene?.add) throw new Error('A Three.js scene is required for conjunction visualization.');

    const group = new THREE.Group();
    group.name = 'conjunction-event-layer';
    group.visible = false;

    const markerGeometry = new THREE.SphereGeometry(
        options.markerRadiusSceneUnits || DEFAULT_MARKER_RADIUS,
        18,
        12
    );
    const primaryMarker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshBasicMaterial({ color: PRIMARY_COLOR, depthTest: false })
    );
    const secondaryMarker = new THREE.Mesh(
        markerGeometry.clone(),
        new THREE.MeshBasicMaterial({ color: SECONDARY_COLOR, depthTest: false })
    );
    primaryMarker.name = 'conjunction-primary-marker';
    secondaryMarker.name = 'conjunction-secondary-marker';
    primaryMarker.renderOrder = 1200;
    secondaryMarker.renderOrder = 1200;

    const connector = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: CONNECTOR_COLOR, depthTest: false, transparent: true, opacity: 0.95 })
    );
    connector.name = 'conjunction-miss-distance-connector';
    connector.renderOrder = 1199;

    const primaryTrajectory = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: PRIMARY_COLOR, transparent: true, opacity: 0.82 })
    );
    const secondaryTrajectory = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: SECONDARY_COLOR, transparent: true, opacity: 0.82 })
    );
    primaryTrajectory.name = 'conjunction-primary-trajectory';
    secondaryTrajectory.name = 'conjunction-secondary-trajectory';

    group.add(primaryTrajectory, secondaryTrajectory, connector, primaryMarker, secondaryMarker);
    scene.add(group);

    let activeEvent = null;

    const updateStates = (primaryState, secondaryState) => {
        const primaryPoint = scenePoint(statePositionKm(primaryState));
        const secondaryPoint = scenePoint(statePositionKm(secondaryState));
        if (!primaryPoint || !secondaryPoint) {
            primaryMarker.visible = false;
            secondaryMarker.visible = false;
            connector.visible = false;
            return false;
        }
        primaryMarker.visible = true;
        secondaryMarker.visible = true;
        connector.visible = true;
        primaryMarker.position.copy(primaryPoint);
        secondaryMarker.position.copy(secondaryPoint);
        replaceLinePoints(connector, [primaryPoint, secondaryPoint]);
        group.visible = true;
        return true;
    };

    return {
        group,
        showEvent(event, trajectories = {}) {
            activeEvent = event || null;
            const primaryState = conjunctionStateVector(event, 'primary');
            const secondaryState = conjunctionStateVector(event, 'secondary');
            replaceLinePoints(primaryTrajectory, trajectoryPoints(trajectories.primary));
            replaceLinePoints(secondaryTrajectory, trajectoryPoints(trajectories.secondary));
            return updateStates(primaryState, secondaryState);
        },
        updateStates,
        clear() {
            activeEvent = null;
            group.visible = false;
            replaceLinePoints(primaryTrajectory, []);
            replaceLinePoints(secondaryTrajectory, []);
            replaceLinePoints(connector, []);
        },
        focusObject() {
            return primaryMarker.visible ? primaryMarker : null;
        },
        activeEvent() {
            return activeEvent;
        },
        dispose() {
            scene.remove(group);
            group.traverse(object => {
                if (object !== group) disposeObject(object);
            });
            group.clear();
        }
    };
}
