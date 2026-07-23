import {
    normalizeComputationProvenance,
    normalizeStateVector
} from '../domain/contracts.js';
import { catalogObjectId, stableFingerprint } from '../domain/objectIdentity.js';
import {
    DOMAIN_SCHEMA_VERSION,
    REFERENCE_FRAME,
    TIME_SCALE,
    normalizeUtcInstant
} from '../domain/orbitalPolicy.js';
import { ORBITAL_SOURCE_FORMAT, V21_SCHEMA_VERSION } from '../domain/v21Contracts.js';
import {
    DEFAULT_MINIMUM_ORBIT_RADIUS_KM,
    PROPAGATION_ERROR_CODE,
    SATELLITE_JS_VERSION,
    createTlePropagationService
} from './propagationService.js';

export const MULTI_FORMAT_PROPAGATION_SERVICE_VERSION = '2.1.0';
export const DEFAULT_MAX_INTERPOLATION_GAP_SECONDS = 3600;

export const TABULATED_INTERPOLATION_POLICY = Object.freeze({
    method: 'LINEAR_POSITION_AND_VELOCITY',
    extrapolation: 'REJECT',
    frame_conversion: 'REJECT',
    time_scale_conversion: 'REJECT',
    units: Object.freeze({ position: 'km', velocity: 'km/s' })
});

export const MULTI_FORMAT_PROPAGATION_ERROR_CODE = Object.freeze({
    ...PROPAGATION_ERROR_CODE,
    FORMAT_UNSUPPORTED: 'PROPAGATION_FORMAT_UNSUPPORTED',
    SOURCE_RECORD_INVALID: 'PROPAGATION_SOURCE_RECORD_INVALID',
    OMM_PARSE_FAILED: 'OMM_SGP4_PARSE_FAILED',
    OMM_INVALID: 'OMM_SGP4_INVALID',
    TABULATED_STATES_INVALID: 'TABULATED_STATES_INVALID',
    FRAME_UNSUPPORTED: 'PROPAGATION_FRAME_UNSUPPORTED',
    TIME_SCALE_UNSUPPORTED: 'PROPAGATION_TIME_SCALE_UNSUPPORTED',
    UNITS_UNSUPPORTED: 'PROPAGATION_UNITS_UNSUPPORTED',
    OUT_OF_RANGE: 'TABULATED_PROPAGATION_OUT_OF_RANGE',
    INTERPOLATION_GAP_EXCEEDED: 'TABULATED_INTERPOLATION_GAP_EXCEEDED'
});

const PREPARED_MARKER = 'openbexi.multiformat.prepared.v2.1';
const SGP4_CRITICAL_FINITE_FIELDS = Object.freeze([
    'epochyr', 'epochdays', 'jdsatepoch', 'ndot', 'nddot', 'bstar',
    'inclo', 'nodeo', 'ecco', 'argpo', 'mo', 'no'
]);
const DEFAULT_TABULATED_FRAMES = Object.freeze([
    REFERENCE_FRAME.TEME,
    REFERENCE_FRAME.GCRF,
    REFERENCE_FRAME.ITRF
]);

function finiteVector(value) {
    return !!value &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        Number.isFinite(value.z);
}

