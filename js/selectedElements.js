import { apiEndpoint, resolveApiBaseUrl } from './serverConnection.js';

const pending = new Map();

export function requestSelectedElements(norad, base = resolveApiBaseUrl()) {
    const id = String(norad ?? '');
    if (!base || !/^[1-9]\d{0,8}$/.test(id)) return Promise.resolve(null);
    const url = apiEndpoint(base, '/api/v1/objects/' + id + '/refresh-elements');
    if (!pending.has(url)) {
        const request = fetch(url, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000) })
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                const elements = data?.element_set;
                return String(data?.norad_id) === id && String(elements?.omm?.NORAD_CAT_ID) === id &&
                    Number.isFinite(Date.parse(elements.epoch)) ? elements : null;
            }).catch(() => null).finally(() => pending.delete(url));
        pending.set(url, request);
    }
    return pending.get(url);
}
