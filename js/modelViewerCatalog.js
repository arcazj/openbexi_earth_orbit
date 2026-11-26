import { ALL_COMPANY_OPTION, createCompanyCheckbox, formatCompanyLabel, isCatalogTagOption } from './catalogTagControls.js';
import { satelliteSearchText } from './satelliteSearchUtils.js';
import { SPACE_STATION_FILTER } from './spaceStations.js';
import { starlinkShortcutState, issShortcutState } from './satelliteShortcutLabels.js';
import { createTrackedResultsController } from './trackedResultsController.js';
import {
    createTrackedObjectCatalogLoader, mergeTrackedCatalogRecords, isCatalogResultEligible, isHistoricalTrackedRecord,
    trackedObjectMatchesFilters, trackedObjectTags, trackedTagOptions, toggleTrackedOrbitSelection, toggleTrackedObjectTypeSelection,
    TRACKED_ORBIT_CLASS_OPTIONS, TRACKED_OBJECT_TYPE_OPTIONS, TRACKED_OBJECT_VISUALS
} from './trackedObjectCatalog.js';

const labels = { HEO: 'HRO', OTHER: 'Others', ROCKET_BODY: 'Rocket Body', MISSION_RELATED: 'Mission', [SPACE_STATION_FILTER]: 'Space station' };

function buildSegments(group, values, toggle, onChange) {
    for (const value of ['ALL', ...values]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.value = value;
        button.textContent = labels[value] ?? TRACKED_OBJECT_VISUALS[value]?.label ?? value;
        group.append(button);
    }
    let selection;
    function set(values) {
        selection = values;
        for (const button of group.children) button.setAttribute('aria-pressed', String(values.includes(button.value)));
    }
    set(['ALL']);
    group.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        set(toggle(selection, button.value));
        onChange(button);
    });
    return { reset: () => set(['ALL']), get values() { return selection; } };
}

