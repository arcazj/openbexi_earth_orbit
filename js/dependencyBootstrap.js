(function bootstrapDependencyLoader(global) {
    'use strict';

    async function fetchOk(url, timeoutMs) {
        try {
            const response = await fetch(url, {
                cache: 'force-cache',
                signal: AbortSignal.timeout(timeoutMs)
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    function loadClassicScript(src, timeoutMs) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            let settled = false;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (error) {
                    script.remove();
                    reject(error);
                } else {
                    resolve(src);
                }
            };
            const timeout = setTimeout(
                () => finish(new Error(`Timed out loading ${src}`)),
                timeoutMs
            );
            script.async = false;
            script.src = src;
            script.onload = () => finish();
            script.onerror = () => finish(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    function sourceWithTrailingSlash(source) {
        return source.endsWith('/') ? source : `${source}/`;
    }

    function sourceCandidates(options, allowCdn) {
        const sources = [['local', options.local]];
        if (allowCdn && options.cdn) sources.push(['cdn', options.cdn]);
        return sources;
    }

    async function probeThreeSource(source, probePaths, timeoutMs) {
        if (!source || !await fetchOk(source.core, timeoutMs)) return false;
        const addonBase = sourceWithTrailingSlash(source.addons);
        const checks = (probePaths || []).map(path => fetchOk(`${addonBase}${path}`, timeoutMs));
        return (await Promise.all(checks)).every(Boolean);
    }

    async function resolveThreeSource(options, timeoutMs, allowCdn) {
        for (const [name, source] of sourceCandidates(options, allowCdn)) {
            if (await probeThreeSource(source, options.probePaths, timeoutMs)) {
                return { source: name, core: source.core, addons: sourceWithTrailingSlash(source.addons) };
            }
        }
        throw new Error('Three.js sources are unavailable.');
    }

    function hasSatelliteGlobal() {
        return Boolean(global.satellite?.propagate && global.satellite?.twoline2satrec && global.satellite?.gstime);
    }

    async function loadSatelliteSource(options, timeoutMs, allowCdn) {
        for (const [name, source] of sourceCandidates(options, allowCdn)) {
            try {
                await loadClassicScript(source, timeoutMs);
                if (hasSatelliteGlobal()) return { source: name, url: source };
            } catch (error) {}
        }
        throw new Error('satellite.js sources are unavailable.');
    }

    function injectImportMap(threeSource) {
        const script = document.createElement('script');
        script.type = 'importmap';
        script.textContent = JSON.stringify({
            imports: {
                three: threeSource.core,
                'three/addons/': threeSource.addons
            }
        });
        document.head.appendChild(script);
    }

    function runTemplateModule(templateId, moduleLabel) {
        const template = document.getElementById(templateId);
        if (!template) throw new Error(`Missing module template: ${templateId}`);
        return new Promise((resolve, reject) => {
            const moduleScript = document.createElement('script');
            global.__openbexiModuleLoaded = () => {
                delete global.__openbexiModuleLoaded;
                resolve();
            };
            moduleScript.type = 'module';
            moduleScript.textContent = `${template.textContent}\nwindow.__openbexiModuleLoaded();\n//# sourceURL=${moduleLabel || `${templateId}.js`}`;
            moduleScript.onerror = () => {
                delete global.__openbexiModuleLoaded;
                reject(new Error('Application module graph failed to load.'));
            };
            template.after(moduleScript);
        });
    }

    function showDependencyError(targetId, error) {
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
            target.hidden = false;
            if (!target.querySelector('[data-error-code]')) {
                target.textContent = 'Application failed to start. Confirm the local server is running, then retry.';
            }
            const retry = target.querySelector('[data-startup-retry]');
            if (retry) retry.onclick = () => global.location.reload();
        }
        global.openbexiStartupState = { phase: 'error', errorCode: 'STARTUP_FAILED' };
        console.error('OpenBEXI dependency bootstrap failed:', error);
    }

    global.openbexiShowStartupError = (error, targetId = 'startupFailure') => showDependencyError(targetId, error);
    global.openbexiBootFromTemplate = async function openbexiBootFromTemplate(options) {
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 2500;
        const deploymentMode = document.querySelector?.('meta[name="openbexi-deployment-mode"]')?.content || 'server-capable';
        const policy = document.querySelector?.('meta[name="openbexi-dependency-policy"]')?.content
            || (deploymentMode === 'static' ? 'packaged-only' : 'packaged-first-with-cdn-fallback');
        const allowCdn = policy === 'packaged-first-with-cdn-fallback';
        global.openbexiStartupState = { phase: 'dependencies', errorCode: null };
        try {
            const [threeSource, satelliteSource] = await Promise.all([
                resolveThreeSource(options.three, timeoutMs, allowCdn),
                options.satellite
                    ? loadSatelliteSource(options.satellite, timeoutMs, allowCdn)
                    : Promise.resolve(null)
            ]);
            global.openbexiDependencySources = {
                deploymentMode,
                policy,
                three: threeSource.source,
                satellite: satelliteSource?.source || null,
                threeCoreUrl: threeSource.core,
                threeAddonsUrl: threeSource.addons,
                satelliteUrl: satelliteSource?.url || null
            };
            injectImportMap(threeSource);
            global.openbexiStartupState.phase = 'module';
            await runTemplateModule(options.templateId, options.moduleLabel);
            global.openbexiStartupState.phase = 'module-loaded';
        } catch (error) {
            showDependencyError(options.errorTargetId, error);
        }
    };
}(window));