function vectorCopy(value) {
    return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function vectorMagnitude(value) {
    return Math.hypot(value.x, value.y, value.z);
}

function hashValue(value) {
    return `fnv1a64:${stableFingerprint(value)}`;
}

function errorRecord(code, message, context = {}) {
    return Object.freeze({
        schema_version: V21_SCHEMA_VERSION,
        code,
        message,
        stage: context.stage ?? 'PROPAGATION',
        source_format: context.source_format ?? null,
        object_id: context.object_id ?? null,
        element_set_id: context.element_set_id ?? null,
        timestamp: context.timestamp ?? null,
        frame: context.frame ?? null,
        time_scale: context.time_scale ?? null,
        propagator_error_code: context.propagator_error_code ?? null,
        recoverable: context.recoverable ?? true
    });
}

function resultError(code, message, context = {}) {
    return { ok: false, error: errorRecord(code, message, context) };
}

function stateProvenance(prepared, timestamp, algorithmName, algorithmVersion, configurationValues) {
    return normalizeComputationProvenance({
        dataset_id: prepared.dataset_id,
        dataset_hash: prepared.dataset_hash,
        generated_at: timestamp,
        algorithm: {
            name: algorithmName,
            version: algorithmVersion,
            configuration_hash: hashValue(configurationValues.join('|'))
        },
        input_element_set_ids: [prepared.element_set_id]
    });
}

function sourceFormat(record, format) {
    if (record?.source_format) return String(record.source_format).toUpperCase();
    if (format === 'TLE') return ORBITAL_SOURCE_FORMAT.TLE_JSON;
    if (format === 'OMM') return ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON;
    if (format === 'OEM') return ORBITAL_SOURCE_FORMAT.CCSDS_OEM_KVN;
    if (format === 'PROVIDER_EPHEMERIS') return ORBITAL_SOURCE_FORMAT.PROVIDER_EPHEMERIS_JSON;
    return null;
}

function commonPreparedMetadata(record, elementSet) {
    let objectId;
    try {
        objectId = catalogObjectId({ object_id: record?.object_id ?? elementSet?.object_id });
    } catch (error) {
        return resultError(
            MULTI_FORMAT_PROPAGATION_ERROR_CODE.INVALID_OBJECT_IDENTITY,
            error.message,
            { stage: 'PREPARE', source_format: record?.source_format ?? null }
        );
    }
    const elementSetId = String(elementSet?.element_set_id ?? '').trim();
    if (!elementSetId) {
        return resultError(
            MULTI_FORMAT_PROPAGATION_ERROR_CODE.SOURCE_RECORD_INVALID,
            'element_set.element_set_id is required.',
            { stage: 'PREPARE', source_format: record?.source_format ?? null, object_id: objectId }
        );
    }
    const datasetId = String(record?.provenance?.dataset_id ?? '').trim();
    const datasetHash = String(record?.provenance?.dataset_hash ?? '').trim();
    if (!datasetId || !/^[a-z0-9][a-z0-9_-]*:[A-Za-z0-9+/_=-]+$/.test(datasetHash)) {
        return resultError(
            MULTI_FORMAT_PROPAGATION_ERROR_CODE.SOURCE_RECORD_INVALID,
            'A valid dataset_id and dataset_hash are required.',
            {
                stage: 'PREPARE',
                source_format: record?.source_format ?? null,
                object_id: objectId,
                element_set_id: elementSetId
            }
        );
    }
    return {
        ok: true,
        value: {
            object_id: objectId,
            object_name: String(record?.name ?? objectId),
            element_set_id: elementSetId,
            dataset_id: datasetId,
            dataset_hash: datasetHash,
            input_quality_flags: Object.freeze([
                ...new Set((record?.quality_flags ?? []).map(String))
            ].sort())
        }
    };
}

function validateSgp4Record(satrec) {
    if (!satrec) return { valid: false, fields: [] };
    const nonFinite = SGP4_CRITICAL_FINITE_FIELDS.filter(field => !Number.isFinite(satrec[field]));
    return {
        valid: Number.isFinite(satrec.error) && satrec.error === 0 && nonFinite.length === 0,
        fields: nonFinite
    };
}

function normalizedInstant(instant, prepared) {
    try {
        return { ok: true, value: normalizeUtcInstant(instant, 'propagation timestamp') };
    } catch (error) {
        return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.INVALID_EPOCH, error.message, {
            object_id: prepared?.object_id ?? null,
            element_set_id: prepared?.element_set_id ?? null,
            source_format: prepared?.source_format ?? null,
            recoverable: false
        });
    }
}

