import { test, expect } from '@playwright/test';
import { astra3b, horizons3e, mev2 as mev, intelsat as client } from '../tests/fixtures/lifeExtensionTles.js';
import { propagate, twoline2satrec } from '../vendor/satellite.js/7.1.0/satellite.es.js';
import { computeTleChecksum } from '../js/domain/catalogValidation.js';

async function spacecraftCameraDirection(page) {
  return page.evaluate(async () => {
    const {Mesh, Quaternion, Vector3} = await import('three');
    return new Promise((resolve, reject) => {
      const previous = Mesh.prototype.onBeforeRender;
      const timer = setTimeout(() => { Mesh.prototype.onBeforeRender = previous; reject(Error('No spacecraft frame')); }, 8000);
      Mesh.prototype.onBeforeRender = function(renderer, scene, camera, ...args) {
        previous.call(this,renderer,scene,camera,...args);
        const preset = scene.getObjectByName('Inspection_nadir');
        if (!preset || renderer.domElement.parentElement !== document.body) return;
        clearTimeout(timer);
        Mesh.prototype.onBeforeRender = previous;
        const attitude = preset.parent.getWorldQuaternion(new Quaternion());
        resolve(camera.getWorldDirection(new Vector3()).negate().applyQuaternion(attitude.invert()).toArray());
      };
    });
  });
}

test('Browse catalog selects each BeiDou MEO exterior with flight facts, matching downloads and adjustable views', async ({page}) => {
  await page.setViewportSize({width:1500,height:900});
  await page.route('**/refresh-elements', route => route.fulfill({json:{element_set:null}}));
  await page.goto('/display_satellite.html', {waitUntil:'domcontentloaded'});
  const facts = page.locator('#satelliteFactsGrid');
  async function select(id) {
    await page.getByRole('button',{name:'Browse catalog results'}).click();
    const results = page.locator('#trackedResultsDrawer');
    await results.getByRole('tab',{name:'All matches'}).click();
    await results.getByRole('searchbox').fill(String(id));
    await results.locator('[data-norad-id="'+id+'"]').click();
  }
  for (const [id, variant, svn, prn, area, mass, archive] of [
    [43001,'CAST','C201','C19','10.22','943','beidou-3-cast'],
    [43245,'SECM-A','C207','C29','5.40','1,010.4','beidou-3-secm-a'],
    [44794,'SECM-B','C226','C38','5.40','1,078.8','beidou-3-secm-b']
  ]) {
    await select(id);
    await expect(facts).toContainText('BeiDou-3 MEO '+variant);
    await expect(facts).toContainText(svn);
    await expect(facts.locator('.diagnostic-item').filter({hasText:'Broadcast ID (PRN)'}).locator('dd')).toContainText(prn+' (');
    await expect(facts).toContainText(area+' m²');
    await expect(facts).toContainText(mass+' kg');
    await expect(page.locator('#statusPill')).toHaveText('Ready');
    const zip = page.locator('#wavefrontDownload'), glb = page.locator('#glbDownload');
    await expect(zip).toHaveAttribute('href','obj/exports/'+archive+'.zip');
    for (const [link, magic] of [[zip,'PK'],[glb,'glTF']]) {
      const response = await page.request.get('/'+await link.getAttribute('href'));
      expect(response.ok()).toBe(true);
      expect((await response.body()).subarray(0,magic.length).toString()).toBe(magic);
    }
    await expect(page.locator('#diagnosticsGrid')).toContainText('estimated from the artwork');
    await expect(page.locator('#diagnosticsGrid')).toContainText('CSNO and SECM spacecraft illustrations');
    for (const [name, direction] of [['Earth-facing instrument',[0,0,1]],['Body side',[1,0,0]]]) {
      await page.getByRole('button',{name,exact:true}).click();
      const before = await spacecraftCameraDirection(page);
      expect(before.every((v,i)=>Math.abs(v-direction[i])<.015)).toBe(true);
      await page.mouse.move(750,530);
      await page.mouse.down();
      await page.mouse.move(840,560,{steps:8});
      await page.mouse.up();
      const after = await spacecraftCameraDirection(page);
      expect(Math.hypot(...after.map((v,i)=>v-before[i]))).toBeGreaterThan(.04);
    }
  }
  // These two vehicles share a mesh and formerly resolved to CAST. Their dated identifiers differ.
  for (const [id, svn, prn, earlier] of [[61186,'C234','C11','C47'],[61187,'C235','C13','C49']]) {
    await select(id);
    await expect(facts).toContainText(svn);
    await expect(facts).toContainText('Shanghai Engineering Center for Microsatellites');
    await expect(facts).toContainText(prn+' (from 2026-04-');
    await expect(facts).toContainText(earlier+' (2024-');
    await expect(page.locator('#glbDownload')).toHaveAttribute('href','obj/meo/beidou-3-secm-b-2024.glb');
  }
});

