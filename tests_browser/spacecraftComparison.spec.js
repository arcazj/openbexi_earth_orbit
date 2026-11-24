import { expect, test } from '@playwright/test';
import { astra3b, intelsat, intelsat18, mev1, mev2, optus } from '../tests/fixtures/lifeExtensionTles.js';
import { computeTleChecksum } from '../js/domain/catalogValidation.js';

const at='2026-11-24T12:00:00Z';
const url='/display_satellite.html?norad=28358&at='+at;
test.beforeEach(async ({page})=>{
    await page.route('**/json/tle/TLE.meta.json',route=>route.fulfill({json:{catalog_revision:'test-elements'}}));
    await page.route('**/json/tle/TLE.json',route=>route.fulfill({json:[intelsat,mev2,astra3b,intelsat18,optus,mev1]}));
});

// Observe an actual comparison render. The same Three.js instance drives the map and both viewers.
async function renderedFrame(page) {
    return page.evaluate(async()=>{
        const {Mesh,Vector3}=await import('three');
        return new Promise((resolve,reject)=>{
            const previous=Mesh.prototype.onBeforeRender;
            const timer=setTimeout(()=>{Mesh.prototype.onBeforeRender=previous;reject(Error('Comparison frame unavailable'));},8000);
            Mesh.prototype.onBeforeRender=function(renderer,scene,camera,...args) {
                previous.call(this,renderer,scene,camera,...args);
                if (!renderer.domElement.closest('.pair-stage')) return;
                clearTimeout(timer);Mesh.prototype.onBeforeRender=previous;
                const members=[], tracks=[];
                scene.traverse(node=>{
                    if(node.userData.comparisonMembers) members.push(node.userData.comparisonMembers);
                    if(!node.name.startsWith('Orbit of ')) return;
                    const line=node.children[0], points=line.geometry.attributes.position;
                    let extent=0;
                    for(let i=0;i<points.count;i++) {
                        const p=new Vector3().fromBufferAttribute(points,i).applyMatrix4(line.matrixWorld).project(camera);
                        extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));
                    }
                    tracks.push({name:node.name,dashed:!!line.material.isLineDashedMaterial,samples:points.count,extent});
                });
                const earth=scene.getObjectByName('Earth at propagated UTC');
                const primary=new Vector3().project(camera);
                const center=earth?.position.clone().project(camera);
                resolve({members,tracks,direction:camera.getWorldDirection(new Vector3()).toArray(),earthDepth:center?.z,primaryDepth:primary.z,
                    earthOffset:center && Math.hypot(center.x-primary.x,center.y-primary.y)});
            };
        });
    });
}

