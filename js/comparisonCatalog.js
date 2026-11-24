import { attachmentAt, attachmentPeer, extensionFamilies, serviceAttachments } from './lifeExtensionCatalog.js';
import { loadPublishedTles } from './publishedTleCatalog.js';

const known = new Map();
for (const record of serviceAttachments) {
    for (const member of [record.host,record.vehicle]) known.set(member.key,member);
}
const families = Object.entries(extensionFamilies).filter(([key]) => key !== 'MEV').map(([key, family]) => ({
    key: 'model:'+(family.model || 'mission-'+key.toLowerCase()), name: family.name+' ('+key+')', model: family.model
}));

export function comparisonObject(key, name, model) {
    const family = families.find(item => item.key === key);
    return {key, name: known.get(key)?.name || family?.name || name || (/^\d+$/.test(key) ? 'NORAD '+key : key.slice(6)),
        model: model || known.get(key)?.model || family?.model};
}

export function servicingPartner(key, time) {
    const record = attachmentAt(key,time);
    return record ? attachmentPeer(record,key) : null;
}

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
let directory;
export function loadComparisonDirectory() {
    directory ??= import('./trackedObjectCatalog.js').then(async ({createTrackedObjectCatalogLoader}) =>
        (await createTrackedObjectCatalogLoader().load({objectTypes:['PAYLOAD'], includeHistorical:false})).records
    ).catch(error => { directory = null; throw error; });
    return directory;
}

export function findComparisonObjects(query, primary, rows = [], limit = 8) {
    const term = normalize(query).replace(/^norad(?=\d)/,'');
    if (!term) return [];
    const found = new Map();
    function include(item) {
        if (item.key === primary || found.has(item.key)) return;
        const name = normalize(item.name);
        const number = /^\d+$/.test(item.key) ? item.key : '';
        const rank = number === term || name === term ? 0 : name.startsWith(term) || number.startsWith(term) ? 1 : 2;
        if (rank < 2 || name.includes(term)) found.set(item.key,{item,rank});
    }
    for (const member of known.values()) include(member);
    for (const item of families) include(item);
    for (const row of rows) {
        const id = row.norad_id ?? row.NORAD_CAT_ID;
        if (id != null) include(comparisonObject(String(id),row.satellite_name || row.OBJECT_NAME || row.name));
    }
    if (/^[1-9]\d{0,8}$/.test(term) && term !== primary && !found.has(term)) include(comparisonObject(term));
    return [...found.values()].sort((a,b) => a.rank-b.rank || a.item.name.localeCompare(b.item.name, 'en', {numeric:true}))
        .slice(0,limit).map(value => value.item);
}

export function comparisonSnapshot(url, keys) {
    const data = new URLSearchParams(url.hash.slice(1)).get('orbits');
    if (data === null) {
        if (url.searchParams.has('tleRevision')) throw Error('This snapshot is missing its saved orbital elements.');
        return null;
    }
    if (data.length > 10000) throw Error('Invalid comparison snapshot.');
    let saved;
    try { saved = JSON.parse(data); } catch { throw Error('Invalid comparison snapshot.'); }
    const revision = url.searchParams.get('tleRevision');
    if (![1,2].includes(saved?.version) || !Array.isArray(saved.objects) || saved.objects.length !== 2 ||
        !revision || revision !== saved.revision || !Number.isFinite(Date.parse(url.searchParams.get('at')))) {
        throw Error('Incomplete comparison snapshot.');
    }
    function restore(value,key) {
        if (!value || value.key !== key || typeof value.name !== 'string' || value.name.length > 200) {
            throw Error('Snapshot elements do not match the selected objects.');
        }
        const object = comparisonObject(value.key,value.name,typeof value.model === 'string' ? value.model : undefined);
        if (value.lines === null) return {...object, row:null};
        if (!/^\d+$/.test(value.key) || !Array.isArray(value.lines) || value.lines.length !== 2 ||
            value.lines.some(line => typeof line !== 'string' || line.length !== 69)) throw Error('Invalid saved TLE.');
        return {...object,row:{norad_id:value.key, satellite_name:object.name, orbit_class:value.orbit,
            tle_line1:value.lines[0], tle_line2:value.lines[1]}};
    }
    const objects = saved.objects.map((value,i) => restore(value,keys[i]));
    const allowed = relatedMembers(objects).map(item => item.key);
    const related = saved.related || [];
    if (!Array.isArray(related) || related.length > allowed.length || related.some(item => !allowed.includes(item?.key))) {
        throw Error('Unknown spacecraft in the saved assembly.');
    }
    return {revision, source:'Snapshot TLEs', objects, related:related.map(item=>restore(item,item.key))};
}

function relatedMembers(objects) {
    const keys = new Set(objects.map(item=>item.key));
    const related = new Map();
    for (const record of serviceAttachments) {
        for (const member of [record.host,record.vehicle]) {
            if (!keys.has(member.key) && keys.has(attachmentPeer(record,member.key).key)) related.set(member.key,member);
        }
    }
    return [...related.values()];
}

export async function comparisonElements(objects) {
    const catalog = await loadPublishedTles();
    function load(item) {
        const row = catalog.records.get(item.key);
        return {...comparisonObject(item.key,row?.satellite_name || item.name,item.model), row};
    }
    return {revision:catalog.revision || 'unversioned', source:catalog.source,
        objects:objects.map(load), related:relatedMembers(objects).map(load)};
}

export function comparisonLink({objects, related=[], revision, date, view, earth, footprint, orbits=false, snapshot}, base = document.baseURI) {
    const url = new URL('display_satellite.html', base);
    const [a,b] = objects;
    if (a.key.startsWith('model:')) {
        url.searchParams.set('model',a.key.slice(6));
        if (a.key.startsWith('model:mission-')) url.searchParams.set('catalog','life-extension');
    }
    else url.searchParams.set('norad',a.key);
    url.searchParams.set('compare',b.key);
    url.searchParams.set('view',view);
    url.searchParams.set('earth',earth ? '1':'0');
    url.searchParams.set('orbits',orbits ? '1':'0');
    if (earth && footprint) url.searchParams.set('footprint','1');
    if (date) url.searchParams.set('at',date.toISOString());
    if (snapshot) {
        url.searchParams.set('tleRevision',revision);
        const pack = ({key,name,model,row}) => ({
            key,name,model,orbit:row?.orbit_class,
            lines:row?.tle_line1 && row?.tle_line2 ? [row.tle_line1,row.tle_line2] : null
        });
        const peers = new Set(objects.map(item=>servicingPartner(item.key,+date)?.key));
        url.hash = new URLSearchParams({orbits:JSON.stringify({version:2,revision,objects:objects.map(pack),
            related:related.filter(item=>peers.has(item.key)).map(pack)})}).toString();
    }
    return url;
}
