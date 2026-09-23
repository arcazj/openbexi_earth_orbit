import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTrackedResultsController } from '../js/trackedResultsController.js';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value)
    };
    this.classList = {
      values: new Set(),
      add: name => this.classList.values.add(name),
      contains: name => this.classList.values.has(name)
    };
    this.hidden = false;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.clientHeight = 92;
    this.tabIndex = 0;
    this.textContent = '';
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    children.forEach(child => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  matches(selector) {
    const dataAttribute = selector.match(/^\[data-([a-z-]+)\]$/)?.[1];
    if (!dataAttribute) return false;
    const property = dataAttribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.hasOwn(this.dataset, property);
  }

  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = element => {
      element.children.forEach(child => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }

  dispatch(type, properties = {}) {
    const event = {
      bubbles: true,
      defaultPrevented: false,
      key: undefined,
      ...properties,
      target: this,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    let current = this;
    while (current) {
      event.currentTarget = current;
      current.listeners.get(type)?.forEach(handler => handler(event));
      if (!event.bubbles) break;
      current = current.parentElement;
    }
    return event;
  }

  click() {
    this.dispatch('click');
  }

  focus() {
    this.ownerDocument.activeElement = this;
    this.dispatch('focusin');
  }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function append(parent, child) {
  parent.appendChild(child);
  return child;
}

function createFixture() {
  const documentRef = new FakeDocument();
  const element = tag => documentRef.createElement(tag);
  const openButton = element('button');
  const drawer = element('section');
  drawer.id = 'trackedResultsDrawer';
  drawer.hidden = true;
  const closeButton = append(drawer, element('button'));
  const tabs = append(drawer, element('div'));
  const modeButtons = ['ALL', 'POSITIONED', 'UNAVAILABLE'].map(mode => {
    const button = append(tabs, element('button'));
    button.dataset.resultMode = mode;
    button.textContent = mode;
    button.setAttribute('aria-selected', String(mode === 'ALL'));
    button.tabIndex = mode === 'ALL' ? 0 : -1;
    return button;
  });
  const columns = append(drawer, element('div'));
  const sortButtons = ['name', 'norad', 'type', 'owner', 'orbit', 'rcs', 'availability'].map(key => {
    const button = append(columns, element('button'));
    button.dataset.resultSort = key;
    button.textContent = key;
    return button;
  });
  const viewport = append(drawer, element('div'));
  const spacer = append(viewport, element('div'));
  const rows = append(viewport, element('div'));
  const count = append(drawer, element('span'));
  const empty = append(drawer, element('div'));
  empty.hidden = true;
  return {
    documentRef,
    elements: { openButton, drawer, closeButton, tabs, columns, viewport, spacer, rows, count, empty },
    modeButtons,
    sortButtons
  };
}

const fixture = createFixture();
const records = [
  { norad_id: '20', satellite_name: 'Zulu', object_type: 'DEBRIS', has_current_elements: false, metadata_only: true },
  { norad_id: '3', satellite_name: 'Alpha', object_type: 'PAYLOAD', has_current_elements: true, metadata_only: false },
  { norad_id: '11', satellite_name: 'Beta', object_type: 'DEBRIS', has_current_elements: true, metadata_only: false }
];
const selected = [];
let selectedNoradId = '11';
const controller = createTrackedResultsController({
  root: fixture.documentRef,
  elements: fixture.elements,
  getRecords: () => records,
  getSelectedNoradId: () => selectedNoradId,
  onSelect: record => selected.push(record)
});

assert.equal(fixture.elements.openButton.getAttribute('aria-controls'), 'trackedResultsDrawer');
assert.equal(fixture.elements.openButton.getAttribute('aria-expanded'), 'false');
fixture.elements.openButton.click();
assert.equal(controller.isOpen(), true);
assert.equal(fixture.elements.count.textContent, '3 results');
assert.equal(fixture.documentRef.activeElement, fixture.elements.viewport, 'opening focuses the listbox');
assert.deepEqual(fixture.elements.rows.children.map(row => row.children[0].textContent), ['Alpha', 'Beta', 'Zulu']);
assert(fixture.elements.rows.children.every(row => row.tabIndex === -1), 'listbox options stay out of the tab order');
assert.equal(fixture.elements.rows.children[1].getAttribute('aria-selected'), 'true');

fixture.modeButtons[0].dispatch('keydown', { key: 'ArrowRight' });
assert.equal(fixture.documentRef.activeElement, fixture.modeButtons[1]);
assert.equal(fixture.elements.count.textContent, '2 results');
assert.equal(fixture.modeButtons[1].getAttribute('aria-selected'), 'true');
fixture.modeButtons[2].click();
assert.equal(fixture.elements.count.textContent, '1 result');
assert.equal(fixture.elements.rows.children[0].children[0].textContent, 'Zulu');

fixture.modeButtons[0].click();
fixture.sortButtons[0].click();
assert.deepEqual(fixture.elements.rows.children.map(row => row.children[0].textContent), ['Zulu', 'Beta', 'Alpha']);
assert.equal(fixture.sortButtons[0].dataset.sortDirection, 'descending');

fixture.elements.viewport.dispatch('keydown', { key: 'Home' });
assert.equal(fixture.elements.viewport.getAttribute('aria-activedescendant'), 'tracked-result-0');
fixture.elements.viewport.scrollTop = 460;
fixture.elements.viewport.scrollLeft = 19;
fixture.elements.viewport.dispatch('scroll');
assert.equal(fixture.elements.viewport.getAttribute('aria-activedescendant'), null, 'manual scrolling never references an unrendered option');
assert.equal(fixture.elements.columns.style.values.get('--tracked-results-scroll-x'), '19px');

fixture.elements.viewport.scrollTop = 0;
fixture.elements.viewport.dispatch('scroll');
fixture.elements.viewport.dispatch('keydown', { key: 'Home' });
fixture.elements.viewport.dispatch('keydown', { key: 'Enter' });
assert.equal(selected[0].satellite_name, 'Zulu');
assert.equal(controller.isOpen(), false);
assert.equal(fixture.documentRef.activeElement, fixture.elements.openButton, 'selection closes and restores opener focus');

fixture.elements.openButton.click();
controller.refresh([records[1]]);
assert.equal(fixture.elements.count.textContent, '1 result', 'open drawers accept refreshed filter results');
selectedNoradId = '3';
controller.refresh([records[1]]);
assert.equal(fixture.elements.rows.children[0].getAttribute('aria-selected'), 'true');
fixture.sortButtons[1].focus();
fixture.sortButtons[1].dispatch('keydown', { key: 'Escape' });
assert.equal(controller.isOpen(), false, 'Escape closes the drawer from controls outside the listbox');
assert.equal(fixture.documentRef.activeElement, fixture.elements.openButton);

controller.destroy();
fixture.elements.openButton.click();
assert.equal(controller.isOpen(), false, 'destroy removes controller bindings');

const emptyFixture = createFixture();
const emptyController = createTrackedResultsController({
  root: emptyFixture.documentRef,
  elements: emptyFixture.elements,
  getRecords: () => []
});
emptyFixture.elements.openButton.click();
assert.equal(emptyController.isOpen(), true);
assert.equal(emptyFixture.elements.viewport.hidden, true, 'zero-result drawers hide the empty listbox');
assert.equal(
  emptyFixture.documentRef.activeElement,
  emptyFixture.modeButtons[0],
  'zero-result drawers focus the selected availability tab instead of the hidden listbox'
);
emptyFixture.documentRef.activeElement.dispatch('keydown', { key: 'Escape' });
assert.equal(emptyController.isOpen(), false, 'Escape closes a zero-result drawer from its fallback focus target');
assert.equal(
  emptyFixture.documentRef.activeElement,
  emptyFixture.elements.openButton,
  'closing a zero-result drawer restores focus to its opener'
);
emptyController.destroy();

const indexSource = fs.readFileSync('index.html', 'utf8');
assert(indexSource.includes("import { createTrackedResultsController } from './js/trackedResultsController.js';"));
assert(indexSource.includes('trackedResultsController = createTrackedResultsController({'));
assert(indexSource.includes('trackedResultsController?.isOpen()) trackedResultsController.refresh(filteredTLEs)'));
assert(!indexSource.includes('trackedResultsDrawerElement'), 'index has no stale drawer-global integration');
assert(!indexSource.includes('refreshTrackedResults'), 'index delegates result refreshes to the controller');
assert(Buffer.byteLength(indexSource) <= 315_000, 'index remains within its existing release budget');

console.log('tracked results controller tests passed');
