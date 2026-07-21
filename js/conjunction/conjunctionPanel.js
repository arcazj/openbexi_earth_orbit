import {
    CAPABILITY,
    CAPABILITY_MATURITY,
    DOMAIN_SCHEMA_VERSION,
    REFERENCE_FRAME,
    TIME_SCALE
} from '../domain/orbitalPolicy.js';
import { stableFingerprint } from '../domain/objectIdentity.js';
import {
    CONJUNCTION_CONFIGURATION_VERSION,
    DEFAULT_SCREENING_CONFIGURATION,
    MAX_ESTIMATED_COARSE_PROPAGATIONS
} from './conjunctionScreening.js';

const PANEL_SCHEMA_VERSION = '2.0.0';
const DEFAULT_PLAYBACK_LIMIT_SECONDS = 300;
const PLAYBACK_TICK_MS = 100;
const PLAYBACK_SECONDS_PER_TICK = 2;

function finiteNumber(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null);
}

export function formatUtcDateTimeLocal(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toISOString().slice(0, 19);
}

export function parseUtcDateTimeLocal(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)) return null;
    const normalized = text.length === 16 ? `${text}:00Z` : `${text}Z`;
    const date = new Date(normalized);
    return Number.isFinite(date.getTime()) ? date : null;
}

export function conjunctionEventId(event, index = 0) {
    return String(firstDefined(event?.eventId, event?.event_id, event?.id, `event-${index}`));
}

