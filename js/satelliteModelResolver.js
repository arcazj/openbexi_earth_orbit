import orbitIndex from '../json/satellites/orbit-model-index.json' with { type: 'json' };
import { trackedObjectType, trackedOrbitClass } from './trackedObjectCatalog.js';

export function uniqueModelNorad(entry) {
    if (entry.members?.length) return entry.members.length === 1 ? entry.members[0].norad : null;
    const matches = [];
    for (const profiles of Object.values(orbitIndex.orbits)) {
        for (const [id, numbers] of Object.entries(profiles)) {
            if (numbers && ((orbitIndex.meshFiles[id] || id) === entry.files.glb || id === entry.id)) matches.push(numbers);
        }
    }
    return matches.length === 1 && /^\d+$/.test(matches[0]) ? matches[0] : null;
}

export const LOCAL_MODEL_CATALOG = Object.freeze([
    {
        assetId: 'starlink_v3.glb', directory: 'leo', metadataId: 'starlink_v3', kind: 'glb',
        aliases: ['starlink v3'], starlinkGeneration: 'v3'
    },
    {
        assetId: 'starlink_v2.glb', directory: 'leo',
        metadataId: 'starlink_v2',
        kind: 'glb',
        aliases: ['starlink v2', 'starlink-v2', 'starlink_v2', 'v2 mini', 'v2mini'],
        starlinkGeneration: 'v2'
    },
    {
        assetId: 'starlink_V1', directory: 'leo',
        metadataId: 'starlink_V1',
        kind: 'obj-mtl',
        aliases: ['starlink', 'spacex', 'starlink v1', 'starlink_v1', 'starlink-v1'],
        noradIds: ['44713'],
        starlinkGeneration: 'v1'
    },
    {
        assetId: 'oneweb.glb', directory: 'leo',
        metadataId: 'oneweb',
        kind: 'glb',
        aliases: ['oneweb', 'one web', 'one-web', 'one_web'],
        noradIds: ['44057']
    },
    {
        assetId: 'o3b.glb', directory: 'meo',
        metadataId: 'O3b',
        kind: 'glb',
        namePrefixes: ['o3b fm', '03b fm', 'ob3 fm'],
        aliases: ['o3b', 'ob3'],
        noradIds: ['39188']
    },
    {
        assetId: 'o3b_mpower.glb', directory: 'meo',
        metadataId: 'o3b_mpower',
        kind: 'glb',
        namePrefixes: ['o3b mpower', '03b mpower', 'ob3 mpower'],
        noradIds: ['54755', '54756', '56367', '56368', '58346', '58347', '62362',
            '62363', '64866', '64867', '100686', '100687', '100688']
    },
    {
        assetId: 'qianfan', directory: 'leo',
        kind: 'obj-mtl',
        namePattern: /^(?:qianfan|spacesail|thousandsails|g60starlink)(?:constellation|jigui|xingzuo)?(?:i{1,2})?\d*$/,
        platformPattern: /^(?:qianfan|spacesail)(?:flatpanelplatform)?$/,
        noradIds: ['60379']
    },
    {
        assetId: 'iridium', directory: 'leo',
        kind: 'obj-mtl',
        namePattern: /^iridium(?:next(?:sv)?\d*|(?:sv)?1\d{2})?$/,
        platformPattern: /^iridiumnext$/,
        noradIds: ['41917']
    },
    {
        assetId: 'cubesat', directory: 'leo',
        kind: 'obj-mtl',
        namePattern: /^(?:cubesat(?:3u)?|(?:generic)?3ucubesat|canx2|rax2)$/,
        platformPattern: /^(?:3u|(?:generic)?3ucubesat|cubesat3u)$/,
        formFactor: '3u',
        noradIds: ['32790', '37853']
    },
    {
        assetId: 'ISS.glb', directory: 'leo',
        metadataId: 'ISS',
        kind: 'glb',
        aliases: ['iss', 'international space station', 'zarya']
    },
    {
        assetId: 'SSL_1300.glb', directory: 'geo',
        metadataId: 'SSL_1300',
        kind: 'glb',
        exactNames: [
            'INTELSAT 20',
            'INTELSAT 20 (IS-20)',
            'IS-20'
        ]
    },
    {
        assetId: 'geo/ref-osc-star-2-27461.glb', metadataId: 'geo', kind: 'glb',
        exactNames: ['INTELSAT 18', 'INTELSAT 18 (IS-18)', 'IS-18']
    },
    {
        assetId: 'leo/aqua.glb',
        metadataId: 'leo',
        kind: 'glb',
        aliases: ['aqua']
    },
    {
        assetId: 'leo/aura.glb',
        metadataId: 'leo',
        kind: 'glb',
        aliases: ['aura']
    },
    {
        assetId: 'leo/landsat-8-9.glb',
        metadataId: 'leo',
        kind: 'glb',
        aliases: ['landsat 8', 'landsat8']
    },
    {
        assetId: 'leo/ref-mms-11703.glb',
        metadataId: 'leo',
        kind: 'glb',
        aliases: ['landsat 4', 'landsat 5', 'landsat4', 'landsat5']
    },
    {
        assetId: 'leo/ref-proteus-26997.glb',
        metadataId: 'leo',
        kind: 'glb',
        aliases: ['calipso', 'cloud aerosol lidar infrared pathfinder']
    }
]);

