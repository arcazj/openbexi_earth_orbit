// satelliteFootprintLoader.js – Enhanced version with high-precision shader-based 3D rendering and dateline wrapping for 2D maps.

import * as THREE from 'three';
// It's assumed you have a constants file like this.
// If not, replace with direct values: e.g., const EARTH_RADIUS_KM = 6371;
import { KM_TO_SCENE_UNITS, EARTH_RADIUS_KM } from './SatelliteConstantLoader.js';

let _scene;
let _earthMesh; // A reference to the main Earth mesh is now needed
let footprintMesh3D; // This will now be a mesh with a custom shader material

const R_E_KM = EARTH_RADIUS_KM;

// --- Vertex Shader for the Footprint ---
// This shader is responsible for setting up the coordinates for the fragment shader.
// It simply passes the world position of each vertex of the overlay sphere.
const footprintVertexShader = `
    // Data passed from the vertex shader to the fragment shader
    varying vec3 v_world_position;

    void main() {
        // Calculate the world position of the vertex.
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        v_world_position = worldPosition.xyz;

        // Standard Three.js projection.
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

// --- Fragment Shader for the Footprint ---
// This is where the magic happens. It runs for every visible pixel of the overlay sphere
// and decides whether that pixel should be part of the footprint.
const footprintFragmentShader = `
    // Uniforms are global variables passed from your JavaScript code to the shader.
    uniform vec3 u_satellite_position_wc; // Satellite's position in World Coordinates
    uniform float u_lambda;                 // The angular radius (half-angle) of the footprint cone
    uniform vec3 u_footprint_color;         // The color of the footprint
    uniform float u_footprint_opacity;      // The opacity of the footprint

    // Data received from the vertex shader
    varying vec3 v_world_position;

    void main() {
        // The Earth is assumed to be at the origin of the world coordinate system.
        vec3 earth_center = vec3(0.0, 0.0, 0.0);

        // Vector from the Earth's center to the current pixel on the overlay sphere.
        // Normalizing it makes it a direction vector.
        vec3 pos_on_sphere_normalized = normalize(v_world_position - earth_center);

        // Vector from the Earth's center to the satellite.
        vec3 sat_pos_normalized = normalize(u_satellite_position_wc);

        // The core of the logic: calculate the angle between the satellite and the current pixel.
        // The dot product of two normalized vectors gives the cosine of the angle between them.
        // acos() then gives us the actual angle in radians.
        float angle_between = acos(dot(pos_on_sphere_normalized, sat_pos_normalized));

        // If the calculated angle is within the footprint's angular radius (lambda),
        // it means this pixel is within the satellite's line of sight.
        if (angle_between < u_lambda) {
            // Color the pixel with the specified color and opacity.
            gl_FragColor = vec4(u_footprint_color, u_footprint_opacity);
        } else {
            // If the pixel is outside the footprint, discard it completely.
            // This makes the rest of the overlay sphere invisible.
            discard;
        }
    }
