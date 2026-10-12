// A matched-state lifecycle check. Cold renderer counts are not allocation baselines:
// Three uploads a geometry only when it is first rendered, including shadow passes.
export function mountResourceQA({ getState, apply, getLab }) {
  const button = document.createElement("button");
  button.textContent = "Matched resource cycles";
  const out = document.createElement("pre");
  const panel = document.querySelector("#qa-panel");
  panel.prepend(button, out);
  button.onclick = async () => {
    button.disabled = true;
    const saved = { ...getState() },
      lab = getLab(),
      report = { status: "running", cycles: [], errors: [] };
    const pause = () => new Promise((r) => setTimeout(r, 650));
    const show = () => (out.textContent = JSON.stringify(report, null, 2));
    const measure = () => {
      const ids = new Set();
      lab.scene.traverse((o) => {
        if (o.geometry) ids.add(o.geometry.uuid);
      });
      return {
        gpu: lab.renderer.info.memory.geometries,
        reachable: ids.size,
        textures: lab.renderer.info.memory.textures,
        programs: lab.renderer.info.programs.length,
      };
    };
    try {
      for (let cycle = 0; cycle < 4; cycle++) {
        for (let n = 0; n < 28; n++) {
          apply({
            ...saved,
            experiment: [
              undefined,
              "motion",
              "polarization",
              "diffusion",
              "prism",
            ][n % 5],
            filter: ["none", "nd", "cpl", "soft"][n % 4],
            cutaway: n % 2 === 0,
            rays: n % 3 !== 0,
            pane: n % 2 === 0,
            weather: ["sun", "night", "cloud", "golden"][n % 4],
            focal: 16 + n,
            focus: 0.5 + n / 10,
            aperture: 5.6 + (n % 8),
            prismShape: ["prism", "slab", "mirror"][n % 3],
            prismAngle: 0.14 + n / 100,
            inlineSourceAngle: -0.85,
            quality: n % 2 ? "high" : "low",
          });
          lab.visit(
            [
              "desk",
              "lens",
              "sensor",
              "aperture",
              "filters",
              "prism",
              "objects",
            ][n % 7],
          );
          await pause();
        }
        apply(saved);
        lab.visit("desk");
        await pause();
        await pause();
        report.cycles.push(measure());
        show();
      }
      const warm = report.cycles[1];
      report.status = report.cycles
        .slice(2)
        .every(
          (x) =>
            x.gpu === warm.gpu &&
            x.reachable === warm.reachable &&
            x.textures === warm.textures &&
            x.programs === warm.programs,
        )
        ? "passed"
        : "failed";
    } catch (e) {
      report.errors.push(String(e.stack ?? e));
      report.status = "failed";
    } finally {
      apply(saved);
      button.disabled = false;
      show();
    }
  };
}