function validatedState({ prepared, timestamp, position, velocity, provenance, qualityFlags }) {
    if (!finiteVector(position)) {
        return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.INVALID_POSITION, 'Propagation returned a non-finite position.', {
            object_id: prepared.object_id,
            element_set_id: prepared.element_set_id,
            source_format: prepared.source_format,
            timestamp,
            propagator_error_code: prepared.satrec?.error ?? null
        });
    }
    if (!finiteVector(velocity)) {
        return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.INVALID_VELOCITY, 'Propagation returned a non-finite velocity.', {
            object_id: prepared.object_id,
            element_set_id: prepared.element_set_id,
            source_format: prepared.source_format,
            timestamp,
            propagator_error_code: prepared.satrec?.error ?? null
        });
    }
    if (Number.isFinite(prepared.minimum_orbit_radius_km) && vectorMagnitude(position) < prepared.minimum_orbit_radius_km) {
        return resultError(
            MULTI_FORMAT_PROPAGATION_ERROR_CODE.BELOW_EARTH,
            `Propagated radius is below ${prepared.minimum_orbit_radius_km.toFixed(3)} km.`,
            {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                source_format: prepared.source_format,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            }
        );
    }
    try {
        return {
            ok: true,
            value: normalizeStateVector({
                schema_version: DOMAIN_SCHEMA_VERSION,
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp,
                time_scale: prepared.time_scale,
                frame: prepared.frame,
                position_km: vectorCopy(position),
                velocity_km_s: vectorCopy(velocity),
                units: { position: 'km', velocity: 'km/s' },
                provenance,
                quality_flags: [...new Set(qualityFlags)].sort()
            })
        };
    } catch (error) {
        return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.STATE_VALIDATION_FAILED, error.message, {
            object_id: prepared.object_id,
            element_set_id: prepared.element_set_id,
            source_format: prepared.source_format,
            timestamp,
            propagator_error_code: prepared.satrec?.error ?? null
        });
    }
}

function interpolateVector(left, right, fraction) {
    return {
        x: left.x + (right.x - left.x) * fraction,
        y: left.y + (right.y - left.y) * fraction,
        z: left.z + (right.z - left.z) * fraction
    };
}

function findSampleBracket(samples, timestampMs) {
    let low = 0;
    let high = samples.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const value = samples[middle].timestamp_ms;
        if (value === timestampMs) return { exact: samples[middle] };
        if (value < timestampMs) low = middle + 1;
        else high = middle - 1;
    }
    return { left: samples[high], right: samples[low] };
}

