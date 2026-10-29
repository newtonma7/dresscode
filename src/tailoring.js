export const TAILORING = Object.freeze(Object.fromEntries(Object.entries({
    shoulderWidth: { label: 'Shoulder width', min: 85, max: 115, value: 100, unit: '%' },
    shoulderSlope: { label: 'Shoulder slope', min: 0, max: 22, value: 10, unit: '°' },
    chestEase: { label: 'Chest ease', min: -8, max: 18, value: 5, unit: '% span' },
    sleeveLength: { label: 'Sleeve length', min: 75, max: 135, value: 100, unit: '%' },
    sleeveOpening: { label: 'Sleeve opening', min: 75, max: 130, value: 100, unit: '%' },
    necklineWidth: { label: 'Neckline width', min: 80, max: 125, value: 100, unit: '%' },
    necklineDepth: { label: 'Neckline depth', min: 65, max: 140, value: 100, unit: '%' },
    collarThickness: { label: 'Collar thickness', min: 60, max: 150, value: 100, unit: '%' },
}).map(([key, spec]) => [key, Object.freeze(spec)])));

export const defaultTailoring = () => Object.freeze(Object.fromEntries(Object.entries(TAILORING).map(([key, spec]) => [key, spec.value])));

export function tailoringSnapshot(current, next) {
  for (const [key, value] of Object.entries(next)) {
    const spec = TAILORING[key];
    if (!Object.hasOwn(TAILORING, key) || !Number.isFinite(value) || value < spec.min || value > spec.max) throw new RangeError(`Invalid tailoring value for ${key}`);
  }
  return Object.freeze({ ...current, ...next });
}
