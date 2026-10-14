// Explicit local QA build only. Exercises the same state/model/render update path.
export function mountQA({
  getState,
  apply,
  getLab,
  getPreview,
  rework,
  select,
  visit,
}) {
  const p = document.createElement("section");
  p.id = "qa-panel";
  p.innerHTML = `<b>LOCAL QA · IMMERSIVE LAB</b><label> Duration <select id="duration"><option value="60">1 min</option><option value="300">5 min</option><option value="900" selected>15 min</option><option value="2700">45 min</option><option value="3600">60 min</option></select></label><button id="run">Run model/render soak</button><button id="stop">Stop & restore</button><button id="context">Context recovery</button><pre id="result">Ready</pre>`;
  document.body.append(p);
  import('./qa-causal.js').then(({mountCausalQA})=>mountCausalQA({getState,apply,getLab,getPreview,select,visit}));
  import("./qa-resources.js").then(({ mountResourceQA }) =>
    mountResourceQA({ getState, apply, getLab }),
  );
  if (rework)
    import("./qa-rework.js").then(({ mountReworkQA }) =>
      mountReworkQA({ getState, apply, getLab, getPreview, select }),
    );
  const css = document.createElement("style");
  css.textContent =
    "#qa-panel{position:fixed;left:12px;bottom:12px;z-index:100;background:#142d30ed;color:#eff7e8;padding:14px;border-radius:8px;width:360px;max-height:calc(100vh - 24px);overflow:auto;font:11px system-ui}#qa-panel pre{white-space:pre-wrap;font:11px monospace;max-height:180px;overflow:auto}#qa-panel button,#qa-panel select{font:11px system-ui;margin:5px;padding:6px}";
  document.head.append(css);
  const q = (id) => p.querySelector("#" + id);
  let timer,
    report = { status: "idle", cases: 0, failures: [], errors: [] },
    start,
    snapshot;
  const metrics = () => {
    const l = getLab(),
      i = l.renderer.info;
    return {
      fps: +l.fps.toFixed(1),
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      programs: i.programs.length,
      calls: i.render.calls,
      triangles: i.render.triangles,
    };
  };
  function show() {
    q("result").textContent = JSON.stringify(
      {
        ...report,
        elapsed: Math.round((performance.now() - start) / 1000),
        latest: metrics(),
      },
      null,
      2,
    );
  }
  function stop(completed = false) {
    clearInterval(timer);
    timer = null;
    report.status =
      report.errors.length || report.failures.length
        ? "failed"
        : completed
          ? "passed"
          : "stopped";
    if (snapshot) apply(snapshot);
    show();
  }
  window.addEventListener("error", (e) => {
    if (timer) report.errors.push(e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (timer) report.errors.push(String(e.reason));
  });
  q("stop").onclick = () => stop(false);
  q("context").onclick = () => {
    const l = getLab();
    l.renderer.forceContextLoss();
    setTimeout(() => l.renderer.forceContextRestore(), 2000);
  };
  document.querySelector("#world").addEventListener("graphics-status", (e) => {
    report.context = e.detail;
    show();
  });
  q("run").onclick = () => {
    if (timer) return;
    snapshot = { ...getState() };
    start = performance.now();
    const duration = +q("duration").value;
    let lastTick = start,
      activeMs = 0;
    report = {
      status: "running",
      cases: 0,
      failures: [],
      errors: [],
      baseline: metrics(),
      started: new Date().toISOString(),
    };
    const step = () => {
      const now = performance.now(),
        dt = now - lastTick;
      lastTick = now;
      if (document.hidden) {
        report.hiddenSeconds = (report.hiddenSeconds ?? 0) + dt / 1000;
        show();
        return;
      }
      activeMs += dt;
      report.activeSeconds = Math.round(activeMs / 1000);
      if (activeMs >= duration * 1000) return stop(true);
      const i = report.cases;
      try {
        apply({
          ...(rework
            ? {
                experiment: [
                  undefined,
                  "motion",
                  "polarization",
                  "diffusion",
                  "prism",
                ][i % 5],
                inlineSourceAngle: -0.85 + Math.sin(i) * 0.3,
                paneAngle: Math.PI * 0.75 + Math.sin(i) * 0.2,
                filterBypass: i % 9 === 0,
                compareShutter: 1 / 30,
              }
            : {}),
          focal: 16 + ((i * 7) % 35),
          focus: [0.3, 0.5, 1, 1.5, 2, 4, 5][i % 7],
          aperture: [3.5, 5.6, 8, 11, 16, 22][i % 6],
          distance: [0.4, 0.8, 1.5, 2.5, 4][i % 5],
          weather: ["golden", "night", "sun", "cloud"][i % 4],
          light: [0.15, 0.5, 1, 2][i % 4],
          iso: [100, 400, 1600, 6400, 12800][i % 5],
          shutter: [1 / 4, 1 / 30, 1 / 125, 1 / 500, 1 / 2000][i % 5],
          filter: ["none", "nd", "cpl", "soft"][i % 4],
          ndStops: i % 9,
          softStrength: (i % 11) / 10,
          filterAngle: (i * 13) % 180,
          prismAngle: Math.PI / 2 + Math.sin(i) * 0.6,
          prismShape: ["prism", "slab", "mirror"][i % 3],
          sourceAngle: Math.sin(i * 0.7) * 0.2,
          pane: i % 3 === 0,
          cutaway: i % 5 !== 0,
          rays: i % 7 !== 0,
          object: ["cat", "flower", "chart"][i % 3],
          exposureAuto: i % 3 !== 0,
          quality: i % 40 < 30 ? "low" : "high",
        });
        if (i % 20 === 0)
          getLab().visit(
            [
              "desk",
              "lens",
              "sensor",
              "aperture",
              "filters",
              "prism",
              "objects",
            ][Math.floor(i / 20) % 7],
          );
        const s = getState(),
          l = getLab();
        const fail = (message) => report.failures.push({ case: i, message });
        if (Math.abs(l.solution.effectiveFocal - s.focal) > 1e-5)
          fail("effective focal mismatch");
        if (l.filterMount.visible !== (s.filter !== "none"))
          fail("filter mount visibility");
        if (
          l.rayGroup.visible !==
          (rework && s.experiment === "prism" ? false : s.rays)
        )
          fail("ray visibility");
        if (!Number.isFinite(getPreview().last.blur))
          fail("nonfinite sensor blur");
        if (!Number.isFinite(getPreview().last.brightness))
          fail("nonfinite brightness");
        l.lensElements.forEach((o, n) => {
          if (!Number.isFinite(o.position.x)) fail("nonfinite glass " + n);
        });
        // Cold counts exclude resources uploaded only when first visible.
        // A changing scene cannot establish a leak from that baseline alone.
        // Allocation stability is checked separately by matched resource cycles.
        const allocation = metrics();
        report.allocationPeak = Math.max(report.allocationPeak ?? 0, allocation.geometries);
        report.memoryVerification = "Use matched-state resource cycles before and after this soak";
      } catch (e) {
        report.errors.push(String(e.stack ?? e));
      }
      report.cases++;
      show();
    };
    timer = setInterval(step, 2000);
    step();
  };
}
