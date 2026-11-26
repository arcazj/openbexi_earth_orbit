export const SPACE_STATION_FILTER = 'SPACE_STATION';

const stations = new Map([
    [25544, { name: 'International Space Station (ISS)', aliases: 'ISS Zarya' }],
    [48274, { name: 'Tiangong Space Station (TSS)', aliases: 'China space station Chinese space station China station CSS Tianhe 天宫 天宮 中国空间站' }]
]);

export function spaceStation(record) {
    return stations.get(Number(record?.norad_id ?? record?.NORAD_CAT_ID));
}
