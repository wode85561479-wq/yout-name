// Overlay controls: clock + time slider, presets, toggles and camera shots.

import { phaseName } from '../core/timeofday.js';

const TIME_PRESETS = [
  { label: '清晨', hour: 6.35 },
  { label: '正午', hour: 12.5 },
  { label: '夕阳', hour: 17.05 },
  { label: '黄昏 · 片割れ時', hour: 18.3 },
  { label: '星夜', hour: 21.5 },
];

export function buildUI(state, director, shots, hooks) {
  const $ = (id) => document.getElementById(id);
  const ui = $('ui');
  const slider = $('hour');
  const clock = $('clock');
  const phase = $('phase');
  const caption = $('caption');
  const capName = $('caption-name');
  const capSub = $('caption-sub');
  const stats = $('stats');

  const chip = (label, onClick, cls = '') => {
    const b = document.createElement('button');
    b.className = 'chip ' + cls;
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  const presetEls = TIME_PRESETS.map((p) => {
    const el = chip(p.label, () => { hooks.setHour(p.hour, true); });
    $('time-presets').appendChild(el);
    return { el, p };
  });

  const toggles = [
    { key: 'flow', label: '时间流动', onChange: () => {} },
    { key: 'tour', label: '自动漫游', onChange: (v) => (v ? director.startTour() : director.stopTour()) },
    { key: 'comet', label: '彗星', onChange: () => {} },
    { key: 'split', label: '彗星分裂', onChange: () => {} },
    { key: 'festival', label: '秋祭灯笼', onChange: () => {} },
  ];
  const toggleEls = toggles.map((t) => {
    const el = chip(t.label, () => {
      state[t.key] = !state[t.key];
      t.onChange(state[t.key]);
      refresh();
    });
    $('toggles').appendChild(el);
    return { el, t };
  });

  const shotEls = shots.map((s, i) => {
    const el = chip(`${i + 1} ${s.name}`, () => { director.stopTour(); state.tour = false; director.go(i); refresh(); });
    $('shots').appendChild(el);
    return { el, s };
  });

  slider.addEventListener('input', () => { hooks.setHour(parseFloat(slider.value), false); });

  let capTimer = 0;
  director.onShot = (s) => {
    capName.textContent = s.name;
    capSub.textContent = s.sub || '';
    caption.classList.add('show');
    clearTimeout(capTimer);
    capTimer = setTimeout(() => caption.classList.remove('show'), 4200);
    refresh();
  };

  const setHidden = (h) => {
    state.uiHidden = h;
    ui.classList.toggle('hidden', h);
  };
  $('ui-toggle').addEventListener('click', () => setHidden(!state.uiHidden));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '9') {
      const i = parseInt(k, 10) - 1;
      if (shots[i]) { director.stopTour(); state.tour = false; director.go(i); }
    } else if (k === 't') state.flow = !state.flow;
    else if (k === 'c') { state.tour = !state.tour; state.tour ? director.startTour() : director.stopTour(); }
    else if (k === 'h') setHidden(!state.uiHidden);
    else if (k === 'k') state.comet = !state.comet;
    else if (k === 'f') state.festival = !state.festival;
    refresh();
  });

  function refresh() {
    for (const { el, t } of toggleEls) el.classList.toggle('on', !!state[t.key]);
    for (const { el, s } of shotEls) el.classList.toggle('on', director.current === s);
  }

  let lastText = '';
  return {
    show() { ui.classList.remove('hidden'); state.uiHidden = false; refresh(); },
    refresh,
    update(fps) {
      const h = ((state.hour % 24) + 24) % 24;
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      const txt = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (txt !== lastText) {
        lastText = txt;
        clock.textContent = txt;
        const [jp] = phaseName(h);
        phase.textContent = jp;
        if (document.activeElement !== slider) slider.value = String(h);
        for (const { el, p } of presetEls) el.classList.toggle('on', Math.abs(p.hour - h) < 0.05);
      }
      if (state.debug && fps !== undefined) stats.textContent = `${fps.toFixed(0)} fps`;
    },
    setTourOff() { state.tour = false; refresh(); },
  };
}
