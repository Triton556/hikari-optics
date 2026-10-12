import "./style.css";
import { installFocusPresets } from "./focus-presets.js";
import { installWayfinding } from "./wayfinding.js";
import { exposure } from "./exposure.js";
import { alignInlineSource, inlineBeam } from "./inline-optics.js";
import { canMove, DEFAULT_OFFSETS } from "./placement.js";
import { ImmersiveLab } from "./immersive.js";
import { SensorPreview } from "./preview.js";
import { SharedSensorPreview } from "./shared-preview.js";
import { DEFAULT, normalizeState, clamp, WEATHER } from "./optics.js";
const app = document.querySelector("#app");
app.innerHTML = `<main id="world" aria-label="Лаборатория света"></main><div class="identity"><span class="sunmark" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="8"/><path d="M24 2v9m0 26v9M2 24h9m26 0h9M8.4 8.4l6.4 6.4m18.4 18.4l6.4 6.4M8.4 39.6l6.4-6.4m18.4-18.4l6.4-6.4"/></svg></span><div>HIKARI<small>маленькая лаборатория света</small></div></div><button id="back" hidden>← К столу</button><button id="help" aria-label="Как пользоваться">?</button><button id="restore-scene" hidden title="Вернуть исходный свет, настройки камеры и общий вид">↺ Сбросить стенд</button><div id="welcome"><span>ПОТРОГАЙ СВЕТ</span><h1>Всё начинается<br>с любопытства.</h1><p>Подойди к столу. Нажми на объектив,<br>покрути кольцо и посмотри внутрь.</p><button id="enter">Подойти к стенду <b>→</b></button><small>Мышь или касание · Escape — вернуться</small></div><div id="hover" hidden></div><div id="feedback"><div id="readout" hidden><span id="control-name"></span><strong id="control-value"></strong><small id="control-hint"></small></div><div id="caption" aria-live="polite"></div></div><dialog id="notebook"><button id="close-help">×</button><span>ПОЛЕВЫЕ ЗАМЕТКИ / 01</span><h2>Здесь можно всё потрогать.</h2><p>Нажми на табличку или деталь, чтобы подойти. Перетаскивай рифлёные кольца. Цветные метки и подписи подскажут: бирюзовая — зум, золотая — фокус, сиреневая — диафрагма.</p><p>Фильтры лежат в лотке перед камерой. Нажми, чтобы установить. Крути установленный фильтр для изменения плотности ND или угла CPL.</p><p>Котика, цветок и мишень можно двигать; Shift меняет направление движения поперёк стола. В опыте с призмой вращаются и стекло, и источник; табличка «Элемент» меняет призму на пластину или зеркало.</p><p>«Сменить свет» переключает погоду и время суток. Диски на камере меняют ISO и выдержку. A / M включает автоматический подбор выдержки. В ручном режиме ночью изображение может быть почти чёрным: добавь свет, открой диафрагму, увеличь ISO или выдержку.</p><p>Tab и Enter выбирают доступное действие, стрелки меняют выбранный параметр.</p><p>Перетаскивание свободного места поворачивает взгляд. Колесо приближает. Escape возвращает к столу.</p><h3>Опыты с фокусом</h3><p>Полка внизу открывает пресеты 16, 28 и 50 мм. Котик, цветок и мишень задают дистанцию резкости. В виде «Сцена» мятная плоскость показывает фокус, полоса на столе — приблизительную глубину резкости (дальний край ограничен стендом). В «Кадре» видно изображение матрицы. ƒ/11 расширяет резкую область; открытая диафрагма сильнее отделяет фон. Это разные действия: зум меняет охват кадра, а фокус — дистанцию резкости.</p><h3>Три опыта с фильтрами</h3><p>ND — длинная выдержка при ярком свете. Смотри на движущиеся лопасти: фильтр уменьшает поток света, автомат удлиняет выдержку, движение оставляет след. При сравнении без ND выдержка сохраняется, поэтому кадр может пересветиться.</p><p>CPL — съёмка сквозь отражение в стекле. Поверни фильтр: отражение световой панели ослабеет, котик за стеклом станет виден. Эффект зависит от угла стекла и поляризации. CPL не удаляет любые блики; у металлических отражений эффект другой.</p><p>MIST — мягкое свечение вокруг ярких источников. Регулятор подбирает плотность учебного фильтра; настоящий MIST при вращении не меняет плотность. Кнопка A/B на экране позволяет сравнить огни при одинаковой экспозиции.</p><h3>Что здесь считается</h3><p>Девять элементов учебного объектива имеют постоянные оптические силы. При зуме и фокусировке перемещаются группы; пути света вычисляются параксиальным методом. Это учебная модель, а не конструкция конкретного производителя.</p><p>Дальний мир сжат по масштабу, чтобы поместиться на столе. Внутри объектива расстояния пропорциональны. Яркость лучей усилена для наглядности. В объективе три цвета обозначают три точки объекта; это не расщепление света. В призме цвета соответствуют разным длинам волн. Опыт с призмой использует изолированный источник: на матрице показаны рассчитанные световые пятна, а не фотография всей комнаты. Размытие глубины резкости и диффузия рассчитаны приближёнными шейдерами. Мягкий фон обзорной камеры — художественный приём; он не влияет на изображение матрицы или измерения.</p><button id="quality">Качество: высокое</button><button id="reset-scene">Начать заново</button></dialog>`;
const rework = true;
let state = normalizeState({
  ...DEFAULT,
  exposureAuto: true,
  filter: "none",
  ndStops: 2,
  softStrength: 0.35,
  filterAngle: 0,
  prismAngle: (40 * Math.PI) / 180,
  sourceAngle: 0,
  prismShape: "prism",
  catDistance: 1.5,
  flowerDistance: 2.2,
  chartDistance: 3,
  pane: false,
  paneAngle: (3 * Math.PI) / 4,
  cutaway: !rework,
});
const initialState = { ...state };
let selected = null,
  station = "desk",
  captionTimer,
  preview,
  lab;
