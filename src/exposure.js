import { clamp, exposureEV, WEATHER } from "./optics.js";
import { filterTransmission } from "./lens-system.js";
export function exposure(s) {
  const transmission = filterTransmission(s.filter, s.ndStops, s.filterAngle);
  const sceneEV = WEATHER[s.weather].ev + Math.log2(s.light);
  const idealShutter =
    s.aperture ** 2 / (2 ** sceneEV * (s.iso / 100) * transmission);
  const shutter = s.exposureAuto
    ? clamp(idealShutter, 1 / 2000, 1 / 4)
    : s.shutter;
  const brightness =
    2 ** clamp(sceneEV - exposureEV(s.aperture, shutter, s.iso), -16, 16) *
    transmission;
  return {
    transmission,
    sceneEV,
    shutter,
    brightness,
    limited:
      s.exposureAuto && (idealShutter < 1 / 2000 || idealShutter > 1 / 4),
  };
}
