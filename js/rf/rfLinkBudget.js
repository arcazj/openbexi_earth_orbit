export const SPEED_OF_LIGHT_MPS = 299792458;
export const BOLTZMANN_W_PER_HZ_K = 1.380649e-23;

function assertPositive(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive finite number.`);
    }
}

export function wattsToDbw(watts) {
    assertPositive(watts, 'watts');
    return 10 * Math.log10(watts);
}

export function dbwToWatts(dbw) {
    if (!Number.isFinite(dbw)) throw new Error('dbw must be finite.');
    return 10 ** (dbw / 10);
}

export function dbwToDbm(dbw) {
    if (!Number.isFinite(dbw)) throw new Error('dbw must be finite.');
    return dbw + 30;
}

export function dbmToDbw(dbm) {
    if (!Number.isFinite(dbm)) throw new Error('dbm must be finite.');
    return dbm - 30;
}

export function fsplDb(rangeKm, frequencyGhz) {
    assertPositive(rangeKm, 'rangeKm');
    assertPositive(frequencyGhz, 'frequencyGhz');
    return 92.45 + 20 * Math.log10(rangeKm) + 20 * Math.log10(frequencyGhz);
}

export function eirpDbw(txPowerDbw, txAntennaGainDbi, feederLossDb = 0, amplifierBackoffDb = 0) {
    return txPowerDbw + txAntennaGainDbi - feederLossDb - amplifierBackoffDb;
}

export function receivedPowerDbw(eirpDbwValue, rxAntennaGainDbi, pathLossDb, additionalLossesDb = 0) {
    return eirpDbwValue + rxAntennaGainDbi - pathLossDb - additionalLossesDb;
}

export function noisePowerDbw(bandwidthHz, systemNoiseTempK = 290) {
    assertPositive(bandwidthHz, 'bandwidthHz');
    assertPositive(systemNoiseTempK, 'systemNoiseTempK');
    return wattsToDbw(BOLTZMANN_W_PER_HZ_K * systemNoiseTempK * bandwidthHz);
}

export function gtDbK(rxAntennaGainDbi, systemNoiseTempK) {
    assertPositive(systemNoiseTempK, 'systemNoiseTempK');
    return rxAntennaGainDbi - 10 * Math.log10(systemNoiseTempK);
}

export function snrDb(receivedPowerDbwValue, noisePowerDbwValue) {
    return receivedPowerDbwValue - noisePowerDbwValue;
}

export function cn0DbHz(receivedPowerDbwValue, gtDbKValue, additionalLossesDb = 0) {
    // C/N0 = received carrier density relative to k, using dBW and dB/K units.
    const boltzmannDbwPerHzK = -228.6;
    return receivedPowerDbwValue + gtDbKValue - additionalLossesDb - boltzmannDbwPerHzK;
}

export function ebn0Db(cn0DbHzValue, bitRateBps) {
    assertPositive(bitRateBps, 'bitRateBps');
    return cn0DbHzValue - 10 * Math.log10(bitRateBps);
}

export function linkMarginDb(actualDb, requiredDb, implementationLossDb = 0) {
    return actualDb - requiredDb - implementationLossDb;
}

export function requiredEirpDbw({
    requiredSnrDb,
    noisePowerDbw: noisePowerDbwValue,
    pathLossDb,
    rxAntennaGainDbi,
    additionalLossesDb = 0
}) {
    return requiredSnrDb + noisePowerDbwValue + pathLossDb + additionalLossesDb - rxAntennaGainDbi;
}

export function requiredTxPowerDbw(requiredEirpDbwValue, txAntennaGainDbi, feederLossDb = 0, amplifierBackoffDb = 0) {
    return requiredEirpDbwValue - txAntennaGainDbi + feederLossDb + amplifierBackoffDb;
}

export function propagationDelayMs(rangeKm) {
    assertPositive(rangeKm, 'rangeKm');
    return (rangeKm * 1000 / SPEED_OF_LIGHT_MPS) * 1000;
}

export function dopplerHz(radialVelocityMps, carrierHz) {
    assertPositive(carrierHz, 'carrierHz');
    if (!Number.isFinite(radialVelocityMps)) throw new Error('radialVelocityMps must be finite.');
    return -(radialVelocityMps / SPEED_OF_LIGHT_MPS) * carrierHz;
}

export function antennaGainDbiFromDish(diameterM, frequencyHz, efficiency = 0.6) {
    assertPositive(diameterM, 'diameterM');
    assertPositive(frequencyHz, 'frequencyHz');
    assertPositive(efficiency, 'efficiency');
    const wavelengthM = SPEED_OF_LIGHT_MPS / frequencyHz;
    const gainLinear = efficiency * (Math.PI * diameterM / wavelengthM) ** 2;
    return 10 * Math.log10(gainLinear);
}

export function beamwidthDeg(diameterM, frequencyHz) {
    assertPositive(diameterM, 'diameterM');
    assertPositive(frequencyHz, 'frequencyHz');
    const wavelengthM = SPEED_OF_LIGHT_MPS / frequencyHz;
    return 70 * wavelengthM / diameterM;
}

export function scanLossDb(scanAngleDeg) {
    if (!Number.isFinite(scanAngleDeg)) throw new Error('scanAngleDeg must be finite.');
    const cosScan = Math.cos(Math.abs(scanAngleDeg) * Math.PI / 180);
    if (cosScan <= 0) return Infinity;
    return -10 * Math.log10(cosScan);
}

export function evaluateLinkBudget({
    rangeKm,
    frequencyGhz,
    bandwidthHz,
    systemNoiseTempK = 290,
    txPowerDbw,
    txAntennaGainDbi,
    rxAntennaGainDbi,
    feederLossDb = 0,
    amplifierBackoffDb = 0,
    additionalLossesDb = 0,
    requiredSnrDb = 10,
    requiredMarginDb = 3
}) {
    const pathLossDb = fsplDb(rangeKm, frequencyGhz);
    const eirp = eirpDbw(txPowerDbw, txAntennaGainDbi, feederLossDb, amplifierBackoffDb);
    const receivedPower = receivedPowerDbw(eirp, rxAntennaGainDbi, pathLossDb, additionalLossesDb);
    const noisePower = noisePowerDbw(bandwidthHz, systemNoiseTempK);
    const actualSnrDb = snrDb(receivedPower, noisePower);
    const requiredSnrWithMarginDb = requiredSnrDb + requiredMarginDb;
    const marginDb = actualSnrDb - requiredSnrWithMarginDb;
    const requiredEirp = requiredEirpDbw({
        requiredSnrDb: requiredSnrWithMarginDb,
        noisePowerDbw: noisePower,
        pathLossDb,
        rxAntennaGainDbi,
        additionalLossesDb
    });
    const requiredTxPower = requiredTxPowerDbw(requiredEirp, txAntennaGainDbi, feederLossDb, amplifierBackoffDb);

    return {
        pathLossDb,
        eirpDbw: eirp,
        receivedPowerDbw: receivedPower,
        noisePowerDbw: noisePower,
        snrDb: actualSnrDb,
        requiredSnrWithMarginDb,
        marginDb,
        requiredEirpDbw: requiredEirp,
        requiredTxPowerDbw: requiredTxPower,
        requiredTxPowerW: dbwToWatts(requiredTxPower),
        status: marginDb >= 0 ? 'pass' : 'fail'
    };
}
