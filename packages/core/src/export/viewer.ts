/**
 * JS nhúng vào HTML export (~2.5KB): chuyển tab, zoom/pan, click node → dòng trong bảng.
 * Viết ES2017 thuần, không phụ thuộc thư viện; trang vẫn đọc được khi tắt JS (mọi view hiển thị lần lượt).
 */
export const VIEWER_JS = `(function () {
  var doc = document;
  doc.documentElement.classList.add('js');

  var tabs = [].slice.call(doc.querySelectorAll('[data-view-tab]'));
  function show(id) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-view-tab') === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      doc.getElementById('view-' + t.getAttribute('data-view-tab')).hidden = !on;
    });
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(t.getAttribute('data-view-tab')); });
  });
  if (tabs.length) show(tabs[0].getAttribute('data-view-tab'));

  [].slice.call(doc.querySelectorAll('.canvas')).forEach(function (canvas) {
    var svg = canvas.querySelector('svg');
    if (!svg) return;
    var base = svg.getAttribute('viewBox').split(' ').map(Number);
    var vb = base.slice();
    function apply() { svg.setAttribute('viewBox', vb.join(' ')); }
    function scale() {
      var r = svg.getBoundingClientRect();
      return Math.max(vb[2] / r.width, vb[3] / r.height);
    }
    function toSvg(e) {
      var r = svg.getBoundingClientRect(), s = scale();
      return [vb[0] + vb[2] / 2 + (e.clientX - r.left - r.width / 2) * s,
              vb[1] + vb[3] / 2 + (e.clientY - r.top - r.height / 2) * s];
    }
    function zoom(f, c) {
      c = c || [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
      vb = [c[0] - (c[0] - vb[0]) * f, c[1] - (c[1] - vb[1]) * f, vb[2] * f, vb[3] * f];
      apply();
    }
    canvas.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toSvg(e));
    }, { passive: false });

    var drag = null, moved = false;
    canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, vb: vb.slice(), s: scale() };
      moved = false;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!moved) canvas.setPointerCapture(e.pointerId);
      moved = true;
      canvas.classList.add('panning');
      vb[0] = drag.vb[0] - dx * drag.s;
      vb[1] = drag.vb[1] - dy * drag.s;
      apply();
    });
    function end() { drag = null; canvas.classList.remove('panning'); }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('click', function (e) {
      if (moved) return;
      var node = e.target.closest('[data-kind="component"]');
      if (!node) return;
      var row = doc.getElementById('c-' + node.getAttribute('data-id'));
      if (!row) return;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.remove('flash');
      void row.offsetWidth;
      row.classList.add('flash');
    });

    var bar = canvas.parentNode.querySelector('.zoom');
    if (bar) bar.addEventListener('click', function (e) {
      var action = e.target.getAttribute('data-zoom');
      if (action === 'in') zoom(1 / 1.25);
      else if (action === 'out') zoom(1.25);
      else if (action === 'fit') { vb = base.slice(); apply(); }
    });
  });
})();`;