export function conjunctionEventTca(event) {
    const value = firstDefined(
        event?.tcaUtc,
        event?.tca_utc,
        event?.tca,
        event?.timeOfClosestApproach,
        event?.time_of_closest_approach
    );
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

export function conjunctionEventMissDistanceKm(event) {
    return finiteNumber(firstDefined(
        event?.missDistanceKm,
        event?.miss_distance_km,
        event?.metrics?.missDistanceKm,
        event?.metrics?.miss_distance_km
    ));
}

export function conjunctionEventRelativeSpeedKmS(event) {
    return finiteNumber(firstDefined(
        event?.relativeSpeedKmS,
        event?.relative_speed_km_s,
        event?.relative_velocity_km_s,
        event?.relativeVelocityKmS,
        event?.metrics?.relativeSpeedKmS,
        event?.metrics?.relative_velocity_km_s
    ));
}

export function conjunctionEventSecondaryLabel(event) {
    const secondary = firstDefined(event?.secondary, event?.secondaryObject, event?.secondary_object, {});
    const name = firstDefined(
        secondary?.name,
        secondary?.satelliteName,
        secondary?.satellite_name,
        event?.secondaryName,
        event?.secondary_name
    );
    const id = firstDefined(
        secondary?.noradId,
        secondary?.norad_id,
        secondary?.objectId,
        secondary?.object_id,
        event?.secondaryNoradId,
        event?.secondary_norad_id,
        event?.secondary_object_id
    );
    const normalizedId = /^(?:obx:)?norad:/i.test(String(id || ''))
        ? `NORAD ${String(id).split(':').pop()}`
        : String(id || '');
    if (name && normalizedId && !String(name).includes(normalizedId)) return `${name} (${normalizedId})`;
    return String(name || normalizedId || 'Unknown object');
}

export function conjunctionEventQuality(event) {
    const flags = firstDefined(event?.qualityFlags, event?.quality_flags, event?.quality?.flags, []);
    const normalizedFlags = Array.isArray(flags) ? flags.filter(Boolean).map(String) : [];
    const status = String(firstDefined(event?.quality?.status, event?.qualityStatus, event?.quality_status, '')).toLowerCase();
    if (status === 'invalid' || normalizedFlags.some(flag => /invalid|failed|error/i.test(flag))) return 'Invalid';
    if (status === 'partial' || normalizedFlags.some(flag => /stale|future|epoch.after|unavailable|partial|incomplete|non.?converg|degraded|uncertain|co.?located|common.?tle/i.test(flag))) return 'Review';
    return 'Nominal';
}

function sortableTca(event) {
    return conjunctionEventTca(event)?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function filterAndSortConjunctionEvents(events, filterText = '', sortMode = 'tca') {
    const query = String(filterText || '').trim().toLocaleLowerCase();
    const filtered = (Array.isArray(events) ? events : []).filter(event => {
        if (!query) return true;
        return conjunctionEventSecondaryLabel(event).toLocaleLowerCase().includes(query)
            || conjunctionEventId(event).toLocaleLowerCase().includes(query);
    });

    const compare = {
        'miss-distance': (a, b) => (conjunctionEventMissDistanceKm(a) ?? Infinity) - (conjunctionEventMissDistanceKm(b) ?? Infinity),
        'relative-speed': (a, b) => (conjunctionEventRelativeSpeedKmS(b) ?? -Infinity) - (conjunctionEventRelativeSpeedKmS(a) ?? -Infinity),
        object: (a, b) => conjunctionEventSecondaryLabel(a).localeCompare(conjunctionEventSecondaryLabel(b)),
        tca: (a, b) => sortableTca(a) - sortableTca(b)
    }[sortMode] || ((a, b) => sortableTca(a) - sortableTca(b));

    return filtered.map((event, originalIndex) => ({ event, originalIndex }))
        .sort((left, right) => compare(left.event, right.event) || left.originalIndex - right.originalIndex)
        .map(item => item.event);
}

export function buildConjunctionScreeningRequest({
    primary,
    catalog,
    startTime,
    durationHours,
    coarseStepSeconds,
    screeningRadiusKm,
    refinementToleranceSeconds,
    maxResults,
    dataset = null
}) {
    const start = startTime instanceof Date ? startTime : new Date(startTime);
    const duration = finiteNumber(durationHours);
    const coarseStep = finiteNumber(coarseStepSeconds);
    const radius = finiteNumber(screeningRadiusKm);
    const tolerance = finiteNumber(refinementToleranceSeconds);
    const limit = finiteNumber(maxResults);

    if (!primary) throw new Error('A primary catalog object is required.');
    if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('A non-empty catalog is required.');
    if (!Number.isFinite(start.getTime())) throw new Error('A valid UTC start time is required.');
    if (!(duration > 0)) throw new Error('Duration must be greater than zero.');
    if (!(coarseStep > 0)) throw new Error('Coarse step must be greater than zero.');
    if (!(radius > 0)) throw new Error('Screening radius must be greater than zero.');
    if (!(tolerance > 0)) throw new Error('Refinement tolerance must be greater than zero.');
    if (!(limit > 0)) throw new Error('Result limit must be greater than zero.');
    const estimatedCoarsePropagations = catalog.length *
        (Math.ceil(duration * 60 * 60 / coarseStep) + 1);
    if (estimatedCoarsePropagations > MAX_ESTIMATED_COARSE_PROPAGATIONS) {
        throw new Error(
            `This screen exceeds the v2.0 preview work limit (${estimatedCoarsePropagations.toLocaleString()} estimated catalog propagations). Shorten the duration or increase the coarse step.`
        );
    }

    const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
    const primaryProvenance = primary?.provenance ?? primary?.element_set?.provenance ?? {};
    const datasetId = firstDefined(dataset?.dataset_id, dataset?.datasetId, primaryProvenance.dataset_id, null);
    const datasetHash = firstDefined(dataset?.dataset_hash, dataset?.datasetHash, primaryProvenance.dataset_hash, null);
    const requestedAt = new Date().toISOString();
    const suppliedObjectId = String(firstDefined(primary?.object_id, primary?.objectId, '')).trim();
    const noradId = String(firstDefined(primary?.norad_id, primary?.noradId, primary?.NORAD_CAT_ID, '')).trim();
    const primaryObjectId = suppliedObjectId || (noradId ? `obx:norad:${noradId.replace(/^0+(?=\d)/, '')}` : '');
    if (!primaryObjectId) throw new Error('The primary object requires a stable object identifier.');
    const configuration = {
        configuration_version: CONJUNCTION_CONFIGURATION_VERSION,
        screening_radius_km: radius,
        horizon_seconds: duration * 60 * 60,
        coarse_step_seconds: coarseStep,
        refinement_tolerance_seconds: tolerance,
        refinement_subdivisions: DEFAULT_SCREENING_CONFIGURATION.refinement_subdivisions,
        max_results: Math.round(limit),
        max_refinement_iterations: DEFAULT_SCREENING_CONFIGURATION.max_refinement_iterations,
        max_relative_acceleration_km_s2: DEFAULT_SCREENING_CONFIGURATION.max_relative_acceleration_km_s2,
        coarse_padding_km: DEFAULT_SCREENING_CONFIGURATION.coarse_padding_km,
        yield_every_operations: DEFAULT_SCREENING_CONFIGURATION.yield_every_operations,
        start_time: start.toISOString(),
        end_time: end.toISOString()
    };
    const requestId = `screen:${stableFingerprint(JSON.stringify([
        primaryObjectId,
        datasetId,
        datasetHash,
        start.toISOString(),
        end.toISOString(),
        configuration,
        Math.round(limit)
    ]))}`;
    const rawSourceStatus = String(firstDefined(
        dataset?.source_status,
        dataset?.sourceStatus,
        primaryProvenance.source_status,
        'DEGRADED'
    )).toUpperCase();
    const sourceStatus = ['COMPLETE', 'PARTIAL', 'DEGRADED'].includes(rawSourceStatus)
        ? rawSourceStatus
        : 'DEGRADED';
    const datasetHasRetrievalTime = dataset != null && (
        Object.prototype.hasOwnProperty.call(dataset, 'retrieved_at') ||
        Object.prototype.hasOwnProperty.call(dataset, 'retrievedAt')
    );
    const retrievedAt = datasetHasRetrievalTime
        ? (dataset.retrieved_at ?? dataset.retrievedAt ?? null)
        : firstDefined(primaryProvenance.retrieved_at, null);
    const datasetProvenance = datasetId && datasetHash ? {
        schema_version: DOMAIN_SCHEMA_VERSION,
        source_id: String(firstDefined(dataset?.source_id, dataset?.sourceId, primaryProvenance.source_id, 'loaded-catalog')),
        provider: String(firstDefined(dataset?.provider, primaryProvenance.provider, 'Unknown source')),
        retrieved_at: retrievedAt == null ? null : String(retrievedAt),
        dataset_id: String(datasetId),
        dataset_hash: String(datasetHash),
        source_uri: firstDefined(dataset?.source_uri, primaryProvenance.source_uri, dataset?.source_urls?.[0], null),
        source_status: sourceStatus,
        partial_update: sourceStatus === 'PARTIAL' || dataset?.partial_update === true || primaryProvenance.partial_update === true,
        license_id: firstDefined(dataset?.license_id, primaryProvenance.license_id, null)
    } : null;
    const catalogMetadata = dataset ? {
        source_urls: Array.isArray(dataset.source_urls) ? [...dataset.source_urls] : [],
        accepted_count: catalog.length,
        rejected_count: finiteNumber(dataset.rejectedCount) ?? 0,
        stale_count_at_ingestion: finiteNumber(firstDefined(dataset.staleCount, dataset?.quality?.freshness?.STALE)) ?? 0,
        retained_count: finiteNumber(dataset.retainedCount)
    } : null;
    return {
        schema_version: DOMAIN_SCHEMA_VERSION,
        request_id: requestId,
        capability: CAPABILITY.SELECTED_OBJECT_SCREENING,
        maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        analysis_type: 'tle-selected-object-close-approach-screening',
        primary_object_id: primaryObjectId,
        candidate_object_ids: null,
        primary,
        catalog,
        ...(datasetId ? { dataset_id: String(datasetId) } : {}),
        ...(datasetHash ? { dataset_hash: String(datasetHash) } : {}),
        ...(datasetProvenance ? { dataset_provenance: datasetProvenance } : {}),
        ...(catalogMetadata ? { catalog_metadata: catalogMetadata } : {}),
        requested_at: requestedAt,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        time_scale: TIME_SCALE.UTC,
        frame: REFERENCE_FRAME.TEME,
        configuration,
        options: { ...configuration }
    };
}

function replayCatalogRecord(record) {
    const elementSet = record?.element_set ?? record?.elementSet ?? {};
    return {
        object_id: firstDefined(record?.object_id, record?.objectId, null),
        name: firstDefined(record?.name, record?.satellite_name, record?.satelliteName, null),
        norad_id: firstDefined(record?.norad_id, record?.noradId, record?.NORAD_CAT_ID, null),
        orbit_class: firstDefined(record?.orbit_class, record?.orbitClass, null),
        quality_flags: Array.isArray(record?.quality_flags) ? [...record.quality_flags] : [],
        element_set: {
            element_set_id: firstDefined(elementSet.element_set_id, elementSet.elementSetId, null),
            epoch: firstDefined(elementSet.epoch, record?.element_epoch_utc, record?.elementEpochUtc, null),
            time_scale: firstDefined(elementSet.time_scale, TIME_SCALE.UTC),
            native_frame: firstDefined(elementSet.native_frame, REFERENCE_FRAME.TEME),
            line1: firstDefined(elementSet.line1, record?.tle_line1, record?.tleLine1, null),
            line2: firstDefined(elementSet.line2, record?.tle_line2, record?.tleLine2, null),
            provenance: firstDefined(elementSet.provenance, record?.provenance, null)
        },
        provenance: firstDefined(record?.provenance, elementSet.provenance, null)
    };
}

export function buildConjunctionExportPayload(screeningRequest, screeningResult) {
    const result = screeningResult || {};
    const { catalog = [], ...requestWithoutCatalog } = screeningRequest || {};
    return {
        exportSchemaVersion: PANEL_SCHEMA_VERSION,
        exportedAtUtc: new Date().toISOString(),
        qualification: 'Experimental TLE-based close-approach screening. Not for operational decisions.',
        request: {
            ...requestWithoutCatalog,
            catalogSnapshot: {
                dataset_id: screeningRequest?.dataset_id ?? null,
                dataset_hash: screeningRequest?.dataset_hash ?? null,
                provenance: screeningRequest?.dataset_provenance ?? null,
                metadata: screeningRequest?.catalog_metadata ?? null,
                objectCount: Array.isArray(catalog) ? catalog.length : null,
                objects: Array.isArray(catalog) ? catalog.map(replayCatalogRecord) : []
            }
        },
        result,
        replay: {
            input_status: 'SELF_CONTAINED_FROZEN_CATALOG',
            import_support: 'NOT_AVAILABLE_IN_V2_0',
            requirement: 'Use the exact frozen catalog, request, result configuration, and algorithm version.'
        },
        limitations: {
            collision_probability: {
                status: 'unavailable',
                reason: 'Covariance and hard-body radius are unavailable.'
            }
        }
    };
}

function formatShortUtc(date) {
    if (!date || !Number.isFinite(date.getTime?.())) return 'Unavailable';
    return date.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

function formatNumber(value, digits) {
    return Number.isFinite(value) ? value.toFixed(digits) : 'Unavailable';
}

function eventElementAgeDays(event) {
    return finiteNumber(firstDefined(
        event?.secondary_element_set?.age_days,
        event?.secondaryElementSet?.ageDays
    ));
}

function humanizeStage(value) {
    const text = String(value || 'Screening').trim().replace(/[_-]+/g, ' ').toLowerCase();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Screening';
}

function normalizedProgress(progress) {
    if (Number.isFinite(progress)) {
        return { percent: Math.max(0, Math.min(100, progress)), text: `Screening ${Math.round(progress)}%` };
    }
    const processed = finiteNumber(firstDefined(progress?.processed, progress?.completed));
    const total = finiteNumber(progress?.total);
    const directPercent = finiteNumber(firstDefined(
        progress?.percent,
        progress?.percentage,
        finiteNumber(progress?.fraction) === null ? null : Number(progress.fraction) * 100
    ));
    const percent = directPercent !== null
        ? directPercent
        : (processed !== null && total > 0 ? processed / total * 100 : 0);
    const stage = humanizeStage(firstDefined(progress?.stage, progress?.message, 'Screening'));
    const counts = processed !== null && total !== null ? ` ${Math.round(processed)}/${Math.round(total)}` : '';
    return {
        percent: Math.max(0, Math.min(100, percent || 0)),
        text: `${stage}${counts}`
    };
}

export function conjunctionRunQualityNotices(response) {
    const flags = new Set(response?.quality_flags || response?.qualityFlags || []);
    const statistics = response?.statistics || {};
    const reported = finiteNumber(statistics.events_reported);
    const detected = finiteNumber(statistics.events_detected);
    const truncated = finiteNumber(statistics.events_truncated) ??
        (reported !== null && detected !== null ? Math.max(0, detected - reported) : 0);
    const notices = [];
    if (truncated > 0 || flags.has('RESULT_LIMIT_APPLIED')) {
        notices.push(`${Math.max(0, Math.round(truncated))} additional event${truncated === 1 ? '' : 's'} omitted by the result limit`);
    }
    if (flags.has('STALE_INPUTS_AT_SCREEN_TIME')) {
        notices.push('element sets exceed the screening-time freshness policy');
    }
    if (flags.has('FUTURE_EPOCH_INPUTS_AT_SCREEN_TIME')) {
        notices.push('some element epochs occur after the screening window');
    }
    if (flags.has('MISSING_ELEMENT_EPOCH_INPUTS')) {
        notices.push('some element epochs are unavailable');
    }
    return notices;
}

function eventMetricRows(event, dataset = null) {
    const tca = conjunctionEventTca(event);
    const missDistance = conjunctionEventMissDistanceKm(event);
    const relativeSpeed = conjunctionEventRelativeSpeedKmS(event);
    const frame = firstDefined(event?.frame, event?.referenceFrame, event?.reference_frame, event?.states?.frame, 'TEME');
    const algorithm = firstDefined(
        event?.algorithmVersion,
        event?.algorithm_version,
        event?.provenance?.algorithmVersion,
        event?.provenance?.algorithm?.version,
        'Unavailable'
    );
    const safetyMargin = finiteNumber(firstDefined(
        event?.coarseSafetyMarginKm,
        event?.coarse_safety_margin_km,
        event?.diagnostics?.coarseSafetyMarginKm,
        event?.analysis?.broad_phase_margin_km
    ));
    const primaryAgeDays = finiteNumber(firstDefined(
        event?.primary_element_set?.age_days,
        event?.primaryElementSet?.ageDays
    ));
    const secondaryAgeDays = finiteNumber(firstDefined(
        event?.secondary_element_set?.age_days,
        event?.secondaryElementSet?.ageDays
    ));
    const datasetId = firstDefined(event?.provenance?.dataset_id, event?.provenance?.datasetId, 'Unavailable');
    const datasetProvenance = event?.dataset_provenance ?? dataset ?? {};
    const qualityFlags = firstDefined(event?.quality_flags, event?.qualityFlags, []);
    return [
        ['TCA', formatShortUtc(tca)],
        ['Miss distance', `${formatNumber(missDistance, 3)} km`],
        ['Relative speed', `${formatNumber(relativeSpeed, 4)} km/s`],
        ['Frame', String(frame)],
        ['Propagation', 'SGP4'],
        ['Algorithm', String(algorithm)],
        ['Primary element age', primaryAgeDays === null ? 'Unavailable' : `${formatNumber(primaryAgeDays, 2)} days`],
        ['Secondary element age', secondaryAgeDays === null ? 'Unavailable' : `${formatNumber(secondaryAgeDays, 2)} days`],
        ['Dataset', String(datasetId)],
        ['Data source', String(firstDefined(datasetProvenance.provider, datasetProvenance.source_id, 'Unavailable'))],
        ['Catalog retrieved', formatShortUtc(datasetProvenance.retrieved_at ? new Date(datasetProvenance.retrieved_at) : null)],
        ['Source status', String(firstDefined(datasetProvenance.source_status, 'Unavailable'))],
        ['Quality flags', Array.isArray(qualityFlags) && qualityFlags.length ? qualityFlags.join(', ') : 'None'],
        ['Coarse margin', safetyMargin === null ? 'Recorded with run' : `${formatNumber(safetyMargin, 3)} km`],
        ['Collision probability', 'Unavailable']
    ];
}

function requiredElement(root, id) {
    const element = root.getElementById(id);
    if (!element) throw new Error(`Missing conjunction panel element: ${id}`);
    return element;
}

function recordLabel(record) {
    if (!record) return 'Unavailable';
    const name = firstDefined(record.satellite_name, record.satelliteName, record.name, 'Selected object');
    const id = firstDefined(record.norad_id, record.noradId, record.object_id, record.objectId);
    return id ? `${name} (NORAD ${id})` : String(name);
}

export function createConjunctionPanel({
    documentRef = globalThis.document,
    startScreening,
    cancelScreening = () => {},
    onEventSelected = () => {},
    onPlaybackTimeChanged = () => {},
    onDiagnostic = () => {}
} = {}) {
    if (!documentRef || typeof startScreening !== 'function') {
        throw new Error('The conjunction panel requires a document and startScreening callback.');
    }

    const elements = {
        form: requiredElement(documentRef, 'conjunctionScreeningForm'),
        primary: requiredElement(documentRef, 'conjunctionPrimarySummary'),
        catalog: requiredElement(documentRef, 'conjunctionCatalogSummary'),
        start: requiredElement(documentRef, 'conjunctionStartTime'),
        duration: requiredElement(documentRef, 'conjunctionDurationHours'),
        step: requiredElement(documentRef, 'conjunctionCoarseStepSeconds'),
        radius: requiredElement(documentRef, 'conjunctionScreeningRadiusKm'),
        tolerance: requiredElement(documentRef, 'conjunctionRefinementToleranceSeconds'),
        maxResults: requiredElement(documentRef, 'conjunctionMaxResults'),
        run: requiredElement(documentRef, 'conjunctionRunButton'),
        cancel: requiredElement(documentRef, 'conjunctionCancelButton'),
        export: requiredElement(documentRef, 'conjunctionExportButton'),
        progress: requiredElement(documentRef, 'conjunctionProgress'),
        status: requiredElement(documentRef, 'conjunctionStatus'),
        results: requiredElement(documentRef, 'conjunctionResults'),
        filter: requiredElement(documentRef, 'conjunctionResultFilter'),
        sort: requiredElement(documentRef, 'conjunctionResultSort'),
        rows: requiredElement(documentRef, 'conjunctionResultRows'),
        details: requiredElement(documentRef, 'conjunctionEventDetails'),
        eventTitle: requiredElement(documentRef, 'conjunctionEventTitle'),
        eventQuality: requiredElement(documentRef, 'conjunctionEventQuality'),
        metrics: requiredElement(documentRef, 'conjunctionEventMetrics'),
        playback: requiredElement(documentRef, 'conjunctionPlaybackButton'),
        playbackOffset: requiredElement(documentRef, 'conjunctionPlaybackOffset'),
        playbackOffsetValue: requiredElement(documentRef, 'conjunctionPlaybackOffsetValue')
    };

    let primary = null;
    let catalog = [];
    let dataset = null;
    let events = [];
    let selectedEvent = null;
    let latestRequest = null;
    let latestResult = null;
    let running = false;
    let disposed = false;
    let activeRunToken = 0;
    let playbackTimer = null;

    const setStatus = (text) => {
        elements.status.textContent = text;
    };

    const updateRunAvailability = () => {
        elements.run.disabled = running || !primary || catalog.length === 0;
        elements.cancel.disabled = !running;
        elements.export.disabled = running || !latestResult;
    };

    const updateReadinessStatus = () => {
        if (running) return;
        const rejected = finiteNumber(dataset?.rejectedCount) || 0;
        const sourceStatus = String(dataset?.source_status || '').toUpperCase();
        if (catalog.length === 0 && (sourceStatus === 'INVALID' || rejected > 0)) {
            setStatus(`Catalog unavailable: no accepted objects${rejected ? `; ${rejected.toLocaleString()} rejected` : ''}.`);
            return;
        }
        setStatus(primary ? 'Ready to screen the loaded catalog.' : 'Select a satellite to enable screening.');
    };

    const stopPlayback = () => {
        if (playbackTimer !== null) {
            globalThis.clearInterval(playbackTimer);
            playbackTimer = null;
        }
        elements.playback.textContent = '\u25B6';
        elements.playback.setAttribute('aria-label', 'Play conjunction event');
        elements.playback.title = 'Play';
    };

    const publishPlaybackTime = () => {
        if (!selectedEvent) return;
        const tca = conjunctionEventTca(selectedEvent);
        if (!tca) return;
        const offsetSeconds = Number(elements.playbackOffset.value) || 0;
        elements.playbackOffsetValue.value = offsetSeconds === 0
            ? 'TCA'
            : `${offsetSeconds > 0 ? '+' : ''}${offsetSeconds}s`;
        onPlaybackTimeChanged(selectedEvent, new Date(tca.getTime() + offsetSeconds * 1000), offsetSeconds);
    };

    const selectEvent = (event) => {
        selectedEvent = event;
        stopPlayback();
        elements.rows.querySelectorAll('tr').forEach(row => {
            row.setAttribute('aria-selected', row.dataset.eventId === conjunctionEventId(event));
        });
        elements.eventTitle.textContent = conjunctionEventSecondaryLabel(event);
        elements.eventQuality.textContent = conjunctionEventQuality(event);
        elements.metrics.textContent = '';
        eventMetricRows(event, dataset).forEach(([label, value]) => {
            const wrapper = documentRef.createElement('div');
            const term = documentRef.createElement('dt');
            const definition = documentRef.createElement('dd');
            term.textContent = label;
            definition.textContent = value;
            wrapper.append(term, definition);
            elements.metrics.appendChild(wrapper);
        });
        elements.details.hidden = false;
        elements.playback.disabled = false;
        elements.playbackOffset.disabled = false;
        elements.playbackOffset.value = '0';
        elements.playbackOffsetValue.value = 'TCA';
        onEventSelected(event);
        publishPlaybackTime();
    };

    const renderRows = () => {
        const visibleEvents = filterAndSortConjunctionEvents(events, elements.filter.value, elements.sort.value);
        elements.rows.textContent = '';
        visibleEvents.forEach((event, index) => {
            const row = documentRef.createElement('tr');
            const id = conjunctionEventId(event, index);
            row.dataset.eventId = id;
            row.tabIndex = 0;
            row.setAttribute('aria-selected', selectedEvent ? String(id === conjunctionEventId(selectedEvent)) : 'false');
            const values = [
                formatShortUtc(conjunctionEventTca(event)).replace(/:\d{2}Z$/, 'Z'),
                conjunctionEventSecondaryLabel(event),
                formatNumber(conjunctionEventMissDistanceKm(event), 3),
                formatNumber(conjunctionEventRelativeSpeedKmS(event), 3),
                formatNumber(eventElementAgeDays(event), 1),
                conjunctionEventQuality(event)
            ];
            values.forEach(value => {
                const cell = documentRef.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });
            const activate = () => selectEvent(event);
            row.addEventListener('click', activate);
            row.addEventListener('keydown', keyEvent => {
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                    keyEvent.preventDefault();
                    activate();
                }
            });
            elements.rows.appendChild(row);
        });
        elements.results.hidden = events.length === 0;
        if (events.length > 0 && visibleEvents.length === 0) {
            setStatus(`No events match the current filter. ${events.length} event${events.length === 1 ? '' : 's'} in the run.`);
        }
    };

    const runScreening = async (submitEvent) => {
        submitEvent?.preventDefault?.();
        if (running || disposed) return;
        if (!elements.form.reportValidity()) return;
        const startTime = parseUtcDateTimeLocal(elements.start.value);
        try {
            latestRequest = buildConjunctionScreeningRequest({
                primary,
                catalog,
                startTime,
                durationHours: elements.duration.value,
                coarseStepSeconds: elements.step.value,
                screeningRadiusKm: elements.radius.value,
                refinementToleranceSeconds: elements.tolerance.value,
                maxResults: elements.maxResults.value,
                dataset
            });
        } catch (error) {
            setStatus(error.message);
            return;
        }

        const runToken = ++activeRunToken;
        const startedAt = globalThis.performance?.now?.() ?? Date.now();
        running = true;
        latestResult = null;
        events = [];
        selectedEvent = null;
        stopPlayback();
        elements.results.hidden = true;
        elements.details.hidden = true;
        elements.progress.value = 0;
        setStatus('Preparing catalog screen.');
        updateRunAvailability();
        onDiagnostic({ type: 'screening-start', catalogCount: catalog.length, startUtc: latestRequest.options.start_time });

        try {
            const response = await startScreening(latestRequest, {
                onProgress(progress) {
                    if (runToken !== activeRunToken || disposed) return;
                    const normalized = normalizedProgress(progress);
                    elements.progress.value = normalized.percent;
                    setStatus(normalized.text);
                }
            });
            if (runToken !== activeRunToken || disposed) return;
            latestResult = response || {};
            events = Array.isArray(response) ? response : (response?.events || response?.results || []);
            elements.progress.value = 100;
            renderRows();
            const durationMs = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
            const rejected = finiteNumber(firstDefined(
                response?.diagnostics?.rejectedCount,
                response?.rejectedCount,
                response?.statistics?.propagation_failures
            )) || 0;
            const partial = Boolean(response?.partial || String(response?.status || '').toUpperCase() === 'PARTIAL');
            const resultQualityFlags = response?.quality_flags || response?.qualityFlags || [];
            const qualityNotices = conjunctionRunQualityNotices(response);
            setStatus(
                `${events.length} close approach${events.length === 1 ? '' : 'es'} found in ${(durationMs / 1000).toFixed(1)}s`
                + `${rejected ? `; ${rejected} state propagations failed` : ''}${partial ? '; partial result' : ''}`
                + `${qualityNotices.length ? `; ${qualityNotices.join('; ')}` : ''}.`
            );
            onDiagnostic({
                type: 'screening-complete',
                durationMs,
                eventCount: events.length,
                status: response?.status || null,
                statistics: response?.statistics || response?.diagnostics || null,
                qualityFlags: resultQualityFlags,
                provenance: response?.provenance || null
            });
        } catch (error) {
            if (runToken !== activeRunToken || disposed) return;
            const cancelled = error?.name === 'AbortError' || /cancel/i.test(error?.message || '');
            elements.progress.value = 0;
            setStatus(cancelled ? 'Screening cancelled.' : `Screening failed: ${error?.message || 'Unknown error'}`);
            onDiagnostic({ type: cancelled ? 'screening-cancelled' : 'screening-error', error: error?.message || String(error) });
        } finally {
            if (runToken === activeRunToken && !disposed) {
                running = false;
                updateRunAvailability();
            }
        }
    };

    const cancelActiveScreening = () => {
        if (!running) return;
        activeRunToken += 1;
        running = false;
        cancelScreening();
        elements.progress.value = 0;
        setStatus('Screening cancelled.');
        updateRunAvailability();
        onDiagnostic({ type: 'screening-cancelled' });
    };

    const clearResults = () => {
        latestRequest = null;
        latestResult = null;
        events = [];
        selectedEvent = null;
        stopPlayback();
        elements.rows.textContent = '';
        elements.results.hidden = true;
        elements.details.hidden = true;
        elements.playback.disabled = true;
        elements.playbackOffset.disabled = true;
        elements.progress.value = 0;
        onEventSelected(null);
    };

    const invalidateScreeningInputs = () => {
        if (!running && !latestRequest && !latestResult && events.length === 0) return;
        if (running) cancelActiveScreening();
        clearResults();
        setStatus('Screening inputs changed. Run a new screen.');
        updateRunAvailability();
        onDiagnostic({ type: 'screening-invalidated', reason: 'inputs-changed' });
    };

    const exportLatest = () => {
        if (!latestRequest || !latestResult) return;
        const payload = buildConjunctionExportPayload(latestRequest, latestResult);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = documentRef.createElement('a');
        const primaryId = firstDefined(primary?.norad_id, primary?.noradId, primary?.object_id, 'primary');
        anchor.href = url;
        anchor.download = `openbexi-close-approaches-${primaryId}-${latestRequest.options.start_time.slice(0, 10)}.json`;
        documentRef.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    const togglePlayback = () => {
        if (!selectedEvent) return;
        if (playbackTimer !== null) {
            stopPlayback();
            return;
        }
        if (Number(elements.playbackOffset.value) >= DEFAULT_PLAYBACK_LIMIT_SECONDS) {
            elements.playbackOffset.value = String(-DEFAULT_PLAYBACK_LIMIT_SECONDS);
        }
        elements.playback.textContent = '\u275A\u275A';
        elements.playback.setAttribute('aria-label', 'Pause conjunction event');
        elements.playback.title = 'Pause';
        playbackTimer = globalThis.setInterval(() => {
            const next = Number(elements.playbackOffset.value) + PLAYBACK_SECONDS_PER_TICK;
            elements.playbackOffset.value = String(Math.min(DEFAULT_PLAYBACK_LIMIT_SECONDS, next));
            publishPlaybackTime();
            if (next >= DEFAULT_PLAYBACK_LIMIT_SECONDS) stopPlayback();
        }, PLAYBACK_TICK_MS);
    };

    elements.form.addEventListener('submit', runScreening);
    elements.cancel.addEventListener('click', cancelActiveScreening);
    elements.export.addEventListener('click', exportLatest);
    elements.filter.addEventListener('input', renderRows);
    elements.sort.addEventListener('change', renderRows);
    elements.playback.addEventListener('click', togglePlayback);
    elements.playbackOffset.addEventListener('input', () => {
        stopPlayback();
        publishPlaybackTime();
    });
    [
        elements.start,
        elements.duration,
        elements.step,
        elements.radius,
        elements.tolerance,
        elements.maxResults
    ].forEach(input => input.addEventListener('input', invalidateScreeningInputs));

    elements.start.value = formatUtcDateTimeLocal(new Date());
    updateRunAvailability();

    return {
        setPrimary(nextPrimary) {
            const previousIdentity = firstDefined(primary?.object_id, primary?.objectId, primary?.norad_id, primary?.noradId, null);
            const nextIdentity = firstDefined(nextPrimary?.object_id, nextPrimary?.objectId, nextPrimary?.norad_id, nextPrimary?.noradId, null);
            if (previousIdentity !== nextIdentity) {
                cancelActiveScreening();
                clearResults();
            }
            primary = nextPrimary || null;
            elements.primary.textContent = recordLabel(primary);
            updateReadinessStatus();
            updateRunAvailability();
        },
        setCatalog(nextCatalog, catalogMetadata = null) {
            cancelActiveScreening();
            clearResults();
            catalog = Array.isArray(nextCatalog) ? nextCatalog : [];
            dataset = catalogMetadata;
            const rejected = finiteNumber(catalogMetadata?.rejectedCount) || 0;
            const ageDays = finiteNumber(catalogMetadata?.ageDays);
            const stale = finiteNumber(firstDefined(catalogMetadata?.staleCount, catalogMetadata?.quality?.freshness?.STALE)) || 0;
            const retained = finiteNumber(catalogMetadata?.retainedCount);
            const provider = firstDefined(catalogMetadata?.provider, catalogMetadata?.source_id, catalogMetadata?.sourceId, null);
            const partial = catalogMetadata?.partial_update === true ||
                String(catalogMetadata?.source_status || '').toUpperCase() === 'PARTIAL';
            elements.catalog.textContent = [
                provider ? String(provider) : null,
                `${catalog.length.toLocaleString()} accepted`,
                ageDays === null ? null : `${ageDays.toFixed(1)}d since retrieval`,
                stale ? `${stale.toLocaleString()} stale` : null,
                retained === null ? null : `${retained.toLocaleString()} retained`,
                rejected ? `${rejected.toLocaleString()} rejected` : null,
                partial ? 'partial refresh' : null
            ].filter(Boolean).join(', ');
            updateReadinessStatus();
            updateRunAvailability();
        },
        setStartTime(value) {
            const formatted = formatUtcDateTimeLocal(value);
            if (formatted) elements.start.value = formatted;
        },
        cancel: cancelActiveScreening,
        dispose() {
            disposed = true;
            cancelActiveScreening();
            stopPlayback();
        },
        getState() {
            return {
                running,
                primary,
                catalogCount: catalog.length,
                events: [...events],
                selectedEvent,
                latestRequest,
                latestResult
            };
        }
    };
}
