import assert from 'assert';
import { computeCoverageGrid, summarizeCoverage } from '../js/coverage/coverageGrid.js';
import { geodeticToEcfKm } from '../js/orbit/orbitLinkGeometry.js';

function run() {
  const satEcfKm = geodeticToEcfKm(0, 0, 1200);
  const linkBudgetInput = {
    frequencyGhz: 12,
    bandwidthHz: 100e6,
    systemNoiseTempK: 290,
    txPowerDbw: 20,
    txAntennaGainDbi: 35,
    rxAntennaGainDbi: 32,
    additionalLossesDb: 4,
    requiredSnrDb: 10,
    requiredMarginDb: 3
  };

  const cells = computeCoverageGrid({
    satEcfKm,
    latStepDeg: 20,
    lonStepDeg: 20,
    minElevationDeg: 10,
    linkBudgetInput
  });

  assert(cells.length > 0, 'coverage cells generated');
  assert(cells.some(cell => cell.visible), 'at least one visible cell');
  assert(cells.some(cell => !cell.visible), 'at least one blocked cell');

  const summary = summarizeCoverage(cells);
  assert(summary.total === cells.length, 'summary total matches cells');
  assert(summary.visible > 0, 'summary visible count');

  const near = cells
    .filter(cell => cell.visible)
    .sort((a, b) => a.rangeKm - b.rangeKm)[0];
  const far = cells
    .filter(cell => cell.visible)
    .sort((a, b) => b.rangeKm - a.rangeKm)[0];

  assert(near.marginDb >= far.marginDb, 'nearer visible cell has equal or better margin');

  const beamedCells = computeCoverageGrid({
    satEcfKm,
    latStepDeg: 20,
    lonStepDeg: 20,
    minElevationDeg: 10,
    linkBudgetInput,
    beamFootprint: {
      centerLatDeg: 10,
      centerLonDeg: 10,
      halfPowerBeamwidthDeg: 6,
      maxLossDb: 40
    }
  });
  const visibleBeamedCells = beamedCells.filter(cell => cell.visible);
  const boresightCell = visibleBeamedCells
    .sort((a, b) => a.beamSeparationDeg - b.beamSeparationDeg)[0];
  const offBeamCell = visibleBeamedCells
    .sort((a, b) => b.beamSeparationDeg - a.beamSeparationDeg)[0];

  assert(boresightCell.beamLossDb < offBeamCell.beamLossDb, 'off-boresight cells accumulate more beam loss');
  assert(boresightCell.marginDb > offBeamCell.marginDb, 'beam pointing improves boresight margin');
  console.log('Coverage grid tests passed');
}

run();
