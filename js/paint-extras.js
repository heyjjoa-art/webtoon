// 고급 도구: 직선자/도형, 사각 선택, 자유 변형, 대칭자 설정, 집중선, 스크린톤.
// 전부 Paint(paint-core.js)와 stampDab 등을 만든 paint-brush.js 위에 얹는다.
(function () {
  "use strict";

  // ── 직선자 / 도형 ───────────────────────────────────────────────
  var shapeStart = null;
  Paint.shapeKind = "line"; // 'line' | 'rect' | 'circle'
  Paint.shapeFilled = false; // 사각형/원을 안까지 채울지(직선에는 의미 없음)
  Paint.shapeRadius = 0; // 사각형 모서리 둥글기

  // 미리보기와 실제 그리기가 완전히 같은 경로를 그리게 - 도형 종류별 경로
  // 만들기와, 채우기 여부 적용을 한 곳에만 둔다.
  function buildShapePath(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    if (Paint.shapeKind === "line") {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    } else if (Paint.shapeKind === "rect") {
      var rx = Math.min(x0, x1),
        ry = Math.min(y0, y1);
      var rw = Math.abs(x1 - x0),
        rh = Math.abs(y1 - y0);
      var radius = Math.max(0, Math.min(Paint.shapeRadius || 0, rw / 2, rh / 2));
      if (radius > 0 && ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, radius);
      else ctx.rect(rx, ry, rw, rh);
    } else if (Paint.shapeKind === "circle") {
      var r = Math.hypot(x1 - x0, y1 - y0);
      ctx.arc(x0, y0, r, 0, Math.PI * 2);
    }
  }

  function paintShapePath(ctx) {
    if (Paint.shapeFilled && Paint.shapeKind !== "line") {
      ctx.fillStyle = Paint.color;
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawShapePreview(x1, y1) {
    var ctx = Paint.els.overlayCtx;
    ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    if (!shapeStart) return;
    ctx.save();
    ctx.strokeStyle = Paint.color;
    ctx.lineWidth = Paint.brush.size;
    ctx.lineCap = "round";
    ctx.globalAlpha = Paint.brush.opacity;
    buildShapePath(ctx, shapeStart.x, shapeStart.y, x1, y1);
    paintShapePath(ctx);
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
      var pad = Paint.brush.size + Math.hypot(x - shapeStart.x, y - shapeStart.y);
      buildShapePath(ctx, shapeStart.x, shapeStart.y, x, y);
      paintShapePath(ctx);
      ctx.restore();
      Paint.extendDirty(shapeStart.x, shapeStart.y, pad);
      Paint.extendDirty(x, y, pad);
      Paint.strokeEnd();
    }
    shapeStart = null;
    Paint.els.overlayCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // ── 사각 선택 ────────────────────────────────────────────────────
  // 예전에는 선택을 확정하면(selectUp) 미리보기를 지워버려서 화면에 선택
  // 영역이 전혀 안 보였다(실제로는 스크린톤/빗금/채우기가 그 영역을 그대로
  // 존중하고 있었는데도) - 이제 선택이 있는 동안은 항상 점선 테두리와
  // 손잡이를 그려두고, 그 손잡이/안쪽을 다시 잡아 크기 조정·이동도 할 수
  // 있게 했다. 두께/손잡이 크기를 화면 배율로 나눠서, 얼마나 확대·축소해도
  // 항상 같은 화면 두께로 보인다.
  var selStart = null;
  var selDrag = null; // { mode:'move'|'nw'|'n'|...|'w', startRect, startX, startY }
  var HANDLE_TOL = 16;

  function selectionHandlePoints(r) {
    var left = r.x,
      right = r.x + r.w,
      top = r.y,
      bottom = r.y + r.h,
      midX = r.x + r.w / 2,
      midY = r.y + r.h / 2;
    return {
      nw: [left, top], n: [midX, top], ne: [right, top],
      e: [right, midY], se: [right, bottom], s: [midX, bottom],
      sw: [left, bottom], w: [left, midY]
    };
  }

  function hitTestSelection(x, y) {
    var r = Paint.selectionRect;
    if (!r) return null;
    var tol = HANDLE_TOL / (Paint.view.scale || 1);
    var handles = selectionHandlePoints(r);
    var found = null;
    Object.keys(handles).forEach(function (key) {
      if (found) return;
      var p = handles[key];
      if (Math.hypot(x - p[0], y - p[1]) <= tol) found = key;
    });
    if (found) return found;
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return "move";
    return null;
  }

  function drawSelectionOverlay(rect) {
    var ctx = Paint.els.overlayCtx;
    ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    if (!rect || rect.w <= 0 || rect.h <= 0) return;
    var scale = Paint.view.scale || 1;
    ctx.save();
    ctx.strokeStyle = "rgba(255,138,91,0.95)";
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([8 / scale, 6 / scale]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    if (Paint.selectionRect !== rect) return; // 새로 긋는 중(아직 확정 전)에는 손잡이를 안 보여준다
    var handles = selectionHandlePoints(rect);
    var hr = 5 / scale;
    ctx.save();
    ctx.fillStyle = "#ff8a5b";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 / scale;
    Object.keys(handles).forEach(function (key) {
      var p = handles[key];
      ctx.beginPath();
      ctx.arc(p[0], p[1], hr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function selectDown(x, y) {
    var hit = hitTestSelection(x, y);
    if (hit) {
      selDrag = { mode: hit, startRect: Object.assign({}, Paint.selectionRect), startX: x, startY: y };
      selStart = null;
      return;
    }
    selDrag = null;
    selStart = { x: x, y: y };
  }

  function selectMove(x, y) {
    if (selDrag) {
      var r = selDrag.startRect;
      var dx = x - selDrag.startX;
      var dy = y - selDrag.startY;
      var nr = Object.assign({}, r);
      if (selDrag.mode === "move") {
        nr.x = r.x + dx;
        nr.y = r.y + dy;
      } else {
        if (selDrag.mode.indexOf("e") !== -1) nr.w = Math.max(4, r.w + dx);
        if (selDrag.mode.indexOf("w") !== -1) {
          nr.w = Math.max(4, r.w - dx);
          nr.x = r.x + (r.w - nr.w);
        }
        if (selDrag.mode.indexOf("s") !== -1) nr.h = Math.max(4, r.h + dy);
        if (selDrag.mode.indexOf("n") !== -1) {
          nr.h = Math.max(4, r.h - dy);
          nr.y = r.y + (r.h - nr.h);
        }
      }
      nr.x = Math.max(0, Math.min(nr.x, Paint.nativeW - nr.w));
      nr.y = Math.max(0, Math.min(nr.y, Paint.nativeH - nr.h));
      Paint.selectionRect = nr;
      drawSelectionOverlay(nr);
      return;
    }
    if (!selStart) return;
    drawSelectionOverlay({
      x: Math.min(selStart.x, x),
      y: Math.min(selStart.y, y),
      w: Math.abs(x - selStart.x),
      h: Math.abs(y - selStart.y)
    });
  }

  function selectUp(x, y) {
    if (selDrag) {
      selDrag = null;
      drawSelectionOverlay(Paint.selectionRect);
      if (Paint.onSelectionChanged) Paint.onSelectionChanged();
      return;
    }
    if (!selStart) return;
    var rx = Math.max(0, Math.min(selStart.x, x));
    var ry = Math.max(0, Math.min(selStart.y, y));
    var rw = Math.min(Paint.nativeW - rx, Math.abs(x - selStart.x));
    var rh = Math.min(Paint.nativeH - ry, Math.abs(y - selStart.y));
    Paint.selectionRect = rw > 2 && rh > 2 ? { x: rx, y: ry, w: rw, h: rh } : null;
    selStart = null;
    drawSelectionOverlay(Paint.selectionRect);
    if (Paint.onSelectionChanged) Paint.onSelectionChanged();
  }

  function clearSelection() {
    Paint.selectionRect = null;
    drawSelectionOverlay(null);
    if (Paint.onSelectionChanged) Paint.onSelectionChanged();
  }

  // 선택 영역 지우기(투명하게) - 크기/회전은 변형 도구가 이미 선택 영역을
  // 그대로 대상으로 삼으므로(transformBegin) 따로 만들지 않고 그쪽으로 보낸다.
  function selectionEraseContent() {
    var layer = Paint.getActiveLayer();
    var r = Paint.selectionRect;
    if (!layer || layer.locked || !r) return;
    Paint.strokeStart(layer.id);
    layer.ctx.clearRect(r.x, r.y, r.w, r.h);
    Paint.extendDirty(r.x, r.y, 0);
    Paint.extendDirty(r.x + r.w, r.y + r.h, 0);
    Paint.strokeEnd();
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // 선택 영역을 새 레이어로 복제 - 그 자리에 그대로, 위에 쌓인다.
  function selectionDuplicate() {
    var layer = Paint.getActiveLayer();
    var r = Paint.selectionRect;
    if (!layer || !r) return;
    var newLayer = Paint.addLayer();
    newLayer.ctx.drawImage(layer.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // 선택 영역 안의 내용만 좌우/상하로 뒤집는다(선택이 없으면 캔버스 전체).
  function selectionFlip(axis) {
    var layer = Paint.getActiveLayer();
    var r = Paint.selectionRect || { x: 0, y: 0, w: Paint.nativeW, h: Paint.nativeH };
    if (!layer || layer.locked || r.w <= 0 || r.h <= 0) return;
    var tmp = document.createElement("canvas");
    tmp.width = r.w;
    tmp.height = r.h;
    tmp.getContext("2d").drawImage(layer.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    Paint.strokeStart(layer.id);
    layer.ctx.clearRect(r.x, r.y, r.w, r.h);
    layer.ctx.save();
    if (axis === "h") {
      layer.ctx.translate(r.x + r.w, r.y);
      layer.ctx.scale(-1, 1);
    } else {
      layer.ctx.translate(r.x, r.y + r.h);
      layer.ctx.scale(1, -1);
    }
    layer.ctx.drawImage(tmp, 0, 0);
    layer.ctx.restore();
    Paint.extendDirty(r.x, r.y, 0);
    Paint.extendDirty(r.x + r.w, r.y + r.h, 0);
    Paint.strokeEnd();
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // 다른 도구를 고르거나 화면을 확대·축소해도(줌 배지, 핀치) 선택 테두리가
  // 계속 같은 자리에 같은 굵기로 보이게 다시 그린다.
  function refreshSelectionOverlay() {
    drawSelectionOverlay(Paint.selectionRect);
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

  // ── 플래시(방사형 빛 번짐) ─────────────────────────────────────
  // 집중선과 같은 방식(중심을 누르고 드래그해 반지름 정하기)이지만, 선 다발
  // 대신 중심이 밝고 가장자리로 갈수록 옅어지는 원형 그라디언트 하나를
  // 찍는다 - 충격/섬광 효과에 쓴다.
  var flashCenter = null;
  Paint.flashIntensity = 0.8;

  function hexToRgbLocal(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return { r: 255, g: 255, b: 255 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function drawFlash(ctx, cx, cy, radius, intensity) {
    if (radius <= 0) return;
    var rgb = hexToRgbLocal(Paint.color);
    var col = rgb.r + "," + rgb.g + "," + rgb.b;
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, "rgba(" + col + "," + intensity + ")");
    grad.addColorStop(0.6, "rgba(" + col + "," + intensity * 0.4 + ")");
    grad.addColorStop(1, "rgba(" + col + ",0)");
    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function flashDown(x, y) {
    flashCenter = { x: x, y: y };
  }
  function flashMove(x, y) {
    if (!flashCenter) return;
    var ctx = Paint.els.overlayCtx;
    ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    drawFlash(ctx, flashCenter.x, flashCenter.y, Math.hypot(x - flashCenter.x, y - flashCenter.y), Paint.flashIntensity);
  }
  function flashUp(x, y) {
    if (!flashCenter) return;
    var radius = Math.hypot(x - flashCenter.x, y - flashCenter.y);
    var layer = Paint.getActiveLayer();
    if (layer && !layer.locked && radius > 4) {
      Paint.strokeStart(layer.id);
      drawFlash(layer.ctx, flashCenter.x, flashCenter.y, radius, Paint.flashIntensity);
      Paint.extendDirty(flashCenter.x, flashCenter.y, radius + 4);
      Paint.strokeEnd();
    }
    flashCenter = null;
    Paint.els.overlayCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
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

  // ── 스크린톤/빗금 미리보기 ─────────────────────────────────────
  // 상세 옵션 패널의 작은 캔버스에 지금 슬라이더 값으로 실제 적용했을 때와
  // 똑같은 회전+타일 반복을 그대로 그려 보여준다(캔버스에 직접 쓰지 않고
  // 되돌리기 기록도 남기지 않는다 - applyScreentone/applyHatching과 달리
  // 그냥 미리보기용 ctx 하나만 받는다).
  function previewScreentone(ctx, w, h, spacing, angleDeg, dotSize) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.fillStyle = Paint.color;
    var diag = Math.hypot(w, h);
    for (var y = -diag; y <= diag; y += spacing) {
      for (var x = -diag; x <= diag; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function previewHatching(ctx, w, h, spacing, angleDeg, lineWidth) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.strokeStyle = Paint.color;
    ctx.lineWidth = lineWidth;
    var diag = Math.hypot(w, h);
    for (var x = -diag; x <= diag; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, -diag);
      ctx.lineTo(x, diag);
      ctx.stroke();
    }
    ctx.restore();
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
  Paint.selectionEraseContent = selectionEraseContent;
  Paint.selectionDuplicate = selectionDuplicate;
  Paint.selectionFlip = selectionFlip;
  Paint.refreshSelectionOverlay = refreshSelectionOverlay;
  Paint.transformBegin = transformBegin;
  Paint.transformMoveBy = transformMoveBy;
  Paint.transformScaleRotateBy = transformScaleRotateBy;
  Paint.transformCommit = transformCommit;
  Paint.transformCancel = transformCancel;
  Paint.isTransforming = isTransforming;
  Paint.focusLinesDown = focusLinesDown;
  Paint.focusLinesMove = focusLinesMove;
  Paint.focusLinesUp = focusLinesUp;
  Paint.flashDown = flashDown;
  Paint.flashMove = flashMove;
  Paint.flashUp = flashUp;
  Paint.applyScreentone = applyScreentone;
  Paint.applyHatching = applyHatching;
  Paint.previewScreentone = previewScreentone;
  Paint.previewHatching = previewHatching;
  Paint.setSymmetry = setSymmetry;
})();