for (const mission of [
  {name:'Telesat LEO-1', query:'Telesat LEO-1', norad:'43113', zip:'telesat-leo-1', glb:'telesat-leo-1',
    facts:['2018-004C','Surrey Satellite Technology Ltd','168 kg','Ka-band communications demonstrator'],
    source:'SSTL flight photograph and mission data', views:['Body-mounted solar panels','Opposite quarter','End fittings']},
  {name:'Gravitas', query:'68495', norad:'68495', zip:'gravitas', glb:'ref-gravitas-68495',
    facts:['2026-067CH','K2 Space','11 hosted customer payloads','40 m (GCAT estimate)','20 kW'],
    source:'K2 Space flight report and deployment photographs', views:['Payload deck','Solar wing','Rear structure']}
]) {
  test(mission.name+' opens from the catalog with a matching textured OBJ', async ({page}) => {
    await page.setViewportSize({width:1440, height:900});
    await page.route('**/refresh-elements', route => route.fulfill({json:{element_set:null}}));
    await page.goto('/display_satellite.html', {waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Browse catalog results'}).click();
    const drawer = page.locator('#trackedResultsDrawer');
    await drawer.getByRole('tab',{name:'All matches'}).click();
    await drawer.getByRole('searchbox').fill(mission.query);
    await drawer.locator('[data-norad-id="'+mission.norad+'"]').click();
    await expect(page.locator('#statusPill')).toHaveText('Ready');
    const facts = page.locator('#satelliteFactsGrid');
    for (const fact of mission.facts) {
      await expect(facts).toContainText(fact);
    }
    await expect(page.locator('#diagnosticsGrid')).toContainText(mission.source);
    for (const label of mission.views) {
      const view = page.getByRole('button',{name:label,exact:true});
      await view.click();
      await expect(view).toHaveAttribute('aria-pressed','true');
    }
    for (const [id,path,magic] of [
      ['wavefrontDownload','obj/exports/'+mission.zip+'.zip','PK'], ['glbDownload','obj/leo/'+mission.glb+'.glb','glTF']
    ]) {
      await expect(page.locator('#'+id)).toHaveAttribute('href',path);
      const response = await page.request.get('/'+path);
      expect(response.ok()).toBe(true);
      expect((await response.body()).subarray(0,magic.length).toString()).toBe(magic);
    }
  });
}

test('Spacebus and Eurostar open the flight model, specifications and textured OBJ by NORAD', async ({page}) => {
  for (const [id, archive, fact, source] of [
    [28638,'spacebus-4000c2','38 C-band and 12 Ku-band transponders','APT Satellite'],
    [28526,'spacebus-4000c3','4,974 kg','International Launch Services'],
    [33453,'spacebus-4000c4','5,561 kg','International Launch Services'],
    [28187,'eurostar-3000','9.6 kW','EADS Astrium']
  ]) {
    await page.goto('/display_satellite.html?norad='+id);
    await expect(page.locator('#statusPill')).toHaveText('Ready');
    await expect(page.locator('#satelliteFactsGrid')).toContainText(fact);
    await expect(page.locator('#satelliteFactsGrid')).toContainText(id === 28187 ? '35 m' :
      (id === 33453 ? '35' : '38')+' m (GCAT estimate)');
    await expect(page.locator('#flightFactsSource a')).toHaveText(source);
    const url = 'obj/exports/'+archive+'.zip';
    await expect(page.locator('#wavefrontDownload')).toHaveAttribute('href',url);
    const response = await page.request.get('/'+url);
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0,2).toString()).toBe('PK');
  }
});

test('Galileo catalog aliases select the correct payload, orbit and Wavefront download', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/refresh-elements', route => route.fulfill({json:{element_set:null}}));
  await page.goto('/display_satellite.html', {waitUntil:'domcontentloaded'});
  for (const [query,id,svn,orbit,archive,sar] of [
    ['GIOVE-A',28922,'E001','MEO','giove-a',false],
    ['E101',37846,'E101','MEO','galileo-iov',false],
    ['GSAT0103',38857,'E103','MEO','galileo-iov-sar',true],
    ['E201',40128,'E201','HEO','galileo-foc',true]
  ]) {
    await page.getByRole('button',{name:'Browse catalog results'}).click();
    const drawer = page.locator('#trackedResultsDrawer');
    await drawer.getByRole('tab',{name:'All matches'}).click();
    await drawer.getByRole('searchbox').fill(query);
    await drawer.locator('[data-norad-id="'+id+'"]').click();
    await expect(page.locator('#statusPill')).toHaveText('Ready');
    const facts = page.locator('#satelliteFactsGrid');
    await expect(facts).toContainText(svn);
    await expect(facts.locator('.diagnostic-item').filter({hasText:'Orbit class'})).toContainText(orbit);
    await expect(page.locator('#wavefrontDownload')).toHaveAttribute('href','obj/exports/'+archive+'.zip');
    await expect(page.getByRole('button',{name:'Search and rescue antenna',exact:true})).toHaveCount(sar ? 1 : 0);
    const view = page.getByRole('button',{name:'Earth-facing deck',exact:true});
    await view.click();
    await expect(view).toHaveAttribute('aria-pressed','true');
  }
});

test('Argos catalog filter selects the two Kinéis antenna configurations', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/refresh-elements', route => route.fulfill({json:{element_set:null}}));
  await page.goto('/display_satellite.html',{waitUntil:'domcontentloaded'});
  const drawer = page.locator('#trackedResultsDrawer');
  await page.locator('#viewerTagFilter').getByLabel('Argos',{exact:true}).check();
  for (const [norad, archive, ais] of [['60079','kineis-ais',true],['60082','kineis-iot',false]]) {
    if (!ais) await page.getByRole('button',{name:'Browse catalog results'}).click();
    await drawer.getByRole('tab',{name:'All matches'}).click();
    await drawer.getByRole('searchbox').fill(norad);
    await drawer.locator('[data-norad-id="'+norad+'"]').click();
    await expect(page.locator('#wavefrontDownload')).toHaveAttribute('href','obj/exports/'+archive+'.zip');
    await expect(page.locator('#satelliteFactsGrid')).toContainText(norad);
    await expect(page.locator('[data-detail="argos-antenna"]')).toBeVisible();
    await expect(page.locator('[data-detail="ais-antenna"]')).toHaveCount(ais ? 1 : 0);
  }
});

