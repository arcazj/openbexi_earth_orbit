import { comparisonElements, comparisonLink, comparisonObject, comparisonSnapshot, findComparisonObjects,
    loadComparisonDirectory, servicingPartner } from './comparisonCatalog.js';
import { loadPublishedTles } from './publishedTleCatalog.js';

const views = ['side','behind-a','behind-b','earth','overview','models'];
const viewNames = ['Side view','Behind A','Behind B','Earth behind A','View full orbit','Inspect both models'];
const cameraButtons = views.map((key,i)=>
    '<button type="button" data-view="'+key+'" aria-pressed="false">'+viewNames[i]+'</button>').join('');
const stageMarkup = '<div class="pair-stage" aria-label="Comparison scene" aria-busy="true">'+
    [0,1].map(i=>'<i class="pair-leader pair-'+i+'" hidden></i><i class="pair-dot pair-'+i+'" hidden></i><button type="button" class="pair-tag pair-'+i+'" data-focus="'+i+'" hidden><b></b><small></small></button>').join('')+
    '<span class="pair-line-value" hidden></span></div>';
const panelMarkup = '<h3>Compare with</h3><button type="button" data-partner hidden></button>'+
    '<input data-search type="text" autocomplete="off" aria-label="Find comparison object by name or NORAD ID" placeholder="Name or NORAD ID">'+
    '<div class="pair-results" data-results hidden></div><div class="pair-content" data-content hidden>'+
    '<div class="pair-heading"><span data-names></span><button type="button" data-end>End comparison</button></div>'+
    '<div data-slot></div><div class="pair-measure"><span data-range-label>Estimated separation</span><strong data-distance>…</strong><span data-trend></span></div>'+
    '<div class="pair-time"><time data-time></time><button type="button" data-clock>Pause</button></div>'+
    '<div class="pair-positions" data-positions hidden><strong>TLE positions</strong><p></p><p></p></div>'+
    '<p class="pair-status" data-status role="status"></p><p data-visibility role="status"></p><p data-geometry role="status"></p>'+
    '<div class="pair-views" role="group" aria-label="Comparison camera">'+cameraButtons+'</div>'+
    '<div class="pair-earth"><label><input type="checkbox" data-earth> Show Earth</label>'+
    '<label><input type="checkbox" data-orbits> Show Orbit</label>'+
    '<label><input type="checkbox" data-footprint disabled> Show footprint</label></div><p data-beam hidden></p>'+
    '<button type="button" data-reveal hidden>Reveal both</button> <button type="button" data-primary hidden>Back to primary</button>'+
    '<details data-details><summary>Orbit details</summary><div></div></details>'+
    '<div class="pair-actions"><button type="button" data-copy>Copy snapshot link</button><a data-expand target="_blank" rel="noopener" hidden>Open full comparison</a></div>'+
    '<div data-copy-status role="status"></div><input data-copy-field type="text" readonly aria-label="Snapshot link" hidden></div>';