let adjustmentFrame = null;
let syncFocusShelf = () => {};
const descriptions = {
  "glass-angle": [
    "Угол стекла",
    "°",
    "Поворачивай стекло: положение и поляризация блика меняются",
  ],
  light: ["Свет", "", "Поверни регулятор яркости"],
  iso: ["ISO", "", "Чувствительность: усиление и шум"],
  prism: ["Призма", "", "Поворачивай · преломление и дисперсия"],
  source: ["Источник", "", "Поворачивай · меняется угол падения"],
  zoom: ["Зум", "мм", "Перетаскивай кольцо · меняется угол обзора"],
  focus: ["Фокус", "м", "Перетаскивай кольцо · найди резкость"],
  aperture: ["Диафрагма", "", "Перетаскивай кольцо · меняется отверстие"],
  filter: ["Фильтр", "", "Потяни — изменить параметр · снять можно в лотке"],
  exposure: ["Экспозиция", "", "Перетаскивай диск · выдержка"],
  subject: ["Объект", "", "Перетаскивай · Shift — поперёк стола"],
};
function say(t) {
  document.querySelector("#caption").textContent = t;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(
    () => (document.querySelector("#caption").textContent = ""),
    6500,
  );
}
function update() {
  if (!lab) return;
  state = normalizeState(state);
  document.body.dataset.weather = state.weather;
  document.querySelector("#quality").textContent =
    `Качество: ${state.quality === "high" ? "высокое" : "экономное"}`;
  state[state.object + "Distance"] = state.distance;
  lab.update(state);
  preview?.draw(state);
  readout();
  syncFocusShelf();
}
function readout() {
  const d = descriptions[selected];
  const box = document.querySelector("#readout");
  box.hidden = !d;
  if (!d) return;
  document.querySelector("#control-name").textContent =
    selected === "prism"
      ? { prism: "Призма", slab: "Стеклянная пластина", mirror: "Зеркало" }[
          state.prismShape
        ]
      : d[0];
  document.querySelector("#control-hint").textContent =
    selected === "prism"
      ? {
          prism: "Поверни призму · меняется преломление и спектр",
          slab: "Поверни стекло · луч выходит параллельно со смещением",
          mirror: "Поверни зеркало · угол отражения равен углу падения",
        }[state.prismShape]
      : d[2];
  if (["prism", "source"].includes(selected) && lab?.prismObservation) {
    const observation = lab.prismObservation;
    if (!observation.intersects)
      document.querySelector("#control-hint").textContent =
        "Луч проходит мимо · поверни источник или элемент";
    else if (observation.internalReflection)
      document.querySelector("#control-hint").textContent =
        "Внутри стекла: полное внутреннее отражение";
  }
  if (
    rework &&
    state.experiment === "prism" &&
    ["prism", "source"].includes(selected)
  ) {
    const rays = lab.inlineResults ?? [];
    document.querySelector("#control-hint").textContent = rays.some(
      (r) => r.status === "sensor",
    )
      ? "Свет проходит через объектив и достигает матрицы"
      : rays.some((r) => r.status === "iris")
        ? "Свет перекрыт диафрагмой"
        : "Пучок отклонён от матрицы · поверни источник или призму";
  }
  if (selected === "filter")
    document.querySelector("#control-hint").textContent = {
      none: "Выбери фильтр в лотке",
      nd: "Каждый EV уменьшает свет вдвое · сравни результат на экране",
      cpl: "Вращай, чтобы ослабить блик · сравни результат на экране",
      soft: rework
        ? "Учебный регулятор заменяет MIST на другую плотность"
        : "Поверни кольцо, чтобы изменить мягкость · клик — снять",
    }[state.filter];
  if (rework && selected === "filter" && station === "screen")
    document.querySelector("#control-hint").textContent =
      ({
        nd: "Потяни плотность: выдержка станет длиннее, движение оставит след. Сравнение сохраняет выдержку.",
        cpl: "Потяни CPL: отражение ослабнет. Сравнение покажет стекло без фильтра.",
        soft: "Потяни плотность: вокруг огней появится ореол. Сравнение — при той же экспозиции.",
      }[state.filter] ?? "Выбери фильтр, чтобы сравнить его действие.");
  document.querySelector("#control-value").textContent =
    selected === "glass-angle"
      ? `${Math.round((state.paneAngle * 180) / Math.PI - 90)}° к взгляду камеры`
      : selected === "light"
        ? `${state.light.toFixed(2)} ×`
        : selected === "iso"
          ? `ISO ${Math.round(state.iso)}`
          : selected === "subject"
            ? `${state.distance.toFixed(2)} м`
            : selected === "prism"
              ? `${Math.round((state.prismAngle * 180) / Math.PI)}°`
              : selected === "source"
                ? `${Math.round(((state.experiment === "prism" ? state.inlineSourceAngle : state.sourceAngle) * 180) / Math.PI)}°`
                : selected === "zoom"
                  ? `${state.focal.toFixed(0)} мм`
                  : selected === "focus"
                    ? `${state.focus.toFixed(2)} м`
                    : selected === "aperture"
                      ? `ƒ / ${state.aperture.toFixed(1)}`
                      : selected === "filter"
                        ? state.filter === "nd"
                          ? `ND ${state.ndStops.toFixed(1)} EV${rework && preview?.last ? " · 1/" + Math.round(1 / preview.last.shutter) + " с" : ""}`
                          : state.filter === "cpl"
                            ? `CPL ${state.filterAngle.toFixed(0)}°`
                            : state.filter === "soft"
                              ? `MIST ${Math.round(state.softStrength * 100)}%`
                              : "Без фильтра"
                        : `1 / ${Math.round(1 / (rework && preview?.last ? preview.last.shutter : exposure(state).shutter))} с`;
  if (rework && selected === "filter" && state.filterBypass)
    document.querySelector("#control-value").textContent += " · отведён";
}
function visit(id) {
  if (!lab) return;
  station = id;
  document.body.dataset.station = id;
  lab.visit(id);
  document.querySelector("#back").hidden = id === "desk";
  document.querySelector("#back").textContent = id === "aperture" ? "← К объективу" : "← К столу";
  document.querySelector("#welcome").hidden = true;
  document.querySelector("#restore-scene").hidden = false;
  syncFocusShelf();
}
function select(id) {
  if (["zoom", "focus", "aperture"].includes(id) && station === "desk") {
    state.cutaway = true;
    selected = id;
    update();
    visit("lens");
    say("Три кольца, три действия. Потяни кольцо или его подпись; нажми на диафрагму, чтобы рассмотреть отверстие.");
    return;
  }
  if (id === "glass-angle") {
    state.pane = true;
    if (state.experiment === "prism") state.experiment = undefined;
    update();
    visit("objects");
    selected = id;
    readout();
    return;
  }
  if (
    rework &&
    (id === "inline-prism" ||
      id === "prism-station" ||
      (["prism", "source"].includes(id) && state.experiment !== "prism"))
  ) {
    state.experiment = "prism";
    state.prismShape = "prism";
    state.prismAngle = (8 * Math.PI) / 180;
    state.inlineSourceAngle = -0.85;
    state.pane = false;
    state.filter = "none";
    state.filterBypass = false;
    state.weather = "night";
    state.cutaway = true;
    selected = id === "source" ? "source" : "prism";
    update();
    visit("prism");
    say(
      "Призма стоит перед объективом. Поверни её или источник: следи, проходит ли свет через диафрагму и куда попадает на матрицу.",
    );
    return;
  }
  if (id === "bypass" && rework) {
    if (state.filter === "none") {
      say("Сначала установи фильтр из лотка");
      return;
    }
    state.filterBypass = !state.filterBypass;
    state.compareShutter = state.filterBypass
      ? preview?.last?.shutter
      : undefined;
    update();
    say(
      state.filterBypass
        ? "Фильтр отведён в сторону. Настройки экспозиции зафиксированы для сравнения."
        : "Фильтр снова перед объективом.",
    );
    return;
  }
  if (id.startsWith("object:")) {
    if (rework && state.experiment === "prism") state.experiment = undefined;
    state.object = id.split(":")[1];
    state.distance = state[state.object + "Distance"];
    selected = "subject";
    visit("objects");
    update();
    return;
  }

  if (id.startsWith("filter:")) {
    state.filter = id.split(":")[1];
    state.filterBypass = false;
    state.compareShutter = undefined;
    if (rework && state.filter !== "none") {
      state.experiment = {
        cpl: "polarization",
        nd: "motion",
        soft: "diffusion",
      }[state.filter];
      state.pane = state.filter === "cpl";
      if (state.filter === "cpl") state.paneAngle = Math.PI * 0.75;
      state.weather = state.filter === "soft" ? "night" : "sun";
      state.light = 1;
      state.exposureAuto = true;
    }
    selected = "filter";
    visit("filters");
    update();
    say(
      state.filter === "none"
        ? "Фильтр снят"
        : rework
          ? {
              nd: "ND позволяет снимать движение с длинной выдержкой при ярком свете. Увеличь плотность: лопасти на экране оставят след. A/B покажет пересвет без фильтра при той же выдержке.",
              cpl: "CPL помогает снимать через стекло: поверни кольцо до 90° и убери отражение окна с котика. Нажми на экран для крупного вида. В комнате блик остаётся, меняется только снимок.",
              soft: "MIST смягчает яркие огни: вокруг ламп появляется мягкое свечение. Нажми на экран, подбери плотность правым регулятором и сравни кнопкой A/B слева.",
            }[state.filter]
          : `Установлен ${state.filter.toUpperCase()}. Кольцо можно вращать.`,
    );
    return;
  }
  if (["prism", "source", "prism-station"].includes(id)) {
    visit("prism");
    selected = id === "prism-station" ? "prism" : id;
    readout();
    return;
  }
  if (id === "auto-exposure") {
    state.exposureAuto = !state.exposureAuto;
    update();
    say(
      state.exposureAuto
        ? "Автоэкспозиция подбирает выдержку с учётом фильтра. При сильном затемнении компенсации может не хватить."
        : "Ручная экспозиция: свет, диафрагма, выдержка и ISO влияют на яркость.",
    );
    return;
  }
  if (id === "align-source" && lab.solution) {
    state.inlineSourceAngle = alignInlineSource(state, lab.solution);
    update();
    const result = inlineBeam(state, lab.solution);
    say(result.status === "sensor"
      ? "Источник повёрнут: зелёная середина спектра попадает на матрицу. Теперь вращай стекло и следи за остальными цветами."
      : "Для такого положения стекла луч пока не попадает на матрицу. Поверни элемент и попробуй навести источник снова.");
    return;
  }
  if (id === "prism-shape") {
    if (rework && state.experiment !== "prism") select("inline-prism");
    const shapes = ["prism", "slab", "mirror"];
    state.prismShape = shapes[(shapes.indexOf(state.prismShape) + 1) % 3];
    update();
    visit("prism");
    say(
      {
        prism: "Призма: разные длины волн преломляются по-разному.",
        slab: "Плоскопараллельное стекло: луч смещается, но выходит параллельно.",
        mirror: "Зеркало: угол отражения равен углу падения.",
      }[state.prismShape],
    );
    return;
  }
  if (id === "change-object") {
    const os = ["cat", "flower", "chart"];
    state.object = os[(os.indexOf(state.object) + 1) % os.length];
    state.distance = state[state.object + "Distance"];
    update();
    return;
  }
  if (id === "pane") {
    state.pane = !state.pane;
    update();
    say(
      state.pane
        ? "Стекло перед объектом. Установи CPL и поверни его, чтобы ослабить отражение."
        : "Стекло убрано",
    );
    return;
  }
  if (id === "weather") {
    const ws = Object.keys(WEATHER);
    state.weather = ws[(ws.indexOf(state.weather) + 1) % ws.length];
    update();
    say(
      WEATHER[state.weather].name +
        (rework && state.exposureAuto && preview?.last
          ? ` · Автоэкспозиция: 1/${Math.round(1 / preview.last.shutter)} с. В режиме M яркость изменится при той же выдержке.`
          : ""),
    );
    return;
  }
  if (id === "cutaway") {
    state.cutaway = !state.cutaway;
    update();
    return;
  }
  if (["objects", "subject"].includes(id)) {
    if (rework && state.experiment === "prism") {
      state.experiment = undefined;
      update();
    }
    visit("objects");
    selected = null;
    say(
      "Объект перед объективом. Свет от каждой его точки собирается на матрице.",
    );
  } else if (["lens", "zoom", "focus", "aperture"].includes(id)) {
    if (rework) {
      state.cutaway = true;
      update();
    }
    visit(id === "aperture" ? "aperture" : "lens");
    selected = descriptions[id] ? id : null;
  } else if (["sensor", "screen", "body"].includes(id)) {
    if (rework && id !== "screen") {
      state.cutaway = true;
      update();
    }
    visit(rework && id === "screen" ? "screen" : "sensor");
    selected =
      rework && id === "screen" && state.filter !== "none" ? "filter" : null;
    say(
      rework && id === "screen"
        ? "Потяни подпись фильтра или регулятор на рамке. Нажми «Сравнение», чтобы увидеть разницу."
        : "На матрице изображение перевёрнуто. На экране камеры электроника разворачивает его обратно.",
    );
  } else if (id === "filter") {
    if (station === "filters" || station === "screen") {
      selected = "filter";
      readout();
      return;
    }
    visit("filters");
    selected = id;
  } else if (["exposure", "iso", "light"].includes(id)) {
    if (rework && id !== "light") {
      state.cutaway = true;
      update();
    }
    selected = id;
    visit(id === "light" ? "objects" : "sensor");
  }
  readout();
}
function adjust(id, delta, sideways = false) {
  if (
    rework &&
    ["prism", "source"].includes(id) &&
    state.experiment !== "prism"
  ) {
    select("inline-prism");
    lab.targetView = null;
  }
  if (rework && ["zoom", "focus", "aperture"].includes(id))
    state.cutaway = true;
  if (id.startsWith("object:")) {
    state.object = id.split(":")[1];
    state.distance = state[state.object + "Distance"];
    id = "subject";
  }

  selected = id;
  if (id === "light")
    state.light = clamp(state.light * Math.exp(delta), 0.15, 2);
  if (id === "iso") state.iso = clamp(state.iso * Math.exp(delta), 100, 12800);
  if (id === "subject") {
    const offset =
      state[state.object + "Offset"] ?? DEFAULT_OFFSETS[state.object];
    const nextDistance = sideways
      ? state.distance
      : clamp(state.distance + delta * 2, 0.4, 4);
    const nextOffset = sideways ? clamp(offset + delta, -0.8, 0.8) : offset;
    if (canMove(state, state.object, nextDistance, nextOffset)) {
      state.distance = nextDistance;
      state[state.object + "Distance"] = nextDistance;
      state[state.object + "Offset"] = nextOffset;
    }
  }
  if (id === "glass-angle")
    state.paneAngle = clamp(
      state.paneAngle + delta,
      Math.PI * 0.53,
      Math.PI * 0.97,
    );
  if (id === "prism") state.prismAngle += delta;
  if (id === "source") {
    if (rework && state.experiment === "prism")
      state.inlineSourceAngle = clamp(
        state.inlineSourceAngle + delta,
        -1.4,
        1.4,
      );
    else
      state.sourceAngle = clamp(state.sourceAngle + delta * 0.4, -0.25, 0.25);
  }
  if (id === "zoom") state.focal = clamp(state.focal + delta * 20, 16, 50);
  if (id === "focus")
    state.focus = clamp(state.focus * Math.exp(delta * 1.5), 0.25, 5);
  if (id === "aperture")
    state.aperture = clamp(state.aperture + delta * 10, 3.5, 22);
  if (id === "filter") {
    if (state.filter === "nd")
      state.ndStops = clamp(state.ndStops + delta * 5, 0, 8);
    else if (state.filter === "soft")
      state.softStrength = clamp(state.softStrength + delta, 0, 1);
    else
      state.filterAngle =
        (((state.filterAngle + delta * 90) % 180) + 180) % 180;
  }
  if (id === "exposure") {
    state.exposureAuto = false;
    state.shutter = clamp(state.shutter * Math.exp(delta * 2), 1 / 2000, 1 / 4);
  }
  if (adjustmentFrame === null)
    adjustmentFrame = requestAnimationFrame(() => {
      adjustmentFrame = null;
      update();
    });
}
try {
  lab = new ImmersiveLab(
    document.querySelector("#world"),
    select,
    adjust,
    (id, x, y) => {
      const h = document.querySelector("#hover");
      h.hidden = !id;
      if (id) {
        h.textContent =
          descriptions[id]?.[0] ??
          {
            objects: "Подойти к объектам",
            lens: "Заглянуть в объектив",
            sensor: "Посмотреть матрицу",
            screen: "Приблизить экран · сравнить действие фильтра",
            body: "Заглянуть внутрь камеры",
            weather: "Сменить освещение",
            "prism-station": "Подойти к призме",
            "prism-shape": "Сменить оптический элемент",
            "auto-exposure": "Авто / ручная экспозиция",
            pane: "Стекло для опыта с CPL",
            bypass: "Сравнить с фильтром и без него",
            "inline-prism": "Поставить призму перед объективом",
            "change-object": "Выбрать другой объект",
            cutaway: "Открыть / закрыть корпус",
          }[id] ??
          (id.startsWith("object:")
            ? {
                cat: "Котик · передвинуть",
                flower: "Цветок · передвинуть",
                chart: "Мишень · передвинуть",
              }[id.split(":")[1]]
            : id.startsWith("filter:")
              ? {
                  none: "Снять фильтр",
                  nd: "ND · длинная выдержка днём",
                  cpl: "CPL · убрать отражение стекла",
                  soft: "MIST · свечение ярких лампочек",
                }[id.split(":")[1]]
              : "Исследовать");
        h.style.left = `${Math.min(innerWidth - 180, x + 18)}px`;
        h.style.top = `${Math.min(innerHeight - 50, y + 18)}px`;
      }
    },
  );
  preview = new (rework ? SharedSensorPreview : SensorPreview)(
    lab,
    document.createElement("canvas"),
  );
  update();
  syncFocusShelf = installFocusPresets({ lab, getState: () => state, getStation: () => station, visit,
    apply: patch => { state = { ...state, ...patch }; selected = null; update(); } });
  syncFocusShelf();
  installWayfinding(lab, { getState: () => state, getStation: () => station, getPreview: () => preview?.last, select, adjust });
} catch (error) {
  document.querySelector("#welcome").innerHTML =
    `<h1>Нужен WebGL 2</h1><p>В этом браузере 3D недоступно. Попробуй браузер с аппаратным ускорением.</p>`;
  console.error(error);
}
document
  .querySelector("#enter")
  ?.addEventListener("click", () => visit("desk"));