`;

/**
 * Initializes the footprint renderer. This creates a sphere with a custom shader material
 * that will be used to draw the footprint directly onto the globe.
 * @param {THREE.Scene} scene The main Three.js scene.
 * @param {THREE.Mesh} earthMesh The mesh object for the Earth model. This is needed to ensure the footprint sphere is the correct size.
 */
export function initFootprintRenderer(scene, earthMesh) {
    _scene = scene;
    _earthMesh = earthMesh;

    if (!footprintMesh3D && _earthMesh) {
        // The footprint will be rendered on a sphere that is slightly larger than Earth
        // to prevent "Z-fighting" (where two surfaces flicker because they are at the same depth).
        const earthRadiusScene = _earthMesh.geometry.parameters.radius;
        const footprintSphereGeom = new THREE.SphereGeometry(earthRadiusScene * 1.005, 128, 128);

        // Uniforms that will be passed from JavaScript to our custom shader
        const footprintUniforms = {
            u_satellite_position_wc: { value: new THREE.Vector3() },
            u_lambda: { value: 0.0 },
            u_footprint_color: { value: new THREE.Color(0xFFFF99) },
            u_footprint_opacity: { value: 0.25 }
        };

        // Create the custom material using our shaders and uniforms
        const footprintMaterial = new THREE.ShaderMaterial({
            uniforms: footprintUniforms,
            vertexShader: footprintVertexShader,
            fragmentShader: footprintFragmentShader,
            transparent: true,
            depthWrite: false, // Crucial for correct transparency rendering with other objects
        });

        footprintMesh3D = new THREE.Mesh(footprintSphereGeom, footprintMaterial);
        footprintMesh3D.visible = false;
        _scene.add(footprintMesh3D);
    }
}

/**
 * Converts Latitude/Longitude in degrees to 2D Mercator canvas coordinates.
 * @param {number} lat Latitude
 * @param {number} lon Longitude
 * @param {HTMLCanvasElement} cv The canvas element
 * @returns {{x: number, y: number}}
 */
const ll2merc = (lat, lon, cv) => {
    const w = cv.width, h = cv.height;
    const x = (lon + 180) * (w / 360);
    // Clamp latitude to Mercator limits to avoid infinite y values at the poles
    const latRad = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = h / 2 - (w * mercN) / (2 * Math.PI);
    return { x, y };
};


/**
 * Helper function to draw a single, continuous polygon path on the Mercator canvas.
 * @param {CanvasRenderingContext2D} ctx The canvas 2D context.
 * @param {Array<[number, number]>} polyPath An array of [lat, lon] points.
 */
function drawSinglePolygon(ctx, polyPath) {
    ctx.beginPath();
    polyPath.forEach(([la, lo], i) => {
        const { x, y } = ll2merc(la, lo, ctx.canvas);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

/**
 * Draws the footprint on the Mercator map, correctly handling wrapping across the dateline.
 * This is achieved by drawing the polygon normally, and then drawing it again shifted by 360
 * degrees. The canvas clipping automatically renders the parts that cross the edge of the map.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number, number]>} path
 */
function drawMercator(ctx, path) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 153, 0.3)'; // #FFFF99 with alpha
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;

    // Draw the original polygon
    drawSinglePolygon(ctx, path);

    // Create and draw a shifted polygon to handle wrapping across the antimeridian.
    // If a longitude is negative, shift it to the right; if positive, shift to the left.
    const shiftedPath = path.map(([la, lo]) => [la, lo < 0 ? lo + 360 : lo - 360]);
    drawSinglePolygon(ctx, shiftedPath);

    ctx.restore();
}

/**
 * Main update function. Called each frame to calculate the satellite's current
 * footprint and update both the 2D map and the 3D view.
 * @param {object} selectedSat The currently selected satellite object.
 * @param {number} gmstRad The current GMST in radians.
 * @param {object} options Additional options including `showFootprint`, `mercatorCtx`, and `simDate`.
 */
export function updateFootprints(selectedSat, gmstRad, { showFootprint, mercatorCtx, simDate }) {
    if (!footprintMesh3D) return;

    if (!selectedSat || !selectedSat.satrec || !showFootprint) {
        footprintMesh3D.visible = false;
        return;
    }

    const simDateObj = simDate || new Date();
    const pv = satellite.propagate(selectedSat.satrec, simDateObj);

    if (!pv || !pv.position) {
        console.warn("Footprint calculation failed: satellite.propagate returned invalid data.", { satrec: selectedSat.satrec, date: simDateObj });
        footprintMesh3D.visible = false;
        return;
    }

    const sat_pos_vec_km = new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z);
    const d_km = sat_pos_vec_km.length(); // Distance from Earth's center
    const H_km = d_km - R_E_KM;           // Altitude above surface

    if (H_km <= 0) { // Satellite is below or on the surface
        footprintMesh3D.visible = false;
        return;
    }

    // --- High-Precision Calculations ---
    // Calculate the angular radius (lambda) of the footprint cone. This is the
    // half-angle of the cone formed by the satellite and the Earth's limb (horizon).
    const lambda = Math.acos(R_E_KM / d_km);

    // Get the sub-satellite point (the point on Earth directly below the satellite)
    const jday = satellite.jday(simDateObj);
    const gmst = satellite.gstime(jday);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const center_lat_rad = geo.latitude;
    const center_lon_rad = geo.longitude;

    // --- 2D Mercator Map Rendering ---
    if (mercatorCtx) {
        const path = [];
        const num_points = 128; // Use a sufficient number of points for a smooth circle
        for (let i = 0; i <= num_points; i++) {
            const bearing = (i / num_points) * 2 * Math.PI; // Azimuth from North, 0 to 2PI

            // Use spherical trigonometry (haversine formula principles) to find points on the great circle
            const lat2 = Math.asin(
                Math.sin(center_lat_rad) * Math.cos(lambda) +
                Math.cos(center_lat_rad) * Math.sin(lambda) * Math.cos(bearing)
            );
            let lon2 = center_lon_rad + Math.atan2(
                Math.sin(bearing) * Math.sin(lambda) * Math.cos(center_lat_rad),
                Math.cos(lambda) - Math.sin(center_lat_rad) * Math.sin(lat2)
            );

            // Normalize longitude to the standard -180 to +180 range
            let lonDeg = THREE.MathUtils.radToDeg(lon2);
            lonDeg = ((lonDeg + 540) % 360) - 180;
            path.push([THREE.MathUtils.radToDeg(lat2), lonDeg]);
        }
        drawMercator(mercatorCtx, path);
    }

    // --- 3D Shader-based Rendering ---
    // Convert satellite's ECI coordinates (km) to Three.js scene coordinates.
    // Note the Y and Z axes are swapped to match the common convention in 3D graphics
    // where Y is the "up" axis (polar axis in this case).
    const satPosWC = new THREE.Vector3(pv.position.x, pv.position.z, pv.position.y)
        .multiplyScalar(KM_TO_SCENE_UNITS);

    // Update the shader uniforms with the new satellite position and footprint angle
    const material = footprintMesh3D.material;
    material.uniforms.u_satellite_position_wc.value.copy(satPosWC);
    material.uniforms.u_lambda.value = lambda;

    footprintMesh3D.visible = true;
}
