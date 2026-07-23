const NUMERIC_NORAD_PATTERN = /^\d{1,9}$/;
const ALPHA5_NORAD_PATTERN = /^[A-HJ-NP-Z]\d{4}$/;
const INTERNAL_OBJECT_ID_PATTERN = /^obx:(?:norad|cospar|provider):[a-z0-9._:-]+$/;
const INTERNATIONAL_DESIGNATOR_PATTERN = /^\d{4}-\d{3}[A-Z0-9]{0,3}$/;

export const IDENTITY_SCHEME = Object.freeze({
    NORAD: 'NORAD',
    COSPAR: 'COSPAR',
    PROVIDER: 'PROVIDER'
});

export const IDENTITY_CONFIDENCE = Object.freeze({
    AUTHORITATIVE: 'AUTHORITATIVE',
    PROVIDER_ASSERTED: 'PROVIDER_ASSERTED',
    MANUAL: 'MANUAL',
    PROVISIONAL: 'PROVISIONAL'
});

function requireText(value, label) {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new TypeError(`${label} is required.`);
    return normalized;
}

function normalizeProviderToken(value, label) {
    const normalized = requireText(value, label)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!normalized) throw new TypeError(`${label} does not contain a usable identifier.`);
    return normalized;
}

export function normalizeNoradId(value) {
    const normalized = requireText(value, 'NORAD catalog identifier')
        .toUpperCase()
        .replace(/\s+/g, '');

    if (NUMERIC_NORAD_PATTERN.test(normalized)) {
        return normalized.replace(/^0+(?=\d)/, '');
    }
    if (ALPHA5_NORAD_PATTERN.test(normalized)) return normalized;
    throw new TypeError(`Invalid NORAD catalog identifier: ${value}`);
}

export function noradIdFromInternalObjectId(value) {
    const match = /^obx:norad:([a-hj-np-z]\d{4}|\d{1,9})$/i.exec(String(value ?? '').trim());
    if (!match) return null;
    try {
        return normalizeNoradId(match[1]);
    } catch {
        return null;
    }
}

export function normalizeInternationalDesignator(value) {
    const normalized = requireText(value, 'International designator')
        .toUpperCase()
        .replace(/\s+/g, '');
    if (!INTERNATIONAL_DESIGNATOR_PATTERN.test(normalized)) {
        throw new TypeError(`Invalid international designator: ${value}`);
    }
    return normalized;
}

export function isInternalObjectId(value) {
    return typeof value === 'string' && INTERNAL_OBJECT_ID_PATTERN.test(value);
}

export function catalogObjectId(identity = {}) {
    if (typeof identity === 'string' || typeof identity === 'number') {
        return `obx:norad:${normalizeNoradId(identity).toLowerCase()}`;
    }

    const explicitObjectId = String(identity.object_id ?? identity.objectId ?? '').trim().toLowerCase();
    const noradCandidate = identity.norad_id ?? identity.noradId ?? identity.NORAD_CAT_ID;
    const cosparCandidate = identity.international_designator ?? identity.internationalDesignator ?? identity.OBJECT_ID;

    if (explicitObjectId) {
        if (!isInternalObjectId(explicitObjectId)) {
            throw new TypeError(`Invalid internal object identifier: ${explicitObjectId}`);
        }
        if (noradCandidate !== undefined && noradCandidate !== null && String(noradCandidate).trim()) {
            const expected = `obx:norad:${normalizeNoradId(noradCandidate).toLowerCase()}`;
            if (explicitObjectId.startsWith('obx:norad:') && explicitObjectId !== expected) {
                throw new TypeError(`Internal object identifier ${explicitObjectId} conflicts with NORAD ${noradCandidate}.`);
            }
        }
        return explicitObjectId;
    }

    if (noradCandidate !== undefined && noradCandidate !== null && String(noradCandidate).trim()) {
        return `obx:norad:${normalizeNoradId(noradCandidate).toLowerCase()}`;
    }
    if (cosparCandidate !== undefined && cosparCandidate !== null && String(cosparCandidate).trim()) {
        return `obx:cospar:${normalizeInternationalDesignator(cosparCandidate).toLowerCase()}`;
    }

    const provider = identity.provider ?? identity.source_id ?? identity.sourceId;
    const providerObjectId = identity.provider_object_id ?? identity.providerObjectId;
    if (provider && providerObjectId) {
        return `obx:provider:${normalizeProviderToken(provider, 'Provider')}:${normalizeProviderToken(providerObjectId, 'Provider object identifier')}`;
    }
    throw new TypeError('Stable object identity requires an internal, NORAD, COSPAR, or provider-specific identifier.');
}