document.querySelector("#back").onclick = () => {
  selected = null;
  visit(station === "aperture" ? "lens" : "desk");
  readout();
};
const notebook = document.querySelector("#notebook");
document.querySelector("#help").onclick = () => notebook.showModal();
document.querySelector("#close-help").onclick = () => notebook.close();
document.querySelector("#quality").onclick = (e) => {
  state.quality = state.quality === "high" ? "low" : "high";
  e.target.textContent = `Качество: ${state.quality === "high" ? "высокое" : "экономное"}`;
  update();
};
window.addEventListener("keydown", (e) => {
  if (notebook.open) return;
  if (e.key === "Escape") {
    selected = null;
    visit(station === "aperture" ? "lens" : "desk");
    readout();
  }
  if (selected && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
    adjust(selected, e.key === "ArrowRight" ? 0.05 : -0.05, e.shiftKey);
    e.preventDefault();
  }
});

if (
  import.meta.env.VITE_QA === "1" &&
  new URLSearchParams(location.search).has("qa")
) {
  import("./qa-runner.js").then(({ mountQA }) =>
    mountQA({
      getState: () => state,
      apply: (patch) => {
        state = { ...state, ...patch };
        update();
      },
      getLab: () => lab,
      getPreview: () => preview,
      rework,
      select,
    }),
  );
}