test('Amazon Leo aliases and Kuiper prototypes open their own facts, cameras and archives', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/refresh-elements', route => route.fulfill({json:{element_set:null}}));
  await page.goto('/display_satellite.html',{waitUntil:'domcontentloaded'});
  const drawer = page.locator('#trackedResultsDrawer');
  for (const [query,norad,archive,fact] of [
    ['Amazon Leo','63724','kuiper-production','590, 610 and 630 km'],
    ['KuiperSat-1','58014','kuiper-protoflight','2024-09-29'],
    ['KuiperSat-2','58013','kuiper-protoflight','2025-04-29']
  ]) {
    await page.getByRole('button',{name:'Browse catalog results'}).click();
    await drawer.getByRole('tab',{name:'All matches'}).click();
    if (archive==='kuiper-protoflight') await drawer.getByLabel('Include history').check();
    await drawer.getByRole('searchbox').fill(query);
    await drawer.locator('[data-norad-id="'+norad+'"]').click();
    await expect(page.locator('#wavefrontDownload')).toHaveAttribute('href','obj/exports/'+archive+'.zip');
    await expect(page.locator('#satelliteFactsGrid')).toContainText(fact);
    const camera = page.getByRole('button',{name:'Optical link terminal',exact:true});
    await camera.click();
    await expect(camera).toHaveAttribute('aria-pressed','true');
    const visiblePart = await page.evaluate(async () => {
      const {Mesh, Raycaster, Vector3} = await import('three');
      return new Promise((resolve, reject) => {
        const previous = Mesh.prototype.onBeforeRender;
        const timeout = setTimeout(() => {
          Mesh.prototype.onBeforeRender = previous;
          reject(Error('No optical-terminal frame'));
        }, 8000);
        Mesh.prototype.onBeforeRender = function(renderer, scene, camera, ...args) {
          previous.call(this, renderer, scene, camera, ...args);
          const preset = scene.getObjectByName('Inspection_optical-terminal');
          if (!preset || renderer.domElement.parentElement !== document.body) return;
          clearTimeout(timeout);
          Mesh.prototype.onBeforeRender = previous;
          const ray = new Raycaster(camera.position, camera.getWorldDirection(new Vector3()));
          const [hit] = ray.intersectObject(preset.parent, true);
          resolve(hit?.object.name);
        };
      });
    });
    expect(visiblePart).toMatch(/^Optical[ _]aperture/);
  }
});

test('SES catalog aliases select the flight model and its OBJ outside the usual GEO filter', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/refresh-elements', route => route.fulfill({json:{element_set:null}}));
  await page.goto('/display_satellite.html', {waitUntil:'domcontentloaded'});
  for (const [query, id, archive] of [['GovSat 1','43178','govsat-1'],['NSS-K','21989','nss-k'],['Astra 3C','39617','astra-3c']]) {
    await page.getByRole('button',{name:'Browse catalog results'}).click();
    const drawer = page.locator('#trackedResultsDrawer');
    await drawer.getByRole('tab',{name:'All matches'}).click();
    await drawer.getByRole('searchbox').fill(query);
    await drawer.locator('[data-norad-id="'+id+'"]').click();
    await expect(page.locator('#statusPill')).toHaveText('Ready');
    await expect(page.locator('#satelliteFactsGrid')).toContainText(id);
    await expect(page.locator('#glbDownload')).toHaveAttribute('href','obj/geo/'+archive+'.glb');
    await expect(page.locator('#wavefrontDownload')).toHaveAttribute('href','obj/exports/'+archive+'.zip');
    const bank = page.getByRole('button',{name:'Reflector bank',exact:true});
    await bank.click();
    await expect(bank).toHaveAttribute('aria-pressed','true');
  }
});

async function openModelLibrary(page) {
  for (const id of ['modelInformation', 'modelLibraryDetails']) {
    const details = page.locator('#' + id);
    if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
  }
}

// Inspect a real rendered frame, including the spacecraft bounds, the near limb
// of Earth and the camera used by the selected viewer preset.
async function earthFraming(page) {
  return page.evaluate(async () => {
    const {Box3, Mesh, Vector3} = await import('three');
    return new Promise((resolve, reject) => {
      const previous = Mesh.prototype.onBeforeRender;
      const timeout = setTimeout(() => { Mesh.prototype.onBeforeRender = previous; reject(Error('Earth was not rendered')); }, 8000);
      Mesh.prototype.onBeforeRender = function(renderer, scene, camera, ...rest) {
        previous.call(this,renderer,scene,camera,...rest);
        if (!['Earth at propagated UTC','Reference Earth at stated altitude'].includes(this.name)) return;
        Mesh.prototype.onBeforeRender = previous;
        clearTimeout(timeout);
        const spacecraft = scene.children.find(child => child.getObjectByName('OpenBEXIPreview'));
        const bounds = new Box3().setFromObject(spacecraft, true);
        const planet = this.getWorldPosition(new Vector3()), center = bounds.getCenter(new Vector3());
        const direction = camera.getWorldDirection(new Vector3());
        const earthDepth = planet.clone().sub(camera.position).dot(direction)-this.geometry.parameters.radius*this.scale.x;
        const farSide = center.clone().sub(camera.position).dot(direction)+bounds.getSize(new Vector3()).length()/2;
        const range = planet.length();
        this.geometry.computeBoundingBox();
        const size = this.geometry.boundingBox.getSize(new Vector3()).multiply(this.scale);
        const a = planet.project(camera), b = center.project(camera);
        resolve({foreground: earthDepth > farSide, centerOffset: Math.hypot(a.x,a.y), separation: Math.hypot(a.x-b.x,a.y-b.y),
          range, size:size.toArray(), fov:camera.fov});
      };
    });
  });
}

