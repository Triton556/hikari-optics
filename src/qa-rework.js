// Local explicit QA only; launched from a button by the tester, never shipped.
export function mountReworkQA({ getState, apply, getLab, getPreview, select }) {
  const button = document.createElement("button");
  button.textContent = "Check shared-world scenarios";
  document.querySelector("#qa-panel").prepend(button);
  const output = document.createElement("pre");
  document.querySelector("#qa-panel").append(output);
  button.onclick = () => {
    const snapshot = { ...getState() },
      results = [];
    const check = (name, pass, evidence) =>
      results.push({ name, pass, ...evidence });
    const pixels = () =>
      new Uint8ClampedArray(getPreview().ctx.getImageData(0, 0, 480, 320).data);
    const mean = (p) => {
      let t = 0;
      for (let i = 0; i < p.length; i += 4) t += p[i] + p[i + 1] + p[i + 2];
      return t / ((p.length / 4) * 3);
    };
    const diff = (a, b) => {
      let t = 0;
      for (let i = 0; i < a.length; i += 4)
        t +=
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
      return t / ((a.length / 4) * 3);
    };
    try {
      apply({
        focal: 28,
        focus: 1.5,
        aperture: 5.6,
        iso: 400,
        shutter: 1 / 125,
        weather: "sun",
        light: 1,
        object: "cat",
        catDistance: 1.5,
        flowerDistance: 2.2,
        chartDistance: 3,
        catOffset: 0,
        flowerOffset: -0.72,
        chartOffset: 0.72,
        filterBypass: false,
        compareShutter: undefined,
        paneAngle: Math.PI * 0.75,
      });
      // Observer-only depth separation must not alter the camera sensor image.
      apply({ experiment: undefined, filter: "none", pane: false, animate: false });
      const observerBefore = pixels();
      const focusPass = getLab().spectatorFocus;
      const focusWasEnabled = focusPass.enabled;
      focusPass.enabled = !focusWasEnabled;
      getPreview().draw(getState());
      const observerAfter = pixels();
      focusPass.enabled = focusWasEnabled;
      check("Spectator focus leaves sensor pixels unchanged", diff(observerBefore, observerAfter) < 0.01, {
        meanDifference: diff(observerBefore, observerAfter)
      });
      select("filter:cpl");
      apply({ filterAngle: 0 });
      const c0 = pixels();
      apply({ filterAngle: 90 });
      const c90 = pixels();
      check("CPL changes actual reflected image", diff(c0, c90) > 1, {
        meanDifference: diff(c0, c90),
      });
      select("filter:nd");
      apply({ ndStops: 0 });
      const short = getPreview().last.shutter;
      apply({ ndStops: 5 });
      const long = getPreview().last.shutter,
        nd = pixels();
      select("bypass");
      const clear = pixels();
      check("ND extends automatic shutter", long > short * 4, { short, long });
      check(
        "ND bypass holds shutter and admits more light",
        getPreview().last.shutter === long && mean(clear) > mean(nd) + 5,
        { filtered: mean(nd), bypass: mean(clear) },
      );
      select("filter:soft");
      apply({ softStrength: 0 });
      const clean = pixels();
      apply({ softStrength: 1 });
      const mist = pixels();
      check(
        "MIST adds highlight spread",
        diff(clean, mist) > 0.2 && mean(mist) > mean(clean),
        { meanDifference: diff(clean, mist) },
      );
      select("filter:none");
      apply({
        experiment: undefined,
        pane: false,
        exposureAuto: false,
        weather: "sun",
      });
      const sun = getPreview().last.worldRadiance;
      apply({ weather: "night" });
      const night = getPreview().last.worldRadiance;
      check("Sensor reads changed scene lighting", sun > night * 1.2, {
        sun,
        night,
      });
      select("inline-prism");
      check("Default inline prism reaches sensor", getPreview().last.hits > 0, {
        hits: getPreview().last.hits,
      });
      apply({ prismAngle: (21 * Math.PI) / 180 });
      check("Prism rotation removes sensor hit", getPreview().last.hits === 0, {
        hits: getPreview().last.hits,
      });
      select("objects");
      check(
        "Return restores objects and ordinary image",
        Object.values(getLab().targetStages).every((o) => o.visible) &&
          Number.isFinite(getPreview().last.worldRadiance),
        {},
      );
    } catch (error) {
      results.push({ pass: false, error: String(error.stack ?? error) });
    } finally {
      apply(snapshot);
      getLab().visit("desk");
    }
    output.textContent = JSON.stringify(
      { passed: results.every((r) => r.pass), results },
      null,
      2,
    );
  };
}
