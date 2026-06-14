export const LOCAL_MODEL_CATALOG = Object.freeze([
    {
        assetId: 'starlink_v2.glb',
        metadataId: 'starlink_v2',
        kind: 'glb',
        aliases: ['starlink v2', 'starlink-v2', 'starlink_v2', 'v2 mini', 'v2mini'],
        starlinkGeneration: 'v2'
    },
    {
        assetId: 'starlink_V1',
        metadataId: 'starlink_V1',
        kind: 'obj-mtl',
        aliases: ['starlink', 'spacex', 'starlink v1', 'starlink_v1', 'starlink-v1'],
        noradIds: ['44713'],
        starlinkGeneration: 'v1'
    },
    {
        assetId: 'oneweb.glb',
        metadataId: 'oneweb',
        kind: 'glb',
        aliases: ['oneweb', 'one web', 'one-web', 'one_web'],
        noradIds: ['44072']
    },
    {
        assetId: 'o3b.glb',
        metadataId: 'O3b',
        kind: 'glb',
        aliases: ['o3b', 'ob3', 'o3b mpower', 'o3b-mpower', 'o3b_mpower'],
        noradIds: ['39188']
    },
    {
        assetId: 'ISS.glb',
        metadataId: 'ISS',
        kind: 'glb',
        aliases: ['iss', 'international space station', 'zarya']
    },
    {
        assetId: 'SSL_1300.glb',
        metadataId: 'SSL_1300',
        kind: 'glb',
        exactNames: [
            'INTELSAT 20',
            'INTELSAT 20 (IS-20)',
            'IS-20',
            'INTELSAT 18',
            'INTELSAT 18 (IS-18)',
            'IS-18'
        ]
    },
    {
        assetId: 'Aqua.glb',
        metadataId: 'Aqua',
        kind: 'glb',
        aliases: ['aqua']
    },
    {
        assetId: 'Aura.glb',
        metadataId: 'Aura',
        kind: 'glb',
        aliases: ['aura']
    },
    {
        assetId: 'Landsat8.glb',
        metadataId: 'Landsat8',
        kind: 'glb',
        aliases: ['landsat 8', 'landsat8']
    },
    {
        assetId: 'Landsat4and5.glb',
        metadataId: 'Landsat4and5',
        kind: 'glb',
        aliases: ['landsat 4', 'landsat 5', 'landsat4', 'landsat5']
    },
    {
        assetId: 'Cloud-Aerosol Lidar and Infrared Pathfinder Satellite (CALIPSO).glb',
        metadataId: 'CALIPSO',
        kind: 'glb',
        aliases: ['calipso', 'cloud aerosol lidar infrared pathfinder']
    }
]);

export function normalizeModelKey(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[^a-z0-9]+/g, '');
}

function stripExtension(value) {
    return String(value ?? '').replace(/\.[^.]+$/, '');
}

function textFieldsForSatellite(sat = {}) {
    return [
        sat.norad_id,
        sat.satellite_name,
        sat.name,
        sat.company,
        sat.operator,
        sat.type,
        sat.object_name,
        sat.meta?.name,
        sat.meta?.scid,
        sat.meta?.bus,
        sat.meta?.manufacturer
    ].filter(value => value !== undefined && value !== null);
}

function nameFieldsForSatellite(sat = {}) {
    return [
        sat.satellite_name,
        sat.name,
        sat.object_name,
        sat.meta?.name,
        sat.meta?.scid
    ].filter(value => value !== undefined && value !== null);
}

function satelliteIdentifierFields(sat = {}) {
    // App satellite identifiers are separate from NORAD IDs and can be used by restricted entries.
    return [
        sat.satellite_id,
        sat.satelliteId,
        sat.id,
        sat.app_satellite_id,
        sat.appSatelliteId,
        sat.meta?.satellite_id,
        sat.meta?.satelliteId,
        sat.meta?.id,
        sat.meta?.app_satellite_id,
        sat.meta?.appSatelliteId
    ].filter(value => value !== undefined && value !== null);
}

function starlinkNameNumber(sat = {}) {
    const name = String(sat.satellite_name || sat.name || sat.object_name || sat.meta?.name || '').toUpperCase();
    const match = /\bSTARLINK[-\s]?(\d{4,5})\b/.exec(name);
    return match ? Number(match[1]) : null;
}

function isStarlinkSatellite(sat = {}) {
    return textFieldsForSatellite(sat)
        .map(value => String(value).toLowerCase())
        .some(value => value.includes('starlink') || value.includes('spacex'));
}

export function isStarlinkV2Satellite(sat = {}) {
    if (!isStarlinkSatellite(sat)) return false;
    const explicitGenerationText = [
        sat.generation,
        sat.version,
        sat.variant,
        sat.bus,
        sat.meta?.generation,
        sat.meta?.version,
        sat.meta?.variant,
        sat.meta?.bus,
        sat.meta?.description
    ].filter(value => value !== undefined && value !== null)
        .map(normalizeModelKey)
        .join(' ');
    if (
        explicitGenerationText.includes('starlinkv2') ||
        explicitGenerationText.includes('v2mini') ||
        explicitGenerationText.split(/\s+/).includes('v2')
    ) return true;

    const number = starlinkNameNumber(sat);
    return Number.isFinite(number) && number >= 30000;
}