test('life-extension catalog compares two identified TLEs and switches between flight configurations', async ({ page }) => {
  // Fixed elements and comparison time keep the mission-state regression independent of catalog refreshes.
  let records = [mev, client];
  await page.route('**/json/tle/TLE.json', route => route.fulfill({ json: records }));
  await page.goto('/display_satellite.html?catalog=life-extension&norad=46113&at=2026-11-24T12:00:00Z', { waitUntil: 'domcontentloaded' });
  const heading = page.locator('#servicePanel h3');
  await expect(heading).toHaveText('MEV-2 + Intelsat 10-02', { timeout: 45000 });
  await page.locator('#modelEarth').check();
  await page.locator('#modelFootprint').check();
  await expect(page.locator('#modelBeamNotice')).toContainText('Intelsat 10-02 · Beam 5491');
  await expect(page.locator('#diagnosticsGrid')).toContainText('obj/geo/intelsat-10-02.glb');
  await page.getByText('MEV-2 TLE · NORAD 46113 · fresh').click();
  await expect(page.locator('#servicePanel pre').first()).toHaveText(mev.tle_line1 + '\n' + mev.tle_line2);
  await expect(page.getByRole('link', { name: 'Download available TLEs' })).toHaveAttribute('download', 'norad-46113-28358.tle');
  await page.getByRole('button', { name: 'Show MEV alone' }).click();
  await expect(heading).toHaveText('MEV-2 alone');
  await expect(page.locator('#modelBeamNotice')).toContainText('No published beam');
  await expect(page.locator('#modelBeamNotice a')).toHaveCount(0);
  await page.locator('#modelEarth').uncheck();
  await page.getByRole('button', { name: 'Show docked pair' }).click();
  await expect(heading).toHaveText('MEV-2 + Intelsat 10-02');
  const clientMesh = '**/obj/geo/intelsat-10-02.glb';
  await page.route(clientMesh, route => route.abort());
  await openModelLibrary(page);
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(heading).toHaveText('MEV-2 alone');
  await expect(page.locator('#servicePanel')).toContainText('Companion model unavailable.');
  await page.unroute(clientMesh);
  records = [mev];
  await openModelLibrary(page);
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(heading).toHaveText('MEV-2 + Intelsat 10-02');
  await expect(page.locator('#servicePanel')).toContainText('Intelsat 10-02 TLE · NORAD 28358 · unavailable');
  await page.locator('[data-norad="44625"]').click();
  await expect(heading).toHaveText('MEV-1 alone');
  await expect(page.locator('#servicePanel')).toContainText('Optus D3');
  await page.getByText('Documented clients',{exact:true}).click();
  await expect(page.getByRole('link',{name:'Undocking reported 2026-08-13'})).toHaveAttribute('href',/second-mission-extension-vehicle-undocking/);
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('MEP');
  await page.locator('#modelList button').click();
  await expect(heading).toHaveText('Mission Extension Pod');
  await expect(page.locator('#servicePanel')).toContainText('No independently identified NORAD');
  await expect(page.locator('#wavefrontDownload')).toHaveAttribute('href', 'obj/exports/mep.zip');
  const archive = await page.request.get('/obj/exports/mep.zip');
  expect(archive.status()).toBe(200);
  expect((await archive.body()).subarray(0,2).toString()).toBe('PK');
  await page.locator('#modelEarth').check();
  await expect(page.locator('#modelEarthStatus')).toContainText('standalone pod');
  await expect(page.locator('#modelFootprint')).toBeDisabled();
  await expect(page.locator('#modelEarthStatus')).toContainText('Reference altitude 35,786 km');
  await expect(page.locator('#modelPositionTle')).toBeHidden();
  const pod = await earthFraming(page);
  expect(pod.foreground).toBe(true);
  expect(pod.separation).toBeLessThan(.08);
  expect(pod.range).toBeCloseTo(42164137,1);
  expect(pod.size[0]).toBeCloseTo(12756274,0);
});

test('Horizons 3e opens on its aft detail, offers its textured OBJ and uses its NORAD orbit', async ({page}) => {
  await page.route('**/json/tle/TLE.json',route=>route.fulfill({json:[horizons3e]}));
  await page.goto('/display_satellite.html?norad=43633&detail=aft&at=2026-11-24T20:44:00Z');
  await expect(page.locator('#statusPill')).toHaveText('Ready');
  await expect(page.locator('#diagnosticsGrid')).toContainText('obj/geo/horizons-3e.glb');
  const views=page.getByRole('group',{name:'Spacecraft detail views'});
  await expect(views.getByRole('button',{name:'Aft detail'})).toBeVisible();
  await views.getByRole('button',{name:'Earth-facing detail'}).click();
  await expect(page).toHaveURL(/detail=earth-facing/);
  await expect(page.locator('#wavefrontDownload')).toHaveAttribute('href','obj/exports/horizons-3e.zip');
  const archive=await page.request.get('/obj/exports/horizons-3e.zip');
  expect(archive.status()).toBe(200);
  expect((await archive.body()).subarray(0,2).toString()).toBe('PK');
  await page.locator('#modelEarth').check();
  await expect(views).toBeHidden();
  await expect(page.locator('#modelOrbitPosition')).toContainText('0.0196° S, 168.9532° E · WGS84 altitude 35,784.2 km');
  await page.locator('#modelEarth').uncheck();
  await expect(views).toBeVisible();
  await views.getByRole('button',{name:'Aft detail'}).click();
  await page.locator('#modelInformation > summary').click();
  await page.getByRole('button',{name:'Reset View'}).click();
  await expect(page).not.toHaveURL(/detail=/);
});

