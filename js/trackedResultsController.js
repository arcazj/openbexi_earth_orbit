import {
    prepareTrackedResults,
    TRACKED_RESULT_MODE,
    TRACKED_RESULT_SORT,
    trackedResultWindow
} from './trackedResultsView.js';
import { isCatalogResultEligible, trackedObjectTags, trackedTagOptions } from './trackedObjectCatalog.js';

const DEFAULT_ROW_HEIGHT = 46;
const RESULT_OVERSCAN = 5;
const validModes = new Set(Object.values(TRACKED_RESULT_MODE));
const columnLabels = {
    name: 'Name', norad: 'NORAD', type: 'Type', owner: 'Owner',
    orbit: 'Orbit', rcs: 'RCS m²', availability: 'Availability'
};
const DRAWER_MARKUP = `
    <header class="tracked-results-header">
        <div>
            <h2 id="trackedResultsTitle">Tracked-object results</h2>
            <span id="trackedResultsCount" role="status">0 results</span>
        </div>
        <button id="closeTrackedResults" type="button" class="tracked-results-close" aria-label="Close catalog results" title="Close catalog results">&times;</button>
    </header>
    <div class="tracked-results-tag">
        <label for="trackedResultsTag">Catalog tag</label>
        <select id="trackedResultsTag"><option value="">All tags</option></select>
        <label><input id="trackedResultsHistory" type="checkbox"> Include history</label>
    </div>
    <div class="tracked-results-search">
        <label for="trackedResultsSearch">Filter results</label>
        <input id="trackedResultsSearch" type="search" placeholder="Name, NORAD ID, owner…" aria-controls="trackedResultsViewport" autocomplete="off">
        <button id="clearTrackedResultsSearch" type="button" class="search-clear-button" aria-label="Clear results filter" disabled>Clear</button>
    </div>
    <div id="trackedResultsTabs" class="tracked-results-tabs" role="tablist" aria-label="Result availability">
        <button type="button" role="tab" data-result-mode="ALL" aria-selected="false" tabindex="-1">All matches</button>
        <button type="button" role="tab" data-result-mode="POSITIONED" aria-selected="true">On map</button>
        <button type="button" role="tab" data-result-mode="UNAVAILABLE" aria-selected="false" tabindex="-1">Position unavailable</button>
    </div>
    <div id="trackedResultsColumns" class="tracked-results-columns">
        ${Object.entries(columnLabels).map(([key, label]) =>
            `<button type="button" data-result-sort="${key}">${label}</button>`).join('')}
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
        search: byId('trackedResultsSearch'),
        tag: byId('trackedResultsTag'),
        history: byId('trackedResultsHistory'),
        clearSearch: byId('clearTrackedResultsSearch'),
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
    const tabs = [...(elements.tabs?.querySelectorAll('[data-result-mode]') ?? [])];
    const documentRef = elements.drawer?.ownerDocument ?? root;
    const getRecords = typeof options.getRecords === 'function' ? options.getRecords : () => [];
    const getSelectedNoradId = typeof options.getSelectedNoradId === 'function'
        ? options.getSelectedNoradId
        : () => null;
    const onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
    const rowHeight = Math.max(32, Number(options.rowHeight) || DEFAULT_ROW_HEIGHT);
    const removers = [];
    let sourceRecords = [];
    let scoped = false;
    let opener;
    let taggedRecords = [];
    let sortedRows = [];
    let preparedRows = [];
    let mode = TRACKED_RESULT_MODE.POSITIONED;
    let sortKey = TRACKED_RESULT_SORT.NAME;
    let sortDirection = 'asc';
    let activeIndex = -1;
    let catalogState = 'idle';

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

    function refresh(records = sourceRecords, force = false) {
        if (sourceRecords === records && !force) {
            renderWindow();
            return;
        }
        sourceRecords = Array.isArray(records) ? records : [];
        if (elements.tag) {
            const sidebar = scoped && options.getScopedTags?.();
            if (sidebar?.includeHistory !== undefined) setHistory(sidebar.includeHistory);
            const tags = sidebar ? sidebar.available : trackedTagOptions(sourceRecords, options.isTagOption);
            const selected = sidebar ? sidebar.selected : [elements.tag.value].filter(tag => tags.includes(tag));
            const label = options.tagLabel ?? (tag => tag);
            elements.tag.replaceChildren(new Option('All tags', ''), ...tags.map(tag => new Option(label(tag), tag)));
            if (selected.length > 1) {
                const summary = new Option(selected.map(label).join(' + '));
                summary.disabled = true;
                elements.tag.add(summary);
                summary.selected = true;
            } else {
                elements.tag.value = selected[0] ?? '';
            }
        }
        applyTag();
    }

    function applyTag() {
        // Scoped rows already match the sidebar tags.
        const tag = scoped && options.getScopedTags ? '' : elements.tag?.value;
        taggedRecords = sourceRecords.filter(record =>
            isCatalogResultEligible(record, elements.history?.checked) &&
            (!tag || trackedObjectTags(record).includes(tag)));
        sortRows();
    }

    function sortRows() {
        sortedRows = prepareTrackedResults(taggedRecords, { mode, sortKey, direction: sortDirection });
        filterRows();
    }

    function updateCount() {
        const loading = catalogState === 'loading';
        if (elements.count) {
            const count = `${preparedRows.length.toLocaleString()} ${preparedRows.length === 1 ? 'result' : 'results'}`;
            const partial = ['error', 'stale', 'lineage-error'].includes(catalogState);
            elements.count.textContent = loading ? `${count} · Loading full catalog…`
                : partial ? `${count} · Full catalog unavailable` : count;
        }
        if (elements.empty) elements.empty.hidden = preparedRows.length > 0 || loading;
    }

    function setCatalogState(state) {
        if (state === catalogState) return;
        catalogState = state;
        elements.viewport?.setAttribute('aria-busy', String(state === 'loading'));
        updateCount();
    }

    function filterRows() {
        const query = (elements.search?.value || '').trim().toLowerCase();
        const terms = query.split(/\s+/);
        preparedRows = query ? sortedRows.filter(row => terms.every(term => row.searchText.includes(term))) : sortedRows;
        activeIndex = Math.min(activeIndex, preparedRows.length - 1);
        updateCount();
        if (elements.clearSearch) elements.clearSearch.disabled = !elements.search.value;
        if (elements.empty) {
            elements.empty.textContent = query ? 'No objects match this filter.' : 'No results in this availability view.';
        }
        if (elements.viewport) {
            elements.viewport.hidden = preparedRows.length === 0;
            const maxScroll = Math.max(0, preparedRows.length * rowHeight - elements.viewport.clientHeight);
            if (elements.viewport.scrollTop > maxScroll) elements.viewport.scrollTop = maxScroll;
        }
        renderWindow();
    }

    function onQueryChange() {
        activeIndex = -1;
        elements.viewport.scrollTop = 0;
        filterRows();
    }

    function setHistory(include) {
        if (!elements.history || elements.history.checked === include) return;
        elements.history.checked = include;
        if (include && mode === TRACKED_RESULT_MODE.POSITIONED) setMode(TRACKED_RESULT_MODE.ALL);
    }

    function setOpen(open, context = {}) {
        if (!elements.drawer) return;
        const continuing = open && scoped && context.scoped && isOpen() && !context.reset;
        const historyChanged = Boolean(context.includeHistory) !== Boolean(elements.history?.checked);
        elements.drawer.hidden = !open;
        elements.openButton?.setAttribute('aria-expanded', String(open));
        if (open) {
            const scopeChanged = scoped !== Boolean(context.scoped);
            scoped = Boolean(context.scoped);
            opener = context.trigger ?? elements.openButton;
            if (!continuing) {
                if (elements.tag && !scoped) elements.tag.value = '';
                if (elements.search) elements.search.value = '';
                setMode(context.includeHistory ? TRACKED_RESULT_MODE.ALL : TRACKED_RESULT_MODE.POSITIONED);
            }
            setHistory(Boolean(context.includeHistory));
            if (elements.search && context.query !== undefined) elements.search.value = context.query;
            options.onOpen?.(context);
            const records = getRecords();
            if (records !== sourceRecords || scopeChanged) refresh(records, scopeChanged);
            else if (continuing && !historyChanged) onQueryChange();
            else applyTag();
            const focusTarget = elements.viewport && !elements.viewport.hidden
                ? elements.viewport
                : tabs.find(tab => tab.dataset.resultMode === mode) ?? elements.closeButton;
            if (!context.keepFocus) focusTarget?.focus({ preventScroll: true });
        } else {
            opener?.focus({ preventScroll: true });
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

    function setMode(nextMode) {
        mode = validModes.has(nextMode) ? nextMode : TRACKED_RESULT_MODE.ALL;
        tabs.forEach(tab => {
            const selected = tab.dataset.resultMode === mode;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        });
        if (elements.viewport) elements.viewport.scrollTop = 0;
        activeIndex = -1;
    }

    function selectSort(button) {
        const nextKey = button?.dataset?.resultSort;
        if (!Object.hasOwn(columnLabels, nextKey)) return;
        sortDirection = sortKey === nextKey && sortDirection === 'asc' ? 'desc' : 'asc';
        sortKey = nextKey;
        updateSortHeaders();
        sortRows();
    }

    function updateSortHeaders() {
        elements.columns?.querySelectorAll('[data-result-sort]').forEach(column => {
            const label = column.textContent.trim();
            if (column.dataset.resultSort === sortKey) {
                const direction = sortDirection === 'asc' ? 'ascending' : 'descending';
                column.dataset.sortDirection = direction;
                column.setAttribute('aria-label', `Sort by ${label}, ${direction}`);
            } else {
                delete column.dataset.sortDirection;
                column.setAttribute('aria-label', `Sort by ${label}`);
            }
        });
    }

    updateSortHeaders();
    elements.openButton?.setAttribute('aria-controls', elements.drawer?.id || 'trackedResultsDrawer');
    elements.openButton?.setAttribute('aria-expanded', 'false');
    listen(elements.openButton, 'click', () => setOpen(true, options.getOpenContext?.()));
    listen(elements.closeButton, 'click', () => setOpen(false));
    listen(elements.search, 'input', onQueryChange);
    function updateFilteredRows() {
        activeIndex = -1;
        elements.viewport.scrollTop = 0;
        if (scoped) refresh(getRecords(), true);
        else applyTag();
    }
    listen(elements.history, 'change', () => {
        if (elements.history.checked && mode === TRACKED_RESULT_MODE.POSITIONED) setMode(TRACKED_RESULT_MODE.ALL);
        options.onHistoryChange?.(elements.history.checked);
        updateFilteredRows();
    });
    listen(elements.tag, 'change', () => {
        if (scoped) options.onScopedTagChange?.(elements.tag.value);
        updateFilteredRows();
    });
    listen(elements.clearSearch, 'click', () => {
        elements.search.value = '';
        onQueryChange();
        elements.search.focus();
    });
    listen(elements.search, 'keydown', event => {
        if (event.key === 'ArrowDown' && preparedRows.length) {
            elements.viewport.focus();
            handleViewportKeydown(event);
        }
    });
    listen(elements.tabs, 'click', event => {
        const button = event.target?.closest?.('[data-result-mode]');
        if (!button) return;
        setMode(button.dataset.resultMode);
        sortRows();
    });
    listen(elements.tabs, 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
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
        setCatalogState,
        setOpen
    });
}
