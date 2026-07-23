export const DOMAIN_SCHEMA_VERSION = '2.0.0';

export const TIME_SCALE = Object.freeze({
    UTC: 'UTC',
    TAI: 'TAI',
    UT1: 'UT1'
});

export const REFERENCE_FRAME = Object.freeze({
    TEME: 'TEME',
    GCRF: 'GCRF',
    ITRF: 'ITRF',
    RTN: 'RTN',
    ENCOUNTER_PLANE: 'ENCOUNTER_PLANE'
});

export const CAPABILITY = Object.freeze({
    CATALOG_VISUALIZATION: 'CATALOG_VISUALIZATION',
    TLE_PROPAGATION: 'TLE_PROPAGATION',
    SELECTED_OBJECT_SCREENING: 'SELECTED_OBJECT_SCREENING',
    COLLISION_PROBABILITY: 'COLLISION_PROBABILITY',
    MANEUVER_RECOMMENDATION: 'MANEUVER_RECOMMENDATION'
});

export const CAPABILITY_MATURITY = Object.freeze({
    VISUALIZATION: 'Visualization',
    EXPERIMENTAL: 'Experimental',
    VALIDATED: 'Validated',
    OPERATIONALLY_REVIEWED: 'Operationally Reviewed'
});

export const SOFTWARE_READINESS = Object.freeze({
    DEVELOPMENT: 'Development',
    RELEASE_CANDIDATE: 'Release Candidate',
    PRODUCTION: 'Production'
});

export const OBJECT_TYPE = Object.freeze({
    PAYLOAD: 'PAYLOAD',
    ROCKET_BODY: 'ROCKET_BODY',
    DEBRIS: 'DEBRIS',
    UNKNOWN: 'UNKNOWN'
});

export const ORBIT_CLASS = Object.freeze({
    LEO: 'LEO',
    MEO: 'MEO',
    GEO: 'GEO',
    HEO: 'HEO',
    DECAYING: 'DECAYING',
    OTHER: 'OTHER',
    UNKNOWN: 'UNKNOWN'
});

export const LIFECYCLE_STATUS = Object.freeze({
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    DECAYED: 'DECAYED',
    RETIRED: 'RETIRED',
    UNKNOWN: 'UNKNOWN'
});

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

export const INITIAL_TIME_FRAME_POLICY = deepFreeze({
    policy_version: '2.0.0',
    canonical_time_scale: TIME_SCALE.UTC,
    accepted_timestamp_syntax: 'ISO-8601 date-time with explicit Z or numeric UTC offset',
    leap_second_behavior: 'REJECT_UNREPRESENTABLE_INSTANT',
    tle_native_state_frame: REFERENCE_FRAME.TEME,
    v2_screening_frame: REFERENCE_FRAME.TEME,
    ambiguous_eci_label_allowed: false,
    supported_frames_v2: [REFERENCE_FRAME.TEME],
    planned_frames: [REFERENCE_FRAME.GCRF, REFERENCE_FRAME.ITRF, REFERENCE_FRAME.RTN, REFERENCE_FRAME.ENCOUNTER_PLANE],
    earth_orientation_policy: 'NOT_USED_FOR_TEME_TO_TEME_V2_SCREENING',
    requirements: [
        'Both objects are evaluated at the same UTC instant.',
        'Every state declares frame, time scale, distance unit, and velocity unit.',
        'Frame conversion is rejected unless a validated conversion and required Earth-orientation data are available.'
    ]
});

export const DEFAULT_TLE_FRESHNESS_POLICY = deepFreeze({
    policy_version: '2.0.0-experimental',
    purpose: 'Diagnostic gate for experimental TLE-based screening; not an accuracy guarantee.',
    future_epoch_tolerance_days: 0.01,
    max_age_days_by_orbit_class: {
        [ORBIT_CLASS.LEO]: 7,
        [ORBIT_CLASS.MEO]: 14,
        [ORBIT_CLASS.GEO]: 14,
        [ORBIT_CLASS.HEO]: 7,
        [ORBIT_CLASS.DECAYING]: 1,
        [ORBIT_CLASS.OTHER]: 7,
        [ORBIT_CLASS.UNKNOWN]: 7
    },
    missing_epoch_status: 'UNUSABLE',
    stale_status: 'STALE',
    fresh_status: 'FRESH'
});