const orbitByNorad = new Map();
const entriesByAsset = new Map(LOCAL_MODEL_CATALOG.map(entry => [entry.assetId, entry]));
for (const [orbit, groups] of Object.entries(orbitIndex.orbits)) {
    for (const [assetId, ranges] of Object.entries(groups)) {
        const entry = entriesByAsset.get(assetId) || { assetId, metadataId: assetId.split('/')[0], kind: 'glb' };
        entriesByAsset.set(assetId, entry);
        const match = { orbit, entry };
        for (const range of ranges.split(',').filter(Boolean)) {
            const [first, last = first] = range.split('-').map(Number);
            for (let number = first; number <= last; number++) orbitByNorad.set(number, match);
        }
    }
}

export function orbitLibraryEntries(orbit, profiles) {
    return Object.entries(profiles).filter(([, profile]) => !profile.existingMetadata)
        .map(([id, profile]) => ({
            id, displayName: profile.name, type: 'glb', description: profile.description,
            tags: [orbit, profile.family], files: { glb: orbitIndex.meshFiles[id] || id }, textures: []
        }));
}

export function catalogModel(assetId) {
    return entriesByAsset.get(assetId);
}

function meoFamily(name) {
    if (/^(GSAT01\d{2}|GALILEO IOV)\b/.test(name)) return 'galileo-iov';
    if (/^(GSAT02\d{2}|GALILEO FOC)\b/.test(name)) return 'galileo-foc';
    const gps = /\bGPS\s+(?:BLOCK\s+)?(III|IIF|IIR(?:-M)?|IIA|II|I)\b/.exec(name);
    if (gps) return 'gps-' + gps[1].replace('-M', '').toLowerCase();
    const glonass = /\bGLONASS[- ](K2|K1|K|M)\b/.exec(name);
    if (glonass) return 'glonass-' + (glonass[1] === 'K' ? 'k1' : glonass[1].toLowerCase());
    if (/^LAGEOS\b/.test(name)) return 'lageos';
    if (/^LARES[- ]2\b/.test(name)) return 'lares-2';
    if (/^ETALON\b/.test(name)) return 'etalon';
    if (/^BEIDOU-?2?\s+(?:MEO|M\d)/.test(name)) return 'beidou-2-meo';
    return null;
}

export function normalizeModelKey(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[^a-z0-9]+/g, '');
}

function stripExtension(value) {
    return String(value ?? '').replace(/\.[^.]+$/, '');
}

