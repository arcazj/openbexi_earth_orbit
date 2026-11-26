export const ALL_COMPANY_OPTION = "ALL COMPANY";

const COMPANY_LABEL_OVERRIDES = {
    [ALL_COMPANY_OPTION]: "All tags",
    BEIDOU: "BeiDou",
    DEBRIS: "Debris group",
    EUTELSAT: "Eutelsat",
    GALILEO: "Galileo",
    GEO: "Geosynchronous group",
    "GLO-OPS": "GLONASS",
    GLOBALSTAR: "Globalstar",
    "GPS-OPS": "GPS",
    HEO: "HEO group",
    HRO: "HRO group",
    INTELSAT: "Intelsat",
    "IRIDIUM-NEXT": "Iridium",
    KUIPER: "Kuiper",
    LEO: "LEO group",
    MEO: "MEO group",
    ONEWEB: "One Web",
    ORBCOMM: "Orbcomm",
    OTHER: "Other group",
    OTHERS: "Others group",
    QIANFAN: "Qianfan",
    SATNOGS: "SatNOGS",
    SES: "SES",
    STARLINK: "Starlink",
    STATIONS: "Space Station",
    TDRSS: "Tracking and Data Relay",
    WEATHER: "Weather",
    "X-COMM": "X-Comm"
};

export function formatCompanyLabel(companyName) {
    if (COMPANY_LABEL_OVERRIDES[companyName]) return COMPANY_LABEL_OVERRIDES[companyName];
    return companyName
        .toLowerCase()
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function createCompanyCheckbox(value, labelText) {
    const label = document.createElement('label');
    label.className = 'filter-chip';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.name = 'tagFilter';
    input.setAttribute('aria-label', labelText);

    const textSpan = document.createElement('span');
    textSpan.textContent = labelText;

    label.append(input, textSpan);

    return label;
}

export function isCatalogTagOption(tag) {
    const value = String(tag ?? '').trim().toUpperCase();
    return Boolean(value && value !== 'N/A' && value !== 'ACTIVE');
}
