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
    return { container, filterSelect: select, detailCanvas, overviewCanvas, tooltip };
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

function buildTimelineData(rawSatellites = []) {
    return rawSatellites
        .map((sat, idx) => {
            const decay = sat.decay || {};
            if (decay.decay_status === 'CONFIRMED' && decay.decay_date) {
                const t = new Date(decay.decay_date);
                if (!isNaN(t)) {
                    return { type: 'CONFIRMED', time: t.getTime(), satellite: sat, index: idx, reason: decay.decay_reason };
                }
            }
            if (decay.decay_status === 'PREDICTED' && decay.predicted_decay_window) {
                const start = new Date(decay.predicted_decay_window.start);
                const end = new Date(decay.predicted_decay_window.end);
                if (!isNaN(start) && !isNaN(end)) {
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
        .filter(Boolean)
        .sort((a, b) => {
            const at = a.type === 'CONFIRMED' ? a.time : a.start;
            const bt = b.type === 'CONFIRMED' ? b.time : b.start;
            return at - bt;
        });
}

export function initReentryTimeline(rawSatellites, onSelect) {
    const toggle = document.getElementById('reentryTimelineToggle');
    const { container, filterSelect, detailCanvas, overviewCanvas, tooltip } = createHudElements();
    let timelineData = buildTimelineData(rawSatellites);

    let isVisible = false;
    let detailPositions = [];
    let overviewPositions = [];
    let detailStart = Date.now() - MS_DAY * 120;
    let detailEnd = Date.now() + MS_DAY * 210;
    let overviewStart = detailStart - MS_DAY * 180;
    let overviewEnd = detailEnd + MS_DAY * 180;
    let hasCustomRange = false;
    let needsDraw = true;
    let rafScheduled = false;

    if (toggle) toggle.textContent = SHOW_LABEL;

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
        const bounds = getTimelineBounds(getFilteredData());
        if (!bounds) return;
        detailStart = bounds.min;
        detailEnd = bounds.max;
        overviewStart = bounds.min;
        overviewEnd = bounds.max;
    };

    const rebuildData = () => {
        timelineData = buildTimelineData(rawSatellites);
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
        const detailHeight = HUD_HEIGHT * DETAIL_RATIO;
        const overviewHeight = HUD_HEIGHT * (1 - DETAIL_RATIO);
        detailCanvas.style.height = `${detailHeight}px`;
        overviewCanvas.style.height = `${overviewHeight}px`;
        detailCanvas.style.width = overviewCanvas.style.width = '100%';
        sizeCanvas(detailCanvas, detailHeight);
        sizeCanvas(overviewCanvas, overviewHeight);
        scheduleDraw();
    }

    function setVisibility(visible) {
        isVisible = visible;
        if (toggle) toggle.textContent = visible ? HIDE_LABEL : SHOW_LABEL;
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
        toggle.addEventListener('click', () => setVisibility(!isVisible));
    }

    filterSelect.addEventListener('change', scheduleDraw);
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
            let row = 0;
            while (rowsLastEnd[row] !== undefined && xStart - rowsLastEnd[row] < textWidth + 12) {
                row += 1;
            }
            rowsLastEnd[row] = xEnd + textWidth + 12;
            const y = row * ROW_HEIGHT + TOP_PADDING;
            if (y > height - ROW_HEIGHT) return;

            if (item.type === 'PREDICTED') {
                ctx.fillStyle = PREDICTED_COLOR;
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                const barWidth = Math.max(2, xEnd - xStart);
                ctx.fillRect(xStart, y - 6, barWidth, 10);
                ctx.strokeRect(xStart + 0.5, y - 6.5, barWidth - 1, 11);
            } else {
                ctx.fillStyle = CONFIRMED_COLOR;
                ctx.beginPath();
                ctx.arc(xStart, y - 2, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = TEXT_COLOR;
            ctx.fillText(label, xEnd + 4, y - 9);

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
            if (item.type === 'PREDICTED') {
                const xStart = timeToX(item.start, overviewStart, overviewEnd, width);
                const xEnd = timeToX(item.end, overviewStart, overviewEnd, width);
                const barWidth = Math.max(1, xEnd - xStart);
                const y = height * 0.55;
                ctx.fillStyle = `${PREDICTED_COLOR}55`;
                ctx.fillRect(xStart, y, barWidth, height * 0.35);
                overviewPositions.push({ item, xStart, xEnd: xStart + barWidth, y, height: height * 0.35 });
            } else {
                const x = timeToX(item.time, overviewStart, overviewEnd, width);
                const y = height * 0.6;
                const barHeight = height * 0.3;
                ctx.fillStyle = CONFIRMED_COLOR;
                ctx.fillRect(x - 0.5, y, 2, barHeight);
                overviewPositions.push({ item, xStart: x - 0.5, xEnd: x + 1.5, y, height: barHeight });
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
            const decay = hit.item.satellite.decay || {};
            let line = '';
            if (hit.item.type === 'CONFIRMED') {
                line = `Re-entered: ${formatDateTime(new Date(hit.item.time))}`;
            } else {
                line = `Predicted window: ${formatDate(new Date(hit.item.start))} → ${formatDate(new Date(hit.item.end))}`;
            }
            const confidence = decay.predicted_decay_window?.confidence;
            tooltip.innerHTML = `
              <div style="font-weight:bold;">${hit.item.satellite.satellite_name || hit.item.satellite.norad_id}</div>
              <div>NORAD: ${hit.item.satellite.norad_id || '—'}</div>
              <div>Status: ${decay.decay_status || hit.item.type}</div>
              <div>${line}</div>
              ${confidence !== undefined ? `<div>Confidence: ${(confidence * 100).toFixed(0)}%</div>` : ''}
              <div style="max-width:260px;">${decay.decay_reason || hit.item.reason || ''}</div>
            `;
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
            const decay = hit.item.satellite.decay || {};
            let line = '';
            if (hit.item.type === 'CONFIRMED') {
                line = `Re-entered: ${formatDateTime(new Date(hit.item.time))}`;
            } else {
                line = `Predicted window: ${formatDate(new Date(hit.item.start))} → ${formatDate(new Date(hit.item.end))}`;
            }
            const confidence = decay.predicted_decay_window?.confidence;
            tooltip.innerHTML = `
              <div style="font-weight:bold;">${hit.item.satellite.satellite_name || hit.item.satellite.norad_id}</div>
              <div>NORAD: ${hit.item.satellite.norad_id || '—'}</div>
              <div>Status: ${decay.decay_status || hit.item.type}</div>
              <div>${line}</div>
              ${confidence !== undefined ? `<div>Confidence: ${(confidence * 100).toFixed(0)}%</div>` : ''}
              <div style="max-width:260px;">${decay.decay_reason || hit.item.reason || ''}</div>
            `;
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
        requestRedraw: scheduleDraw,
        refreshData: rebuildData
    };
}