const keyboardTools = document.createElement("nav");
keyboardTools.className = "keyboard-tools";
keyboardTools.setAttribute("aria-label", "Управление стендом с клавиатуры");
for (const [id, label] of [
  ["objects", "Подойти к объектам"],
  ["lens", "Подойти к объективу"],
  ["sensor", "Посмотреть матрицу"],
  ["prism-station", "Подойти к призме"],
  ...(rework ? [["inline-prism", "Поставить призму перед объективом"]] : []),
  ["zoom", "Кольцо зума: стрелки меняют фокусное расстояние"],
  ["focus", "Кольцо фокуса: стрелки меняют дистанцию"],
  ["aperture", "Кольцо диафрагмы: стрелки меняют отверстие"],
  ["filter:nd", "Установить ND фильтр"],
  ["filter:cpl", "Установить CPL фильтр"],
  ["filter:soft", "Установить диффузионный фильтр"],
  ["filter:none", "Снять фильтр"],
  ...(rework
    ? [
        ["bypass", "Сравнить с фильтром и без него при той же выдержке"],
        ["screen", "Приблизить экран камеры"],
        ["glass-angle", "Повернуть стекло: зависимость блика от угла"],
      ]
    : []),
  ["weather", "Сменить освещение"],
  ["pane", "Установить или убрать стекло перед объектом"],
  ["object:cat", "Передвинуть котика: стрелки, Shift — поперёк"],
  ["object:flower", "Передвинуть цветок: стрелки, Shift — поперёк"],
  ["object:chart", "Передвинуть мишень: стрелки, Shift — поперёк"],
  ["prism-shape", "Сменить призму, стекло или зеркало"],
  ["source", "Повернуть источник света: стрелки"],
  ["light", "Изменить яркость света: стрелки"],
  ["iso", "Изменить ISO: стрелки"],
  ["exposure", "Изменить выдержку: стрелки"],
  ["auto-exposure", "Переключить автоматическую экспозицию"],
  ["cutaway", "Открыть или закрыть корпус камеры"],
]) {
  const button = document.createElement("button");
  button.textContent = label;
  button.onclick = () => select(id);
  keyboardTools.append(button);
}
document.body.append(keyboardTools);
function restoreScene() {
  state = { ...initialState };
  selected = null;
  update();
  visit("desk");
  notebook.close();
  say("Стенд восстановлен: исходный свет, без фильтра, автоматическая экспозиция. Нажми на объектив, фильтр или экран камеры.");
}
document.querySelector("#reset-scene").onclick = restoreScene;
document.querySelector("#restore-scene").onclick = restoreScene;

if (!lab) {
  document.querySelector("#quality").disabled = true;
  document.querySelector("#reset-scene").disabled = true;
  keyboardTools.hidden = true;
}