test('the viewer panel shows Intelsat 40e facts and component views with diagnostics closed', async ({ page }) => {
  await page.goto('/display_satellite.html?catalog=geo&norad=56174');
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/geo/56174.glb');

  const options = page.getByRole('region', { name: 'Display Options' });
  await expect(options.getByRole('heading', { name: 'Compare with' })).toBeVisible();
  await expect(options.getByRole('checkbox', { name: 'Show Earth', exact: true })).not.toBeChecked();
  const footprint = options.getByRole('checkbox', { name: 'Show footprint', exact: true });
  await expect(footprint).not.toBeChecked();
  await expect(footprint).toBeDisabled();

  const facts = page.locator('#satelliteFacts');
  const information = page.locator('#modelInformation');
  await expect(facts).toHaveJSProperty('open', true);
  await expect(facts.getByText('INTELSAT 40E (IS-40E)', { exact: true })).toBeVisible();
  await expect(facts.getByText('56174', { exact: true })).toBeVisible();
  await expect(facts.getByText('2023-04-07', { exact: true })).toBeVisible();
  await expect(facts.getByText('GEO', { exact: true })).toBeVisible();
  await expect(information).toHaveJSProperty('open', false);
  await expect(information.locator('#diagnosticsGrid')).toBeHidden();

  const instrument = options.getByRole('button', { name: 'Earth-facing instrument' });
  const reflectors = options.getByRole('button', { name: 'Reflector bank' });
  await instrument.click();
  await expect(instrument).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/detail=instrument/);
  await reflectors.click();
  await expect(reflectors).toHaveAttribute('aria-pressed', 'true');
  await expect(instrument).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL(/detail=reflectors/);

  await facts.getByText('Satellite Facts', { exact: true }).click();
  await information.getByText('GLB Information', { exact: true }).click();
  await expect(options).toBeVisible();
  await expect(facts).toHaveJSProperty('open', false);
  await expect(information.locator('#diagnosticsGrid')).toBeVisible();
  await expect(information.getByRole('button', { name: 'Copy diagnostics' })).toBeVisible();
  for (const [control, on] of [['Axes', true], ['Grid', true], ['Wireframe', false]]) {
    const button = information.locator('#toggle' + control + 'Btn');
    await expect(button).toHaveAttribute('aria-pressed', String(on));
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', String(!on));
  }
  await information.getByRole('button', {name:'Bright Background'}).click();
  await expect(information.getByRole('button', {name:'Dark Background'})).toBeVisible();
  await information.getByRole('button', {name:'Auto Fit'}).click();
  await expect(page).not.toHaveURL(/detail=/);
  await expect(page.locator('#viewerSelectionPanel')).toBeInViewport();

  await openModelLibrary(page);
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('49332');
  await page.locator('#modelList button[data-norad="49332"]').click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/geo/ses-17.glb');
  await expect(options.getByRole('button', { name: 'Side view' })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Reflector bank' })).toHaveCount(0);
  await facts.getByText('Satellite Facts', { exact: true }).click();
  await expect(facts.getByText('49332', { exact: true })).toBeVisible();
  await expect(facts.getByText('56174', { exact: true })).toHaveCount(0);
});

test('direct NORAD links show sourced spacecraft facts and confirmed decay dates', async ({ page }) => {
  const grid = page.locator('#satelliteFactsGrid');
  const fact = label => grid.locator('div').filter({
    has: page.getByText(label, { exact: true })
  }).locator('dd');

  await page.goto('/display_satellite.html?norad=56174');
  await expect(fact('Manufacturer')).toContainText('Maxar');
  await expect(fact('Launch date')).toHaveText('2023-04-07');
  await expect(fact('Launch mass')).toHaveText(/^[\d,.]+ kg(?: \(estimated\))?$/);
  await expect(fact('Decay date')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'GCAT by Jonathan C. McDowell' })).toBeVisible();

  await page.goto('/display_satellite.html?norad=15');
  await expect(fact('Satellite')).toHaveText('EXPLORER 6');
  await expect(fact('Launch date')).toHaveText('1959-08-07');
  await expect(fact('Status')).toHaveText('Decayed');
  await expect(fact('Decay date')).toHaveText('1961-06-30');
  await expect(fact('Dry mass')).toHaveText('40 kg');
});

test('conflicting fresh TLEs keep a documented MEV and client in separate positions',async({page})=>{
  const line=client.tle_line2.slice(0,43)+'181.3672'.padStart(8)+client.tle_line2.slice(51,68);
  const displaced={...client,tle_line2:line+computeTleChecksum(line)};
  await page.route('**/json/tle/TLE.json',route=>route.fulfill({json:[mev,displaced]}));
  await page.goto('/display_satellite.html?norad=46113&at=2026-11-24T12:00:00Z');
  const flight=page.locator('#servicePanel');
  await expect(flight.locator('h3')).toHaveText('MEV-2 alone');
  await expect(flight.getByRole('link',{name:'Historical docking record'})).toBeVisible();
  await expect(flight.getByRole('button',{name:'Show docked pair'})).toHaveCount(0);
  await page.locator('#viewerComparison').getByRole('button',{name:'Compare with Intelsat 10-02'}).click();
  const panel=page.locator('#viewerComparison');
  await expect(panel.locator('[data-status]')).toContainText('Showing their independent orbits.');
  await expect(panel.locator('[data-distance]')).toHaveText(/km$/);
  await expect(panel.locator('[data-positions] p:visible')).toHaveCount(2);
});