export function mountSpacecraftComparison(host, options = {}) {
    host.classList.add('spacecraft-comparison');
    host.innerHTML=panelMarkup;
    const el=name=>host.querySelector('[data-'+name+']');
    const field=el('search'), results=el('results'), content=el('content');
    const workspace=document.createElement('div');
    workspace.className='pair-workspace';
    workspace.innerHTML='<div class="pair-camera-toolbar" role="group" aria-label="Main comparison camera controls">'+
        '<div class="pair-main-presets">'+cameraButtons+'</div><div class="pair-main-actions">'+
        '<label><input type="checkbox" data-main-earth> Show Earth</label>'+
        '<label><input type="checkbox" data-main-orbits> Show Orbit</label>'+
        '<button type="button" data-reveal hidden>Reveal both</button><button type="button" data-primary hidden>Back to primary</button>'+
        '<button type="button" data-back></button></div></div><ul class="pair-orbit-legend" aria-label="Comparison orbit legend" hidden></ul>';
    workspace.querySelector('[data-back]').textContent=options.getClock ? 'Back to map' : 'Back to model';
    const mainEarth=workspace.querySelector('[data-main-earth]');
    const mainOrbits=workspace.querySelector('[data-main-orbits]');
    const legend=workspace.querySelector('.pair-orbit-legend');
    const mainReveal=workspace.querySelector('[data-reveal]');
    const viewButtons=[...host.querySelectorAll('[data-view]'),...workspace.querySelectorAll('[data-view]')];
    let primary, secondary, suggested, matches=[], generation=0, searchRequest=0, timer;
    let scene, api, beams, data, prepared, instant, outcome, stage, saved, errorMessage='';
    let view='earth', orbitView='earth', fixed=null, pinError='', clockStamp='', directoryRows=[], tleRows=[];
    let homeZoom=1, missionStamp='';
    let initialUrl=options.initialUrl;
    const initialAt=initialUrl?.searchParams.get('at');
    if (initialAt !== null && initialAt !== undefined) fixed=Date.parse(initialAt);
    const clock=()=>options.getClock ? options.getClock() :
        {timeMs:fixed ?? Date.now(),live:fixed===null,rate:fixed===null ? 1 : 0};
    function updatePartner() {
        suggested=primary && servicingPartner(primary.key,clock().timeMs);
        const button=el('partner');
        button.hidden=!suggested || secondary?.key===suggested.key;
        if (suggested) button.textContent='Compare with '+suggested.name;
    }
    function hideResults() {searchRequest++;results.replaceChildren();results.hidden=true;matches=[];}
    function showResults() {
        const query=field.value.trim();
        matches=findComparisonObjects(query,primary?.key,[...(options.rows?.() || []),...tleRows,...directoryRows]);
        results.replaceChildren();
        results.hidden=!query;
        for (const item of matches) {
            const button=document.createElement('button');
            button.type='button';button.dataset.key=item.key;button.textContent=item.name;
            const id=document.createElement('small');
            id.textContent=item.key.startsWith('model:') ? 'Model / mission' : 'NORAD '+item.key;
            button.append(id);results.append(button);
        }
        if (query && !matches.length) results.textContent='No matching objects';
    }
    async function search() {
        const token=++searchRequest;
        if (!field.value.trim()) {hideResults();return;}
        showResults();
        await Promise.allSettled([
            tleRows.length ? null : loadPublishedTles().then(c=>{tleRows=[...c.records.values()]; if(token===searchRequest) showResults();}),
            directoryRows.length ? null : loadComparisonDirectory().then(rows=>{directoryRows=rows;if(token===searchRequest) showResults();})
        ]);
    }
    function end(notify=true) {
        generation++;clearInterval(timer);timer=null;hideResults();
        scene?.dispose();scene=null;stage?.remove();stage=null;workspace.remove();
        secondary=null;data=prepared=instant=outcome=saved=null;errorMessage=pinError=clockStamp=missionStamp='';
        homeZoom=1;legend.hidden=true;
        content.hidden=true;field.value='';el('copy-field').hidden=true;el('copy-status').textContent='';
        el('details').open=false;
        updatePartner();
        if(notify) options.onActive?.(false);
    }
    function setPrimary(item) {
        if (item?.key===primary?.key) {if(item) {primary=item;updatePartner();} return;}
        if (secondary) end();
        else {hideResults();field.value='';}
        primary=item;
        host.hidden=!primary;
        if (!primary) return;
        updatePartner();
        if (initialUrl) {
            const url=initialUrl;
            const key=url.searchParams.get('norad') || url.searchParams.get('object') || url.searchParams.get('sat') || 'model:'+url.searchParams.get('model');
            if (primary.key===key || (url.searchParams.get('model') && primary.model===url.searchParams.get('model'))) {
                initialUrl=null;
                const other=url.searchParams.get('compare');
                if (other && other!==primary.key && (/^[1-9]\d{0,8}$/.test(other) || /^model:[\w./-]{1,140}$/.test(other))) {
                    choose(comparisonObject(other),url);
                }
            }
        }
    }
    function makeLink(snapshot=false) {
        if (!data || !instant || !Number.isFinite(instant.getTime()) || pinError) return null;
        const url=comparisonLink({...data,date:snapshot || !clock().live ? instant : null,
            view,earth:el('earth').checked,footprint:el('footprint').checked,orbits:el('orbits').checked,snapshot});
        if (view==='models' && scene?.spin.some(v=>v!==0)) url.searchParams.set('spin',scene.spin.join(','));
        if (scene && scene.zoom!==1) url.searchParams.set('zoom',String(scene.zoom));
        const pose=scene?.pose;
        if (pose) url.searchParams.set('compareCamera',pose.join(','));
        if (homeZoom!==1) url.searchParams.set('primaryZoom',String(homeZoom));
        return url;
    }
    function syncLink() {
        const link=makeLink(!!saved);
        if (!link) return;
        if (options.onLink) options.onLink(link);
        else {el('expand').href=link.href;el('expand').hidden=false;}
    }
    function details() {
        const box=el('details').querySelector('div');
        box.replaceChildren();
        const systems=outcome?.systems || [];
        const keys=new Set(data.objects.map(item=>item.key));
        for (const {attachment} of systems) {
            if (!attachment) continue;
            keys.add(attachment.host.key);keys.add(attachment.vehicle.key);
        }
        for (const {item,elements,error} of prepared.records.values()) {
            if (!keys.has(item.key)) continue;
            const p=document.createElement('p');
            p.textContent=item.name+(item.key.startsWith('model:') ? '' : ' · NORAD '+item.key)+' · '+(elements ? 'TLE epoch '+elements.epoch : error);
            box.append(p);
        }
        for (const record of new Set(systems.map(system=>system.attachment).filter(Boolean))) {
            const p=document.createElement('p'), link=document.createElement('a');
            link.href=record.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Mission record';
            p.append(record.host.name+' + '+record.vehicle.name+' · attached '+record.docked.slice(0,10)+'. Representative docking orientation. ',link);
            box.append(p);
        }
        const ended=outcome?.ended;
        if (ended) {
            const p=document.createElement('p'), link=document.createElement('a');
            link.href=ended.releaseReport?.source || ended.source;link.target='_blank';link.rel='noopener noreferrer';
            link.textContent='Operator undocking report';
            p.append(ended.vehicle.name+' and '+ended.host.name+' · ',link);
            box.append(p);
        }
        const rev=document.createElement('p');rev.textContent=(data?.source || '')+' · Revision '+(data?.revision || 'unavailable');
        box.append(rev);
    }
    function renderLegend(systems) {
        legend.hidden=!systems?.length || (!el('orbits').checked && !['overview','models'].includes(view));
        if (legend.hidden) return;
        const labels=(outcome.shared ? systems.slice(0,1) : systems).map(system=>system.label);
        const key=labels.join('|')+el('orbits').checked+view;
        if (legend.dataset.legend===key) return;
        legend.dataset.legend=key;
        legend.replaceChildren(...labels.map((label,i)=>{
            const li=document.createElement('li');
            li.className='pair-'+i;
            li.textContent=label+(outcome.shared && view!=='models' ? ' · shared orbit' : '');
            return li;
        }));
        legend.classList.toggle('pair-show-tracks',el('orbits').checked && view!=='models');
    }
    function notices(visibility,notes) {
        if (el('visibility').textContent!==visibility) el('visibility').textContent=visibility;
        const message=notes.filter(Boolean).join(' ');
        if (el('geometry').textContent!==message) el('geometry').textContent=message;
    }
    function update() {
        if (!secondary || !data || !prepared) return;
        const time=clock();
        instant=new Date(time.timeMs);
        outcome=Number.isFinite(instant.getTime()) && !pinError ? api.comparisonAt(prepared,instant) : {errors:[pinError || 'Invalid comparison UTC.']};
        const valid=!!outcome.poses;
        view=valid ? orbitView : 'models';
        if (!el('earth').checked && view==='earth') view=orbitView='primary';
        const systems=outcome.systems;
        const references=systems?.map(system=>system.reference.item.name);
        el('range-label').textContent=outcome.shared ? systems[0].label : systems?.some(s=>s.attachment) && valid ?
            'Estimated range from '+references[0]+' to '+references[1] : 'Estimated separation';
        el('distance').textContent=outcome.status || (valid ? outcome.measurement.text : 'Distance unavailable');
        el('trend').textContent=outcome.shared && valid ? 'Shared orbit · '+references[0] : valid ? outcome.measurement.trend : '';
        const ended=outcome.ended;
        const release=ended?.released ? 'Undocked '+ended.released.slice(0,10)+'.' : ended?.releaseReport ?
            'Undocking reported '+ended.releaseReport.publishedAt.slice(0,10)+'.' : '';
        el('status').textContent=[release,...(outcome.warnings || []),...(outcome.errors || []),errorMessage].filter(Boolean).join(' ');
        const prefix=time.live ? 'Live' : time.rate===0 ? 'Paused' : 'Simulation';
        el('time').textContent=prefix+' · '+(Number.isFinite(instant.getTime()) ? instant.toISOString().slice(0,19).replace('T',' ')+' UTC' : 'Invalid UTC');
        el('clock').textContent=time.rate!==0 ? 'Pause' : options.getClock ? 'Resume live' : 'Go live';
        el('clock').hidden=!!options.getClock && !options.changeClock;
        const positions=el('positions');
        const orbits=new Map();
        for (const system of systems || []) {
            const ref=system.observed.pose ? system.observed : system.reference;
            if (ref.pose) orbits.set(ref.item.key,ref);
        }
        positions.hidden=orbits.size===0;
        const rows=Array.from(orbits.values());
        positions.querySelectorAll('p').forEach((p,i)=>{
            const ref=rows[i];
            p.hidden=!ref;
            if (ref) p.textContent=ref.item.name+' · NORAD '+ref.item.key+'\n'+api.formatTlePosition(ref.pose.geodetic);
        });
        el('copy').disabled=!!pinError || !Number.isFinite(instant.getTime());
        viewButtons.forEach(button=>{
            const key=button.dataset.view;
            button.disabled=key!=='models' && !valid;
            button.setAttribute('aria-pressed',String(key===view));
        });
        mainReveal.hidden=el('reveal').hidden=!valid || !['behind-a','behind-b','earth','focus-b','primary'].includes(view);
        workspace.querySelector('[data-primary]').hidden=el('primary').hidden=!valid || ['earth','primary'].includes(view);
        mainEarth.checked=el('earth').checked;
        mainOrbits.checked=el('orbits').checked;
        mainOrbits.disabled=el('orbits').disabled=!valid;
        el('footprint').disabled=!valid || !el('earth').checked || view==='models';
        const footprintOn=!el('footprint').disabled && el('footprint').checked;
        const beam=footprintOn ? systems.map(system=>beams.publishedBeam(system.host.key)).find(Boolean) : null;
        beams.showBeamNotice(el('beam'),beam,footprintOn ? 'No published beam in this catalog for either spacecraft.' : '');
        scene?.update(outcome,view,el('earth').checked,beam,el('orbits').checked);
        renderLegend(systems);
        const missions=(systems?.map(s=>s.key+'/'+s.reference.item.key+'/'+(s.attachment?.docked || '')).join('|') || '')+(ended?.docked || '');
        if(missions!==missionStamp) {missionStamp=missions;details();}
        const stamp=prefix+view+String(valid);
        if(clockStamp!==stamp || !time.live && !options.onLink) {clockStamp=stamp;syncLink();}
        updatePartner();
    }
    async function choose(item,url=null) {
        if (!primary || item.key===primary.key) return;
        end(false);
        secondary=item;const token=generation;
        const preset=url?.searchParams.get('compareView') || url?.searchParams.get('view');
        const legacySnapshot=url?.searchParams.has('tleRevision') && !url.searchParams.has('earth');
        el('earth').checked=!legacySnapshot && url?.searchParams.get('earth')!=='0';
        orbitView=[...views,'primary','focus-b'].includes(preset) ? preset : el('earth').checked ? 'earth' : 'primary';
        el('orbits').checked=url?.searchParams.has('orbits') ? url.searchParams.get('orbits')==='1' : !!options.orbits?.();
        el('footprint').checked=url?.searchParams.get('footprint')==='1';
        el('distance').textContent='…'; el('trend').textContent=el('time').textContent='';
        el('status').textContent='Loading comparison…';notices('',[]);el('details').querySelector('div').replaceChildren();
        el('positions').hidden=true;
        el('expand').hidden=true;el('copy').disabled=true;el('reveal').hidden=true;
        viewButtons.forEach(button=>{button.disabled=true;button.setAttribute('aria-pressed','false');});
        content.hidden=false;stage=document.createRange().createContextualFragment(stageMarkup).firstElementChild;
        mainEarth.checked=el('earth').checked;mainOrbits.checked=el('orbits').checked;mainReveal.hidden=true;
        workspace.querySelector('[data-primary]').hidden=el('primary').hidden=true;
        workspace.append(stage);(options.stageHost || el('slot')).append(workspace);options.onActive?.(true);
        if (!url && options.onLink && matchMedia('(max-width: 900px)').matches) {
            requestAnimationFrame(()=>workspace.scrollIntoView({block:'start'}));
        }
        el('names').textContent=primary.name+' / '+item.name;updatePartner();
        let lookup;
        try {
            if (url) saved=comparisonSnapshot(url,[primary.key,item.key]);
            lookup=saved || await comparisonElements([primary,item]);
        } catch(error) {
            if(token!==generation) return;
            if (url && (new URLSearchParams(url.hash.slice(1)).has('orbits') || url.searchParams.has('tleRevision'))) pinError=error.message;
            else errorMessage='The published TLE catalog could not be loaded.';
            lookup={revision:'unavailable',source:'Orbital elements unavailable',objects:[primary,item]};
        }
        if (token!==generation) return;
        try {
            const modules=await Promise.all([import('./spacecraftComparisonScene.js'),import('./publishedBeamFootprints.js')]);
            if(token!==generation) return;
            [api,beams]=modules;data=lookup;prepared=api.prepareComparison(data);
            const [a,b]=data.objects;
            el('names').textContent=a.name+' / '+b.name;
            const names={'behind-a':'Behind '+a.name,'behind-b':'Behind '+b.name,earth:'Earth behind '+a.name};
            for (const button of viewButtons) {
                if (names[button.dataset.view]) button.textContent=names[button.dataset.view];
            }
            try {
                scene=api.createComparisonScene(stage,data.objects,syncLink,options.library?.(),notices);
                scene.resetCamera({
                    zoom: Number(url?.searchParams.get('zoom')) || 1,
                    pose: url?.searchParams.get('compareCamera')?.split(',').map(Number),
                    spin: url?.searchParams.get('spin')?.split(',').map(Number)
                });
                homeZoom=Number(url?.searchParams.get('primaryZoom')) || 1;
            } catch {errorMessage='3D rendering is unavailable in this browser.';}
            stage.setAttribute('aria-busy','false');
            details();update();syncLink();
            let nextCatalogCheck=Date.now()+300000;
            timer=setInterval(async()=>{
                update();
                if (saved || pinError || !clock().live || Date.now()<nextCatalogCheck) return;
                nextCatalogCheck=Date.now()+300000;
                try {
                    const latest=await comparisonElements(data.objects);
                    if (token!==generation || !clock().live || latest.revision===data.revision && latest.revision!=='unversioned') return;
                    data=latest; prepared=api.prepareComparison(data);
                    details();update();syncLink();
                } catch { /* The current set continues to be checked for freshness at each UTC. */ }
            },1000);
        } catch {
            if(token===generation) {stage.setAttribute('aria-busy','false');el('distance').textContent='Distance unavailable';el('status').textContent='The comparison viewer could not load.';}
        }
    }
    el('partner').addEventListener('click',()=>{if(suggested) choose(suggested);});
    field.addEventListener('input',search);
    field.addEventListener('keydown',event=>{
        if (event.key==='Escape') {hideResults();return;}
        if (event.key==='ArrowDown') {event.preventDefault();results.querySelector('button')?.focus();}
        if (event.key==='Enter' && matches[0]) {event.preventDefault();choose(matches[0]);}
    });
    results.addEventListener('click',event=>{
        const match=matches.find(item=>item.key===event.target.closest('button')?.dataset.key);
        if(match) choose(match);
    });
    results.addEventListener('keydown',event=>{
        if(event.key==='Escape') {hideResults();field.focus();return;}
        if(event.key==='ArrowDown' || event.key==='ArrowUp') {
            event.preventDefault();
            (event.key==='ArrowDown' ? event.target.nextElementSibling : event.target.previousElementSibling || field)?.focus();
        }
    });
    host.addEventListener('focusout',event=>{
        if(event.relatedTarget && !host.contains(event.relatedTarget)) hideResults();
    });
    function chooseView(event) {
        const button=event.target.closest('[data-view],[data-reveal],[data-primary],[data-focus]');
        if(!button || button.disabled) return;
        if (['earth','primary'].includes(view)) homeZoom=scene?.zoom || 1;
        if (button.hasAttribute('data-primary')) orbitView=el('earth').checked ? 'earth' : 'primary';
        else if (button.hasAttribute('data-focus')) orbitView='focus-b';
        else orbitView=button.dataset.view || 'side';
        if (orbitView==='earth') el('earth').checked=true;
        scene?.resetCamera({zoom: button.hasAttribute('data-primary') ? homeZoom : 1});
        update();syncLink();
        if (button.hasAttribute('data-focus')) workspace.querySelector('[data-primary]').focus({preventScroll:true});
        if (button.hasAttribute('data-primary')) (workspace.querySelector('[aria-pressed="true"]') || stage.querySelector('canvas'))?.focus({preventScroll:true});
    }
    host.addEventListener('click',chooseView);
    workspace.addEventListener('click',chooseView);
    mainEarth.addEventListener('change',()=>{
        el('earth').checked=mainEarth.checked;
        el('earth').dispatchEvent(new Event('change'));
    });
    function setOrbits(checked,notify=false) {
        el('orbits').checked=checked;
        if (notify) options.onOrbitsChange?.(checked);
        update();syncLink();
    }
    mainOrbits.addEventListener('change',()=>setOrbits(mainOrbits.checked,true));
    el('orbits').addEventListener('change',()=>setOrbits(el('orbits').checked,true));
    workspace.querySelector('[data-back]').addEventListener('click',()=>{end();field.focus({preventScroll:true});});
    el('earth').addEventListener('change',()=>{
        if (!el('earth').checked) el('footprint').checked=false;
        else if (orbitView==='primary') orbitView='earth';
        update();syncLink();
    });
    el('footprint').addEventListener('change',()=>{update();syncLink();});
    el('end').addEventListener('click',()=>{end();field.focus();});
    el('clock').addEventListener('click',()=>{
        if(!instant) return;
        const pause=clock().rate!==0;
        if(options.changeClock) options.changeClock(pause);
        else fixed=pause ? instant.getTime() : null;
        if(!pause && (saved || pinError)) {
            const live=makeLink() || comparisonLink({objects:[primary,secondary],view,earth:el('earth').checked,orbits:el('orbits').checked,footprint:el('footprint').checked});
            choose(secondary,live);
            return;
        }
        update();syncLink();
    });
    el('copy').addEventListener('click',async()=>{
        const link=makeLink(true);
        if(!link) return;
        try {await navigator.clipboard.writeText(link.href);el('copy-status').textContent='Snapshot link copied.';}
        catch {const input=el('copy-field');input.value=link.href;input.hidden=false;input.focus();input.select();el('copy-status').textContent='Snapshot link ready to copy.';}
    });
    return {setPrimary,end,setOrbits,get active(){return !!secondary;}};
}
