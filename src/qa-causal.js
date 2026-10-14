// Local QA build only. The button exercises real renderer pixels and public
// application commands; it supplements the separate pointer/keyboard checks.
export function mountCausalQA({
  getState,
  apply,
  getLab,
  getPreview,
  select,
  visit,
}) {
  const button = document.createElement("button");
  button.textContent = "Check light-path scenarios";
  const output = document.createElement("pre");
  const panel = document.querySelector("#qa-panel");
  const download = document.createElement("a");
  download.textContent = "Save light-path QA report";
  download.download = "causal-browser-results.json";
  download.hidden = true;
  panel.prepend(button, download, output);
  button.onclick = () => {
    const saved = { ...getState() },
      results = [];
    const check = (name, pass, evidence = {}) =>
      results.push({ name, pass, ...evidence });
    const pixels = () =>
      new Uint8Array(getPreview().ctx.getImageData(0, 0, 480, 320).data);
    const diff = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i += 4)
        sum +=
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
      return sum / ((a.length / 4) * 3);
    };
    try {
      apply({
        focal: 50,
        aperture: 5.6,
        focus: 1.5,
        object: "cat",
        distance: 1.5,
        catDistance: 1.5,
        flowerDistance: 2.2,
        chartDistance: 3,
        catOffset: 0,
        flowerOffset: -0.72,
        chartOffset: 0.72,
        filter: "none",
        filterBypass: false,
        experiment: undefined,
        pane: false,
        weather: "sun",
        light: 1,
        exposureAuto: true,
        animate: false,
      });
      visit("desk");
      getPreview().draw(getState());
      const neutral = pixels();
      const home = getLab().monitor.position.toArray(),
        homeScale = getLab().monitor.scale.x;
      select("lens");
      // visit() docks after select() updates: redraw the actual docked scene.
      getPreview().draw(getState());
      const focused = pixels(),
        sharp = getLab().lightPath.observation();
      check(
        "Combined inspection leaves the sensor image unchanged",
        diff(neutral, focused) < 0.01,
        { meanDifference: diff(neutral, focused) },
      );
      check(
        "Existing monitor docks beside the cutaway",
        getLab().monitor.scale.x > homeScale &&
          getLab().monitor.position.y > home[1],
      );
      check("Focused point has a zero paraxial diameter", sharp.blurMm < 1e-8, {
        blurMm: sharp.blurMm,
      });
      apply({ focus: 3 });
      const defocused = pixels(),
        wide = getLab().lightPath.observation();
      check(
        "Focus adjustment changes both mechanism and photograph",
        wide.rearGroupMm !== sharp.rearGroupMm &&
          diff(focused, defocused) > 0.05,
        {
          rearGroupMm: wide.rearGroupMm,
          blurMm: wide.blurMm,
          meanDifference: diff(focused, defocused),
        },
      );
      apply({ aperture: 11 });
      const narrow = getLab().lightPath.observation(),
        stopped = pixels();
      check(
        "Stopping down shrinks the spot without moving groups",
        narrow.blurMm < wide.blurMm && narrow.rearGroupMm === wide.rearGroupMm,
        { wideMm: wide.blurMm, stoppedMm: narrow.blurMm },
      );
      check(
        "Aperture adjustment changes real sensor pixels",
        diff(defocused, stopped) > 0.01,
        { meanDifference: diff(defocused, stopped) },
      );
      select("screen");
      check(
        "Monitor close-up restores its physical home",
        getLab()
          .monitor.position.toArray()
          .every((v, i) => v === home[i]) &&
          getLab().monitor.scale.x === homeScale,
      );
      visit("lens");
      visit("desk");
      check(
        "Returning to the table restores the same monitor",
        getLab()
          .monitor.position.toArray()
          .every((v, i) => v === home[i]) &&
          getLab().monitor.scale.x === homeScale,
      );
    } catch (error) {
      results.push({ pass: false, error: String(error.stack ?? error) });
    } finally {
      apply(saved);
      visit("desk");
    }
    output.textContent = JSON.stringify(
      { passed: results.every((r) => r.pass), results },
      null,
      2,
    );
    download.href = URL.createObjectURL(new Blob([output.textContent], {type:"application/json"}));
    download.hidden = false;
  };
}
