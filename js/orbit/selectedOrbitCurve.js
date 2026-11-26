import { Line3, MathUtils, Sphere, Vector3 } from 'three';

export function sampleOrbitRevolution(epochMs, periodMinutes, count, centered, sampleAt) {
    const step = periodMinutes * 60000 / count;
    // Keep the seam away from the selected UTC. SGP4's one-revolution track
    // need not close exactly and invalid samples must break the line.
    const middle = centered ? Math.floor(count/2) : 0;
    const segments = [];
    let points = [];
    for (let i = 0; i <= count; i++) {
        const point = sampleAt(Math.trunc(epochMs+(i-middle)*step));
        if (point) points.push(point);
        else {
            if (points.length > 1) segments.push(points);
            points = [];
        }
    }
    if (points.length > 1) segments.push(points);
    return segments;
}

export function fullOrbitCameraFrame(segments, normal, camera, {earthRadius = 0, halfAngle} = {}) {
    if (!normal || !segments?.length) return null;
    const points = segments.flat();
    const bounds = new Sphere().setFromPoints(points);
    if (!(bounds.radius > 0)) return null;
    halfAngle ??= Math.atan(Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2) * Math.min(1, camera.aspect));
    let range = 1.08 * bounds.radius / Math.sin(halfAngle);
    if (earthRadius > 0) {
        // From too close along the orbit normal the Earth's apparent limb can
        // hide a whole low orbit. Allow clearance above its tangent at perigee.
        const perigeeSq = points.reduce((nearest, point) => Math.min(nearest, point.lengthSq()), Infinity);
        if (perigeeSq > earthRadius * earthRadius) {
            const tangentRange = bounds.radius * earthRadius / Math.sqrt(perigeeSq - earthRadius * earthRadius);
            range = Math.max(range, tangentRange * 1.3);
        }
    }
    const position = bounds.center.clone().addScaledVector(normal, range);
    return { position, target: bounds.center, range, radius: bounds.radius };
}

export function applyOrbitDistanceFade(material) {
    // Geometry is local to the selected spacecraft. Per-fragment distance
    // keeps the nearby track clear even when a long chord crosses the camera.
    const range = { value: 1e12 };
    material.userData.observerRange = range;
    material.onBeforeCompile = shader => {
        shader.uniforms.orbitObserverRange = range;
        shader.vertexShader = 'varying vec3 orbitOffset;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>', '#include <begin_vertex>\n orbitOffset = position;'
        );
        shader.fragmentShader = 'varying vec3 orbitOffset;\nuniform float orbitObserverRange;\n' +
            shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
                float distant = smoothstep(8.0, 96.0, length(orbitOffset) / orbitObserverRange);
                diffuseColor.a *= mix(1.0, 0.06, distant);`);
    };
    return material;
}

// A chord that looks smooth from Earth can span hundreds of kilometres in a
// spacecraft close-up. Measure its deviation at the scale seen by the camera.
export function refineOrbitForView(segments, sampleAt, observer, pixelAngle) {
    const chord = new Line3();
    const closest = new Vector3();
    const tolerance = 0.2 * pixelAngle;
    const result = [];
    for (const segment of segments) {
        let arc = [segment[0]];
        function appendInterval(start, end) {
            const time = Math.floor((start.orbitTimeMs + end.orbitTimeMs) / 2);
            if (time > start.orbitTimeMs && time < end.orbitTimeMs) {
                const middle = sampleAt(time);
                if (!middle) {
                    if (arc.length > 1) result.push(arc);
                    arc = [end];
                    return;
                }
                chord.set(start, end);
                const deviation = middle.distanceTo(chord.closestPointToPoint(middle, true, closest));
                const range = observer.distanceTo(chord.closestPointToPoint(observer, true, closest));
                if (deviation > tolerance * range) {
                    appendInterval(start, middle);
                    appendInterval(middle, end);
                    return;
                }
            }
            arc.push(end);
        }
        for (let i = 1; i < segment.length; i++) appendInterval(segment[i - 1], segment[i]);
        if (arc.length > 1) result.push(arc);
    }
    return result;
}
