import { sensorBlur, solveLens } from "./lens-system.js";
import { constrainVisitor } from "./camera-space.js";
import { SENSOR } from "./optics.js";

export const TARGET_NAMES = { cat: "Котик", flower: "Цветок", chart: "Мишень" };

// The explanatory spot and the internal rays share the same paraxial system.
// The photograph remains the separately disclosed depth-buffer approximation.
export function lightPathObservation(state) {
  const solution = solveLens(state.focal, state.focus);
  const distance = state[state.object + "Distance"] ?? state.distance;
  const blurMm = sensorBlur(solution, distance, state.aperture);
  return {
    target: state.object,
    distance,
    blurMm,
    acceptable: blurMm <= SENSOR.coc,
    // Presentation magnification is explicit, never fed back into the model.
    spotMagnification: 24,
    rearGroupMm: solution.b,
    stopMm: solution.stopX,
  };
}

export function lightPathPortrait(width, height = width / 1.56) {
  return width < 650 || width / height < 1.05;
}

export function lightPathDock(width, height) {
  const portrait = lightPathPortrait(width, height);
  return {
    position: portrait ? [1.45, 3.45, 0] : [3.58, 3.28, 0.38],
    scale: portrait ? 1.62 : 1.75,
    rotationY: portrait ? 0 : -0.1,
    plaqueX: portrait ? 0 : -0.32,
  };
}

export function lightPathView(width, height = width / 1.56) {
  const portrait = lightPathPortrait(width, height);
  const target = portrait ? [1.65, 2.5, 0] : [0.3, 1.9, 0];
  const desired = portrait ? [1.25, 2.9, 6.2] : [-2.4, 4.2, 9.25];
  // Keep the desktop's horizontal coverage on narrower landscape/tablet screens.
  const landscapeFov = 2 * Math.atan(Math.tan(35 * Math.PI / 360) *
    Math.max(1, 1.56 / (width / height))) * 180 / Math.PI;
  return {
    pos: constrainVisitor(desired, target),
    target,
    fov: portrait ? 54 : landscapeFov,
  };
}

export function focusTargetPatch(state, target) {
  if (!Object.hasOwn(TARGET_NAMES, target)) return null;
  const distance = state[target + "Distance"];
  return {
    object: target,
    distance,
    focus: distance,
    filter: "none",
    filterBypass: false,
    experiment: undefined,
    pane: false,
  };
}