test('published beam controls use the selected orbit and only link to the source', async ({ page }) => {
  let orbitRequests = 0;
  const external = [];
  let resume;
  const pending = new Promise(resolve => { resume = resolve; });
  page.on('request', request => { if (/satbeams\.com/i.test(request.url())) external.push(request.url()); });
  await page.route('**/json/tle/TLE.json', async route => { orbitRequests++; await pending; return route.fulfill({json:[astra3b]}); });
  await page.goto('/display_satellite.html?norad=36581&at=2026-11-24T12:00:00Z');
  await expect(page.locator('#statusPill')).toHaveText('Ready');
  const earth = page.locator('#modelEarth'), footprint = page.locator('#modelFootprint');
  await expect(earth).not.toBeChecked();
  await expect(footprint).not.toBeChecked();
  await expect(footprint).toBeDisabled();
  expect(orbitRequests).toBe(0);
  await earth.check();
  await expect.poll(() => orbitRequests).toBe(1);
  await earth.uncheck();
  resume();
  await expect(page.locator('#earthCameraControls')).toBeHidden();
  await earth.check();
  await expect(page.locator('#modelEarthStatus')).toContainText('NORAD 36581 · Orbit snapshot 2026-11-24 12:00:00 UTC');
  await expect(page.locator('#modelBeamNotice')).toBeHidden();
  await footprint.check();
  await expect(page.locator('#modelBeamNotice')).toContainText('Astra 3B · Beam 6252. Published footprint unavailable');
  await expect(page.locator('#modelBeamNotice a')).toHaveAttribute('href', /satbeams\.com\/footprints\?.*beam=6252&norad=36581/);
  const behind = page.getByRole('button',{name:'Earth behind spacecraft'});
  await expect(behind).toHaveAttribute('aria-pressed','true');
  const foreground = await earthFraming(page);
  expect(foreground.foreground).toBe(true);
  expect(foreground.centerOffset).toBeLessThan(.001);
  expect(foreground.separation).toBeLessThan(.08);
  const pv = propagate(twoline2satrec(astra3b.tle_line1,astra3b.tle_line2),new Date('2026-11-24T12:00:00Z'));
  expect(foreground.range).toBeCloseTo(1000*Math.hypot(pv.position.x,pv.position.y,pv.position.z),1);
  expect(foreground.size).toEqual([12756274,12713505,12756274]);
  expect(foreground.fov).toBe(45);
  await expect(page.locator('#modelPositionTle pre')).toHaveText(astra3b.tle_line1+'\n'+astra3b.tle_line2);
  await page.getByRole('button',{name:'Fit Earth and spacecraft'}).click();
  expect((await earthFraming(page)).separation).toBeGreaterThan(.35);
  await page.locator('#modelInformation > summary').click();
  await page.getByRole('button',{name:'Reset View'}).click();
  await expect(behind).toHaveAttribute('aria-pressed','true');
  expect((await earthFraming(page)).centerOffset).toBeLessThan(.001);
  await page.reload();
  await expect(earth).toBeChecked();
  await expect(behind).toHaveAttribute('aria-pressed','true');
  await expect(footprint).not.toBeChecked();
  await earth.uncheck();
  await expect(page.locator('#modelBeamNotice')).toBeHidden();
  await expect(footprint).toBeDisabled();
  await expect(footprint).not.toBeChecked();
  expect(external).toEqual([]);
});

test('live NORAD view advances its TLE position and rejects unusable elements', async ({page}) => {
  const start = new Date('2026-11-24T12:00:00Z'), later = new Date('2026-11-24T12:02:00Z');
  let rows = [client];
  await page.route('**/api/v1/objects/*/refresh-elements', route => route.fulfill({json:{element_set:null}}));
  await page.route('**/json/tle/TLE.json', route => route.fulfill({json:rows}));
  await page.clock.setFixedTime(start);
  await page.goto('/display_satellite.html?norad=28358&earth=1');
  await expect(page.locator('#modelEarthStatus')).toContainText('NORAD 28358 · Live SGP4 orbit');
  await expect(page.locator('#modelOrbitPosition')).toContainText('12:00:00 UTC');
  await page.clock.setFixedTime(later);
  await expect(page.locator('#modelOrbitPosition')).toContainText('12:02:00 UTC');
  const p = propagate(twoline2satrec(client.tle_line1,client.tle_line2),later).position;
  const frame = await earthFraming(page);
  expect(frame.range).toBeCloseTo(1000*Math.hypot(p.x,p.y,p.z),1);
  expect(frame.centerOffset).toBeLessThan(.001);
  rows = [{...client,tle_line1:astra3b.tle_line1,tle_line2:astra3b.tle_line2}];
  await page.reload();
  await expect(page.locator('#modelEarthStatus')).toContainText('TLE for NORAD 28358 failed validation');
  await expect(page.locator('#modelOrbitPosition')).toBeHidden();
  await expect(page.locator('#earthCameraControls')).toBeHidden();
  rows = [client];
  await page.goto('/display_satellite.html?norad=28358&earth=1&at=2027-04-01T00:00:00Z');
  await expect(page.locator('#modelEarthStatus')).toContainText('TLE for NORAD 28358 is stale');
  await expect(page.locator('#modelFootprint')).toBeDisabled();
});

