import assert from 'assert';
import {
  antennaGainDbiFromDish,
  beamwidthDeg,
  dbwToWatts,
  dopplerHz,
  evaluateLinkBudget,
  fsplDb,
  noisePowerDbw,
  propagationDelayMs,
  scanLossDb,
  wattsToDbw
} from '../js/rf/rfLinkBudget.js';

function closeTo(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function run() {
  closeTo(wattsToDbw(100), 20, 1e-12, 'watts to dBW');
  closeTo(dbwToWatts(20), 100, 1e-12, 'dBW to watts');
  closeTo(fsplDb(1000, 12), 174.03, 0.02, 'FSPL at 1000 km and 12 GHz');
  closeTo(noisePowerDbw(100e6, 290), -123.98, 0.05, 'kTB noise power');
  closeTo(propagationDelayMs(1000), 3.3356, 0.001, 'propagation delay');

  const doppler = dopplerHz(7500, 12e9);
  assert(doppler < -250000 && doppler > -310000, 'LEO-class Doppler range');

  const dishGain = antennaGainDbiFromDish(0.75, 12e9, 0.6);
  assert(dishGain > 36 && dishGain < 39, 'dish gain plausible');
  assert(beamwidthDeg(0.75, 12e9) > 2 && beamwidthDeg(0.75, 12e9) < 3, 'beamwidth plausible');
  assert(scanLossDb(60) > 2.9 && scanLossDb(60) < 3.1, 'scan loss at 60 degrees');

  const leo = evaluateLinkBudget({
    rangeKm: 1200,
    frequencyGhz: 12,
    bandwidthHz: 100e6,
    txPowerDbw: 20,
    txAntennaGainDbi: 35,
    rxAntennaGainDbi: 32,
    additionalLossesDb: 4,
    requiredSnrDb: 10,
    requiredMarginDb: 3
  });

  const geo = evaluateLinkBudget({
    rangeKm: 38000,
    frequencyGhz: 12,
    bandwidthHz: 100e6,
    txPowerDbw: 20,
    txAntennaGainDbi: 35,
    rxAntennaGainDbi: 32,
    additionalLossesDb: 4,
    requiredSnrDb: 10,
    requiredMarginDb: 3
  });

  assert(geo.pathLossDb > leo.pathLossDb, 'GEO path loss exceeds LEO path loss');
  assert(geo.requiredTxPowerDbw > leo.requiredTxPowerDbw, 'GEO required power exceeds LEO required power');

  console.log('RF link budget tests passed');
}

run();
