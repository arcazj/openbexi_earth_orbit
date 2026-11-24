import { extensionFamilies, MEP_ASSET, mevFlights, SPACE_LOGISTICS } from './lifeExtensionCatalog.js';
import { catalogModel, modelAssetPaths, resolveSatelliteModel } from './satelliteModelResolver.js';
import { mountAttachment } from './spacecraftAttachmentMesh.js';

export async function addCompanionModel(selected, view, load, dispose, isCurrent) {
    if (!view.attachment || view.tleDisagreement || !isCurrent()) return null;
    let client;
    try {
        const {key,model} = view.companion;
        const entry = model === MEP_ASSET ? {assetId:model, directory:'geo', kind:'glb'} : catalogModel(model);
        const profile = model ? {assetId:model, attemptedPaths:modelAssetPaths(entry)} :
            resolveSatelliteModel({norad_id:key});
        client = await load(profile);
        if (!isCurrent()) {
            dispose(client);
            return null;
        }
        if (!mountAttachment(selected,client,view.attachment,view.selectedKey)) throw new Error('Missing docking interface');
        if (key===view.attachment.host.key) selected.userData.attachedHostFrame={
            position:client.position.toArray(), quaternion:client.quaternion.toArray()
        };
        view.shownPair = true;
        return client;
    } catch {
        if (client) dispose(client);
        view.modelError = true;
        return null;
    }
}

function add(parent, tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    parent.append(node);
    return node;
}

function link(parent, label, href) {
    const node = add(parent, 'a', label);
    node.href = href;
    return node;
}

export function showFlightLinks(panel) {
    panel.hidden = false;
    add(panel, 'h3', 'Mission Extension Vehicle');
    add(panel, 'p', 'Select a flight to inspect its TLE and client configuration.');
    for (const [id, flight] of Object.entries(mevFlights)) {
        const url = new URL(window.location.href);
        url.searchParams.delete('model');
        url.searchParams.set('catalog', 'life-extension');
        url.searchParams.set('norad', id);
        link(panel, flight.name + ' · NORAD ' + id, url.href);
        panel.append('  ');
    }
}

export function showFamily(panel, key, member, catalogAvailable) {
    const family = extensionFamilies[key];
    panel.hidden = false;
    add(panel, 'h3', member?.name || family.name);
    add(panel, 'p', family.description || family.role);
    if (!member) {
        add(panel, 'p', catalogAvailable === false ? 'The tracked catalog is unavailable. An independent NORAD identity for this family is unverified.'
            : 'No independently identified NORAD record or TLE is assigned to this family model.');
        const launch = add(panel, 'p');
        link(launch, 'CelesTrak records for launch 2026-167', 'https://celestrak.org/satcat/records.php?INTDES=2026-167&FORMAT=JSON');
    }
    link(panel, 'Space Logistics mission report', family.source);
}

export function showFlightEvidence(panel, caption, view) {
    const {selectedName,selectedKey,attachment,companion} = view;
    const title = view.shownPair ? selectedName+' + '+companion.name : selectedName+(mevFlights[selectedKey] || attachment ? ' alone' : '');
    panel.hidden = caption.hidden = false;
    caption.textContent = title;
    add(panel, 'h3', title);
    if (attachment) {
        const record = add(panel,'p');
        link(record, attachment.kind === 'MEP' ? 'Pod attached' : view.tleDisagreement ? 'Historical docking record' : 'Docked', attachment.source);
        record.append(' · '+attachment.docked.slice(0,10)+' · '+attachment.host.name+' + '+attachment.vehicle.name+'.');
        if (view.shownPair) add(panel,'p','Representative docking orientation.');
        if (attachment.kind === 'MEV') add(panel,'p',view.separationKm === undefined ? view.reason :
            view.separationKm.toLocaleString('en',{maximumFractionDigits:2})+' km between the independent published TLE positions.');
        if (view.modelError) add(panel,'p','Companion model unavailable. Showing '+selectedName+' alone.');
        else if (!view.tleDisagreement) {
            const button = add(panel,'button',view.shownPair ? 'Show '+(mevFlights[selectedKey] ? 'MEV' : selectedName)+' alone' : 'Show docked pair');
            button.type = 'button';
            button.dataset.togglePair = '';
        }
    } else if (mevFlights[selectedKey]) add(panel,'p',view.reason);
    add(panel, 'p', 'Compared at ' + view.at.replace('T', ' ').slice(0,19) + ' UTC');
    for (const item of view.elements) {
        const details = add(panel, 'details');
        add(details, 'summary', item.name + ' TLE · NORAD ' + item.id + ' · ' + item.status);
        if (item.line1) {
            add(details, 'p', 'Element epoch ' + item.epoch);
            add(details, 'pre', item.line1 + '\n' + item.line2);
        }
        add(details, 'p', view.source + (view.updated ? ' · snapshot ' + view.updated.slice(0,10) : ''));
        link(details, 'CelesTrak elements for ' + item.id, 'https://celestrak.org/NORAD/elements/gp.php?CATNR=' + item.id + '&FORMAT=TLE');
    }
    const available = view.elements.filter(item => item.line1 && item.line2);
    if (available.length) {
        const lines = available.flatMap(item => [item.name.replace(/[\r\n]+/g, ' '), item.line1, item.line2]);
        const download = link(add(panel, 'p'), 'Download available TLEs', 'data:text/plain;charset=utf-8,' + encodeURIComponent(lines.join('\r\n') + '\r\n'));
        download.download = 'norad-' + available.map(item => item.id).join('-') + '.tle';
    }
    if (view.missions.length) {
        const history = add(panel, 'details');
        add(history, 'summary', 'Documented clients');
        for (const client of view.missions) {
            const row = add(history, 'p');
            link(row, client.name + ' · NORAD ' + client.norad, client.source);
            row.append(' · docked ' + client.docked.slice(0,10) + (client.released ? ' · released ' + client.released.slice(0,10) : ''));
            if (client.releaseReport) {
                row.append(' · ');
                link(row,'Undocking reported '+client.releaseReport.publishedAt.slice(0,10),client.releaseReport.source);
            }
        }
        link(history, 'Operator mission history', SPACE_LOGISTICS);
    }
}
