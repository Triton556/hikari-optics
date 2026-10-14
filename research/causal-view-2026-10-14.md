# Causal light-path view, 2026-10-14

## Baseline and scope

- Sites v8 source: `d275053cd2ebc062cb328e44d2f2fd2fa36b3c53`, confirmed through the saved version and source checkout.
- GitHub `main`: `406eb23443d5db55916cadf1db43bf95eed443e2`, checked before work. These repositories have separate histories; neither is assumed to be the other's current head.
- The existing 16/28/50 mm recipes, three focus targets, f/11 toggle, physical rings, filters, prism, lighting, exposure, monitor close-up and safe classroom navigation are retained.
- Work stays on the cloud computer. No user desktop is used.

## Hypothesis

Keeping the live image next to the opened lens should make the consequence of a focus/aperture adjustment easier to read than switching between separate mechanism and result views. A magnified point footprint provides the missing link between a cone of rays and depth blur. The change reuses the same monitor and the existing focus shelf, rather than adding another settings panel. Desktop inspection shows the subjects, focus plane, cutaway and image together. Portrait inspection prioritizes a vertically stacked, readable lens and monitor; use the retained Scene button to examine the external subjects and focus plane.

## Implementation

- Lens inspection docks the existing monitor next to the cutaway and restores it at other stations.
- The focal shelf initially opens this combined view. Existing scene and image close-ups remain available.
- Focus-target shortcuts select both the target of the ray explanation and its actual focus distance.
- The focus plane and approximate depth-of-field band remain available in the combined inspection even after closing the shelf.
- A reused canvas/texture shows the numeric paraxial blur diameter and a symbolic 24× enlarged spot. There is no new render target or per-frame optical solve for this annotation.
- Finger targets on the existing focus shelf have a 44 px minimum height. Selected ring labels are distinguished from hover, and the selection marker follows the moving iris.

## Scientific boundaries

The nine-element solver and the ray bundles are paraxial geometric optics. Colored bundles identify separate object points; they are not wavelengths. The visible glass profiles are illustrative. The adjacent upright photograph is captured from the shared world and blurred using depth-buffer CoC, not reconstructed by integrating the traced bundles. The footprint's grid is symbolic; a display floor and clipping preserve legibility while the numeric diameter remains unchanged. External distances are compressed to fit a bench. No diffraction, interference, calibrated sensor noise, full optical aberration model or production lens prescription is claimed.

## Reference provenance

[Cameras and Lenses](https://ciechanow.ski/cameras-and-lenses/) was read through the original page and the cloud browser. On the initial Chromium attempt, its interactive diagrams did not initialize: `createBuffer` failed because no WebGL context was available. This is a renderer limitation, not a claim to have exercised those diagrams. No third-party code or assets were copied. The original HTTPS page was also attempted in Firefox; it reported “Unable to connect”. Interactive reference controls could therefore not be exercised in this environment. The textual optical principles were studied; this limitation is disclosed rather than equating article reading with live diagram testing.

## Verification

- Initial unchanged source: 67/67 tests passed; production build passed.
- Final: 72/72 tests passed; production build passed, with Vite's existing >500 kB chunk-size warning. `git diff --check` passed.
- Five new numeric/projection tests cover the selected-target spot, aperture/spot relationship without group motion, focus/group/spot coupling, and bounded combined-view camera destinations.
- The portable Sites preview was started with the installed Node/Vite runtime in a native cloud terminal, using documented CUA input. It is reachable at localhost from the cloud browser.
- Chromium and a standard software-GL Chromium profile both reported unavailable/blocked WebGL2. No GPU block-list or browser protection was disabled.
- Official Firefox 158.0 was downloaded from Mozilla's linked distribution, using the user's existing permission. Its Terms Continue step was completed after the owner explicitly accepted the linked agreement; optional diagnostics were left off. It renders the classroom with ordinary browser protections intact.
- Eight final real browser checks passed after explicit post-docking redraw; the downloadable report is `qa/causal-browser-results.json`. At 50 mm, moving focus 1.5→3 m changed the rear group and sensor image (mean RGB difference 3.9422/255); closing f/5.6→f/11 reduced point diameter 0.134195→0.068317 mm without group motion and changed pixels by 0.78923/255. Docking the monitor alone changed no sensor pixels.
- Actual desktop screenshots revealed a plaque occlusion and a frame-action overlay. Both were repositioned. The shelf's first-opening synchronization bug was corrected and checked from the table/welcome. Portrait QA revealed an excessively wide view; it now stacks the large live monitor above the lens. Physical focus drag and keyboard increments were checked in the combined view. Focus 0.55→0.59→1.00→1.56→3.07 m changes the plane, translating group, point spot, and actual photograph at fixed 50 mm and f/5.6. At fixed focus 0.55 m, aperture dragging 5.6→8→11 and keyboard 11→11.5 shrink the iris, cone and spot while improving the same photograph. Reopening returns f/5.6. Desktop close-up and Escape return were checked, as was an extreme room orbit/zoom without wall or ceiling clipping.
- An independent source review found and closed portrait-tablet clipping and a stale-frame QA comparison. The monitor subtree is excluded from the photo camera and from casting shadows. 72/72 unit tests include full monitor/plaque projection bounds at eight phone/tablet/desktop sizes.
- Numeric/build tests do not replace graphics acceptance. Interactive reference testing remains unavailable as described above.
- Both sampled-state GIFs were encoded from real native browser pixels and decoded for visual review. Publication is the next step; final deployment identities are recorded separately to avoid confusing GitHub and Sites histories.

The saved JSON report and curated media accompany the source. See `qa/causal-captures/README.md` for capture provenance.

## Captured states

1. Same 50 mm camera, f/5.6, cat fixed at 1.5 m: move only focus 1.50→0.55→0.59→1.00→1.56→3.07 m; show the plane, translating group, bundle, point diameter and photograph together.
2. Same focus and framing, an out-of-focus target: stop down to f/11 and reopen; show the iris, narrowing bundle, smaller spot and wider sharp region.
3. Desktop and portrait stills, plus a monitor close-up and return-to-table state.

The GIFs are sampled UI states held for readability, not frame-rate evidence. No synthetic optical interpolation is used. Portrait is browser-emulated 390×720, not a tested physical phone.