export function createMultiFormatPropagationService({
    satelliteLib = globalThis.satellite,
    libraryVersion = SATELLITE_JS_VERSION,
    minimumOrbitRadiusKm = DEFAULT_MINIMUM_ORBIT_RADIUS_KM,
    maxInterpolationGapSeconds = DEFAULT_MAX_INTERPOLATION_GAP_SECONDS,
    allowedTabulatedFrames = DEFAULT_TABULATED_FRAMES
} = {}) {
    if (!Number.isFinite(maxInterpolationGapSeconds) || maxInterpolationGapSeconds <= 0) {
        throw new TypeError('maxInterpolationGapSeconds must be a positive finite number.');
    }
    if (!Array.isArray(allowedTabulatedFrames) || allowedTabulatedFrames.length === 0) {
        throw new TypeError('allowedTabulatedFrames must be a non-empty array.');
    }
    const allowedFrames = new Set(allowedTabulatedFrames.map(value => String(value).trim().toUpperCase()));
    const tleService = createTlePropagationService({ satelliteLib, libraryVersion, minimumOrbitRadiusKm });

    function prepareTle(record) {
        const delegated = tleService.prepareObject(record);
        if (!delegated.ok) return delegated;
        return {
            ok: true,
            value: {
                prepared_by: PREPARED_MARKER,
                route: 'TLE',
                source_format: sourceFormat(record, 'TLE'),
                delegated: delegated.value
            }
        };
    }

    function prepareOmm(record, elementSet) {
        if (!satelliteLib?.json2satrec || !satelliteLib?.propagate) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.LIBRARY_UNAVAILABLE,
                'satellite.js with json2satrec and propagate is required for OMM.',
                { stage: 'PREPARE', source_format: sourceFormat(record, 'OMM'), recoverable: false }
            );
        }
        const common = commonPreparedMetadata(record, elementSet);
        if (!common.ok) return common;
        if (String(elementSet.time_scale ?? '').toUpperCase() !== TIME_SCALE.UTC) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.TIME_SCALE_UNSUPPORTED,
                'OMM propagation supports UTC only.',
                { stage: 'PREPARE', source_format: sourceFormat(record, 'OMM'), ...common.value }
            );
        }
        if (String(elementSet.native_frame ?? '').toUpperCase() !== REFERENCE_FRAME.TEME) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.FRAME_UNSUPPORTED,
                'OMM SGP4 propagation supports TEME only.',
                { stage: 'PREPARE', source_format: sourceFormat(record, 'OMM'), ...common.value }
            );
        }
        if (String(elementSet.propagation_theory ?? '').toUpperCase() !== 'SGP4' || !elementSet.omm) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.SOURCE_RECORD_INVALID,
                'OMM requires explicit SGP4 theory and canonical OMM fields.',
                { stage: 'PREPARE', source_format: sourceFormat(record, 'OMM'), ...common.value }
            );
        }
        let satrec;
        try {
            satrec = satelliteLib.json2satrec(elementSet.omm);
        } catch (error) {
            return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.OMM_PARSE_FAILED, error.message, {
                stage: 'PREPARE',
                source_format: sourceFormat(record, 'OMM'),
                object_id: common.value.object_id,
                element_set_id: common.value.element_set_id
            });
        }
        const validation = validateSgp4Record(satrec);
        if (!validation.valid) {
            const fields = validation.fields.length ? ` Non-finite fields: ${validation.fields.join(', ')}.` : '';
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.OMM_INVALID,
                `OMM is invalid for satellite.js SGP4 initialization.${fields}`,
                {
                    stage: 'PREPARE',
                    source_format: sourceFormat(record, 'OMM'),
                    object_id: common.value.object_id,
                    element_set_id: common.value.element_set_id,
                    propagator_error_code: Number.isFinite(satrec?.error) ? satrec.error : null
                }
            );
        }
        return {
            ok: true,
            value: {
                prepared_by: PREPARED_MARKER,
                route: 'OMM',
                source_format: sourceFormat(record, 'OMM'),
                ...common.value,
                satrec,
                frame: REFERENCE_FRAME.TEME,
                time_scale: TIME_SCALE.UTC,
                minimum_orbit_radius_km: minimumOrbitRadiusKm,
                quality_flags: Object.freeze([
                    ...new Set([...common.value.input_quality_flags, 'OMM_SGP4_EXPERIMENTAL', 'TEME_FRAME_EXPLICIT'])
                ].sort())
            }
        };
    }

    function prepareTabulated(record, elementSet) {
        const common = commonPreparedMetadata(record, elementSet);
        if (!common.ok) return common;
        const format = String(elementSet.format ?? '').toUpperCase();
        const preparedSourceFormat = sourceFormat(record, format);
        const timeScale = String(elementSet.time_scale ?? '').toUpperCase();
        const frame = String(elementSet.native_frame ?? '').toUpperCase();
        if (timeScale !== TIME_SCALE.UTC) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.TIME_SCALE_UNSUPPORTED,
                'Tabulated propagation supports UTC only; no time-scale conversion is performed.',
                { stage: 'PREPARE', source_format: preparedSourceFormat, ...common.value, time_scale: timeScale }
            );
        }
        if (!allowedFrames.has(frame)) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.FRAME_UNSUPPORTED,
                `Tabulated frame ${frame || '(missing)'} is unsupported; no frame conversion is performed.`,
                { stage: 'PREPARE', source_format: preparedSourceFormat, ...common.value, frame }
            );
        }
        if (elementSet.units?.position !== 'km' || elementSet.units?.velocity !== 'km/s') {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.UNITS_UNSUPPORTED,
                'Tabulated propagation requires km and km/s; no unit conversion is performed.',
                { stage: 'PREPARE', source_format: preparedSourceFormat, ...common.value, frame, time_scale: timeScale }
            );
        }
        if (
            elementSet.interpolation?.method !== TABULATED_INTERPOLATION_POLICY.method ||
            elementSet.interpolation?.extrapolation !== TABULATED_INTERPOLATION_POLICY.extrapolation
        ) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.SOURCE_RECORD_INVALID,
                'Tabulated source must declare bounded linear position/velocity interpolation with extrapolation rejected.',
                { stage: 'PREPARE', source_format: preparedSourceFormat, ...common.value, frame, time_scale: timeScale }
            );
        }
        if (!Array.isArray(elementSet.states) || elementSet.states.length < 2) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.TABULATED_STATES_INVALID,
                'At least two tabulated states are required.',
                { stage: 'PREPARE', source_format: preparedSourceFormat, ...common.value, frame, time_scale: timeScale }
            );
        }
        let priorMs = -Infinity;
        const samples = [];
        for (const sample of elementSet.states) {
            let timestamp;
            try {
                timestamp = normalizeUtcInstant(sample?.timestamp, 'tabulated state timestamp');
            } catch (error) {
                return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.TABULATED_STATES_INVALID, error.message, {
                    stage: 'PREPARE', source_format: preparedSourceFormat, ...common.value, frame, time_scale: timeScale
                });
            }
            const timestampMs = Date.parse(timestamp);
            if (
                timestampMs <= priorMs ||
                sample?.time_scale !== timeScale ||
                sample?.frame !== frame ||
                sample?.units?.position !== 'km' ||
                sample?.units?.velocity !== 'km/s' ||
                !finiteVector(sample?.position_km) ||
                !finiteVector(sample?.velocity_km_s)
            ) {
                return resultError(
                    MULTI_FORMAT_PROPAGATION_ERROR_CODE.TABULATED_STATES_INVALID,
                    'Tabulated states must be strictly ordered and share one explicit frame, UTC time scale, and km/km/s units.',
                    { stage: 'PREPARE', source_format: preparedSourceFormat, ...common.value, frame, time_scale: timeScale }
                );
            }
            priorMs = timestampMs;
            samples.push({
                timestamp,
                timestamp_ms: timestampMs,
                position_km: vectorCopy(sample.position_km),
                velocity_km_s: vectorCopy(sample.velocity_km_s)
            });
        }
        return {
            ok: true,
            value: {
                prepared_by: PREPARED_MARKER,
                route: 'TABULATED',
                source_format: preparedSourceFormat,
                ...common.value,
                frame,
                time_scale: timeScale,
                samples,
                start_time: samples[0].timestamp,
                end_time: samples.at(-1).timestamp,
                minimum_orbit_radius_km: minimumOrbitRadiusKm,
                quality_flags: Object.freeze([
                    ...new Set([
                        ...common.value.input_quality_flags,
                        'TABULATED_STATE_INTERPOLATION',
                        'NO_EXTRAPOLATION',
                        `${frame}_FRAME_EXPLICIT`
                    ])
                ].sort())
            }
        };
    }

    function prepareObject(record) {
        if (record?.prepared_by === PREPARED_MARKER && record?.route) return { ok: true, value: record };
        const elementSet = record?.element_set ?? record?.elementSet;
        const format = String(elementSet?.format ?? '').trim().toUpperCase();
        if (format === 'TLE') return prepareTle(record);
        if (format === 'OMM') return prepareOmm(record, elementSet);
        if (format === 'OEM' || format === 'PROVIDER_EPHEMERIS') return prepareTabulated(record, elementSet);
        return resultError(
            MULTI_FORMAT_PROPAGATION_ERROR_CODE.FORMAT_UNSUPPORTED,
            `Unsupported propagation source format ${format || '(missing)'}.`,
            { stage: 'PREPARE', source_format: record?.source_format ?? null, recoverable: false }
        );
    }

    function propagateOmm(prepared, timestamp) {
        let propagated;
        try {
            propagated = satelliteLib.propagate(prepared.satrec, new Date(timestamp));
        } catch (error) {
            return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.PROPAGATION_FAILED, error.message, {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                source_format: prepared.source_format,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            });
        }
        if (!propagated) {
            return resultError(MULTI_FORMAT_PROPAGATION_ERROR_CODE.PROPAGATION_FAILED, 'OMM SGP4 returned no state.', {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                source_format: prepared.source_format,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            });
        }
        const provenance = stateProvenance(
            prepared,
            timestamp,
            'satellite.js SGP4 (CCSDS OMM)',
            libraryVersion,
            [MULTI_FORMAT_PROPAGATION_SERVICE_VERSION, libraryVersion, 'OMM', REFERENCE_FRAME.TEME, TIME_SCALE.UTC]
        );
        return validatedState({
            prepared,
            timestamp,
            position: propagated.position,
            velocity: propagated.velocity,
            provenance,
            qualityFlags: prepared.quality_flags
        });
    }

    function propagateTabulated(prepared, timestamp) {
        const timestampMs = Date.parse(timestamp);
        const firstSample = prepared.samples[0];
        const lastSample = prepared.samples.at(-1);
        if (timestampMs < firstSample.timestamp_ms || timestampMs > lastSample.timestamp_ms) {
            return resultError(
                MULTI_FORMAT_PROPAGATION_ERROR_CODE.OUT_OF_RANGE,
                `Requested time is outside ${prepared.start_time} through ${prepared.end_time}; extrapolation is prohibited.`,
                {
                    object_id: prepared.object_id,
                    element_set_id: prepared.element_set_id,
                    source_format: prepared.source_format,
                    timestamp,
                    frame: prepared.frame,
                    time_scale: prepared.time_scale,
                    recoverable: false
                }
            );
        }
        const bracket = findSampleBracket(prepared.samples, timestampMs);
        let position;
        let velocity;
        let qualityFlag;
        if (bracket.exact) {
            position = bracket.exact.position_km;
            velocity = bracket.exact.velocity_km_s;
            qualityFlag = 'TABULATED_EXACT_SAMPLE';
        } else {
            const gapSeconds = (bracket.right.timestamp_ms - bracket.left.timestamp_ms) / 1000;
            if (gapSeconds > maxInterpolationGapSeconds) {
                return resultError(
                    MULTI_FORMAT_PROPAGATION_ERROR_CODE.INTERPOLATION_GAP_EXCEEDED,
                    `Interpolation gap ${gapSeconds} seconds exceeds ${maxInterpolationGapSeconds} seconds.`,
                    {
                        object_id: prepared.object_id,
                        element_set_id: prepared.element_set_id,
                        source_format: prepared.source_format,
                        timestamp,
                        frame: prepared.frame,
                        time_scale: prepared.time_scale,
                        recoverable: false
                    }
                );
            }
            const fraction = (timestampMs - bracket.left.timestamp_ms) /
                (bracket.right.timestamp_ms - bracket.left.timestamp_ms);
            position = interpolateVector(bracket.left.position_km, bracket.right.position_km, fraction);
            velocity = interpolateVector(bracket.left.velocity_km_s, bracket.right.velocity_km_s, fraction);
            qualityFlag = 'TABULATED_LINEAR_INTERPOLATION';
        }
        const provenance = stateProvenance(
            prepared,
            timestamp,
            'bounded linear tabulated-state interpolation',
            MULTI_FORMAT_PROPAGATION_SERVICE_VERSION,
            [
                MULTI_FORMAT_PROPAGATION_SERVICE_VERSION,
                prepared.source_format,
                prepared.frame,
                prepared.time_scale,
                maxInterpolationGapSeconds,
                TABULATED_INTERPOLATION_POLICY.method
            ]
        );
        return validatedState({
            prepared,
            timestamp,
            position,
            velocity,
            provenance,
            qualityFlags: [...prepared.quality_flags, qualityFlag]
        });
    }

    function propagate(preparedOrRaw, instant) {
        const preparedResult = prepareObject(preparedOrRaw);
        if (!preparedResult.ok) return preparedResult;
        const prepared = preparedResult.value;
        const instantResult = normalizedInstant(instant, prepared.route === 'TLE' ? prepared.delegated : prepared);
        if (!instantResult.ok) return instantResult;
        const timestamp = instantResult.value;
        if (prepared.route === 'TLE') return tleService.propagate(prepared.delegated, timestamp);
        if (prepared.route === 'OMM') return propagateOmm(prepared, timestamp);
        if (prepared.route === 'TABULATED') return propagateTabulated(prepared, timestamp);
        return resultError(
            MULTI_FORMAT_PROPAGATION_ERROR_CODE.FORMAT_UNSUPPORTED,
            `Unsupported prepared route ${prepared.route}.`,
            { source_format: prepared.source_format, recoverable: false }
        );
    }

    return Object.freeze({
        service_version: MULTI_FORMAT_PROPAGATION_SERVICE_VERSION,
        satellite_js_version: libraryVersion,
        supported_formats: Object.freeze(['TLE', 'OMM', 'OEM', 'PROVIDER_EPHEMERIS']),
        supported_tabulated_frames: Object.freeze([...allowedFrames].sort()),
        time_scale: TIME_SCALE.UTC,
        units: TABULATED_INTERPOLATION_POLICY.units,
        interpolation_policy: TABULATED_INTERPOLATION_POLICY,
        max_interpolation_gap_seconds: maxInterpolationGapSeconds,
        minimum_orbit_radius_km: minimumOrbitRadiusKm,
        prepareObject,
        propagate
    });
}
