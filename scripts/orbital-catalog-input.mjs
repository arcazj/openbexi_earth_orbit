import { existsSync } from 'node:fs';
import path from 'node:path';

import { ORBITAL_SOURCE_FORMAT } from '../js/domain/v21Contracts.js';

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function recordsFrom(input) {
    if (Array.isArray(input)) return input;
    if (isRecord(input) && Array.isArray(input.records)) return input.records;
    return [input];
}

function elementSet(record) {
    return isRecord(record?.element_set)
        ? record.element_set
        : isRecord(record?.elementSet) ? record.elementSet : null;
}

function packagedOmm(record) {
    const candidate = elementSet(record);
    if (String(candidate?.format ?? '').trim().toUpperCase() !== 'OMM') return null;
    if (!isRecord(candidate.omm)) {
        throw new TypeError('Packaged OMM records require canonical element_set.omm fields.');
    }
    return candidate.omm;
}

function firstRecord(input) {
    const records = recordsFrom(input);
    const record = records.find(isRecord);
    if (!record) throw new TypeError('Orbital catalog must contain at least one object record.');
    return record;
}

function metadataFormat(metadata) {
    const value = String(metadata?.source_format ?? metadata?.dataset_format ?? '').trim().toUpperCase();
    return value || null;
}

function detectedFormat(record) {
    if (packagedOmm(record)) return ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON;
    const keys = new Set(Object.keys(record).map(key => key.toUpperCase()));
    if (keys.has('CCSDS_OMM_VERS') || (keys.has('EPOCH') && keys.has('MEAN_MOTION'))) {
        return ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON;
    }
    if (
        (keys.has('TLE_LINE1') || keys.has('TLELINE1') || keys.has('LINE1')) &&
        (keys.has('TLE_LINE2') || keys.has('TLELINE2') || keys.has('LINE2'))
    ) {
        return ORBITAL_SOURCE_FORMAT.TLE_JSON;
    }
    return null;
}

export function inferCatalogSourceFormat(input, metadata = {}) {
    const explicit = metadataFormat(metadata);
    if (explicit) {
        if (!Object.values(ORBITAL_SOURCE_FORMAT).includes(explicit)) {
            throw new TypeError(`Unsupported orbital source format ${explicit}.`);
        }
        return explicit;
    }
    const detected = detectedFormat(firstRecord(input));
    if (!detected) {
        throw new TypeError('Orbital source format is absent from metadata and cannot be inferred.');
    }
    return detected;
}

export function prepareCatalogAdapterInput(input, format) {
    if (String(format).toUpperCase() !== ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON) {
        return Object.freeze({
            input,
            satcat_records: null,
            packaged_omm_record_count: 0
        });
    }

    const records = recordsFrom(input);
    const unwrapped = [];
    const satcatRecords = [];
    let packagedCount = 0;
    for (const record of records) {
        if (!isRecord(record)) {
            unwrapped.push(record);
            continue;
        }
        const omm = packagedOmm(record);
        if (!omm) {
            unwrapped.push(record);
            continue;
        }
        packagedCount += 1;
        const wrapperNorad = record.norad_id ?? record.noradId ?? null;
        const ommNorad = omm.NORAD_CAT_ID ?? omm.norad_cat_id ?? null;
        if (wrapperNorad !== null && ommNorad !== null && String(wrapperNorad) !== String(ommNorad)) {
            throw new TypeError('Packaged OMM wrapper and canonical OMM NORAD identifiers conflict.');
        }
        unwrapped.push(omm);
        const noradId = wrapperNorad ?? ommNorad;
        if (noradId !== null && noradId !== undefined && String(noradId).trim()) {
            satcatRecords.push({
                NORAD_CAT_ID: String(noradId),
                OBJECT_TYPE: record.object_type ?? record.objectType ?? omm.OBJECT_TYPE,
                lifecycle_status: record.lifecycle_status ?? record.lifecycleStatus ??
                    record.operational_status ?? record.operationalStatus
            });
        }
    }

    return Object.freeze({
        input: unwrapped,
        satcat_records: satcatRecords.length ? satcatRecords : null,
        packaged_omm_record_count: packagedCount
    });
}

export function preferredCatalogPair(root, pathExists = existsSync) {
    const gp = Object.freeze({
        catalog: path.join(root, 'json', 'gp', 'GP.json'),
        meta: path.join(root, 'json', 'gp', 'GP.meta.json')
    });
    if (pathExists(gp.catalog) && pathExists(gp.meta)) return gp;
    return Object.freeze({
        catalog: path.join(root, 'json', 'tle', 'TLE.json'),
        meta: path.join(root, 'json', 'tle', 'TLE.meta.json')
    });
}

export function siblingMetadataPath(catalogPath) {
    const extension = path.extname(catalogPath);
    const stem = extension ? catalogPath.slice(0, -extension.length) : catalogPath;
    return `${stem}.meta.json`;
}