export const CAPABILITY_POLICIES = deepFreeze({
    [CAPABILITY.CATALOG_VISUALIZATION]: {
        capability: CAPABILITY.CATALOG_VISUALIZATION,
        scientific_maturity: CAPABILITY_MATURITY.VISUALIZATION,
        software_readiness: SOFTWARE_READINESS.PRODUCTION,
        enabled: true,
        required_evidence: [],
        permitted_outputs: ['catalog metadata', 'visual position', 'visual orbit path'],
        prohibited_outputs: ['operational decision support']
    },
    [CAPABILITY.TLE_PROPAGATION]: {
        capability: CAPABILITY.TLE_PROPAGATION,
        scientific_maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        software_readiness: SOFTWARE_READINESS.DEVELOPMENT,
        enabled: true,
        required_evidence: ['valid_tle', 'explicit_utc', 'explicit_teme_frame', 'algorithm_version'],
        permitted_outputs: ['TEME position', 'TEME velocity', 'propagation quality flags'],
        prohibited_outputs: ['high-precision inertial truth', 'operational navigation']
    },
    [CAPABILITY.SELECTED_OBJECT_SCREENING]: {
        capability: CAPABILITY.SELECTED_OBJECT_SCREENING,
        scientific_maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        software_readiness: SOFTWARE_READINESS.DEVELOPMENT,
        enabled: true,
        required_evidence: ['validated_propagation_fixture', 'same_time_same_frame', 'deterministic_screening_configuration'],
        permitted_outputs: ['time of closest approach', 'miss distance', 'relative position', 'relative velocity'],
        prohibited_outputs: ['collision probability', 'collision likelihood percentage', 'operational priority', 'maneuver recommendation']
    },
    [CAPABILITY.COLLISION_PROBABILITY]: {
        capability: CAPABILITY.COLLISION_PROBABILITY,
        scientific_maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        software_readiness: SOFTWARE_READINESS.DEVELOPMENT,
        enabled: false,
        required_evidence: ['both_valid_covariances', 'common_validated_covariance_frame', 'sourced_hard_body_radius', 'independent_pc_benchmark'],
        permitted_outputs: [],
        prohibited_outputs: ['heuristic probability', 'zero substituted for unavailable probability']
    },
    [CAPABILITY.MANEUVER_RECOMMENDATION]: {
        capability: CAPABILITY.MANEUVER_RECOMMENDATION,
        scientific_maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        software_readiness: SOFTWARE_READINESS.DEVELOPMENT,
        enabled: false,
        required_evidence: ['validated_maneuver_model', 'mission_constraints', 'secondary_conjunction_screening', 'independent_domain_review'],
        permitted_outputs: [],
        prohibited_outputs: ['execution recommendation', 'autonomous maneuver command']
    }
});

const EXPLICIT_TIMEZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;

export function normalizeUtcInstant(value, label = 'timestamp') {
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) throw new TypeError(`${label} is not a valid date.`);
        return value.toISOString();
    }
    if (typeof value !== 'string' || !EXPLICIT_TIMEZONE_PATTERN.test(value)) {
        throw new TypeError(`${label} must be an ISO-8601 date-time with an explicit UTC offset.`);
    }
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
        value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/) ?? [];
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const offsetMatch = value.match(/([+-])(\d{2}):(\d{2})$/);
    if (
        year < 1 || month < 1 || month > 12 || day < 1 || day > (monthLengths[month - 1] ?? 0) ||
        hour > 23 || minute > 59 || second > 59 ||
        (offsetMatch && (Number(offsetMatch[2]) > 23 || Number(offsetMatch[3]) > 59))
    ) {
        throw new TypeError(`${label} contains an invalid calendar or clock value.`);
    }
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) {
        throw new TypeError(`${label} is not a representable UTC instant.`);
    }
    return new Date(milliseconds).toISOString();
}

export function utcMillis(value, label = 'timestamp') {
    return Date.parse(normalizeUtcInstant(value, label));
}

export function ageDaysAt(epoch, referenceTime) {
    return (utcMillis(referenceTime, 'reference time') - utcMillis(epoch, 'epoch')) / 86_400_000;
}