test('the primary is framed against Earth and documented assemblies stay together across main camera views', async({page})=>{
    await page.goto(url);
    const panel=page.locator('#viewerComparison');
    const main=page.getByRole('region',{name:'Main spacecraft comparison view'});
    await panel.getByRole('button',{name:'Compare with MEV-2'}).click();
    await expect(panel.locator('[data-distance]')).toHaveText('Docked');
    await expect(panel.locator('[data-trend]')).toContainText('Shared orbit · Intelsat 10-02');
    await expect(main.getByLabel('Show Earth',{exact:true})).toBeChecked();
    await expect(main.locator('.pair-tag:visible')).toHaveCount(0);
    await expect.poll(async()=>(await renderedFrame(page)).members).toEqual([['28358','46113']]);
    const close=await renderedFrame(page);
    expect(close.earthDepth).toBeGreaterThan(close.primaryDepth);
    expect(close.earthOffset).toBeLessThan(.001);
    await main.getByRole('button',{name:'Behind Intelsat 10-02',exact:true}).click();
    const fromHost=(await renderedFrame(page)).direction;
    await main.getByRole('button',{name:'Behind MEV-2',exact:true}).click();
    const fromVehicle=(await renderedFrame(page)).direction;
    expect(fromHost.reduce((sum,v,i)=>sum+v*fromVehicle[i],0)).toBeCloseTo(-1,5);
    await main.getByRole('button',{name:'View full orbit'}).click();
    await main.getByLabel('Show Orbit',{exact:true}).check();
    expect((await renderedFrame(page)).tracks).toHaveLength(1);
    const search=panel.getByLabel('Find comparison object by name or NORAD ID');
    await search.fill('36581');await search.press('Enter');
    await expect(panel.locator('[data-distance]')).toHaveText('17,830 km');
    await expect(panel.locator('[data-trend]')).toContainText('Closing');
    await expect(page.locator('.pair-line-value')).toHaveText('17,830 km');
    await expect.poll(async()=>(await renderedFrame(page)).members.flat().sort()).toEqual(['28358','36581','46113']);
    const utc=await panel.locator('time').innerText();
    await main.getByRole('button',{name:'Behind Intelsat 10-02',exact:true}).click();
    await expect(panel.getByRole('button',{name:'Behind Intelsat 10-02',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.pair-line-value')).toBeVisible();
    await expect(page.locator('.pair-line-value')).toHaveText('17,830 km');
    await expect(main.locator('.pair-tag:visible')).toHaveCount(1);
    await expect(main.locator('.pair-tag:visible')).toContainText('ASTRA 3B');
    await main.getByRole('button',{name:'Behind ASTRA 3B',exact:true}).click();
    await expect(main.locator('.pair-tag:visible')).toHaveCount(0);
    await main.getByRole('button',{name:'Reveal both'}).click();
    await expect(panel.getByRole('button',{name:'Side view'})).toHaveAttribute('aria-pressed','true');
    const globe=main.getByRole('button',{name:'Earth behind Intelsat 10-02'});
    await globe.click();await expect(page.locator('.pair-tag').last()).toContainText('Outside view');
    await main.getByRole('button',{name:'View full orbit'}).click();
    await main.getByLabel('Show Orbit',{exact:true}).check();
    const overview=await renderedFrame(page);
    expect(overview.tracks.map(t=>t.dashed)).toEqual([false,true]);
    expect(overview.tracks.every(t=>t.samples===361 && t.extent<1)).toBe(true);
    await expect(main.locator('.pair-orbit-legend li')).toHaveText(['Intelsat 10-02 + MEV-2','ASTRA 3B']);
    await main.getByLabel('Show Orbit',{exact:true}).uncheck();
    expect((await renderedFrame(page)).tracks).toHaveLength(0);
    await expect(main.locator('.pair-line-value')).toBeVisible();
    await panel.getByLabel('Show footprint',{exact:true}).check();
    await expect(panel.locator('[data-beam] a')).toHaveAttribute('href',/beam=5491/);
    await expect(panel.locator('time')).toHaveText(utc);
    await main.getByRole('button',{name:'Back to model'}).click();
    await expect(page.locator('.pair-stage')).toHaveCount(0);
    await expect(page.locator('#modelEarth')).not.toBeChecked();
});

test('a reported undocking restores both spacecraft at their own TLE positions',async({page})=>{
    await page.goto('/display_satellite.html?norad=35756&compare=44625&at=2026-11-24T20:44:00Z&view=overview&orbits=1');
    const panel=page.locator('#viewerComparison');
    await expect(panel.locator('[data-distance]')).toHaveText('77,061 km');
    await expect(panel.locator('[data-status]')).toContainText('Undocking reported 2026-08-13');
    const rows=panel.locator('[data-positions] p');
    await expect(rows.nth(0)).toContainText('0.6507° S, 156.0947° E · WGS84 altitude 35,781.3 km');
    await expect(rows.nth(1)).toContainText('0.6893° S, 23.9646° E · WGS84 altitude 35,779.3 km');
    await expect(panel.locator('time')).toContainText('2026-11-24 20:44:00 UTC');
    await panel.getByText('Orbit details',{exact:true}).click();
    await expect(panel.getByRole('link',{name:'Operator undocking report'})).toHaveAttribute('href',/northropgrumman/);
    await expect.poll(async()=>(await renderedFrame(page)).members).toEqual([['35756'],['44625']]);
    expect((await renderedFrame(page)).tracks).toHaveLength(2);
});

test('a far-side satellite has an actionable locator and its visibility updates with the camera',async({page})=>{
    await page.goto(url+'&compare=37834');
    const panel=page.locator('#viewerComparison'), main=page.locator('#comparisonStageHost');
    const locator=main.getByRole('button',{name:/Focus INTELSAT 18/});
    await expect(panel.locator('[data-visibility]')).toHaveText('INTELSAT 18 (IS-18) · Not visible behind Earth');
    await expect(locator).toContainText('Not visible behind Earth');
    const tagBounds=await locator.boundingBox(), rangeBounds=await main.locator('.pair-line-value').boundingBox();
    expect(tagBounds.y+tagBounds.height<=rangeBounds.y || rangeBounds.y+rangeBounds.height<=tagBounds.y ||
        tagBounds.x+tagBounds.width<=rangeBounds.x || rangeBounds.x+rangeBounds.width<=tagBounds.x).toBe(true);
    const utc=await panel.locator('time').textContent();
    await locator.click();
    await expect(panel.locator('[data-visibility]')).toBeEmpty();
    await expect(locator).toBeHidden();
    await main.getByRole('button',{name:'Back to primary'}).click();
    await expect(locator).toBeVisible();
    await main.getByRole('button',{name:'View full orbit'}).click();
    await expect(panel.locator('[data-visibility]')).toBeEmpty();
    await expect(main.locator('.pair-line-value')).toHaveText('84,333.5 km');
    await expect(panel.locator('time')).toHaveText(utc);
});

test('coincident independent TLE positions keep both physical models and never imply docking',async({page})=>{
    // Copy the orbit to an independently identified test spacecraft to exercise a projected overlap.
    function renumber(line) {
        const body=line.slice(0,2)+astra3b.norad_id+line.slice(7,68);
        return body+computeTleChecksum(body);
    }
    const nearby={...astra3b,tle_line1:renumber(intelsat.tle_line1),tle_line2:renumber(intelsat.tle_line2)};
    await page.route('**/json/tle/TLE.json',route=>route.fulfill({json:[intelsat,mev2,nearby]}));
    await page.goto(url+'&compare=36581');
    const main=page.locator('#comparisonStageHost');
    await expect(page.locator('#viewerComparison [data-distance]')).toHaveText('0 km');
    await expect.poll(async()=>(await renderedFrame(page)).members).toEqual([['28358','46113'],['36581']]);
    await expect(main.locator('.pair-tag:visible')).toHaveCount(0);
    await main.getByRole('button',{name:'Reveal both'}).click();
    await expect(main.getByRole('button',{name:'Side view'})).toHaveAttribute('aria-pressed','true');
    await expect(main.locator('.pair-tag:visible')).toHaveCount(0);
});

test('a snapshot replays its original elements, camera and UTC after the catalog changes', async({page,context})=>{
    await context.addInitScript(()=>{
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.snapshotText=value;}}});
    });
    await page.goto('/display_satellite.html?norad=46113&compare=36581&view=overview&orbits=1&zoom=1.15&at='+at);
    const panel=page.locator('#viewerComparison');
    await expect(panel.locator('[data-distance]')).toHaveText('17,830 km');
    await panel.getByRole('button',{name:'Copy snapshot link'}).click();
    const link=await page.evaluate(()=>window.snapshotText);
    expect(new URL(link).searchParams.get('tleRevision')).toBe('test-elements');
    expect(new URL(link).searchParams.get('at')).toBe('2026-11-24T12:00:00.000Z');
    expect(new URL(link).searchParams.get('orbits')).toBe('1');
    expect(new URL(link).searchParams.get('zoom')).toBe('1.15');
    expect(JSON.parse(new URLSearchParams(new URL(link).hash.slice(1)).get('orbits')).related[0].key).toBe('28358');
    await page.route('**/json/tle/TLE.json',r=>r.fulfill({json:[]}));
    await page.route('**/json/tle/TLE.meta.json',r=>r.fulfill({json:{catalog_revision:'new-revision'}}));
    await page.goto('about:blank');
    await page.goto(link);
    await expect(panel.locator('[data-distance]')).toHaveText('17,830 km');
    await expect(panel.getByRole('button',{name:'View full orbit',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(panel.locator('[data-range-label]')).toContainText('from Intelsat 10-02 to ASTRA 3B');
    await panel.getByText('Orbit details',{exact:true}).click();
    await expect(panel.locator('[data-details]')).toContainText('Snapshot TLEs');
    await expect(panel.locator('[data-details]')).toContainText('test-elements');
    await panel.getByRole('button',{name:'Go live',exact:true}).click();
    await expect(panel.locator('[data-distance]')).toHaveText('Distance unavailable');
    await expect(panel.locator('[data-status]')).toContainText('No published TLE');
});

test('a model-only pod remains available for equal-scale inspection and keyboard rotation',async({page})=>{
    await page.goto(url+'&compare=model:mep.glb');
    const panel=page.locator('#viewerComparison');
    await expect(panel.locator('[data-distance]')).toHaveText('Distance unavailable');
    await expect(panel.locator('[data-status]')).toContainText('no independent TLE');
    await expect(panel.getByRole('button',{name:'Inspect both models'})).toHaveAttribute('aria-pressed','true');
    await expect(panel.getByRole('button',{name:'Side view'})).toBeDisabled();
    await expect.poll(()=>page.locator('.pair-tag small').allTextContents()).toEqual(['','']);
    const stage=page.locator('.pair-stage');
    await expect(stage).toHaveClass(/pair-inspecting/);
    const canvas=stage.locator('canvas');
    await canvas.focus();await canvas.press('ArrowRight');
    await expect(page).toHaveURL(/spin=/);
    const viewport=page.viewportSize();
    const rect=await stage.boundingBox();
    expect(rect.width).toBeGreaterThan(200);
    expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width);
});