test('NORAD search displays a known orbit when spacecraft geometry is unavailable', async ({page}) => {
  const row = {norad_id:'14129', satellite_name:'PHASE 3B (AO-10)', orbit_class:'HEO',
    tle_line1:'1 14129U 83058B   26322.25536576 -.00000058  00000+0  00000+0 0  9997',
    tle_line2:'2 14129  26.0068 194.5549 5965809 157.7142 246.0435  2.05871676298664'};
  await page.route('**/json/tle/TLE.json', route => route.fulfill({json:[row]}));
  await page.goto('/display_satellite.html?model=mep.glb&earth=1&at=2026-11-24T12:00:00Z');
  await expect(page.locator('#modelEarthStatus')).toContainText('Reference altitude');
  await openModelLibrary(page);
  const search = page.getByRole('searchbox', {name:'Search catalog', exact:true});
  await search.fill(row.norad_id);
  await search.press('Enter');
  await expect(page.locator('#statusMessage')).toContainText('Position marker');
  await expect(page.locator('#modelEarthStatus')).toContainText('NORAD 14129 · Orbit snapshot');
  await expect(page.locator('#modelOrbitPosition')).toContainText('WGS84 altitude');
  await expect(page.locator('#modelPositionTle pre')).toHaveText(row.tle_line1+'\n'+row.tle_line2);
});