export function mountModelViewerCatalog({ onSelect, getSelectedNoradId }) {
    const byId = id => document.getElementById(id);
    const search = byId('viewerSearch'), tags = byId('viewerTagFilter'), history = byId('viewerHistoryFilter');
    const count = byId('viewerMatchCount');
    const loader = createTrackedObjectCatalogLoader();
    const searchText = new WeakMap();
    const selectedTags = new Set();
    let all = [], eligible = [], candidates = [], matches = [], availableTags = [];
    let scoped = false, pending = null;
    let orbitalRecords, trackedRecords = [], currentLoaded = false, historyLoaded = false, loadingHistory = false;
    const selectedElements = new Map();
    const orbit = buildSegments(byId('viewerOrbitFilter'), [...TRACKED_ORBIT_CLASS_OPTIONS, SPACE_STATION_FILTER], toggleTrackedOrbitSelection, filtersChanged);
    const type = buildSegments(byId('viewerTypeFilter'), TRACKED_OBJECT_TYPE_OPTIONS, toggleTrackedObjectTypeSelection, filtersChanged);

    const results = createTrackedResultsController({
        getRecords: () => scoped ? matches : all,
        getSelectedNoradId, onSelect, isTagOption: isCatalogTagOption, tagLabel: formatCompanyLabel,
        getScopedTags: () => ({ available: availableTags, selected: [...selectedTags] }),
        onScopedTagChange(tag) {
            selectedTags.clear();
            if (tag) selectedTags.add(tag);
            updateMatches();
        },
        onOpen(context) {
            scoped = Boolean(context.scoped);
            void load(context.includeHistory);
        },
        onHistoryChange(value) {
            if (scoped) {
                history.checked = value;
                updateEligibility();
            }
            void load(value);
        }
    });

    function updateCount() {
        const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const matched = !terms.length ? matches.length : matches.reduce((n, record) => {
            if (!searchText.has(record)) searchText.set(record, satelliteSearchText(record));
            return n + Number(terms.every(term => searchText.get(record).includes(term)));
        }, 0);
        count.textContent = matched.toLocaleString() + ' / ' + eligible.length.toLocaleString();
    }

    function updateEligibility() {
        eligible = all.filter(record => isCatalogResultEligible(record, history.checked));
        updateScope();
    }

    function updateScope() {
        const filters = { orbitSelection: orbit.values, objectTypeSelection: type.values, includeHistorical: true };
        candidates = orbit.values.includes('ALL') && type.values.includes('ALL') ? eligible :
            eligible.filter(record => trackedObjectMatchesFilters(record, filters));
        availableTags = trackedTagOptions(candidates, isCatalogTagOption);
        for (const tag of selectedTags) if (!availableTags.includes(tag)) selectedTags.delete(tag);
        tags.replaceChildren(...[ALL_COMPANY_OPTION, ...availableTags].map(tag =>
            createCompanyCheckbox(tag, formatCompanyLabel(tag))));
        updateMatches();
    }

    function updateMatches() {
        matches = selectedTags.size ? candidates.filter(record => trackedObjectTags(record).some(tag => selectedTags.has(tag))) : candidates;
        for (const input of tags.querySelectorAll('input')) {
            input.checked = input.value === ALL_COMPANY_OPTION ? !selectedTags.size : selectedTags.has(input.value);
        }
        updateCount();
    }

    function showMatches(trigger, keepFocus = false, reset = false) {
        results.setOpen(true, { scoped: true, includeHistory: history.checked, query: search.value, trigger,
            keepFocus, reset });
    }

    function filtersChanged(trigger) {
        if (trigger.value === SPACE_STATION_FILTER) {
            type.reset();
            selectedTags.clear();
            search.value = '';
            history.checked = false;
            updateEligibility();
            showMatches(trigger, false, true);
            return;
        }
        updateScope();
        showMatches(trigger);
    }

    function setShortcut(button, record, describe) {
        const { disabled, text, title, ariaLabel } = describe(record);
        button.disabled = disabled;
        button.textContent = text;
        button.title = title;
        button.setAttribute('aria-label', ariaLabel);
        button.onclick = record ? () => { if (results.isOpen()) results.setOpen(false); onSelect(record); } : null;
    }

    function applyElements(record, elements) {
        if (!record || isHistoricalTrackedRecord(record) || Date.parse(record.element_set?.epoch) >= Date.parse(elements.epoch)) return;
        Object.assign(record, { element_set: elements, has_current_elements: true, metadata_only: false,
            tracked_catalog_suppressed: false, propagation_status: 'CURRENT_ELEMENTS', unavailable_reason: null });
    }

    function load(includeHistory = false) {
        if (pending) return includeHistory && !loadingHistory ? pending.then(() => load(true)) : pending;
        if (includeHistory ? historyLoaded : currentLoaded) {
            results.setCatalogState('ready');
            return Promise.resolve();
        }
        loadingHistory = includeHistory;
        results.setCatalogState('loading');
        pending = Promise.allSettled([
            orbitalRecords ?? fetch('json/gp/GP.json').then(response => {
                if (!response.ok) throw Error('Orbital catalog unavailable');
                return response.json();
            }),
            loader.loadAll({ includeHistorical: includeHistory })
        ]).then(([gp, tracked]) => {
            if (gp.status === 'fulfilled') orbitalRecords = gp.value;
            if (tracked.status === 'fulfilled') trackedRecords = tracked.value.records;
            all = mergeTrackedCatalogRecords(orbitalRecords, trackedRecords);
            for (const [id, elements] of selectedElements) applyElements(all.find(record => record.norad_id === id), elements);
            setShortcut(byId('viewerStarlink'), all.find(record => !isHistoricalTrackedRecord(record) &&
                (record.company === 'STARLINK' || /^STARLINK[- ]/i.test(record.satellite_name)) &&
                !/DEB|R\/B/i.test(record.satellite_name)), starlinkShortcutState);
            setShortcut(byId('viewerIss'), all.find(record => String(record.norad_id) === '25544'), issShortcutState);
            updateEligibility();
            if (results.isOpen()) results.refresh(scoped ? matches : all);
            const complete = gp.status === 'fulfilled' && tracked.status === 'fulfilled';
            results.setCatalogState(complete ? 'ready' : 'error');
            if (complete) {
                currentLoaded = true;
                historyLoaded ||= includeHistory;
            }
        }).finally(() => { pending = null; });
        return pending;
    }

    tags.addEventListener('change', event => {
        const input = event.target;
        if (input.value === ALL_COMPANY_OPTION) selectedTags.clear();
        else if (input.checked) selectedTags.add(input.value);
        else selectedTags.delete(input.value);
        updateMatches();
        showMatches(input);
    });
    history.addEventListener('change', () => { updateEligibility(); showMatches(history); });
    search.addEventListener('input', () => { updateCount(); showMatches(search, true); });
    search.addEventListener('keydown', event => {
        if (event.key === 'Enter') showMatches(search);
    });
    byId('viewerClear').addEventListener('click', () => {
        search.value = '';
        search.focus();
        updateCount();
        showMatches(search, true);
    });
    byId('viewerReset').addEventListener('click', event => {
        orbit.reset();
        type.reset();
        selectedTags.clear();
        search.value = '';
        history.checked = false;
        updateEligibility();
        showMatches(event.currentTarget);
    });
    updateScope();
    void load();
    return {
        async find(id) {
            await load();
            const current = all.find(record => record.norad_id === id);
            if (current) return current;
            await load(true);
            return all.find(record => record.norad_id === id);
        },
        rememberElements(id, elements) {
            if (Date.parse(selectedElements.get(id)?.epoch) >= Date.parse(elements.epoch)) return;
            selectedElements.set(id, elements);
            applyElements(all.find(item => item.norad_id === id), elements);
            if (results.isOpen()) results.refresh(scoped ? matches : all, true);
        }
    };
}
