const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, modules, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const sandbox = { exports: {}, require: name => {
    if (!(name in modules)) throw new Error('Unexpected import ' + name);
    return modules[name];
  }, ...globals };
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox.exports;
}

// A small hook/canvas harness keeps the test on the actual component handlers.
const canvas = {
  clientWidth: 400, getBoundingClientRect: () => ({ left: 0, top: 0 }),
  setPointerCapture() {}, addEventListener() {}, removeEventListener() {},
};
const slots = [], effects = [], frames = new Map();
let cursor = 0, nextFrame = 0;
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
const react = {
  useRef(initial) {
    const i = cursor++;
    if (!slots[i]) slots[i] = { current: initial };
    return slots[i];
  },
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
  },
  useMemo(fn, deps) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
    return slots[i].value;
  },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) {
      const previous = slots[i];
      slots[i] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
    }
  },
};
const draws = [];
const canvasHelpers = load('src/landing/canvasNet.ts', { './zoom': { scaleOf: () => 1 } }, { window: { devicePixelRatio: 1 } });
const layout = load('src/landing/layout.ts', {});
const jsx = (type, props) => ({ type, props });
const { NetInteractive } = load('src/landing/NetInteractive.tsx', {
  react, 'react/jsx-runtime': { jsx, jsxs: jsx },
  './data': { T: [{ name: 'First', short: 'First' }, { name: 'Second', short: 'Second' }], rankColor: () => '#000' },
  './layout': layout,
  './canvasNet': { ...canvasHelpers, fitCanvas: () => ({ ctx: {}, dpr: 1 }), cssColor: () => '#000', drawNet: options => draws.push(options) },
  './zoom': { scaleOf: () => 1 },
}, {
  ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } disconnect() {} },
  requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
  cancelAnimationFrame: id => frames.delete(id),
});

function findCanvas(node) {
  if (node?.type === 'canvas') return node;
  for (const child of [node?.props?.children].flat()) {
    const found = child && findCanvas(child);
    if (found) return found;
  }
  return null;
}
function render(props) {
  cursor = 0;
  const node = findCanvas(NetInteractive(props));
  node.props.ref.current = canvas;
  while (effects.length) effects.shift()();
  return node;
}
function flush() {
  for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
}
const checks = [];
function check(name, run) { run(); checks.push(name); }
const initial = {
  cm: { config_id: 'SSE_K06', month: '2024-11', lab: [0, 1], clusters: [{ g: 0 }, { g: 1 }] },
  net: { xy: [[0, 0], [1, 1]], edges: [[0, 1, 0.8]], layout: 'minmax_X0_level_X1_h_projection', aspect: 1 },
  focus: null, selected: null, onPick() {}, ratio: 1, label: 'Two-node fixture',
};

render(initial);
let view = render(initial);
flush();
view.props.onPointerDown({ pointerId: 1, clientX: 20, clientY: 20 });
view.props.onPointerMove({ pointerId: 1, clientX: 30, clientY: 35 });
flush();
check('drag moves the point without changing graph data', () => {
  assert.equal(draws.at(-1).pos.get(0).x, 30);
  assert.equal(draws.at(-1).pos.get(0).y, 35);
  assert.equal(initial.net.edges[0][2], 0.8);
});
view.props.onPointerUp({ pointerId: 1 });
view.props.onKeyDown({ key: '+', preventDefault() {} });
flush();
check('keyboard zoom works', () => assert.equal(draws.at(-1).view.k, 1.4));
view.props.onKeyDown({ key: 'Home', preventDefault() {} });
flush();
check('reset restores positions and zoom', () => {
  assert.equal(draws.at(-1).view.k, 1);
  assert.equal(draws.at(-1).pos.get(0).x, 20);
  assert.equal(draws.at(-1).pos.get(0).y, 20);
});
view.props.onPointerDown({ pointerId: 1, clientX: 20, clientY: 20 });
view = render({
  ...initial, cm: { ...initial.cm, month: '2024-12', lab: ['not_observed', 1] },
  net: { ...initial.net, xy: [null, [1, 1]], edges: [] },
});
check('month change cancels a drag when the point disappears', () => {
  assert.doesNotThrow(() => view.props.onPointerMove({ pointerId: 1, clientX: 26, clientY: 20 }));
});
view = render(initial);
view = render(initial);
flush();
view.props.onPointerMove({ pointerId: 2, clientX: 20, clientY: 20 });
view = render(initial);
flush();
check('hover highlights the group', () => assert.equal(typeof draws.at(-1).hiEdge, 'function'));
const otherModel = { ...initial, cm: { ...initial.cm, config_id: 'NCut_K10' } };
view = render(otherModel);
view = render(otherModel);
flush();
check('model change clears the previous hover', () => assert.equal(draws.at(-1).hiEdge, undefined));
view.props.onKeyDown({ key: '+', preventDefault() {} });
for (const slot of slots) slot?.cleanup?.();
check('unmount cancels the pending animation frame', () => assert.equal(frames.size, 0));

console.log(JSON.stringify({
  passed: true, checks: checks.length, names: checks,
}, null, 2));
