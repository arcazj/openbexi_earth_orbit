import {
    prepareTrackedResults,
    TRACKED_RESULT_MODE,
    TRACKED_RESULT_SORT,
    trackedResultWindow
} from './trackedResultsView.js';

const DEFAULT_ROW_HEIGHT = 46;
const RESULT_OVERSCAN = 5;
const validModes = new Set(Object.values(TRACKED_RESULT_MODE));
const validSortKeys = new Set(Object.values(TRACKED_RESULT_SORT));
const DRAWER_MARKUP = `
    <header class="tracked-results-header">
        <div>
            <h2 id="trackedResultsTitle">Tracked-object results</h2>
            <span id="trackedResultsCount">0 results</span>
        </div>
        <button id="closeTrackedResults" type="button" class="tracked-results-close" aria-label="Close catalog results" title="Close catalog results">&times;</button>
    </header>
    <div id="trackedResultsTabs" class="tracked-results-tabs" role="tablist" aria-label="Result availability">
        <button type="button" role="tab" data-result-mode="ALL" aria-selected="true">All matches</button>
        <button type="button" role="tab" data-result-mode="POSITIONED" aria-selected="false" tabindex="-1">On map</button>
        <button type="button" role="tab" data-result-mode="UNAVAILABLE" aria-selected="false" tabindex="-1">Position unavailable</button>
    </div>
    <div id="trackedResultsColumns" class="tracked-results-columns">
        <button type="button" data-result-sort="name" data-sort-direction="ascending" aria-label="Sort by Name, ascending">Name</button>
        <button type="button" data-result-sort="norad" aria-label="Sort by NORAD">NORAD</button>
        <button type="button" data-result-sort="type" aria-label="Sort by Type">Type</button>
        <button type="button" data-result-sort="owner" aria-label="Sort by Owner">Owner</button>
        <button type="button" data-result-sort="orbit" aria-label="Sort by Orbit">Orbit</button>
        <button type="button" data-result-sort="rcs" aria-label="Sort by RCS">RCS m2</button>
        <button type="button" data-result-sort="availability" aria-label="Sort by Availability">Availability</button>
    </div>
    <div id="trackedResultsViewport" class="tracked-results-viewport" role="listbox" aria-label="Tracked-object catalog results" tabindex="0">
        <div id="trackedResultsSpacer" class="tracked-results-spacer" aria-hidden="true"></div>
        <div id="trackedResultsRows" class="tracked-results-rows"></div>
    </div>
    <div id="trackedResultsEmpty" class="empty-state" hidden>No results in this availability view.</div>`;

function formatResultType(value) {
    return String(value || 'UNKNOWN').replaceAll('_', ' ').toLowerCase()
        .replace(/\b\w/g, character => character.toUpperCase());
}