export function freshnessStatus(epoch, orbitClass, referenceTime, policy = DEFAULT_TLE_FRESHNESS_POLICY) {
    if (!epoch) {
        return {
            status: policy.missing_epoch_status,
            age_days: null,
            max_age_days: policy.max_age_days_by_orbit_class[orbitClass] ?? policy.max_age_days_by_orbit_class.UNKNOWN,
            policy_version: policy.policy_version
        };
    }
    const normalizedOrbitClass = Object.values(ORBIT_CLASS).includes(orbitClass) ? orbitClass : ORBIT_CLASS.UNKNOWN;
    const maxAgeDays = policy.max_age_days_by_orbit_class[normalizedOrbitClass] ?? policy.max_age_days_by_orbit_class.UNKNOWN;
    const ageDays = ageDaysAt(epoch, referenceTime);
    let status = policy.fresh_status;
    if (ageDays < -policy.future_epoch_tolerance_days) status = 'FUTURE';
    if (ageDays > maxAgeDays) status = policy.stale_status;
    return {
        status,
        age_days: ageDays,
        max_age_days: maxAgeDays,
        policy_version: policy.policy_version
    };
}

export function assertSupportedFrame(frame, capability = CAPABILITY.SELECTED_OBJECT_SCREENING) {
    const normalizedFrame = String(frame ?? '').trim().toUpperCase();
    if (!Object.values(REFERENCE_FRAME).includes(normalizedFrame)) {
        throw new TypeError(`Unknown reference frame: ${frame}`);
    }
    if (
        capability === CAPABILITY.SELECTED_OBJECT_SCREENING &&
        !INITIAL_TIME_FRAME_POLICY.supported_frames_v2.includes(normalizedFrame)
    ) {
        throw new TypeError(`Reference frame ${normalizedFrame} is not supported for v2.0 TLE screening.`);
    }
    return normalizedFrame;
}

export function capabilityPolicy(capability) {
    const policy = CAPABILITY_POLICIES[capability];
    if (!policy) throw new TypeError(`Unknown capability: ${capability}`);
    return policy;
}

export function evaluateCapability(capability, evidence = []) {
    const policy = capabilityPolicy(capability);
    const availableEvidence = new Set(evidence);
    const missing_evidence = policy.required_evidence.filter(item => !availableEvidence.has(item));
    return Object.freeze({
        capability,
        enabled: policy.enabled && missing_evidence.length === 0,
        configured_enabled: policy.enabled,
        scientific_maturity: policy.scientific_maturity,
        software_readiness: policy.software_readiness,
        missing_evidence: Object.freeze(missing_evidence),
        permitted_outputs: policy.permitted_outputs,
        prohibited_outputs: policy.prohibited_outputs
    });
}

export function normalizeObjectType(value) {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (['PAY', 'PAYLOAD', 'SAT', 'SATELLITE'].includes(normalized)) return OBJECT_TYPE.PAYLOAD;
    if (['R/B', 'RB', 'ROCKET_BODY', 'ROCKETBODY'].includes(normalized)) return OBJECT_TYPE.ROCKET_BODY;
    if (['DEB', 'DEBRIS', 'FRAGMENT', 'FRAGMENTATION_DEBRIS'].includes(normalized)) return OBJECT_TYPE.DEBRIS;
    return OBJECT_TYPE.UNKNOWN;
}

export function normalizeOrbitClass(value) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'HRO') return ORBIT_CLASS.HEO;
    return Object.values(ORBIT_CLASS).includes(normalized) ? normalized : ORBIT_CLASS.UNKNOWN;
}

export function normalizeLifecycleStatus(value) {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (['ACTIVE', 'OPERATIONAL'].includes(normalized)) return LIFECYCLE_STATUS.ACTIVE;
    if (['INACTIVE', 'NONOPERATIONAL', 'NON_OPERATIONAL'].includes(normalized)) return LIFECYCLE_STATUS.INACTIVE;
    if (['DECAYED', 'REENTERED', 'RE_ENTERED'].includes(normalized)) return LIFECYCLE_STATUS.DECAYED;
    if (['RETIRED', 'REMOVED'].includes(normalized)) return LIFECYCLE_STATUS.RETIRED;
    return LIFECYCLE_STATUS.UNKNOWN;
}
