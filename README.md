<div align="center">

# HIKARI
### A small classroom. A world of optics.

An interactive 3D lab for exploring what happens **inside a camera lens**.

[Open the hosted demo](https://hikari-optics.blondperch32.chatgpt.site) · [Run locally](#run-locally) · [How it works](#under-the-glass)

![Hikari lens cutaway: glass elements and luminous ray bundles](media/lens-cutaway.png)

**Three.js · WebGL · GLSL · JavaScript · Vite**

</div>

## Touch the light

Walk up to a tabletop in a warm, low-poly classroom. Open the lens, turn its rings, move the subjects, and watch the image change on the camera's screen.

Hikari is a hands-on explanation of optics: a place to experiment with the connection between **mechanics, light, and the photograph**.

- **Look inside the lens.** A cutaway reveals nine optical elements, moving groups, an iris, and computed ray paths.
- **Explore focus.** Switch between 16, 28, and 50 mm; focus on the cat, flower, or chart; compare a wide aperture with ƒ/11.
- **Follow the image.** The sensor preview renders the same scene, with approximate depth of field and exposure.
- **Try filters with a purpose.** ND for longer exposures, CPL for polarized glass reflections, and MIST for diffusion around highlights.
- **Bend a beam.** Rotate a prism, glass plate, or mirror in a dedicated tabletop experiment.
- **Change the atmosphere.** Sun, cloud, golden hour, and night alter the lighting; ISO, shutter speed, and automatic/manual exposure affect the camera's image.

### Inside the lens

![Animated lens cutaway with moving lens groups and changing focal length](media/lens-mechanics.gif)

### Pull focus

![Focus moving between subjects in the camera's live view](media/focus-pull.gif)

### The classroom

![The Hikari tabletop optics lab in its classroom](media/classroom.png)

## A quick first experiment

1. Approach the bench, or open the focus experiments shelf at the bottom.
2. Choose **50 mm** and focus on the **cat**.
3. Move focus to the **chart**. Watch which part of the image becomes sharp.
4. Compare the open aperture with **ƒ/11**.
5. Switch to the lens cutaway and see the groups move.

The in-app interface is currently in **Russian**. This README is in English. The hosted preview may ask you to sign in; running locally does not require an account.

## Controls

| Action | Control |
| --- | --- |
| Approach an instrument | Click/tap the object or its label |
| Adjust a ring | Drag it; use arrow keys when selected |
| Move a subject | Drag; hold Shift for the other tabletop axis |
| Look around | Drag an empty area |
| Move closer | Mouse wheel |
| Return to the table | Escape or the back button |
| Find instructions / reset | The `?` button / reset control |

If the camera image becomes dark, check the lighting and exposure. In manual mode, a night scene can genuinely underexpose. Switch back to automatic exposure or reset the bench to recover a known starting point.

## Run locally

Use Node.js **22.12+** or a supported newer release.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. A WebGL-capable browser is required; a GPU-backed desktop browser gives the best experience. The help panel includes a lower-quality rendering option.

```sh
npm test       # optics, state, placement and layout regression tests
npm run build # production bundle in dist/
```

This repository contains the application source and its test suite. It has no backend, account system, or API key requirement.

## Under the glass

- **Shared 3D world:** the visitor view and sensor view use the same Three.js scene.
- **Lens model:** fixed optical powers and moving groups, evaluated with a paraxial ray-transfer model.
- **Refraction experiment:** angle-dependent reflection/refraction and wavelength-dependent prism dispersion.
- **Image formation:** depth-aware shader blur, exposure, and highlight diffusion.
- **Presentation:** procedural low-poly objects, warm lighting, bloom, and restrained depth separation.
- **State:** normalized camera parameters shared by the physical controls and quick experiments.

### Educational boundaries

Hikari is an educational visualization, **not an optical design or camera calibration tool**. The lens is not a reconstruction of a Sony or other manufacturer's optical prescription. Tabletop distances are compressed; ray brightness is exaggerated for visibility. Colored ray bundles in the lens identify different object points, whereas prism colors represent wavelengths. Depth-of-field blur, diffusion, and motion blur are approximations. Overview-camera blur is an artistic effect, separate from the simulated camera image.

The prism experiment displays computed beam spots rather than a full physically based photograph of the classroom. CPL demonstrates a selected dielectric-reflection scenario; it does not remove every kind of reflection. The MIST strength control is educational, not a claim that rotating a real diffusion filter changes its density.

## Project map

```text
src/
  immersive.js          classroom, controls and instrument geometry
  shared-preview.js     sensor view of the shared world
  lens-system.js        lens groups and paraxial propagation
  optics.js             normalized camera state and optical helpers
  refraction.js         reflection, refraction and dispersion
  filter-experiments.js contextual filter demonstrations
  focus-presets.js      focal-length and focus experiments
  spectator-focus.js    presentation depth separation
  main.js               interaction and state coordination
test/                    regression tests
media/                   screenshots and animated showcases
```

## About the media

The lens and focus loops were rendered locally with **[HyperFrames](https://github.com/heygen-com/hyperframes)** using the application's actual Three.js scene and deterministic GSAP timelines. Titles are showcase overlays, not additional controls in the app. Still images are captures of the same rendered scene.

Built by **[Danil Volodin](https://github.com/Triton556)** with AI-assisted development. An ongoing experiment in making technical ideas tangible, playful, and visually understandable.