test('catalog selections load Kuiper, AMC, Astra 3B and SES-17 with their design references', async ({ page }) => {
  for (const [scope, norad, asset, source, detail] of [
    ['leo','63724','leo/kuiper-production.glb','arxiv.org','three-leaf'],
    ['leo-history','58013','leo/ref-kuiper-58013.glb','aboutamazon.com','Protoflight'],
    ['geo','33275','geo/amc-21-geostar.glb','sky-brokers.com','2.3 m'],
    ['geo','36581','geo/astra-3b.glb','space.skyrocket.de','39.8 m'],
    ['geo','49332','geo/ses-17.glb','sky-brokers.com','46 m'],
    ['meo','32708','meo/ref-a2100axs-32708.glb','news.lockheedmartin.com','AMC-14']
  ]) {
    await page.goto(`/display_satellite.html?catalog=${scope}&norad=${norad}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#statusMessage')).toContainText('Loaded obj/' + asset, { timeout: 45000 });
    await page.getByText('GLB Information', { exact: true }).click();
    await expect(page.locator('.diagnostic-item').filter({ hasText: 'Design references' }).getByRole('link', { name: source }).first()).toBeAttached();
    await expect(page.locator('.diagnostic-item').filter({ hasText: 'Model dimensions' })).toContainText(detail);
    if (norad === '36581') {
      const metric = label => page.locator('.diagnostic-item').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
      await expect(metric('Original diameter')).toHaveText('39.800');
      await expect(metric('Textures loaded')).toHaveText('3');
    }
    if (norad === '49332') {
      const diagnostics = page.locator('.diagnostics');
      const copy = diagnostics.getByRole('button', { name: 'Copy diagnostics' });
      const original = page.viewportSize();
      for (const viewport of [original, { width: 320, height: 640 }]) {
        await page.setViewportSize(viewport);
        await expect(copy).toBeVisible();
        const [meshes, materials] = await diagnostics.locator('.diagnostic-metric').evaluateAll(
          rows => rows.slice(0, 2).map(row => row.getBoundingClientRect().toJSON()));
        expect(meshes.y).toBe(materials.y);
        expect(meshes.right).toBeLessThan(materials.left);
        const box = await diagnostics.boundingBox();
        expect(box.width).toBeLessThanOrEqual(316);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(await diagnostics.evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
      }
      await page.setViewportSize(original);
    }
  }
});

test('the OBJ viewer waits for its material maps before reporting Ready', async ({ page }) => {
  const texture = '**/obj/leo/Textures/spacecraft_cells.png';
  let releaseTexture;
  const gate = new Promise(resolve => { releaseTexture = resolve; });
  await page.route(texture, async route => {
    await gate;
    await route.continue();
  });

  const requested = page.waitForRequest(texture);
  const geometry = page.waitForResponse(response => response.url().endsWith('/obj/leo/qianfan.obj'));
  try {
    await page.goto('/display_satellite.html?model=qianfan.obj', { waitUntil: 'domcontentloaded' });
    await requested;
    await (await geometry).finished();
    await expect(page.locator('#statusPill')).toHaveText('Loading');
  } finally {
    releaseTexture();
  }

  await expect(page.locator('#statusPill')).toHaveText('Ready');
  const textures = page.locator('.diagnostic-item').filter({ hasText: 'Textures loaded' });
  await expect(textures.locator('.diagnostic-value')).toHaveText('2');
  await expect(page.locator('.model-card.active')).toHaveAttribute('data-model-id', 'qianfan');
});

test('a late texture from the previous selection keeps the current model active', async ({ page }) => {
  const texture = '**/obj/leo/Textures/iridium_l_band_face.png';
  let releaseTexture;
  const gate = new Promise(resolve => { releaseTexture = resolve; });
  await page.route(texture, async route => {
    await gate;
    await route.continue();
  });
  const requested = page.waitForRequest(texture);
  try {
    await page.goto('/display_satellite.html?model=iridium', { waitUntil: 'domcontentloaded' });
    await requested;
    await openModelLibrary(page);
    await page.locator('button[data-model-id="cubesat"]').click();
    await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/cubesat.obj');
  } finally {
    releaseTexture();
  }

  await page.waitForLoadState('networkidle');
  await expect(page.locator('#statusPill')).toHaveText('Ready');
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/cubesat.obj');
  await expect(page).toHaveURL(/\?model=cubesat$/);
});

test('current and historical MEO spacecraft can be browsed, searched and reopened by NORAD', async ({ page }) => {
  await page.goto('/display_satellite.html?catalog=meo&norad=40544', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/meo/galileo-foc.glb', { timeout: 45000 });
  await expect(page.locator('.model-card.active')).toContainText('GSAT0203');
  await expect(page.locator('#modelList button')).toHaveCount(40);
  await openModelLibrary(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('o3b');
  await expect(page.locator('#modelList .model-name > span:first-child')).toHaveText(['O3b Classic', 'O3b mPOWER']);
  await expect(page.locator('#modelCount')).toHaveText(/^2 models · [\d,]+ spacecraft$/);
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('54755');
  await expect(page.locator('#modelList button')).toHaveCount(1);
  await page.locator('#modelList button').click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/meo/o3b_mpower.glb');
  await expect(page).toHaveURL(/catalog=meo&norad=54755/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.model-card.active')).toContainText('NORAD 54755');
  await openModelLibrary(page);
  await page.locator('#catalogScope').selectOption('history');
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('EXPLORER 6');
  await page.locator('#modelList button').filter({ hasText: 'NORAD 15' }).click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/meo/ref-able-probe-15.glb');
  await expect(page).toHaveURL(/catalog=history&norad=15/);
});

test('a Starlink search offers each model once and keeps the loaded mesh when the NORAD selection changes', async ({ page }) => {
  let v1Requests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/leo/starlink_V1.obj')) v1Requests++;
  });
  await page.goto('/display_satellite.html?catalog=leo&norad=44961', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/starlink_V1.obj', { timeout: 45000 });
  await openModelLibrary(page);
  const search = page.getByRole('searchbox', {name:'Search catalog', exact:true});
  const names = page.locator('#modelList .model-name > span:first-child');
  await search.fill('starlink');
  await expect(names).toHaveText(['Starlink V1', 'Starlink V2', 'Starlink V3']);
  await expect(page.locator('#modelCount')).toHaveText(/^3 models · [\d,]+ spacecraft$/);
  await expect(page.locator('#pageControls')).toBeHidden();

  for (const [query, norad] of [['STARLINK-1090', '44968'], ['NORAD 44961', '44961']]) {
    await search.fill(query);
    await expect(names).toHaveText(['Starlink V1']);
    const card = page.locator('#modelList button');
    await expect(card).toContainText('NORAD ' + norad);
    await card.click();
    await expect(page).toHaveURL(new RegExp('catalog=leo&norad=' + norad + '$'));
    await expect(page.locator('#statusPill')).toHaveText('Ready');
    await expect(page.locator('#satelliteFactsGrid').getByText(norad, { exact: true })).toBeVisible();
  }
  expect(v1Requests).toBe(1);
  await search.fill('starlink');
  await page.locator('button[data-model-id="starlink_v2.glb"]').click();
  await expect(page).toHaveURL(/catalog=leo&model=starlink_v2\.glb$/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.model-card.active .model-name > span:first-child')).toHaveText('Starlink V2');
  await openModelLibrary(page);
  await page.locator('#catalogScope').selectOption('leo-history');
  await search.fill('starlink');
  await expect(names).toHaveText(['Starlink V1', 'Starlink V2']);
});

test('library aliases across orbits open the same selectable model', async ({ page }) => {
  await page.goto('/display_satellite.html?model=leo/ref-molniya-1-9049.glb', { waitUntil: 'domcontentloaded' });
  const file = 'obj/meo/ref-molniya-1-1621.glb';
  await expect(page.locator('#statusMessage')).toContainText('Loaded ' + file);
  await openModelLibrary(page);
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('molniya-1');
  await expect(page.locator('.model-card').filter({ hasText: file })).toHaveCount(1);
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('MOLNIYA 1-S');
  await expect(page.locator('.model-card.active')).toContainText(file);
});

test('LEO and GEO scopes include live catalog membership and retain the selected orbit when empty', async ({ page }) => {
  await page.goto('/display_satellite.html?catalog=geo&norad=41866', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/geo/goes-r.glb', { timeout: 45000 });
  await page.getByText('GLB Information', { exact: true }).click();
  const references = page.locator('.diagnostic-item').filter({ hasText: 'Design references' });
  await expect(references.getByRole('link', { name: 'ospo.noaa.gov' })).toHaveAttribute('href', /GOES-RSeriesDataBook\.pdf/);
  await expect(page.locator('.diagnostic-item').filter({ hasText: 'Model dimensions' })).toContainText(/representative/i);
  await openModelLibrary(page);
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('GOES-R');
  await expect(page.locator('#modelList .model-name > span:first-child')).toHaveText(['GOES-R series']);
  await page.locator('#catalogScope').selectOption('geo-history');
  await expect(page.locator('#statusMessage')).toContainText('No historical GEO');
  await expect(page).toHaveURL(/catalog=geo-history$/);
  await page.locator('#catalogScope').selectOption('leo');
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('20580');
  await page.locator('#modelList button').filter({ hasText: 'NORAD 20580' }).click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/hubble.glb');
  await expect(references).toHaveCount(0);
  await page.locator('#catalogScope').selectOption('leo-history');
  await page.getByRole('searchbox', {name:'Search catalog', exact:true}).fill('12399');
  await page.locator('#modelList button').filter({ hasText: 'NORAD 12399' }).click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/space-shuttle.glb');
  await expect(page).toHaveURL(/catalog=leo-history&norad=12399/);
});