function catalogKeys(entry) {
    return [
        entry.assetId,
        stripExtension(entry.assetId),
        entry.metadataId,
        ...(entry.aliases || [])
    ].map(normalizeModelKey).filter(Boolean);
}

export function modelAssetPaths(entry, objBase = 'obj/') {
    if (!entry?.assetId) return [];
    const base = objBase.endsWith('/') ? objBase : `${objBase}/`;
    if (entry.kind === 'glb' || /\.glb$/i.test(entry.assetId)) {
        return [`${base}${entry.assetId}`];
    }

    const assetBase = stripExtension(entry.assetId);
    return [`${base}${assetBase}.obj`, `${base}${assetBase}.mtl`];
}

export function resolveSatelliteModel(sat = {}, {
    catalog = LOCAL_MODEL_CATALOG,
    objBase = 'obj/'
} = {}) {
    const normalizedNorad = normalizeModelKey(sat.norad_id);
    const normalizedSatelliteIds = satelliteIdentifierFields(sat).map(normalizeModelKey).filter(Boolean);
    const normalizedNameFields = nameFieldsForSatellite(sat).map(normalizeModelKey).filter(Boolean);
    const normalizedFields = textFieldsForSatellite(sat).map(normalizeModelKey).filter(Boolean);
    const normalizedText = normalizedFields.join(' ');
    const starlinkV2Satellite = isStarlinkV2Satellite(sat);
    const starlinkSatellite = isStarlinkSatellite(sat);

    let best = null;
    for (const entry of catalog) {
        const keys = catalogKeys(entry);
        const exactNorad = (entry.noradIds || []).map(normalizeModelKey).includes(normalizedNorad);
        const exactSatelliteId = (entry.satelliteIds || []).map(normalizeModelKey)
            .some(id => normalizedSatelliteIds.includes(id));
        const exactRestrictedName = (entry.exactNames || []).map(normalizeModelKey)
            .some(name => normalizedNameFields.includes(name));
        const exactStarlinkGeneration = entry.starlinkGeneration === 'v2'
            ? starlinkV2Satellite
            : entry.starlinkGeneration === 'v1' && starlinkSatellite && !starlinkV2Satellite;
        if (((entry.satelliteIds || []).length > 0 || (entry.exactNames || []).length > 0) &&
            !exactSatelliteId && !exactRestrictedName) {
            continue;
        }
        const exactField = normalizedFields.some(field => keys.includes(field));
        const alias = keys.find(key => key && normalizedText.includes(key));

        let score = 0;
        let reason = '';
        if (exactRestrictedName) {
            score = 115;
            reason = 'exact restricted satellite name matched model catalog';
        } else if (exactSatelliteId) {
            score = 110;
            reason = `app satellite identifier ${normalizedSatelliteIds.join(', ')} matched model catalog id`;
        } else if (exactStarlinkGeneration && entry.starlinkGeneration === 'v2') {
            score = 105;
            reason = 'Starlink V2 generation matched model catalog';
        } else if (exactNorad) {
            score = 100;
            reason = `NORAD ${sat.norad_id} matched metadata mapping`;
        } else if (exactStarlinkGeneration && entry.starlinkGeneration === 'v1') {
            score = 90;
            reason = 'Starlink V1 generation matched model catalog';
        } else if (exactField) {
            score = 80;
            reason = 'exact normalized satellite field matched model catalog';
        } else if (alias) {
            score = 50;
            reason = `alias "${alias}" matched satellite name/company metadata`;
        }

        if (score > 0 && (!best || score > best.score)) {
            best = { entry, score, reason };
        }
    }

    if (!best) {
        return {
            found: false,
            reason: 'No local model mapping matched satellite metadata',
            attemptedPaths: []
        };
    }

    const { entry, reason } = best;
    return {
        found: true,
        assetId: entry.assetId,
        metadataId: entry.metadataId || stripExtension(entry.assetId),
        kind: entry.kind,
        reason,
        attemptedPaths: modelAssetPaths(entry, objBase),
        entry
    };
}

export async function verifyResolvedModelAsset(resolution, checkFileExists) {
    if (!resolution?.found) return { ...resolution, exists: false };
    if (typeof checkFileExists !== 'function') {
        return { ...resolution, exists: true };
    }

    const checks = await Promise.all(
        resolution.attemptedPaths.map(async path => ({
            path,
            ok: await checkFileExists(path)
        }))
    );
    const exists = resolution.kind === 'obj-mtl'
        ? checks.some(check => /\.obj$/i.test(check.path) && check.ok)
        : checks.every(check => check.ok);

    return {
        ...resolution,
        exists,
        checkedPaths: checks
    };
}
