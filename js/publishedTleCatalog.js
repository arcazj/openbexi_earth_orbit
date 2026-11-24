// Both viewers read the same two-line element snapshot on demand. The servicing
// directory retains just its flights and clients, while NORAD lookup accepts any row.
async function read(path) {
    const response = await fetch(path, {cache:'no-cache', signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('Published TLE catalog unavailable.');
    return response.json();
}

export function createPublishedTleLoader(accept = () => true) {
    let pending, previous, loadedAt = 0;
    return function load(reload = false) {
        if (!reload && pending && Date.now()-loadedAt < 300000) return pending;
        loadedAt = Date.now();
        const request = read('json/tle/TLE.meta.json').catch(() => null).then(async meta => {
            const revision = meta?.catalog_revision;
            if (!reload && revision && revision === previous?.revision) return previous;
            const rows = await read('json/tle/TLE.json');
            const catalog = {revision, records:new Map(rows.filter(accept).map(row => [String(row.norad_id), row])),
                source:meta?.mode === 'derived-gp' ? 'CelesTrak GP / published TLE compatibility catalog' : 'Published TLE catalog',
                updated:meta?.last_success_at || null};
            if (pending === request) previous = catalog;
            return catalog;
        }).catch(error => {
            if (pending === request) pending = null;
            throw error;
        });
        pending = request;
        return request;
    };
}

export const loadPublishedTles = createPublishedTleLoader();