export function stableFingerprint(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    const bytes = new TextEncoder().encode(text);
    for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = (hash * prime) & mask;
    }
    return hash.toString(16).padStart(16, '0');
}

export function elementSetId({ object_id, objectId, format = 'TLE', line1 = '', line2 = '', source_record_id = '' } = {}) {
    const normalizedObjectId = catalogObjectId({ object_id: object_id ?? objectId });
    const normalizedFormat = requireText(format, 'Element format').toLowerCase();
    const identityMaterial = [normalizedObjectId, normalizedFormat, line1, line2, source_record_id].join('\n');
    return `elset:${normalizedFormat}:${normalizedObjectId}:${stableFingerprint(identityMaterial)}`;
}

export function canonicalObjectPair(firstObjectId, secondObjectId) {
    const first = catalogObjectId({ object_id: firstObjectId });
    const second = catalogObjectId({ object_id: secondObjectId });
    if (first === second) throw new TypeError('A conjunction pair must contain two distinct objects.');
    return [first, second].sort((left, right) => left.localeCompare(right));
}

export function canonicalPairKey(firstObjectId, secondObjectId) {
    return canonicalObjectPair(firstObjectId, secondObjectId).join('|');
}

export function conjunctionEventId({ first_object_id, second_object_id, tca, request_id = '' } = {}) {
    const pairKey = canonicalPairKey(first_object_id, second_object_id);
    const normalizedTca = requireText(tca, 'TCA');
    const fingerprint = stableFingerprint([pairKey, normalizedTca, request_id].join('\n'));
    return `conjunction:${fingerprint}`;
}

export function buildIdentityEvidence(record = {}, options = {}) {
    const objectId = catalogObjectId(record);
    const evidence = [];
    const noradCandidate = record.norad_id ?? record.noradId ?? record.NORAD_CAT_ID;
    const cosparCandidate = record.international_designator ?? record.internationalDesignator ?? record.OBJECT_ID;

    if (noradCandidate !== undefined && noradCandidate !== null && String(noradCandidate).trim()) {
        evidence.push({
            kind: 'NORAD_CATALOG_ID',
            value: normalizeNoradId(noradCandidate),
            source_id: options.source_id ?? record.source_id ?? null
        });
    }
    if (cosparCandidate !== undefined && cosparCandidate !== null && String(cosparCandidate).trim()) {
        evidence.push({
            kind: 'INTERNATIONAL_DESIGNATOR',
            value: normalizeInternationalDesignator(cosparCandidate),
            source_id: options.source_id ?? record.source_id ?? null
        });
    }
    const providerObjectCandidate = record.provider_object_id ?? record.providerObjectId;
    if (providerObjectCandidate !== undefined && providerObjectCandidate !== null && String(providerObjectCandidate).trim()) {
        evidence.push({
            kind: 'PROVIDER_OBJECT_ID',
            value: String(providerObjectCandidate).trim(),
            source_id: options.source_id ?? record.source_id ?? record.provider ?? null
        });
    }

    let scheme = IDENTITY_SCHEME.PROVIDER;
    if (objectId.startsWith('obx:norad:')) scheme = IDENTITY_SCHEME.NORAD;
    if (objectId.startsWith('obx:cospar:')) scheme = IDENTITY_SCHEME.COSPAR;

    return Object.freeze({
        object_id: objectId,
        scheme,
        confidence: options.confidence ?? IDENTITY_CONFIDENCE.PROVIDER_ASSERTED,
        provisional: scheme === IDENTITY_SCHEME.PROVIDER,
        evidence: Object.freeze(evidence.map(item => Object.freeze(item)))
    });
}