function normalized(values) {
    return values.map(normalizeModelKey).filter(Boolean);
}

function nameFieldsForSatellite(sat) {
    return [sat.satellite_name, sat.name, sat.object_name, sat.meta?.name, sat.meta?.scid];
}

function textFieldsForSatellite(sat) {
    return [...nameFieldsForSatellite(sat), sat.norad_id, sat.company, sat.operator,
        sat.type, sat.meta?.bus, sat.meta?.manufacturer];
}

function metadataValues(sat, keys) {
    return [sat, sat.meta || {}].flatMap(source => keys.map(key => source[key]));
}

function starlinkGeneration(sat) {
    const names = nameFieldsForSatellite(sat).filter(Boolean);
    const fields = metadataValues(sat, ['generation', 'version', 'variant', 'bus']);
    if (![...names, ...fields, sat.company, sat.operator].some(v => /^starlink(?:\b|v\d)/i.test(String(v)))) return null;
    const labels = normalized([...fields, ...names, sat.meta?.description]);
    for (const generation of ['v3', 'v2', 'v1']) {
        if (labels.some(label => label === generation || label.includes('starlink' + generation)
            || (generation === 'v2' && label.includes('v2mini')))) return generation;
    }
    const serial = names.map(name => /^STARLINK[-\s](\d{4,5})\b/i.exec(name)?.[1]).find(Boolean) || '';
    if (/^4\d{4}$/.test(serial)) return 'v3';
    if (/^[13]\d{4}$/.test(serial)) return 'v2';
    return 'v1';
}

export function isStarlinkV2Satellite(sat = {}) {
    return starlinkGeneration(sat) === 'v2';
}

function catalogKeys(entry) {
    return [
        entry.assetId,
        stripExtension(entry.assetId),
        orbitIndex.orbits[entry.metadataId?.toUpperCase()] ? '' : entry.metadataId,
        ...(entry.namePrefixes || []),
        ...(entry.aliases || [])
    ].map(normalizeModelKey).filter(Boolean);
}

export function modelAssetPaths(entry, objBase = 'obj/') {
    if (!entry?.assetId) return [];
    const base = objBase.endsWith('/') ? objBase : `${objBase}/`;
    const asset = entry.directory ? `${entry.directory}/${entry.assetId}` : orbitIndex.meshFiles[entry.assetId] || entry.assetId;
    if (entry.kind === 'glb' || /\.glb$/i.test(entry.assetId)) {
        return [`${base}${asset}`];
    }

    const assetBase = stripExtension(asset);
    return [`${base}${assetBase}.obj`, `${base}${assetBase}.mtl`];
}

