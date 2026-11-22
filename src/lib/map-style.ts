export const DEFAULT_MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/** Style du fond de carte; surchargeable par NEXT_PUBLIC_MAP_STYLE_URL. */
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

/** Libreville: centre de repli quand aucune position n'est connue. */
export const DEFAULT_MAP_CENTER = { latitude: 0.4162, longitude: 9.4673 };
