(function bootstrapDependencyLoader(global) {
    'use strict';

    const DEFAULT_TIMEOUT_MS = 2500;

    function normalizeTimeout(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
    }

    function fetchOk(url, timeoutMs) {
        return new Promise((resolve) => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeout = controller
                ? setTimeout(() => controller.abort(), timeoutMs)
                : null;

            fetch(url, {
                cache: 'force-cache',
                signal: controller?.signal
            }).then((response) => {
                resolve(Boolean(response?.ok));
            }).catch(() => {
                resolve(false);
            }).finally(() => {
                if (timeout) clearTimeout(timeout);
            });
        });
    }

    function loadClassicScript(src, timeoutMs) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                script.onload = null;
                script.onerror = null;
                script.remove();
                reject(new Error(`Timed out loading ${src}`));
            }, timeoutMs);

            script.async = false;
            script.src = src;
            script.onload = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(src);
            };
            script.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                script.remove();
                reject(new Error(`Failed to load ${src}`));
            };
            document.head.appendChild(script);
        });
    }

    function sourceWithTrailingSlash(source) {
        return source.endsWith('/') ? source : `${source}/`;
    }

    async function probeThreeSource(source, probePaths, timeoutMs) {
        const coreOk = await fetchOk(source.core, timeoutMs);
        if (!coreOk) return false;

        const addonBase = sourceWithTrailingSlash(source.addons);
        const addonChecks = (probePaths || []).map(path => fetchOk(`${addonBase}${path}`, timeoutMs));
        const addonResults = await Promise.all(addonChecks);
        return addonResults.every(Boolean);
    }

    async function resolveThreeSource(options, timeoutMs) {
        const probePaths = options.probePaths || [];
        if (await probeThreeSource(options.cdn, probePaths, timeoutMs)) {
            return {
                source: 'cdn',
                core: options.cdn.core,
                addons: sourceWithTrailingSlash(options.cdn.addons)
            };
        }

        if (await probeThreeSource(options.local, probePaths, timeoutMs)) {
            return {
                source: 'local',
                core: options.local.core,
                addons: sourceWithTrailingSlash(options.local.addons)
            };
        }

        return {
            source: 'local-unverified',
            core: options.local.core,
            addons: sourceWithTrailingSlash(options.local.addons)
        };
    }

    function hasSatelliteGlobal() {
        return Boolean(global.satellite?.propagate && global.satellite?.twoline2satrec && global.satellite?.gstime);
    }

    async function loadSatelliteSource(options, timeoutMs) {
        try {
            await loadClassicScript(options.cdn, timeoutMs);
            if (hasSatelliteGlobal()) return { source: 'cdn', url: options.cdn };
        } catch (err) {
            // Fall through to the local package fallback.
        }

        await loadClassicScript(options.local, timeoutMs);
        if (!hasSatelliteGlobal()) {
            throw new Error('satellite.js loaded without the expected global API');
        }
        return { source: 'local', url: options.local };
    }

    function injectImportMap(threeSource) {
        const script = document.createElement('script');
        script.type = 'importmap';
        script.textContent = JSON.stringify({
            imports: {
                three: threeSource.core,
                'three/addons/': threeSource.addons
            }
        }, null, 2);
        document.head.appendChild(script);
    }

    function runTemplateModule(templateId, moduleLabel) {
        const template = document.getElementById(templateId);
        if (!template) {
            throw new Error(`Missing module template: ${templateId}`);
        }

        const moduleScript = document.createElement('script');
        moduleScript.type = 'module';
        moduleScript.textContent = `${template.textContent}\n//# sourceURL=${moduleLabel || `${templateId}.js`}`;
        template.after(moduleScript);
    }

    function showDependencyError(targetId, error) {
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;
        target.innerHTML = '<div class="empty-state">Runtime dependency load failed. Check the browser console.</div>';
        console.error('OpenBEXI dependency bootstrap failed:', error);
    }

    global.openbexiBootFromTemplate = async function openbexiBootFromTemplate(options) {
        const timeoutMs = normalizeTimeout(options.timeoutMs);
        try {
            const [threeSource, satelliteSource] = await Promise.all([
                resolveThreeSource(options.three, timeoutMs),
                options.satellite
                    ? loadSatelliteSource(options.satellite, timeoutMs)
                    : Promise.resolve(null)
            ]);

            global.openbexiDependencySources = {
                three: threeSource.source,
                satellite: satelliteSource?.source || null,
                threeCoreUrl: threeSource.core,
                threeAddonsUrl: threeSource.addons,
                satelliteUrl: satelliteSource?.url || null
            };

            injectImportMap(threeSource);
            runTemplateModule(options.templateId, options.moduleLabel);
        } catch (error) {
            showDependencyError(options.errorTargetId, error);
        }
    };
}(window));
