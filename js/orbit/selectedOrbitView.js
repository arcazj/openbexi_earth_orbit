import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

function modelDiameter(model) {
    return model?.userData.selectedModelVisualFit?.afterDiameterSceneUnits || 0;
}

// Targets and radii in an inspection camera's extras use its parent's coordinates.
function reflectorCamera(model) {
    let camera = null;
    model?.traverse(node => {
        const { inspectionView, target, radius } = node.userData;
        if (node.isCamera && inspectionView === 'reflectors' && Array.isArray(target) && target.length === 3 &&
            target.every(Number.isFinite) && Number.isFinite(radius) && radius > 0) camera = node;
    });
    return camera;
}

export function createSelectedOrbitView({
    camera, controls, canvas, toolbar, marker, earthRadius, inspectionDistance, orbitalFrame, earthOccludes
}) {
    const presets = toolbar.querySelector('.pair-main-presets');
    const buttons = [...presets.querySelectorAll('button')];
    const reflectorButton = presets.querySelector('[data-orbit-view="reflectors"]');
    const locate = toolbar.querySelector('#selectedOrbitLocate');
    const menu = document.getElementById('controlsContainer');
    const catalog = document.getElementById('catalogPanel');
    const footer = document.getElementById('dataRefreshStatus');
    const projected = new Vector3(), rotation = new Quaternion(), delta = new Quaternion(), basis = new Matrix4();
    const defaultZoomSpeed = controls.zoomSpeed;
    let inspectedModel, reflector, followed, useIcon = false, zoomActive = false;
    let autoFitView = null;
    controls.addEventListener('start', () => { autoFitView = null; });

    function inspect(model) {
        if (model === inspectedModel) return;
        inspectedModel = model;
        reflector = reflectorCamera(model);
        reflectorButton.hidden = !reflector;
        useIcon = false;
    }

    function prepareCameraView(model) {
        inspect(model);
        showControls(true);
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const catalogRect = catalog.getBoundingClientRect();
        let halfWidth = rect.width / 2, halfHeight = cy - toolbar.getBoundingClientRect().bottom;
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right < cx) halfWidth = Math.min(halfWidth, cx - menuRect.right);
        else halfHeight = Math.min(halfHeight, cy - menuRect.bottom);
        if (catalogRect.width) {
            if (matchMedia('(max-width: 760px)').matches) halfHeight = Math.min(halfHeight, catalogRect.top - cy);
            else halfWidth = Math.min(halfWidth, catalogRect.left - cx);
        }
        if (!footer.hidden) halfHeight = Math.min(halfHeight, footer.getBoundingClientRect().top - cy);
        // Keep the entire orbit, including the fixed-size glyph, clear of the panels.
        const available = Math.max(12, Math.min(halfWidth, halfHeight) - 12);
        return Math.atan(Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2) * 2 * available / rect.height);
    }

    function cameraFrame(view, object, model, axes, halfAngle) {
        if (view === 'earth') {
            const range = 1.08 * earthRadius / Math.sin(halfAngle);
            const direction = camera.position.clone().normalize();
            return {position: direction.multiplyScalar(range), target: new Vector3(), range, radius: earthRadius};
        }
        if (view === 'reflectors') {
            if (!reflector) return null;
            const root = reflector.parent;
            const target = root.localToWorld(new Vector3().fromArray(reflector.userData.target));
            const direction = reflector.getWorldPosition(new Vector3()).sub(target).normalize();
            const radius = reflector.userData.radius * root.getWorldScale(new Vector3()).x;
            const range = radius / Math.sin(halfAngle);
            const up = new Vector3(0, 1, 0).applyQuaternion(reflector.getWorldQuaternion(rotation));
            return {position: target.clone().addScaledVector(direction, range), target, range, radius, up};
        }
        if (!axes) return null;
        const target = object.position.clone();
        const radius = modelDiameter(model) / 2;
        const range = Math.max(inspectionDistance, 1.2 * radius / Math.sin(halfAngle));
        const direction = view === 'nadir' ? axes.zAxis : axes.yAxis;
        return {position: target.clone().addScaledVector(direction, range), target, range, radius, up: axes.xAxis};
    }

    function bodyRotation(model, axes) {
        if (model) return rotation.copy(model.quaternion);
        return axes ? rotation.setFromRotationMatrix(basis.makeBasis(axes.xAxis, axes.yAxis, axes.zAxis)) : rotation.identity();
    }

    function select(view, object, model, axes) {
        followed = null;
        autoFitView = view === 'orbit' || view === 'earth' ? view : null;
        if (!view) showControls(false);
        if (object && view !== 'orbit' && view !== 'earth') {
            followed = {model, position: object.position.clone(), rotation: bodyRotation(model, axes).clone()};
        }
        for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.orbitView === view));
    }

    function follow(position, model, propagation) {
        if (!followed) return;
        const orientation = bodyRotation(model, model ? null : orbitalFrame(position, propagation));
        if (followed.model === model && followed.position.equals(position) && followed.rotation.equals(orientation)) return;
        // Transport both endpoints. Any rotation, pan or dolly since the previous
        // frame remains in the user's view as the spacecraft translates and turns.
        delta.identity();
        if (followed.model === model) delta.copy(followed.rotation).invert().premultiply(orientation);
        camera.position.sub(followed.position).applyQuaternion(delta).add(position);
        controls.target.sub(followed.position).applyQuaternion(delta).add(position);
        camera.up.applyQuaternion(delta);
        followed.position.copy(position);
        followed.rotation.copy(orientation);
        followed.model = model;
        controls.update();
    }

    // Keep OrbitControls' native wheel, trackpad and two-finger gestures. Small
    // deltas remain precise at the model; crossing the gap to Earth is faster.
    function setZoomSpeed(pinch) {
        if (!zoomActive) return;
        const range = controls.getDistance();
        const spacecraftScale = Math.max(inspectionDistance, modelDiameter(inspectedModel));
        const near = MathUtils.clamp(Math.log10(Math.max(1, range / spacecraftScale)) / 2, 0, 1);
        const far = MathUtils.clamp(Math.log10(Math.max(1, range / (earthRadius * 0.15))) / 1.5, 0, 1);
        const speed = MathUtils.lerp(22, 46, near);
        controls.zoomSpeed = MathUtils.lerp(speed, 7, far) * (pinch ? 0.45 : 1);
    }
    canvas.addEventListener('wheel', event => setZoomSpeed(event.ctrlKey), {capture: true, passive: true});
    canvas.addEventListener('pointerdown', event => setZoomSpeed(event.pointerType === 'touch'), {capture: true});
    canvas.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') setZoomSpeed(true);
    }, {capture: true});

    function showControls(framed, message = '') {
        toolbar.toggleAttribute('hidden', !framed && !message);
        presets.toggleAttribute('hidden', !framed);
        locate.toggleAttribute('hidden', !message);
        if (locate.textContent !== message) locate.textContent = message;
    }

    function update(record, model, framed, propagation) {
        if (!record) {
            if (zoomActive) controls.zoomSpeed = defaultZoomSpeed;
            zoomActive = false;
            inspect(null);
            marker.toggleAttribute('hidden', true);
            showControls(framed);
            return null;
        }
        zoomActive = true;
        inspect(model);
        const position = record.mesh.position;
        if (framed) follow(position, model, propagation);
        camera.updateMatrixWorld();
        const rect = canvas.getBoundingClientRect();
        const depth = -projected.copy(position).applyMatrix4(camera.matrixWorldInverse).z;
        const diameterPx = modelDiameter(model) * rect.height * camera.projectionMatrix.elements[5] / (2 * depth);
        useIcon = !model || depth <= 0 || (useIcon ? diameterPx <= 12 : diameterPx < 8);
        if (model) model.visible = !useIcon;

        projected.copy(position).project(camera);
        const behindEarth = earthOccludes(position, camera.position, earthRadius, 0);
        const onScreen = depth > 0 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 &&
            projected.z >= -1 && projected.z <= 1;
        marker.toggleAttribute('hidden', !useIcon || behindEarth || !onScreen);
        if (!marker.hidden) {
            const x = rect.left + (1 + projected.x) * rect.width / 2;
            const y = rect.top + (1 - projected.y) * rect.height / 2;
            marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
            if (marker.alt !== record.satellite_name) marker.alt = record.satellite_name;
        }
        showControls(framed, behindEarth ? 'Behind Earth · Locate' : !onScreen ? 'Outside view · Locate' : '');
        return record;
    }

    return {prepareCameraView, cameraFrame, select, update, get autoFitView() { return autoFitView; }};
}
