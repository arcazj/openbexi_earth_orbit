const DETAIL_RATIO = 0.75;
const HUD_HEIGHT = 250;
const DOT_RADIUS = 1;
const ROW_HEIGHT = 13;
const FONT = '9px sans-serif';
const TOP_PADDING = 16;
const BG_COLOR = 'rgba(0,0,0,0.9)';
const BORDER_COLOR = 'rgba(255,255,255,0.15)';
const GRID_COLOR = 'rgba(255,255,255,0.15)';
const TEXT_COLOR = '#ddd';
const DOT_COLOR = '#00ff7f';
const NOW_COLOR = '#ff4444';
const BRUSH_COLOR = 'rgba(255,255,255,0.15)';
const BRUSH_BORDER = 'rgba(255,255,255,0.35)';

const MS_DAY = 24 * 60 * 60 * 1000 *2;
const MS_YEAR = 365.25 * MS_DAY;
const OVERVIEW_SPACING_TARGET = 360/2;
const OVERVIEW_MIN_RANGE = MS_YEAR * 1.5;

function createHudElements() {
    const container = document.createElement('div');
    container.className = 'timeline-hud';

    const toggle = document.createElement('button');
    toggle.className = 'timeline-toggle';
    toggle.textContent = 'Hide Launch Timeline ▼';
    container.appendChild(toggle);

    const detailCanvas = document.createElement('canvas');
    detailCanvas.className = 'timeline-canvas timeline-detail';
    container.appendChild(detailCanvas);

    const overviewCanvas = document.createElement('canvas');
    overviewCanvas.className = 'timeline-canvas timeline-overview';
    container.appendChild(overviewCanvas);

    document.body.appendChild(container);

    return { container, toggle, detailCanvas, overviewCanvas };
}

