// 고급 도구: 직선자/도형, 사각 선택, 자유 변형, 대칭자 설정, 집중선, 스크린톤.
// 전부 Paint(paint-core.js)와 stampDab 등을 만든 paint-brush.js 위에 얹는다.
(function () {
  "use strict";

  // ── 직선자 / 도형 ───────────────────────────────────────────────
  var shapeStart = null;
  Paint.shapeKind = "line"; // 'line' | 'rect' | 'circle'

  function drawShapePreview(x1, y1) {
    var ctx = Paint.els.overlayCtx;
    ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    if (!shapeStart) return;
    ctx.save();
    ctx.strokeStyle = Paint.color;
    ctx.lineWidth = Paint.brush.size;
    ctx.lineCap = "round";
    ctx.globalAlpha = Paint.brush.opacity;
    ctx.beginPath();
    if (Paint.shapeKind === "line") {
      ctx.moveTo(shapeStart.x, shapeStart.y);
      ctx.lineTo(x1, y1);
    } else if (Paint.shapeKind === "rect") {
      ctx.rect(Math.min(shapeStart.x, x1), Math.min(shapeStart.y, y1), Math.abs(x1 - shapeStart.x), Math.abs(y1 - shapeStart.y));
    } else if (Paint.shapeKind === "circle") {
      var cx = shapeStart.x,
        cy = shapeStart.y;
      var r = Math.hypot(x1 - cx, y1 - cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function shapeDown(x, y) {
    shapeStart = { x: x, y: y };
    drawShapePreview(x, y);
  }
  function shapeMove(x, y) {
    if (!shapeStart) return;
    drawShapePreview(x, y);
  }
  function shapeUp(x, y) {
    if (!shapeStart) return;
    var layer = Paint.getActiveLayer();
    if (layer && !layer.locked) {
      Paint.strokeStart(layer.id);
      var ctx = layer.ctx;
      ctx.save();
      ctx.strokeStyle = Paint.color;
      ctx.lineWidth = Paint.brush.size;
      ctx.lineCap = "round";
      ctx.globalAlpha = Paint.brush.opacity;
      var pad = Paint.brush.size;
      ctx.beginPath();
      if (Paint.shapeKind === "line") {
        ctx.moveTo(shapeStart.x, shapeStart.y);
        ctx.lineTo(x, y);
        Paint.extendDirty(shapeStart.x, shapeStart.y, pad);
        Paint.extendDirty(x, y, pad);
      } else if (Paint.shapeKind === "rect") {
        var rx = Math.min(shapeStart.x, x),
          ry = Math.min(shapeStart.y, y);
        var rw = Math.abs(x - shapeStart.x),
          rh = Math.abs(y - shapeStart.y);
        ctx.rect(rx, ry, rw, rh);
        Paint.extendDirty(rx, ry, pad);
        Paint.extendDirty(rx + rw, ry + rh, pad);
      } else if (Paint.shapeKind === "circle") {
        var r = Math.hypot(x - shapeStart.x, y - shapeStart.y);
        ctx.arc(shapeStart.x, shapeStart.y, r, 0, Math.PI * 2);
        Paint.extendDirty(shapeStart.x - r, shapeStart.y - r, pad);
        Paint.extendDirty(shapeStart.x + r, shapeStart.y + r, pad);
      }
      ctx.stroke();
      ctx.restore();
      Paint.strokeEnd();
    }
    shapeStart = null;
    Paint.els.overlayCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // ── 사각 선택 ────────────────────────────────────────────────────
  var selStart = null;
  function selectDown(x, y) {
    selStart = { x: x, y: y };
  }
  function selectMove(x, y) {
    if (!selStart) return;
    var ctx = Paint.els.overlayCtx;
    ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.min(selStart.x, x), Math.min(selStart.y, y), Math.abs(x - selStart.x), Math.abs(y - selStart.y));
    ctx.restore();
  }
  function selectUp(x, y) {
    if (!selStart) return;
    var rx = Math.max(0, Math.min(selStart.x, x));
    var ry = Math.max(0, Math.min(selStart.y, y));
    var rw = Math.min(Paint.nativeW, Math.abs(x - selStart.x));
    var rh = Math.min(Paint.nativeH, Math.abs(y - selStart.y));
    Paint.selectionRect = rw > 2 && rh > 2 ? { x: rx, y: ry, w: rw, h: rh } : null;
    selStart = null;
    Paint.els.overlayCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    if (Paint.onSelectionChanged) Paint.onSelectionChanged();
  }
  function clearSelection() {
    Paint.selectionRect = null;
    if (Paint.onSelectionChanged) Paint.onSelectionChanged();
  }

  // ── 자유 변형 ───────────────────────────────────────────────────
  // 별도 HTML 손잡이 없이: 펜/마우스 드래그 = 이동, 두 손가락 핀치 = 확대/회전.
  // (핀치 제스처는 paint-ui.js가 tool==='transform'일 때 뷰 줌 대신 여기로 넘겨준다.)
  var transformSrc = null;
  var transformState = null; // { box:{x,y,w,h}, origBox, rotation }

  function transformBegin() {
    var layer = Paint.getActiveLayer();
    if (!layer || layer.locked) return false;
    var sel = Paint.selectionRect;
    var box = sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : { x: 0, y: 0, w: Paint.nativeW, h: Paint.nativeH };
    if (box.w <= 0 || box.h <= 0) return false;
    transformSrc = document.createElement("canvas");
    transformSrc.width = box.w;
    transformSrc.height = box.h;
    transformSrc.getContext("2d").drawImage(layer.canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    Paint.strokeStart(layer.id);
    Paint.extendDirty(box.x, box.y, 0);
    Paint.extendDirty(box.x + box.w, box.y + box.h, 0);
    layer.ctx.clearRect(box.x, box.y, box.w, box.h);
    Paint.composite();
    transformState = { box: box, origBox: Object.assign({}, box), rotation: 0 };
    drawTransformPreview();
    return true;
  }

  function drawTransformPreview() {
    if (!transformState) return;
    var ctx = Paint.els.overlayCtx;
    ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    var b = transformState.box;
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate((transformState.rotation * Math.PI) / 180);
    ctx.drawImage(transformSrc, -b.w / 2, -b.h / 2, b.w, b.h);
    ctx.strokeStyle = "rgba(255,180,84,0.9)";
    ctx.lineWidth = 2 / Paint.view.scale;
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.restore();
  }

  function transformMoveBy(dx, dy) {
    if (!transformState) return;
    transformState.box.x += dx;
    transformState.box.y += dy;
    drawTransformPreview();
  }

  function transformScaleRotateBy(scaleFactor, deltaDeg) {
    if (!transformState) return;
    var b = transformState.box;
    var cx = b.x + b.w / 2,
      cy = b.y + b.h / 2;
    var newW = Math.max(8, b.w * scaleFactor);
    var newH = Math.max(8, b.h * scaleFactor);
    b.x = cx - newW / 2;
    b.y = cy - newH / 2;
    b.w = newW;
    b.h = newH;
    transformState.rotation += deltaDeg;
    drawTransformPreview();
  }

  function transformCommit() {
    if (!transformState) return;
    var layer = Paint.getActiveLayer();
    var b = transformState.box;
    layer.ctx.save();
    layer.ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    layer.ctx.rotate((transformState.rotation * Math.PI) / 180);
    layer.ctx.drawImage(transformSrc, -b.w / 2, -b.h / 2, b.w, b.h);
    layer.ctx.restore();
    var pad = Math.max(b.w, b.h) * 0.5;
    Paint.extendDirty(b.x, b.y, pad);
    Paint.extendDirty(b.x + b.w, b.y + b.h, pad);
    Paint.els.overlayCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    Paint.strokeEnd();
    Paint.composite();
    transformSrc = null;
    transformState = null;
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  function transformCancel() {
    var layer = Paint.getActiveLayer();
    if (transformSrc && transformState && layer) {
      layer.ctx.drawImage(transformSrc, transformState.origBox.x, transformState.origBox.y);
    }
    Paint.cancelStroke();
    Paint.els.overlayCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    Paint.composite();
    transformSrc = null;
    transformState = null;
  }

  function isTransforming() {
    return !!transformState;
  }

  // ── 집중선 ──────────────────────────────────────────────────────
  var focusCenter = null;
  function focusLinesDown(x, y) {
    focusCenter = { x: x, y: y };
  }
  function focusLinesMove(x, y) {
    if (!focusCenter) return;
    var ctx = Paint.els.overlayCtx;
    ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    drawFocusLines(ctx, focusCenter.x, focusCenter.y, Math.hypot(x - focusCenter.x, y - focusCenter.y), Paint.focusLinesDensity || 60);
  }
  function focusLinesUp(x, y) {
    if (!focusCenter) return;
    var radius = Math.hypot(x - focusCenter.x, y - focusCenter.y);
    var layer = Paint.getActiveLayer();
    if (layer && !layer.locked && radius > 4) {
      Paint.strokeStart(layer.id);
      drawFocusLines(layer.ctx, focusCenter.x, focusCenter.y, radius, Paint.focusLinesDensity || 60);
      Paint.extendDirty(focusCenter.x, focusCenter.y, radius + 20);
      Paint.strokeEnd();
    }
    focusCenter = null;
    Paint.els.overlayCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // seed 기반 의사난수 - 매번 결과가 흔들리지 않도록 미리보기와 최종 결과가
  // 같은 시드에서 나오게 한다.
  function pseudoRand(seed) {
    var x = Math.sin(seed * 999.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function drawFocusLines(ctx, cx, cy, radius, count) {
    ctx.save();
    ctx.strokeStyle = Paint.color;
    ctx.lineCap = "round";
    for (var i = 0; i < count; i++) {
      var baseAngle = (Math.PI * 2 * i) / count;
      var jitter = (pseudoRand(i * 7.13) - 0.5) * 0.06;
      var angle = baseAngle + jitter;
      var innerR = radius * (0.08 + pseudoRand(i * 3.1) * 0.06);
      var lenR = radius * (0.75 + pseudoRand(i * 5.7) * 0.25);
      var w = 0.6 + pseudoRand(i * 2.2) * 2.2;
      ctx.globalAlpha = 0.55 + pseudoRand(i * 9.4) * 0.35;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * lenR, cy + Math.sin(angle) * lenR);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 스크린톤 ────────────────────────────────────────────────────
  function applyScreentone(spacing, angleDeg, dotSize) {
    var layer = Paint.getActiveLayer();
    if (!layer || layer.locked) return;
    var sel = Paint.selectionRect;
    var region = sel || { x: 0, y: 0, w: Paint.nativeW, h: Paint.nativeH };

    var tile = document.createElement("canvas");
    tile.width = spacing;
    tile.height = spacing;
    var tctx = tile.getContext("2d");
    tctx.fillStyle = Paint.color;
    tctx.beginPath();
    tctx.arc(spacing / 2, spacing / 2, dotSize / 2, 0, Math.PI * 2);
    tctx.fill();

    Paint.strokeStart(layer.id);
    var ctx = layer.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.w, region.h);
    ctx.clip();
    ctx.translate(region.x + region.w / 2, region.y + region.h / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    var pattern = ctx.createPattern(tile, "repeat");
    ctx.fillStyle = pattern;
    var diag = Math.hypot(region.w, region.h);
    ctx.fillRect(-diag, -diag, diag * 2, diag * 2);
    ctx.restore();
    Paint.extendDirty(region.x, region.y, 0);
    Paint.extendDirty(region.x + region.w, region.y + region.h, 0);
    Paint.strokeEnd();
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // ── 빗금 ────────────────────────────────────────────────────────
  // 스크린톤과 같은 요령(작은 타일을 패턴으로 반복해서 선택 영역/전체에
  // 채운다)이지만, 타일 안에 점 대신 세로선 하나만 그려둔다 - 그 타일
  // 자체를 회전시키면 세로선이 원하는 각도의 평행선 다발이 된다.
  function applyHatching(spacing, angleDeg, lineWidth) {
    var layer = Paint.getActiveLayer();
    if (!layer || layer.locked) return;
    var sel = Paint.selectionRect;
    var region = sel || { x: 0, y: 0, w: Paint.nativeW, h: Paint.nativeH };

    var tile = document.createElement("canvas");
    tile.width = Math.max(2, spacing);
    tile.height = Math.max(2, spacing);
    var tctx = tile.getContext("2d");
    tctx.strokeStyle = Paint.color;
    tctx.lineWidth = lineWidth;
    tctx.beginPath();
    tctx.moveTo(tile.width / 2, -1);
    tctx.lineTo(tile.width / 2, tile.height + 1);
    tctx.stroke();

    Paint.strokeStart(layer.id);
    var ctx = layer.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.w, region.h);
    ctx.clip();
    ctx.translate(region.x + region.w / 2, region.y + region.h / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    var pattern = ctx.createPattern(tile, "repeat");
    ctx.fillStyle = pattern;
    var diag = Math.hypot(region.w, region.h);
    ctx.fillRect(-diag, -diag, diag * 2, diag * 2);
    ctx.restore();
    Paint.extendDirty(region.x, region.y, 0);
    Paint.extendDirty(region.x + region.w, region.y + region.h, 0);
    Paint.strokeEnd();
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // ── 대칭자 설정 ──────────────────────────────────────────────────
  function setSymmetry(mode, segments) {
    Paint.symmetry = { mode: mode, segments: segments || 6 };
  }

  Paint.shapeDown = shapeDown;
  Paint.shapeMove = shapeMove;
  Paint.shapeUp = shapeUp;
  Paint.selectDown = selectDown;
  Paint.selectMove = selectMove;
  Paint.selectUp = selectUp;
  Paint.clearSelection = clearSelection;
  Paint.transformBegin = transformBegin;
  Paint.transformMoveBy = transformMoveBy;
  Paint.transformScaleRotateBy = transformScaleRotateBy;
  Paint.transformCommit = transformCommit;
  Paint.transformCancel = transformCancel;
  Paint.isTransforming = isTransforming;
  Paint.focusLinesDown = focusLinesDown;
  Paint.focusLinesMove = focusLinesMove;
  Paint.focusLinesUp = focusLinesUp;
  Paint.applyScreentone = applyScreentone;
  Paint.applyHatching = applyHatching;
  Paint.setSymmetry = setSymmetry;
})();
