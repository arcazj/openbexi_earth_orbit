export function satelliteShortcutLabel(satData) {
    return satData?.satellite_name || satData?.name || `NORAD ${satData?.norad_id || 'unknown'}`;
}

export function starlinkShortcutState(satData) {
    if (!satData) {
        return {
            disabled: true,
            text: 'Starlink unavailable',
            title: 'Starlink shortcut unavailable: no Starlink satellite found in loaded TLE data',
            ariaLabel: 'Starlink shortcut unavailable'
        };
    }

    const norad = satData.norad_id?.toString() || 'unknown';
    return {
        disabled: false,
        text: `Starlink (${norad})`,
        title: `Starlink shortcut: ${satelliteShortcutLabel(satData)} | NORAD ${norad}`,
        ariaLabel: `Select Starlink satellite NORAD ${norad}`
    };
}

export function issShortcutState(satData) {
    if (!satData) {
        return {
            disabled: true,
            text: 'ISS unavailable',
            title: 'ISS shortcut unavailable: no ISS/ZARYA satellite found in loaded TLE data',
            ariaLabel: 'ISS shortcut unavailable'
        };
    }

    const norad = satData.norad_id?.toString() || 'unknown';
    return {
        disabled: false,
        text: 'ISS',
        title: `ISS shortcut: ${satelliteShortcutLabel(satData)} | NORAD ${norad}`,
        ariaLabel: `Select ISS ${satelliteShortcutLabel(satData)} NORAD ${norad}`
    };
}