function parseLaunchDate(value) {
    if (!value || value === 'N/A') return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function formatLabel(date, msPerPixel) {
    if (!date) return '';
    if (msPerPixel < MS_DAY / 80) {
        return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
    }
    if (msPerPixel < (MS_DAY * 30) / 40) {
        return `${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
    }
    return `${date.getUTCFullYear()}`;
}

function pad(n) {
    return n.toString().padStart(2, '0');
}

function chooseInterval(rangeMs, width, spacingTarget = 120) {
    const target = (rangeMs / width) * spacingTarget;
    const intervals = [
        { type: 'day', days: 1, ms: MS_DAY },
        { type: 'day', days: 3, ms: 3 * MS_DAY },
        { type: 'week', days: 7, ms: 7 * MS_DAY },
        { type: 'month', months: 1, ms: MS_DAY * 30 },
        { type: 'month', months: 3, ms: MS_DAY * 90 },
        { type: 'year', years: 1, ms: MS_YEAR },
        { type: 'year', years: 5, ms: MS_YEAR * 5 },
        { type: 'year', years: 10, ms: MS_YEAR * 10 }
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
    // Move back to ensure start covered
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
    const width = canvas.clientWidth * dpr;
    const h = height * dpr;
    if (canvas.width !== width || canvas.height !== h) {
        canvas.width = width;
        canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

export function initTimeline(satellites, arg2, arg3) {
    let centerDate = new Date();
    let onSelect = null;
    if (typeof arg2 === 'function') {
        onSelect = arg2;
    } else {
        centerDate = arg2 ? new Date(arg2) : centerDate;
        if (typeof arg3 === 'function') onSelect = arg3;
    }

    const timelineData = (satellites || [])
        .map((s, idx) => {
            const launchDate = parseLaunchDate(s.launch_date);
            return launchDate ? { time: launchDate.getTime(), satellite: s, index: idx } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);

    if (!timelineData.length) return () => {};

    const { container, toggle, detailCanvas, overviewCanvas } = createHudElements();

    let isCollapsed = false;
    toggle.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        container.classList.toggle('timeline-collapsed', isCollapsed);
        container.style.height = isCollapsed ? '32px' : `${HUD_HEIGHT}px`;
        toggle.textContent = isCollapsed ? 'Show Launch Timeline ▲' : 'Hide Launch Timeline ▼';
        scheduleDraw();
    });

    let detailStart = centerDate.getTime() - MS_DAY * 3.5;
    let detailEnd = centerDate.getTime() + MS_DAY * 3.5;

    let overviewStart = new Date(centerDate.getUTCFullYear() - 10, 0, 1).getTime();
    let overviewEnd = new Date(centerDate.getUTCFullYear() + 10, 0, 1).getTime();

    let detailPositions = [];

    let needsDraw = true;
    let rafScheduled = false;

    function scheduleDraw() {
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
        container.style.height = isCollapsed ? '32px' : `${HUD_HEIGHT}px`;
        const detailHeight = HUD_HEIGHT * DETAIL_RATIO;
        const overviewHeight = HUD_HEIGHT * (1 - DETAIL_RATIO);
        detailCanvas.style.height = `${detailHeight}px`;
        overviewCanvas.style.height = `${overviewHeight}px`;
        detailCanvas.style.width = overviewCanvas.style.width = '100%';
        sizeCanvas(detailCanvas, detailHeight);
        sizeCanvas(overviewCanvas, overviewHeight);
        scheduleDraw();
    }

    resize();
    window.addEventListener('resize', resize);

    function timeToX(time, start, end, width) {
        return ((time - start) / (end - start)) * width;
    }

    function xToTime(x, start, end, width) {
        return start + (x / width) * (end - start);
    }

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

        ticks.forEach(t => {
            const x = timeToX(t.getTime(), detailStart, detailEnd, width);
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, height);
            ctx.stroke();
            const label = formatLabel(t, msPerPixel);
            if (label) ctx.fillText(label, x + 3, 2);
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
        const visible = timelineData.filter(d => d.time >= detailStart - range * 0.1 && d.time <= detailEnd + range * 0.1);
        visible.forEach(item => {
            const x = timeToX(item.time, detailStart, detailEnd, width);
            const label = item.satellite.satellite_name || `NORAD ${item.satellite.norad_id}`;
            const textWidth = ctx.measureText(label).width;
            let row = 0;
            while (rowsLastEnd[row] !== undefined && x - rowsLastEnd[row] < textWidth + DOT_RADIUS * 2 + 6) {
                row += 1;
            }
            rowsLastEnd[row] = x + textWidth + DOT_RADIUS * 2 + 6;
            const y = row * ROW_HEIGHT + TOP_PADDING;
            if (y < height - ROW_HEIGHT) {
                ctx.fillStyle = DOT_COLOR;
                ctx.beginPath();
                ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = TEXT_COLOR;
                ctx.fillText(label, x + DOT_RADIUS + 4, y - DOT_RADIUS - 2 + DOT_RADIUS);

                detailPositions.push({ x, y, item, row, labelWidth: textWidth });
            }
        });
    }

    function drawOverview(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = BORDER_COLOR;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        const range = overviewEnd - overviewStart;
        const interval = chooseInterval(range, width, OVERVIEW_SPACING_TARGET);
        const ticks = generateTicks(new Date(overviewStart), new Date(overviewEnd), interval);
        const msPerPixel = range / width;

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
            const label = formatLabel(t, msPerPixel);
            if (!label) return;

            const nextTick = ticks[idx + 1];
            const spacing = nextTick ? timeToX(nextTick.getTime(), overviewStart, overviewEnd, width) - x : width / ticks.length;
            if (spacing > ctx.measureText(label).width + 10) {
                ctx.fillText(label, x + 3, 2);
            }
        });

        const bucketCount = Math.max(10, Math.min(Math.floor(width / 8), 240));
        const bucketWidth = width / bucketCount;
        const bucketHeight = height * 0.6;
        const buckets = new Array(bucketCount).fill(0);
        timelineData.forEach(item => {
            if (item.time < overviewStart || item.time > overviewEnd) return;
            const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((item.time - overviewStart) / (overviewEnd - overviewStart) * bucketCount)));
            buckets[idx] += 1;
        });
        const maxBucket = buckets.reduce((m, c) => Math.max(m, c), 0) || 1;

        buckets.forEach((count, i) => {
            const x = i * bucketWidth;
            const intensity = Math.min(1, count / maxBucket);
            ctx.fillStyle = `rgba(0, 255, 127, ${0.15 + intensity * 0.6})`;
            ctx.fillRect(x, height - bucketHeight, bucketWidth, bucketHeight * intensity);
        });

        ctx.fillStyle = DOT_COLOR;
        const decimated = timelineData.filter(d => d.index % 100 === 0);
        decimated.forEach(item => {
            if (item.time < overviewStart || item.time > overviewEnd) return;
            const x = timeToX(item.time, overviewStart, overviewEnd, width);
            ctx.fillRect(x - 0.5, height * 0.6, 1, 1);
        });

        // Brush representing detail view
        const brushStartX = timeToX(detailStart, overviewStart, overviewEnd, width);
        const brushEndX = timeToX(detailEnd, overviewStart, overviewEnd, width);
        const brushWidth = brushEndX - brushStartX;
        ctx.fillStyle = BRUSH_COLOR;
        ctx.strokeStyle = BRUSH_BORDER;
        ctx.fillRect(brushStartX, 4, brushWidth, height - 8);
        ctx.strokeRect(brushStartX + 0.5, 4.5, brushWidth - 1, height - 9);
    }

    function draw() {
        if (isCollapsed) return;
        const detailHeight = detailCanvas.clientHeight;
        const overviewHeight = overviewCanvas.clientHeight;
        const detailCtx = sizeCanvas(detailCanvas, detailHeight);
        const overviewCtx = sizeCanvas(overviewCanvas, overviewHeight);
        const width = detailCanvas.clientWidth;
        drawDetail(detailCtx, width, detailHeight);
        drawOverview(overviewCtx, overviewCanvas.clientWidth, overviewHeight);
    }

    // Interactions - Detail
    let isDetailDragging = false;
    let detailDragStartX = 0;
    let detailDragRangeStart = 0;
    let detailDragRange = 0;

    detailCanvas.addEventListener('mousedown', e => {
        if (isCollapsed) return;
        isDetailDragging = true;
        detailDragStartX = e.clientX;
        detailDragRangeStart = detailStart;
        detailDragRange = detailEnd - detailStart;
    });

    detailCanvas.addEventListener('mousemove', e => {
        if (!isDetailDragging) return;
        const dx = e.clientX - detailDragStartX;
        const width = detailCanvas.clientWidth;
        const deltaMs = (dx / width) * detailDragRange;
        detailStart = detailDragRangeStart - deltaMs;
        detailEnd = detailStart + detailDragRange;
        scheduleDraw();
    });

    detailCanvas.addEventListener('mouseup', e => {
        if (!isDetailDragging) return;
        isDetailDragging = false;
        if (Math.abs(e.clientX - detailDragStartX) < 4) {
            const rect = detailCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const hit = detailPositions.find(p => Math.abs(p.x - x) <= DOT_RADIUS + 3 && Math.abs(p.y - y) <= ROW_HEIGHT / 2);
            if (hit && typeof onSelect === 'function') {
                onSelect(hit.item.satellite);
            }
        }
    });

    detailCanvas.addEventListener('mouseleave', () => {
        isDetailDragging = false;
    });

    detailCanvas.addEventListener('wheel', e => {
        if (isCollapsed) return;
        e.preventDefault();
        const rect = detailCanvas.getBoundingClientRect();
        const mouseTime = xToTime(e.clientX - rect.left, detailStart, detailEnd, detailCanvas.clientWidth);
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        const range = detailEnd - detailStart;
        const newRange = Math.min(MS_YEAR * 20, Math.max(MS_DAY / 2, range * zoomFactor));
        const tRatio = (mouseTime - detailStart) / range;
        detailStart = mouseTime - newRange * tRatio;
        detailEnd = detailStart + newRange;
        scheduleDraw();
    }, { passive: false });

    // Interactions - Overview
    let isOverviewDragging = false;
    let overviewDragStartX = 0;
    let overviewDragRangeStart = 0;
    let overviewDragRange = 0;
    let brushing = false;
    let brushOffset = 0;
    let detailDuringOverviewStart = 0;
    let detailDuringOverviewEnd = 0;

    overviewCanvas.addEventListener('mousedown', e => {
        if (isCollapsed) return;
        const rect = overviewCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = overviewCanvas.clientWidth;
        const brushStartX = timeToX(detailStart, overviewStart, overviewEnd, width);
        const brushEndX = timeToX(detailEnd, overviewStart, overviewEnd, width);
        if (x >= brushStartX && x <= brushEndX) {
            brushing = true;
            brushOffset = x - brushStartX;
        } else {
            isOverviewDragging = true;
            overviewDragStartX = e.clientX;
            overviewDragRangeStart = overviewStart;
            overviewDragRange = overviewEnd - overviewStart;
            detailDuringOverviewStart = detailStart;
            detailDuringOverviewEnd = detailEnd;
        }
    });

    overviewCanvas.addEventListener('mousemove', e => {
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

    overviewCanvas.addEventListener('wheel', e => {
        if (isCollapsed) return;
        e.preventDefault();
        const rect = overviewCanvas.getBoundingClientRect();
        const mouseTime = xToTime(e.clientX - rect.left, overviewStart, overviewEnd, overviewCanvas.clientWidth);
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        const range = overviewEnd - overviewStart;
        const newRange = Math.min(MS_YEAR * 200, Math.max(OVERVIEW_MIN_RANGE, range * zoomFactor));
        const tRatio = (mouseTime - overviewStart) / range;
        overviewStart = mouseTime - newRange * tRatio;
        overviewEnd = overviewStart + newRange;
        scheduleDraw();
    }, { passive: false });

    scheduleDraw();

    return () => {
        window.removeEventListener('resize', resize);
        container.remove();
    };
}
