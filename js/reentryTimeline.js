const DETAIL_RATIO = 0.7;
const HUD_HEIGHT = 250;
const ROW_HEIGHT = 14;
const FONT = '10px sans-serif';
const TOP_PADDING = 20;
const BG_COLOR = 'rgba(0,0,0,0.92)';
const BORDER_COLOR = 'rgba(255,255,255,0.15)';
const GRID_COLOR = 'rgba(255,255,255,0.1)';
const TEXT_COLOR = '#e8e8e8';
const NOW_COLOR = '#ff5c5c';
const PREDICTED_COLOR = '#ffd166';
const CONFIRMED_COLOR = '#66d9ef';
const BRUSH_COLOR = 'rgba(255,255,255,0.12)';
const BRUSH_BORDER = 'rgba(255,255,255,0.35)';
const SHOW_LABEL = 'Show Re-entry Timeline';
const HIDE_LABEL = 'Hide Re-entry Timeline';

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_YEAR = 365.25 * MS_DAY;
const OVERVIEW_MIN_RANGE = MS_YEAR;

function createHudElements() {
    const container = document.createElement('div');
    container.className = 'timeline-hud';
    container.style.display = 'none';

    const filterRow = document.createElement('div');
    filterRow.style.display = 'flex';
    filterRow.style.alignItems = 'center';
    filterRow.style.gap = '6px';
    filterRow.style.padding = '6px 10px 0 10px';

    const label = document.createElement('span');
    label.textContent = 'Re-entry filter:';
    label.style.color = TEXT_COLOR;
    label.style.fontSize = '11px';
    filterRow.appendChild(label);

    const select = document.createElement('select');
    select.innerHTML = `
      <option value="ALL">All</option>
      <option value="CONFIRMED">Confirmed</option>
      <option value="PREDICTED">Predicted</option>
    `;
    select.style.background = '#111';
    select.style.color = '#fff';
    select.style.border = '1px solid #333';
    select.style.padding = '2px 6px';
    select.style.fontSize = '11px';
    filterRow.appendChild(select);

    const status = document.createElement('span');
    status.className = 'timeline-status timeline-status-reentry';
    filterRow.appendChild(status);

    container.appendChild(filterRow);

    const detailCanvas = document.createElement('canvas');
    detailCanvas.className = 'timeline-canvas timeline-detail';
    container.appendChild(detailCanvas);

    const overviewCanvas = document.createElement('canvas');
    overviewCanvas.className = 'timeline-canvas timeline-overview';
    container.appendChild(overviewCanvas);

    const tooltip = document.createElement('div');
    tooltip.style.position = 'fixed';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.background = 'rgba(0,0,0,0.8)';
    tooltip.style.border = '1px solid rgba(255,255,255,0.2)';
    tooltip.style.borderRadius = '4px';
    tooltip.style.padding = '6px 8px';
    tooltip.style.fontSize = '11px';
    tooltip.style.color = '#fff';
    tooltip.style.display = 'none';
    tooltip.style.zIndex = '2600';
    document.body.appendChild(tooltip);

    document.body.appendChild(container);
    return { container, filterSelect: select, status, detailCanvas, overviewCanvas, tooltip };
}

