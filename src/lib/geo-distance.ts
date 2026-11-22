/** Distance a vol d'oiseau (formule de haversine), en kilometres. */
export const calculateDistanceKm = (
  origin: { latitude: number; longitude: number },
  target: { latitude: number; longitude: number },
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(target.latitude - origin.latitude);
  const dLng = toRad(target.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.latitude)) *
      Math.cos(toRad(target.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};
