// Minimal animation timer compatible with the clock subset used by the app.
// Avoids deprecated Three.js timing APIs and version-specific timer availability.

export function createAnimationTimer({ performanceObj = globalThis.performance } = {}) {
    const nowSeconds = () => {
        if (performanceObj?.now) return performanceObj.now() / 1000;
        return Date.now() / 1000;
    };

    const startTime = nowSeconds();
    let previousTime = startTime;

    return {
        getDelta(frameTimeMs) {
            // A shared RAF timestamp avoids per-callback workload changing the clock sample.
            const currentTime = Number.isFinite(frameTimeMs) ? frameTimeMs / 1000 : nowSeconds();
            const delta = Math.max(0, currentTime - previousTime);
            previousTime = currentTime;
            return delta;
        },
        getElapsedTime() {
            return Math.max(0, nowSeconds() - startTime);
        },
        reset() {
            previousTime = nowSeconds();
        }
    };
}