function getTimelineBounds(data = []) {
    if (!data.length) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    data.forEach((item) => {
        const start = item.type === 'CONFIRMED' ? item.time : item.start;
        const end = item.type === 'CONFIRMED' ? item.time : item.end;
        if (start < min) min = start;
        if (end > max) max = end;
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const padding = Math.max(MS_DAY * 7, (max - min) * 0.05);
    return { min: min - padding, max: max + padding };
}

function formatDate(date) {
    return `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate()
        .toString()
        .padStart(2, '0')}`;
}

function formatDateTime(date) {
    return `${formatDate(date)} ${date.toISOString().substring(11, 16)} UTC`;
}

function chooseInterval(rangeMs, width, spacingTarget = 140) {
    const target = (rangeMs / width) * spacingTarget;
    const intervals = [
        { type: 'day', days: 1, ms: MS_DAY },
        { type: 'day', days: 2, ms: 2 * MS_DAY },
        { type: 'day', days: 7, ms: 7 * MS_DAY },
        { type: 'month', months: 1, ms: MS_DAY * 30 },
        { type: 'month', months: 2, ms: MS_DAY * 60 },
        { type: 'year', years: 1, ms: MS_YEAR }
    ];

    let best = intervals[0];
    let bestDiff = Math.abs(intervals[0].ms - target);
    for (const iv of intervals) {
        const diff = Math.abs(iv.ms - target);
        if (diff < bestDiff) {
            best = iv;
            bestDiff = diff;
        }
    }
    return best;
}

function alignToInterval(date, interval) {
    const d = new Date(date.getTime());
    d.setUTCHours(0, 0, 0, 0);
    if (interval.type === 'month') {
        d.setUTCDate(1);
    }
    if (interval.type === 'year') {
        d.setUTCMonth(0, 1);
    }
    return d;
}

function incrementDate(date, interval) {
    const d = new Date(date.getTime());
    if (interval.type === 'day' || interval.type === 'week') {
        d.setUTCDate(d.getUTCDate() + (interval.days || 7));
    } else if (interval.type === 'month') {
        d.setUTCMonth(d.getUTCMonth() + (interval.months || 1));
    } else if (interval.type === 'year') {
        d.setUTCFullYear(d.getUTCFullYear() + (interval.years || 1));
    }
    return d;
}

function generateTicks(start, end, interval) {
    const ticks = [];
    let current = alignToInterval(start, interval);
    while (current > start) {
        current = incrementDate(current, { ...interval, days: -(interval.days || 0), months: -(interval.months || 0), years: -(interval.years || 0) });
    }
    while (current.getTime() < start.getTime()) {
        current = incrementDate(current, interval);
    }
    while (current <= end) {
        ticks.push(new Date(current.getTime()));
        current = incrementDate(current, interval);
    }
    return ticks;
}

function sizeCanvas(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

function timeToX(time, start, end, width) {
    return ((time - start) / (end - start)) * width;
}

function xToTime(x, start, end, width) {
    return start + (x / width) * (end - start);
}

function normalizeConfirmedRecords(confirmedDecays) {
    if (!confirmedDecays) return [];
    if (confirmedDecays instanceof Map) return Array.from(confirmedDecays.values());
    if (Array.isArray(confirmedDecays)) return confirmedDecays;
    if (typeof confirmedDecays === 'object') return Object.values(confirmedDecays);
    return [];
}

function confirmedRecordToSatellite(record) {
    const noradId = record?.noradId ?? record?.NORAD_CAT_ID ?? record?.norad_id;
    const decayDateIso = record?.decayDateIso ?? record?.DECAY_DATE ?? record?.decay_date;
    if (!noradId || !decayDateIso) return null;
    const objectName = record.objectName ?? record.OBJECT_NAME ?? record.object_name ?? `NORAD ${noradId}`;
    const objectId = record.objectId ?? record.OBJECT_ID ?? record.object_id ?? null;
    const objectType = record.objectType ?? record.OBJECT_TYPE ?? record.object_type ?? null;
    const launchDateIso = record.launchDateIso ?? record.LAUNCH_DATE ?? record.launch_date ?? null;
    const launchSite = record.launchSite ?? record.LAUNCH_SITE ?? record.launch_site ?? null;
    return {
        satellite_name: objectName,
        norad_id: String(noradId),
        launch_date: launchDateIso || 'N/A',
        object_id: objectId,
        object_type: objectType,
        launch_site: launchSite,
        isDecayedTimelineRecord: true,
        decay: {
            decay_status: 'CONFIRMED',
            decay_reason: 'Source: json/decayed/decayed.json',
            decay_date: decayDateIso,
            object_name: objectName,
            object_id: objectId,
            object_type: objectType,
            launch_date: launchDateIso,
            launch_site: launchSite
        }
    };
}

function eventStartTime(item) {
    return item?.type === 'CONFIRMED' ? item.time : item?.start;
}

function eventEndTime(item) {
    return item?.type === 'CONFIRMED' ? item.time : item?.end;
}

export function buildReentryTimelineData(rawSatellites = [], confirmedDecays = null) {
    const activeEvents = (rawSatellites || [])
        .map((sat, idx) => {
            const decay = sat.decay || {};
            if (decay.decay_status === 'CONFIRMED' && decay.decay_date) {
                const t = new Date(decay.decay_date);
                if (!isNaN(t.getTime())) {
                    return { type: 'CONFIRMED', time: t.getTime(), satellite: sat, index: idx, reason: decay.decay_reason };
                }
            }
            if (decay.decay_status === 'PREDICTED' && decay.predicted_decay_window) {
                const start = new Date(decay.predicted_decay_window.start);
                const end = new Date(decay.predicted_decay_window.end);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    return {
                        type: 'PREDICTED',
                        start: start.getTime(),
                        end: end.getTime(),
                        confidence: decay.predicted_decay_window.confidence ?? 0,
                        satellite: sat,
                        index: idx,
                        reason: decay.decay_reason
                    };
                }
            }
            return null;
        })
        .filter(Boolean);

    const activeNorads = new Set(activeEvents.map(item => item.satellite?.norad_id?.toString()).filter(Boolean));
    const confirmedEvents = normalizeConfirmedRecords(confirmedDecays)
        .map(confirmedRecordToSatellite)
        .filter(Boolean)
        .filter(sat => !activeNorads.has(sat.norad_id?.toString()))
        .map((sat, idx) => {
            const t = new Date(sat.decay.decay_date);
            if (isNaN(t.getTime())) return null;
            return { type: 'CONFIRMED', time: t.getTime(), satellite: sat, index: rawSatellites.length + idx, reason: sat.decay.decay_reason };
        })
        .filter(Boolean);

    return activeEvents
        .concat(confirmedEvents)
        .sort((a, b) => {
            const at = eventStartTime(a);
            const bt = eventStartTime(b);
            return at - bt;
        });
}

export function getLatestReentryEvent(timelineData = []) {
    for (let i = timelineData.length - 1; i >= 0; i -= 1) {
        const item = timelineData[i];
        const time = eventEndTime(item);
        if (Number.isFinite(time)) return item;
    }
    return null;
}

export function getReentryTimelineRanges(timelineData = [], anchorEvent = getLatestReentryEvent(timelineData), options = {}) {
    if (!anchorEvent) return null;
    const anchorStart = eventStartTime(anchorEvent);
    const anchorEnd = eventEndTime(anchorEvent);
    if (!Number.isFinite(anchorStart) || !Number.isFinite(anchorEnd)) return null;
    const anchor = anchorEvent.type === 'PREDICTED' ? (anchorStart + anchorEnd) / 2 : anchorStart;
    const detailContext = options.detailContextMs ?? MS_DAY * 120;
    const detailStart = anchor - detailContext;
    const detailEnd = anchor + detailContext;
    const bounds = getTimelineBounds(timelineData);
    const overviewStart = bounds?.min ?? detailStart - MS_DAY * 180;
    const overviewEnd = bounds?.max ?? detailEnd + MS_DAY * 180;
    return { detailStart, detailEnd, overviewStart, overviewEnd, latestEvent: anchorEvent };
}

function reentryStatusText(event, count) {
    if (!event) return 'No valid re-entry or decay dates are available.';
    const sat = event.satellite || {};
    const date = new Date(eventEndTime(event)).toISOString().substring(0, 10);
    const name = sat.satellite_name || sat.name || `NORAD ${sat.norad_id || 'unknown'}`;
    const norad = sat.norad_id ? ` | NORAD ${sat.norad_id}` : '';
    const source = sat.isDecayedTimelineRecord ? 'confirmed decayed record' : event.type.toLowerCase();
    return `Latest re-entry: ${date} | ${name}${norad} | ${source} | ${count} events`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function reentryTooltipHtml(item) {
    const sat = item.satellite || {};
    const decay = sat.decay || {};
    let line = '';
    if (item.type === 'CONFIRMED') {
        line = `Re-entered: ${formatDateTime(new Date(item.time))}`;
    } else {
        line = `Predicted window: ${formatDate(new Date(item.start))} -> ${formatDate(new Date(item.end))}`;
    }
    const confidence = decay.predicted_decay_window?.confidence;
    const metadataRows = [
        ['NORAD', sat.norad_id || 'N/A'],
        ['Object ID', decay.object_id || sat.object_id || 'N/A'],
        ['Object type', decay.object_type || sat.object_type || item.type],
        ['Launch date', decay.launch_date || sat.launch_date || 'N/A'],
        ['Launch site', decay.launch_site || sat.launch_site || 'N/A'],
        ['Status', decay.decay_status || item.type],
        ['Decay date', decay.decay_date || 'N/A']
    ];
    return `
      <div style="font-weight:bold;">${escapeHtml(sat.satellite_name || sat.norad_id || 'Decayed object')}</div>
      ${metadataRows.map(([label, value]) => `<div>${escapeHtml(label)}: ${escapeHtml(value)}</div>`).join('')}
      <div>${escapeHtml(line)}</div>
      ${confidence !== undefined ? `<div>Confidence: ${escapeHtml((confidence * 100).toFixed(0))}%</div>` : ''}
      <div style="max-width:260px;">${escapeHtml(decay.decay_reason || item.reason || '')}</div>
    `;
}

export function initReentryTimeline(rawSatellites, onSelect, options = {}) {
    const toggle = document.getElementById('reentryTimelineToggle');
    const { container, filterSelect, status, detailCanvas, overviewCanvas, tooltip } = createHudElements();
    let confirmedDecays = options.confirmedDecays || null;
    let timelineData = buildReentryTimelineData(rawSatellites, confirmedDecays);
    let latestEvent = getLatestReentryEvent(timelineData);
    status.textContent = reentryStatusText(latestEvent, timelineData.length);

    let isVisible = false;
    let detailPositions = [];
    let overviewPositions = [];
    const initialRanges = getReentryTimelineRanges(timelineData, latestEvent);
    let detailStart = initialRanges?.detailStart ?? Date.now() - MS_DAY * 120;
    let detailEnd = initialRanges?.detailEnd ?? Date.now() + MS_DAY * 120;
    let overviewStart = initialRanges?.overviewStart ?? detailStart - MS_DAY * 180;
    let overviewEnd = initialRanges?.overviewEnd ?? detailEnd + MS_DAY * 180;
    let hasCustomRange = false;
    let needsDraw = true;
    let rafScheduled = false;

    const isCheckboxToggle = toggle?.type === 'checkbox';
    const toggleLabel = toggle?.closest?.('label')?.querySelector?.('span');
    const updateToggleState = (visible) => {
        if (!toggle) return;
        if (isCheckboxToggle) {
            toggle.checked = !!visible;
            if (toggleLabel) toggleLabel.textContent = SHOW_LABEL;
        } else {
            toggle.textContent = visible ? HIDE_LABEL : SHOW_LABEL;
        }
    };
    updateToggleState(false);

    const getFilteredData = () => {
        const mode = filterSelect.value;
        return timelineData.filter((item) => {
            const sat = item.satellite;
            if (sat?.mesh && sat.mesh.visible === false) return false;
            if (mode !== 'ALL' && item.type !== mode) return false;
            return true;
        });
    };

    const resetRangesFromData = () => {
        latestEvent = getLatestReentryEvent(getFilteredData());
        const ranges = getReentryTimelineRanges(getFilteredData(), latestEvent);
        if (!ranges) return;
        detailStart = ranges.detailStart;
        detailEnd = ranges.detailEnd;
        overviewStart = ranges.overviewStart;
        overviewEnd = ranges.overviewEnd;
    };

    const updateStatusFromFilteredData = () => {
        const filtered = getFilteredData();
        latestEvent = getLatestReentryEvent(filtered);
        status.textContent = reentryStatusText(latestEvent, filtered.length);
    };

    const rebuildData = (nextConfirmedDecays = confirmedDecays) => {
        confirmedDecays = nextConfirmedDecays;
        timelineData = buildReentryTimelineData(rawSatellites, confirmedDecays);
        latestEvent = getLatestReentryEvent(timelineData);
        status.textContent = reentryStatusText(latestEvent, timelineData.length);
        if (!hasCustomRange) resetRangesFromData();
        scheduleDraw();
    };

    resetRangesFromData();

    function scheduleDraw() {
        if (!isVisible) return;
        needsDraw = true;
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(() => {
                rafScheduled = false;
                if (needsDraw) {
                    needsDraw = false;
                    draw();
                }
            });
        }
    }

    function resize() {
        if (!isVisible) return;
        container.style.height = `${HUD_HEIGHT}px`;
        const chromeHeight = filterSelect.parentElement?.offsetHeight || 28;
        const availableHeight = Math.max(120, HUD_HEIGHT - chromeHeight);
        const detailHeight = availableHeight * DETAIL_RATIO;
        const overviewHeight = availableHeight * (1 - DETAIL_RATIO);
        detailCanvas.style.height = `${detailHeight}px`;
        overviewCanvas.style.height = `${overviewHeight}px`;
        detailCanvas.style.width = overviewCanvas.style.width = '100%';
        sizeCanvas(detailCanvas, detailHeight);
        sizeCanvas(overviewCanvas, overviewHeight);
        scheduleDraw();
    }

    function setVisibility(visible) {
        isVisible = visible;
        updateToggleState(visible);
        if (visible) {
            container.style.display = '';
            container.classList.remove('timeline-collapsed');
            resize();
            scheduleDraw();
        } else {
            container.style.display = 'none';
            tooltip.style.display = 'none';
        }
    }

    if (toggle) {
        toggle.addEventListener(isCheckboxToggle ? 'change' : 'click', () => {
            setVisibility(isCheckboxToggle ? toggle.checked : !isVisible);
        });
    }

    filterSelect.addEventListener('change', () => {
        updateStatusFromFilteredData();
        if (!hasCustomRange) resetRangesFromData();
        scheduleDraw();
    });
    window.addEventListener('resize', resize);
    setVisibility(false);

    function drawDetail(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = BORDER_COLOR;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        const range = detailEnd - detailStart;
        const interval = chooseInterval(range, width);
        const ticks = generateTicks(new Date(detailStart), new Date(detailEnd), interval);
        const msPerPixel = range / width;

        ctx.strokeStyle = GRID_COLOR;
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = FONT;
        ctx.textBaseline = 'top';

        ticks.forEach((t) => {
            const x = timeToX(t.getTime(), detailStart, detailEnd, width);
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, height);
            ctx.stroke();
            ctx.fillText(formatDate(t), x + 3, 2);
        });

        const now = Date.now();
        if (now >= detailStart && now <= detailEnd) {
            const x = timeToX(now, detailStart, detailEnd, width);
            ctx.strokeStyle = NOW_COLOR;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, height);
            ctx.stroke();
        }

        detailPositions = [];
        const rowsLastEnd = [];
        const visible = getFilteredData().filter((d) => {
            const start = d.type === 'CONFIRMED' ? d.time : d.start;
            const end = d.type === 'CONFIRMED' ? d.time : d.end;
            return end >= detailStart - range * 0.1 && start <= detailEnd + range * 0.1;
        });

        visible.forEach((item) => {
            const startTime = item.type === 'CONFIRMED' ? item.time : item.start;
            const endTime = item.type === 'CONFIRMED' ? item.time : item.end;
            const xStart = timeToX(startTime, detailStart, detailEnd, width);
            const xEnd = timeToX(endTime, detailStart, detailEnd, width);
            const label = item.satellite.satellite_name || `NORAD ${item.satellite.norad_id}`;
            const textWidth = ctx.measureText(label).width;
            const isLatest = item === latestEvent;
            let row = 0;
            while (rowsLastEnd[row] !== undefined && xStart - rowsLastEnd[row] < textWidth + 12) {
                row += 1;
            }
            rowsLastEnd[row] = xEnd + textWidth + 12;
            const y = row * ROW_HEIGHT + TOP_PADDING;
            if (y > height - ROW_HEIGHT) return;

            if (item.type === 'PREDICTED') {
                ctx.fillStyle = isLatest ? '#ffffff' : PREDICTED_COLOR;
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                const barWidth = Math.max(2, xEnd - xStart);
                ctx.fillRect(xStart, y - 6, barWidth, 10);
                ctx.strokeRect(xStart + 0.5, y - 6.5, barWidth - 1, 11);
            } else {
                ctx.fillStyle = isLatest ? '#ffffff' : CONFIRMED_COLOR;
                ctx.beginPath();
                ctx.arc(xStart, y - 2, isLatest ? 5 : 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = isLatest ? '#ffffff' : TEXT_COLOR;
            ctx.fillText(isLatest ? `Latest: ${label}` : label, xEnd + 4, y - 9);

            detailPositions.push({
                item,
                xStart,
                xEnd: item.type === 'PREDICTED' ? xEnd : xStart,
                y,
                labelWidth: textWidth
            });
        });
    }

    function drawOverview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = BORDER_COLOR;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        const range = overviewEnd - overviewStart;
        const interval = chooseInterval(range, width, 260);
        const ticks = generateTicks(new Date(overviewStart), new Date(overviewEnd), interval);

        ctx.strokeStyle = GRID_COLOR;
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = FONT;
        ctx.textBaseline = 'top';

        ticks.forEach((t, idx) => {
            const x = timeToX(t.getTime(), overviewStart, overviewEnd, width);
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, height);
            ctx.stroke();
            const nextTick = ticks[idx + 1];
            const spacing = nextTick ? timeToX(nextTick.getTime(), overviewStart, overviewEnd, width) - x : width / ticks.length;
            const label = formatDate(t);
            if (spacing > ctx.measureText(label).width + 10) {
                ctx.fillText(label, x + 3, 2);
            }
        });

        overviewPositions = [];
        const filtered = getFilteredData();
        filtered.forEach((item) => {
            const isLatest = item === latestEvent;
            if (item.type === 'PREDICTED') {
                const xStart = timeToX(item.start, overviewStart, overviewEnd, width);
                const xEnd = timeToX(item.end, overviewStart, overviewEnd, width);
                const barWidth = Math.max(1, xEnd - xStart);
                const y = height * 0.55;
                ctx.fillStyle = isLatest ? '#ffffff99' : `${PREDICTED_COLOR}55`;
                ctx.fillRect(xStart, y, barWidth, height * 0.35);
                overviewPositions.push({ item, xStart, xEnd: xStart + barWidth, y, height: height * 0.35 });
            } else {
                const x = timeToX(item.time, overviewStart, overviewEnd, width);
                const y = height * 0.6;
                const barHeight = height * 0.3;
                ctx.fillStyle = isLatest ? '#ffffff' : CONFIRMED_COLOR;
                ctx.fillRect(x - (isLatest ? 1.5 : 0.5), y, isLatest ? 4 : 2, barHeight);
                overviewPositions.push({ item, xStart: x - 1.5, xEnd: x + 2.5, y, height: barHeight });
            }
        });

        const brushStartX = timeToX(detailStart, overviewStart, overviewEnd, width);
        const brushEndX = timeToX(detailEnd, overviewStart, overviewEnd, width);
        const brushWidth = brushEndX - brushStartX;
        ctx.fillStyle = BRUSH_COLOR;
        ctx.strokeStyle = BRUSH_BORDER;
        ctx.fillRect(brushStartX, 4, brushWidth, height - 8);
        ctx.strokeRect(brushStartX + 0.5, 4.5, brushWidth - 1, height - 9);
    }

    function draw() {
        if (!isVisible) return;
        const detailHeight = detailCanvas.clientHeight;
        const overviewHeight = overviewCanvas.clientHeight;
        const detailCtx = sizeCanvas(detailCanvas, detailHeight);
        const overviewCtx = sizeCanvas(overviewCanvas, overviewHeight);
        const width = detailCanvas.clientWidth;
        drawDetail(detailCtx, width, detailHeight);
        drawOverview(overviewCtx, overviewCanvas.clientWidth, overviewHeight);
    }

    // Detail interactions
    let isDetailDragging = false;
    let detailDragStartX = 0;
    let detailDragRangeStart = 0;
    let detailDragRange = 0;

    detailCanvas.addEventListener('mousedown', (e) => {
        if (!isVisible) return;
        hasCustomRange = true;
        isDetailDragging = true;
        detailDragStartX = e.clientX;
        detailDragRangeStart = detailStart;
        detailDragRange = detailEnd - detailStart;
    });

    detailCanvas.addEventListener('mousemove', (e) => {
        if (!isVisible) return;
        const rect = detailCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isDetailDragging) {
            const width = detailCanvas.clientWidth;
            const dx = e.clientX - detailDragStartX;
            const deltaMs = (dx / width) * detailDragRange;
            detailStart = detailDragRangeStart - deltaMs;
            detailEnd = detailStart + detailDragRange;
            scheduleDraw();
            return;
        }

        const hit = detailPositions.find((p) => x >= p.xStart - 4 && x <= p.xEnd + p.labelWidth + 6 && Math.abs(p.y - y) < ROW_HEIGHT / 1.3);
        if (hit) {
            tooltip.innerHTML = reentryTooltipHtml(hit.item);
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.clientX + 12}px`;
            tooltip.style.top = `${e.clientY + 12}px`;
        } else {
            tooltip.style.display = 'none';
        }
    });

    detailCanvas.addEventListener('mouseup', (e) => {
        if (!isVisible) return;
        if (isDetailDragging) {
            isDetailDragging = false;
            return;
        }
        const rect = detailCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = detailPositions.find((p) => x >= p.xStart - 4 && x <= p.xEnd + p.labelWidth + 6 && Math.abs(p.y - y) < ROW_HEIGHT / 1.3);
        if (hit && typeof onSelect === 'function') {
            onSelect(hit.item.satellite);
        }
    });

    detailCanvas.addEventListener('mouseleave', () => {
        isDetailDragging = false;
        tooltip.style.display = 'none';
    });

    detailCanvas.addEventListener('wheel', (e) => {
        if (!isVisible) return;
        e.preventDefault();
        hasCustomRange = true;
        const rect = detailCanvas.getBoundingClientRect();
        const mouseTime = xToTime(e.clientX - rect.left, detailStart, detailEnd, detailCanvas.clientWidth);
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        const range = detailEnd - detailStart;
        const newRange = Math.min(MS_YEAR, Math.max(MS_DAY / 3, range * zoomFactor));
        const tRatio = (mouseTime - detailStart) / range;
        detailStart = mouseTime - newRange * tRatio;
        detailEnd = detailStart + newRange;
        scheduleDraw();
    }, { passive: false });

    // Overview interactions
    let isOverviewDragging = false;
    let overviewDragStartX = 0;
    let overviewDragRangeStart = 0;
    let overviewDragRange = 0;
    let brushing = false;
    let brushOffset = 0;
    let detailDuringOverviewStart = 0;
    let detailDuringOverviewEnd = 0;

    overviewCanvas.addEventListener('mousedown', (e) => {
        if (!isVisible) return;
        const rect = overviewCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = overviewCanvas.clientWidth;
        const brushStartX = timeToX(detailStart, overviewStart, overviewEnd, width);
        const brushEndX = timeToX(detailEnd, overviewStart, overviewEnd, width);
        if (x >= brushStartX && x <= brushEndX) {
            brushing = true;
            brushOffset = x - brushStartX;
        } else {
            hasCustomRange = true;
            isOverviewDragging = true;
            overviewDragStartX = e.clientX;
            overviewDragRangeStart = overviewStart;
            overviewDragRange = overviewEnd - overviewStart;
            detailDuringOverviewStart = detailStart;
            detailDuringOverviewEnd = detailEnd;
        }
    });

    overviewCanvas.addEventListener('mousemove', (e) => {
        if (brushing) {
            const rect = overviewCanvas.getBoundingClientRect();
            const width = overviewCanvas.clientWidth;
            const newStart = xToTime(e.clientX - rect.left - brushOffset, overviewStart, overviewEnd, width);
            const duration = detailEnd - detailStart;
            detailStart = newStart;
            detailEnd = detailStart + duration;
            scheduleDraw();
            return;
        }
        if (isOverviewDragging) {
            const dx = e.clientX - overviewDragStartX;
            const width = overviewCanvas.clientWidth;
            const deltaMs = (dx / width) * overviewDragRange;
            overviewStart = overviewDragRangeStart - deltaMs;
            overviewEnd = overviewStart + overviewDragRange;
            const detailRange = detailDuringOverviewEnd - detailDuringOverviewStart;
            detailStart = detailDuringOverviewStart - deltaMs;
            detailEnd = detailStart + detailRange;
            scheduleDraw();
            return;
        }

        if (!isVisible) return;

        const rect = overviewCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = overviewPositions.find((p) => x >= p.xStart - 2 && x <= p.xEnd + 2 && y >= p.y && y <= p.y + p.height);
        if (hit) {
            tooltip.innerHTML = reentryTooltipHtml(hit.item);
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.clientX + 12}px`;
            tooltip.style.top = `${e.clientY + 12}px`;
        } else {
            tooltip.style.display = 'none';
        }
    });

    overviewCanvas.addEventListener('mouseup', () => {
        isOverviewDragging = false;
        brushing = false;
    });

    overviewCanvas.addEventListener('mouseleave', () => {
        isOverviewDragging = false;
        brushing = false;
    });

    overviewCanvas.addEventListener('wheel', (e) => {
        if (!isVisible) return;
        e.preventDefault();
        hasCustomRange = true;
        const rect = overviewCanvas.getBoundingClientRect();
        const mouseTime = xToTime(e.clientX - rect.left, overviewStart, overviewEnd, overviewCanvas.clientWidth);
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        const range = overviewEnd - overviewStart;
        const newRange = Math.min(MS_YEAR * 3, Math.max(OVERVIEW_MIN_RANGE, range * zoomFactor));
        const tRatio = (mouseTime - overviewStart) / range;
        overviewStart = mouseTime - newRange * tRatio;
        overviewEnd = overviewStart + newRange;
        scheduleDraw();
    }, { passive: false });

    scheduleDraw();

    const teardown = () => {
        window.removeEventListener('resize', resize);
        tooltip.remove();
        container.remove();
    };

    return {
        teardown,
        setVisible: setVisibility,
        isVisible() {
            return isVisible;
        },
        requestRedraw: scheduleDraw,
        refreshData: rebuildData
    };
}
