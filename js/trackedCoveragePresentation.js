function nonNegativeInteger(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function readableTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
}

export function trackedCoverageState(options = {}) {
    if (options.lineageBlocked) return Object.freeze({ key: 'unavailable', label: 'Unavailable' });
    const state = String(options.snapshotState || '').trim().toLowerCase();
    if (['error', 'failed', 'degraded', 'unavailable'].includes(state)) {
        return Object.freeze({ key: 'degraded', label: 'Degraded' });
    }
    if (state === 'loading' || state === 'manifest') {
        return Object.freeze({ key: 'loading', label: 'Loading' });
    }
    if (options.manifest?.coverage?.complete_source_snapshot === true) {
        return Object.freeze({ key: 'verified', label: 'Verified snapshot' });
    }
    if (options.manifest) return Object.freeze({ key: 'partial', label: 'Partial snapshot' });
    return Object.freeze({ key: 'orbital', label: 'Orbital catalog' });
}

export function buildTrackedCoveragePresentation(options = {}) {
    const counts = options.counts || {};
    const matched = nonNegativeInteger(counts.filtered ?? counts.matched);
    const positioned = Math.min(matched, nonNegativeInteger(counts.propagatable ?? counts.positioned));
    const unavailable = Math.max(0, matched - positioned);
    const state = trackedCoverageState(options);
    const manifest = options.manifest || null;
    const timestamp = readableTimestamp(
        manifest?.generated_at ?? manifest?.fetched_at ?? manifest?.retrieval_timestamp
    );
    const scope = options.includeHistorical ? 'current + history' : 'current';
    const ariaLabel = `${matched.toLocaleString()} tracked objects match active filters; ` +
        `${positioned.toLocaleString()} positioned; ${unavailable.toLocaleString()} position unavailable; ` +
        `${state.label}${timestamp ? `; data ${timestamp}` : ''}.`;
    return Object.freeze({
        matched,
        positioned,
        unavailable,
        scope,
        state,
        timestamp,
        ariaLabel,
        visible: Boolean(manifest || matched || options.lineageBlocked)
    });
}