export function resolveSatelliteModel(sat = {}, {
    catalog = LOCAL_MODEL_CATALOG,
    objBase = 'obj/'
} = {}) {
    const normalizedNorad = normalizeModelKey(sat.norad_id ?? sat.noradId ?? sat.NORAD_CAT_ID);
    const orbit = trackedOrbitClass(sat);
    const type = trackedObjectType(sat);
    const indexed = catalog === LOCAL_MODEL_CATALOG && orbitByNorad.get(Number(normalizedNorad));
    const supported = catalog === LOCAL_MODEL_CATALOG && Object.hasOwn(orbitIndex.orbits, orbit);
    const names = nameFieldsForSatellite(sat);
    const nonPayload = [sat.object_type, sat.objectType, sat.type, sat.meta?.object_type]
        .map(normalizeModelKey).some(type => ['deb', 'debris', 'rb', 'rocketbody', 'deployer'].includes(type)) ||
        names.some(name => /\b(?:deb(?:ris)?|r\/b|rocket body|deployer)\b/i.test(name));
    if (indexed && (indexed.orbit === orbit || orbit === 'UNKNOWN') &&
        (type === 'PAYLOAD' || (type === 'UNKNOWN' && !nonPayload))) {
        return foundModel(indexed.entry, 'NORAD ' + normalizedNorad + ' matched the ' + indexed.orbit + ' platform registry', objBase);
    }
    const satelliteIds = normalized(metadataValues(sat, ['satellite_id', 'satelliteId', 'id', 'app_satellite_id', 'appSatelliteId']));
    const nameKeys = normalized(names);
    const platformFields = metadataValues(sat, ['form_factor', 'formFactor', 'bus', 'type']);
    const platforms = normalized(platformFields);
    const formFactor = platformFields.map(field => /(\d+(?:\.\d+)?)\s*u/i.exec(field)?.[1]).find(Boolean);
    const normalizedFields = normalized(textFieldsForSatellite(sat));
    const normalizedText = normalizedFields.join(' ');
    const generation = starlinkGeneration(sat);

    let best = null;
    const exclude = supported && (nonPayload || !['UNKNOWN', 'PAYLOAD'].includes(type));
    for (const entry of exclude ? [] : catalog) {
        if (entry.starlinkGeneration && (nonPayload || entry.starlinkGeneration !== generation)) continue;
        const keys = catalogKeys(entry);
        const exactNorad = (entry.noradIds || []).map(normalizeModelKey).includes(normalizedNorad);
        const familyName = entry.namePattern && nameKeys.some(name => entry.namePattern.test(name));
        const platformMatch = entry.platformPattern && platforms.some(field => entry.platformPattern.test(field));
        if (entry.namePattern && (nonPayload || (!exactNorad && !familyName && !platformMatch))) continue;
        if (entry.formFactor && formFactor && entry.formFactor !== formFactor + 'u') continue;
        const exactSatelliteId = entry.satelliteIds?.some(id => satelliteIds.includes(normalizeModelKey(id)));
        const exactRestrictedName = entry.exactNames?.some(name => nameKeys.includes(normalizeModelKey(name)));
        if ((entry.satelliteIds?.length || entry.exactNames?.length) &&
            !exactSatelliteId && !exactRestrictedName) {
            continue;
        }
        const exactField = normalizedFields.some(field => keys.includes(field));
        const namePrefix = entry.namePrefixes?.find(prefix =>
            nameKeys.some(name => name.startsWith(normalizeModelKey(prefix))));
        const alias = keys.find(key => key && normalizedText.includes(key));

        const match = [
            [exactRestrictedName, 115, 'exact restricted satellite name matched model catalog'],
            [exactSatelliteId, 110, `app satellite identifier ${satelliteIds.join(', ')} matched model catalog id`],
            [entry.starlinkGeneration, 105, `Starlink ${generation?.toUpperCase()} generation matched model catalog`],
            [exactNorad, 100, `NORAD ${sat.norad_id} matched metadata mapping`],
            [namePrefix || familyName, 95, `satellite name matched model family "${namePrefix || entry.assetId}"`],
            [exactField, 80, 'exact normalized satellite field matched model catalog'],
            [platformMatch, 70, 'spacecraft platform or form factor matched model catalog'],
            [alias, 50, `alias "${alias}" matched satellite name/company metadata`]
        ].find(([matched]) => matched);
        if (match && (!best || match[1] > best.score)) {
            const [, score, reason] = match;
            best = { entry, score, reason };
        }
    }

    if ((!best || best.score < 70) && supported && type === 'PAYLOAD' && !nonPayload) {
        const family = orbit === 'MEO' && names.filter(Boolean).map(name => meoFamily(String(name).toUpperCase())).find(Boolean);
        const dir = orbit.toLowerCase();
        const entry = entriesByAsset.get(`${dir}/${family || dir + '-reference'}.glb`);
        best = { entry, reason: family ? orbit + ' family matched by name' : orbit + ' payload with undocumented exterior' };
    }
    if (!best) {
        return {
            found: false,
            reason: 'No local model mapping matched satellite metadata',
            attemptedPaths: []
        };
    }

    return foundModel(best.entry, best.reason, objBase);
}

function foundModel(entry, reason, objBase) {
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