function formatResultRcs(value) {
    if (!Number.isFinite(value)) return 'Not reported';
    if (value < 0.001) return value.toExponential(2);
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function resolveElements(root) {
    const byId = id => root?.getElementById?.(id) ?? null;
    return Object.freeze({
        openButton: byId('openTrackedResults'),
        drawer: byId('trackedResultsDrawer'),
        closeButton: byId('closeTrackedResults'),
        tabs: byId('trackedResultsTabs'),
        columns: byId('trackedResultsColumns'),
        viewport: byId('trackedResultsViewport'),
        spacer: byId('trackedResultsSpacer'),
        rows: byId('trackedResultsRows'),
        count: byId('trackedResultsCount'),
        empty: byId('trackedResultsEmpty')
    });
}

function populateDrawer(root) {
    const drawer = root?.getElementById?.('trackedResultsDrawer');
    if (drawer && !drawer.querySelector('#trackedResultsViewport')) drawer.innerHTML = DRAWER_MARKUP;
}

export function createTrackedResultsController(options = {}) {
    const root = options.root ?? globalThis.document;
    if (!options.elements) populateDrawer(root);
    const elements = options.elements ?? resolveElements(root);
    const documentRef = elements.drawer?.ownerDocument ?? root;
    const getRecords = typeof options.getRecords === 'function' ? options.getRecords : () => [];
    const getSelectedNoradId = typeof options.getSelectedNoradId === 'function'
        ? options.getSelectedNoradId
        : () => null;
    const onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
    const rowHeight = Math.max(32, Number(options.rowHeight) || DEFAULT_ROW_HEIGHT);
    const removers = [];
    let sourceRecords = [];
    let preparedRows = [];
    let mode = TRACKED_RESULT_MODE.ALL;
    let sortKey = TRACKED_RESULT_SORT.NAME;
    let sortDirection = 'asc';
    let activeIndex = -1;

    function listen(element, type, handler, listenerOptions) {
        if (!element?.addEventListener) return;
        element.addEventListener(type, handler, listenerOptions);
        removers.push(() => element.removeEventListener(type, handler, listenerOptions));
    }

    function renderWindow() {
        if (!elements.viewport || !elements.rows || !elements.spacer || !documentRef?.createElement) return;
        const view = trackedResultWindow(preparedRows, {
            scrollTop: elements.viewport.scrollTop,
            viewportHeight: elements.viewport.clientHeight || 300,
            rowHeight,
            overscan: RESULT_OVERSCAN
        });
        elements.spacer.style.height = `${view.totalHeight}px`;
        elements.rows.style.transform = `translateY(${view.start * view.rowHeight}px)`;
        const selectedNoradId = getSelectedNoradId();
        const renderedRows = view.rows.map((row, offset) => {
            const index = view.start + offset;
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.id = `tracked-result-${index}`;
            button.className = 'tracked-results-row';
            button.tabIndex = -1;
            button.dataset.resultIndex = String(index);
            button.dataset.noradId = row.norad;
            button.setAttribute('role', 'option');
            button.setAttribute('aria-posinset', String(index + 1));
            button.setAttribute('aria-setsize', String(preparedRows.length));
            button.setAttribute('aria-selected', String(
                selectedNoradId !== null && selectedNoradId !== undefined && String(selectedNoradId) === row.norad
            ));
            button.setAttribute('aria-label',
                `${row.name}, NORAD ${row.norad}, ${formatResultType(row.type)}, ` +
                `${row.orbit}, ${row.availability}`
            );
            if (index === activeIndex) button.classList.add('is-active');
            [
                row.name,
                row.norad,
                formatResultType(row.type),
                row.owner,
                row.orbit,
                formatResultRcs(row.rcs),
                row.availability
            ].forEach((value, valueIndex) => {
                const span = documentRef.createElement('span');
                span.textContent = value;
                if (valueIndex === 6) span.dataset.availability = row.positioned ? 'positioned' : 'unavailable';
                button.appendChild(span);
            });
            return button;
        });
        elements.rows.replaceChildren(...renderedRows);
        if (activeIndex >= view.start && activeIndex < view.end) {
            elements.viewport.setAttribute('aria-activedescendant', `tracked-result-${activeIndex}`);
        } else {
            elements.viewport.removeAttribute('aria-activedescendant');
        }
    }

    function refresh(records = sourceRecords) {
        sourceRecords = Array.isArray(records) ? records : [];
        preparedRows = prepareTrackedResults(sourceRecords, { mode, sortKey, direction: sortDirection });
        activeIndex = Math.min(activeIndex, preparedRows.length - 1);
        if (elements.count) {
            elements.count.textContent = `${preparedRows.length.toLocaleString()} ` +
                `${preparedRows.length === 1 ? 'result' : 'results'}`;
        }
        if (elements.empty) elements.empty.hidden = preparedRows.length > 0;
        if (elements.viewport) {
            elements.viewport.hidden = preparedRows.length === 0;
            const maxScroll = Math.max(0, preparedRows.length * rowHeight - elements.viewport.clientHeight);
            if (elements.viewport.scrollTop > maxScroll) elements.viewport.scrollTop = maxScroll;
        }
        renderWindow();
    }

    function setOpen(open) {
        if (!elements.drawer) return;
        elements.drawer.hidden = !open;
        elements.openButton?.setAttribute('aria-expanded', String(open));
        if (open) {
            refresh(getRecords());
            const selectedTab = [...(elements.tabs?.querySelectorAll?.('[data-result-mode]') ?? [])]
                .find(tab => tab.getAttribute('aria-selected') === 'true');
            const focusTarget = elements.viewport && !elements.viewport.hidden
                ? elements.viewport
                : selectedTab ?? elements.closeButton;
            focusTarget?.focus({ preventScroll: true });
        } else {
            elements.openButton?.focus({ preventScroll: true });
        }
    }

    function isOpen() {
        return !!elements.drawer && !elements.drawer.hidden;
    }

    function selectAt(index) {
        const row = preparedRows[index];
        if (!row) return;
        activeIndex = index;
        onSelect(row.record);
        setOpen(false);
    }

    function handleViewportKeydown(event) {
        if (!preparedRows.length) return;
        let nextIndex = activeIndex;
        if (event.key === 'ArrowDown') nextIndex = Math.min(preparedRows.length - 1, Math.max(0, nextIndex + 1));
        else if (event.key === 'ArrowUp') nextIndex = Math.max(0, nextIndex < 0 ? 0 : nextIndex - 1);
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = preparedRows.length - 1;
        else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            selectAt(activeIndex);
            return;
        } else {
            return;
        }
        event.preventDefault();
        activeIndex = nextIndex;
        const rowTop = nextIndex * rowHeight;
        const rowBottom = rowTop + rowHeight;
        if (rowTop < elements.viewport.scrollTop) elements.viewport.scrollTop = rowTop;
        else if (rowBottom > elements.viewport.scrollTop + elements.viewport.clientHeight) {
            elements.viewport.scrollTop = rowBottom - elements.viewport.clientHeight;
        }
        renderWindow();
    }

    function selectMode(button) {
        mode = validModes.has(button?.dataset?.resultMode)
            ? button.dataset.resultMode
            : TRACKED_RESULT_MODE.ALL;
        elements.tabs?.querySelectorAll('[data-result-mode]').forEach(tab => {
            tab.setAttribute('aria-selected', String(tab === button));
            tab.tabIndex = tab === button ? 0 : -1;
        });
        if (elements.viewport) elements.viewport.scrollTop = 0;
        activeIndex = -1;
        refresh();
    }

    function selectSort(button) {
        const nextKey = button?.dataset?.resultSort;
        if (!validSortKeys.has(nextKey)) return;
        if (sortKey === nextKey) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        else {
            sortKey = nextKey;
            sortDirection = 'asc';
        }
        elements.columns?.querySelectorAll('[data-result-sort]').forEach(column => {
            const label = column.textContent.trim();
            if (column === button) {
                const direction = sortDirection === 'asc' ? 'ascending' : 'descending';
                column.dataset.sortDirection = direction;
                column.setAttribute('aria-label', `Sort by ${label}, ${direction}`);
            } else {
                delete column.dataset.sortDirection;
                column.setAttribute('aria-label', `Sort by ${label}`);
            }
        });
        refresh();
    }

    elements.openButton?.setAttribute('aria-controls', elements.drawer?.id || 'trackedResultsDrawer');
    elements.openButton?.setAttribute('aria-expanded', 'false');
    listen(elements.openButton, 'click', () => setOpen(true));
    listen(elements.closeButton, 'click', () => setOpen(false));
    listen(elements.tabs, 'click', event => {
        const button = event.target?.closest?.('[data-result-mode]');
        if (button) selectMode(button);
    });
    listen(elements.tabs, 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...elements.tabs.querySelectorAll('[data-result-mode]')];
        const currentIndex = tabs.indexOf(event.target?.closest?.('[data-result-mode]'));
        if (currentIndex < 0) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? tabs.length - 1
                : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
    });
    listen(elements.columns, 'click', event => selectSort(event.target?.closest?.('[data-result-sort]')));
    listen(elements.viewport, 'scroll', () => {
        elements.columns?.style.setProperty('--tracked-results-scroll-x', `${elements.viewport.scrollLeft}px`);
        renderWindow();
    }, { passive: true });
    listen(elements.viewport, 'keydown', handleViewportKeydown);
    listen(elements.drawer, 'keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
    });
    listen(elements.rows, 'focusin', event => {
        const row = event.target?.closest?.('[data-result-index]');
        if (row) activeIndex = Number(row.dataset.resultIndex);
    });
    listen(elements.rows, 'click', event => {
        const row = event.target?.closest?.('[data-result-index]');
        if (row) selectAt(Number(row.dataset.resultIndex));
    });

    return Object.freeze({
        destroy() {
            removers.splice(0).forEach(remove => remove());
        },
        isOpen,
        refresh,
        setOpen
    });
}
