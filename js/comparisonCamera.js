import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const origin = new Vector3();
const forward = new Vector3(0, 0, 1);
const rounded = value => Number(value.toPrecision(12));

// OrbitControls works in the preset's local frame. Satellite propagation moves
// that frame, while the user's orbit, pan and dolly stay in its coordinates.
export function createComparisonCamera(canvas, camera, redraw, onChange) {
    const local = new PerspectiveCamera(camera.fov, 1, .001, 1e5);
    local.position.copy(forward);
    const controls = new OrbitControls(local, canvas);
    controls.minDistance = .015;
    controls.maxDistance = 1000;
    controls.zoomSpeed = 2.5;
    const basis = new Matrix4(), rotation = new Quaternion(), offset = new Vector3();
    let fitRange = 0, nominalRange = 0, resetting = false, adjusted = false;

    function reset({zoom = 1, pose} = {}) {
        resetting = true;
        adjusted = false;
        controls.minDistance = .015;
        controls.target.set(0, 0, 0);
        local.position.copy(forward);
        if (pose?.length === 6 && pose.every(Number.isFinite)) {
            const direction = offset.fromArray(pose);
            if (direction.lengthSq() > .99 && direction.lengthSq() < 1.01 && pose.slice(3).every(v => Math.abs(v) < 1e6)) {
                controls.target.fromArray(pose, 3);
                local.position.copy(direction).normalize();
            }
        }
        const range = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
        local.position.multiplyScalar(range).add(controls.target);
        controls.update();
        local.updateMatrixWorld();
        fitRange = nominalRange = 0;
        resetting = false;
    }

    function place(target, direction, range, up, minimumRange) {
        if (!fitRange) fitRange = range;
        nominalRange = range;
        local.aspect = camera.aspect;
        local.updateProjectionMatrix();
        controls.minDistance = Math.max(.015, minimumRange / fitRange);
        if (controls.getDistance() < controls.minDistance) {
            resetting = true;
            controls.update();
            resetting = false;
        }
        rotation.setFromRotationMatrix(basis.lookAt(direction, origin, up));
        camera.position.copy(local.position).multiplyScalar(fitRange).applyQuaternion(rotation).add(target);
        camera.quaternion.copy(rotation).multiply(local.quaternion);
        camera.up.copy(local.up).applyQuaternion(rotation);
        camera.updateMatrixWorld();
        return controls.getDistance() * fitRange;
    }

    controls.addEventListener('change', () => {
        local.updateMatrixWorld();
        if (!resetting) {
            adjusted = true;
            redraw();
        }
    });
    controls.addEventListener('end', onChange);
    function keyboard(event) {
        switch (event.key) {
            case 'ArrowLeft': controls.rotateLeft(.12); break;
            case 'ArrowRight': controls.rotateLeft(-.12); break;
            case 'ArrowUp': controls.rotateUp(.12); break;
            case 'ArrowDown': controls.rotateUp(-.12); break;
            case '+': case '=': controls.dollyIn(1 / 1.2); break;
            case '-': controls.dollyOut(1 / 1.2); break;
            default: return;
        }
        event.preventDefault();
        onChange();
    }
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', keyboard);
    return {
        place, reset,
        refit() { if (!adjusted) fitRange = 0; },
        // Express snapshot offsets in units of the fit at its saved UTC, even
        // if the separation changed after the user chose the preset.
        get zoom() { return rounded(controls.getDistance() * (nominalRange ? fitRange / nominalRange : 1)); },
        get pose() {
            const direction = offset.copy(local.position).sub(controls.target).normalize();
            if (direction.distanceToSquared(forward) < 1e-18 && controls.target.lengthSq() < 1e-18) return null;
            const scale = nominalRange ? fitRange / nominalRange : 1;
            return [...direction.toArray(), ...controls.target.toArray().map(v => v * scale)].map(rounded);
        },
        dispose() { canvas.removeEventListener('keydown', keyboard); controls.dispose(); }
    };
}
