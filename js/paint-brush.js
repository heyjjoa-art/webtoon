// 브러시 엔진 + 페인트통 + 스포이드. Paint(paint-core.js)가 만든 레이어 캔버스에
// 직접 그린다. 화면 갱신은 매 점마다가 아니라 requestAnimationFrame으로 묶어서
// (drawScheduled) 태블릿에서도 프레임이 밀리지 않게 한다.
(function () {
  "use strict";

  var drawing = false;
  var smoothX = 0,
    smoothY = 0;
  var lastStampX = 0,
    lastStampY = 0;
  var lastPressure = 0.5;
  var drawScheduled = false;

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  // 좌표 + 시드로 결정되는 의사난수 - 매번 다시 그려도(미리보기, 되돌리기 후
  // 재구성 등) 같은 질감이 나오게, 이전 결과를 기억해두지 않고 매번 다시
  // 계산한다.
  function pseudoRand2(x, y, seed) {
    var v = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
    return v - Math.floor(v);
  }

  // ── 텍스처 없는 붓의 "진짜 붓 느낌" 합성 ────────────────────────
  // 펜/크레파스를 뺀 나머지(부드러운/마커/에어브러시/수채화/유화/연필)를
  // dab마다 곧장 레이어에 알파 블렌딩해서 찍으면, 겹치는 부분은 진하고
  // 한 번만 지나간 가장자리는 옅어서 "동그라미 여러 개를 늘어놓은" 자국이
  // 남는다. 그래서 이 붓들은 한 획이 끝날 때까지 dab을 별도 스크래치
  // 캔버스에만 모아 찍고("농도" 배율 없이, 매번 같은 세기로), 화면에는
  // 매번 [획 시작 전 원본 복원 → 스크래치를 농도값 딱 한 번만 곱해서 얹기]
  // 를 다시 해서 보여준다 - 그러면 겹친 정도와 무관하게 한 획 전체가
  // 고르게 이어진 하나의 붓자국으로 보인다.
  var SCRATCH_TYPES = { soft: true, marker: true, airbrush: true, watercolor: true, oil: true, pencil: true };
  var useScratch = false;
  var scratchCanvas = null;
  var scratchCtx = null;
  var scratchPreCanvas = null;
  var scratchPreCtx = null;
  var scratchDirty = null; // {x0,y0,x1,y1}

  function ensureScratchCanvases() {
    if (scratchCanvas && scratchCanvas.width === Paint.nativeW && scratchCanvas.height === Paint.nativeH) return;
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = Paint.nativeW;
    scratchCanvas.height = Paint.nativeH;
    scratchCtx = scratchCanvas.getContext("2d");
    scratchPreCanvas = document.createElement("canvas");
    scratchPreCanvas.width = Paint.nativeW;
    scratchPreCanvas.height = Paint.nativeH;
    scratchPreCtx = scratchPreCanvas.getContext("2d");
  }

  function scratchStart(layer) {
    ensureScratchCanvases();
    scratchDirty = null;
    scratchCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    scratchPreCtx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
    scratchPreCtx.drawImage(layer.canvas, 0, 0);
  }

  function scratchExtendDirty(x, y, pad) {
    var x0 = Math.max(0, Math.floor(x - pad));
    var y0 = Math.max(0, Math.floor(y - pad));
    var x1 = Math.min(Paint.nativeW, Math.ceil(x + pad));
    var y1 = Math.min(Paint.nativeH, Math.ceil(y + pad));
    if (!scratchDirty) {
      scratchDirty = { x0: x0, y0: y0, x1: x1, y1: y1 };
    } else {
      scratchDirty.x0 = Math.min(scratchDirty.x0, x0);
      scratchDirty.y0 = Math.min(scratchDirty.y0, y0);
      scratchDirty.x1 = Math.max(scratchDirty.x1, x1);
      scratchDirty.y1 = Math.max(scratchDirty.y1, y1);
    }
  }

  function scratchRecomposite(layer, opacity) {
    if (!scratchDirty) return;
    var r = scratchDirty;
    var w = r.x1 - r.x0,
      h = r.y1 - r.y0;
    if (w <= 0 || h <= 0) return;
    var ctx = layer.ctx;
    ctx.clearRect(r.x0, r.y0, w, h);
    ctx.drawImage(scratchPreCanvas, r.x0, r.y0, w, h, r.x0, r.y0, w, h);
    var clipped = applyClipToCtx(ctx);
    ctx.save();
    ctx.globalAlpha = opacity;
    if (layer.alphaLock) ctx.globalCompositeOperation = "source-atop";
    ctx.drawImage(scratchCanvas, r.x0, r.y0, w, h, r.x0, r.y0, w, h);
    ctx.restore();
    if (clipped) ctx.restore();
  }

  function scheduleComposite() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(function () {
      drawScheduled = false;
      Paint.composite();
    });
  }

  // ── 필압 → 굵기/불투명도 곡선 ─────────────────────────────────────
  // pressure가 0(포인터 지원 안 함)이면 mouse/finger 기본값 0.5로 취급한다.
  function pressureCurve(p) {
    if (!p || p <= 0) p = 0.5;
    return p;
  }

  function effectiveSize(pressure) {
    var p = pressureCurve(pressure);
    return Math.max(1, Paint.brush.size * (0.35 + 0.65 * p));
  }

  function effectiveOpacity(pressure) {
    var p = pressureCurve(pressure);
    return Paint.brush.opacity * (0.55 + 0.45 * p);
  }

  // ── 브러시 종류별 dab(점) 하나 찍기 ───────────────────────────────
  function stampDab(ctx, x, y, size, opacity, isEraser) {
    var r = Math.max(0.5, size / 2);
    var rgb = hexToRgb(Paint.color);
    ctx.save();
    ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";

    var type = Paint.brush.type;
    if (type === "pen") {
      ctx.globalAlpha = opacity;
      ctx.fillStyle = isEraser ? "#000" : Paint.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "marker") {
      ctx.globalAlpha = opacity * 0.55;
      ctx.fillStyle = isEraser ? "#000" : Paint.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "crayon") {
      // 크레파스: 매끈한 원 하나 대신 작고 거친 반점 여러 개를 흩뿌려서,
      // 크레파스 특유의 울퉁불퉁하고 종이 결이 비치는 "톡톡한" 질감을 낸다
      // (하나의 원 안을 고르게 덮지 않고 군데군데 비워둬야 그렇게 보인다).
      var speckCount = 7;
      ctx.fillStyle = isEraser ? "#000" : Paint.color;
      for (var si = 0; si < speckCount; si++) {
        var sn1 = pseudoRand2(x, y, si * 3.7 + 1.1);
        var sn2 = pseudoRand2(x, y, si * 5.3 + 2.9);
        var sn3 = pseudoRand2(x, y, si * 7.1 + 4.4);
        var sAngle = sn1 * Math.PI * 2;
        var sDist = sn2 * r * 0.85;
        var sx = x + Math.cos(sAngle) * sDist;
        var sy = y + Math.sin(sAngle) * sDist;
        var sr = Math.max(0.6, r * (0.22 + sn3 * 0.3));
        ctx.globalAlpha = Math.min(1, opacity * (0.4 + sn3 * 0.6));
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === "pencil") {
      // 연필: 크레용보다 촘촘하고 가는 흑연 질감 - 반경을 줄이고 더 잘게
      // 흔들리는 노이즈로 사각사각한 느낌을 낸다.
      var pn = Math.abs(Math.sin(x * 45.233 + y * 12.997) * 12345.678) % 1;
      ctx.globalAlpha = opacity * (0.45 + pn * 0.4);
      ctx.fillStyle = isEraser ? "#000" : Paint.color;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "oil") {
      // 유화: 불투명하게 겹쳐 칠하되, 붓털처럼 살짝 어긋난 작은 덩어리
      // 3~4개를 밝기까지 흔들어 얹어서 두툼하고 거친 임파스토 질감을 낸다.
      var blobs = 4;
      for (var bi = 0; bi < blobs; bi++) {
        var jn = Math.abs(Math.sin((x + bi * 13.1) * 12.9898 + (y + bi * 7.7) * 78.233) * 43758.5453) % 1;
        var jAngle = jn * Math.PI * 2 + bi;
        var jDist = r * 0.3 * jn;
        var bx = x + Math.cos(jAngle) * jDist;
        var by = y + Math.sin(jAngle) * jDist;
        var shade = 1 + (jn - 0.5) * 0.35;
        ctx.globalAlpha = Math.min(1, opacity * 0.85);
        ctx.fillStyle = isEraser
          ? "#000"
          : "rgb(" +
            Math.round(Math.min(255, Math.max(0, rgb.r * shade))) +
            "," +
            Math.round(Math.min(255, Math.max(0, rgb.g * shade))) +
            "," +
            Math.round(Math.min(255, Math.max(0, rgb.b * shade))) +
            ")";
        ctx.beginPath();
        ctx.arc(bx, by, r * (0.6 + jn * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // soft / airbrush / watercolor 공통: 부드러운 방사형 그라디언트
      var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      var baseAlpha = type === "airbrush" ? opacity * 0.35 : type === "watercolor" ? opacity * 0.4 : opacity;
      var col = isEraser ? "0,0,0" : rgb.r + "," + rgb.g + "," + rgb.b;
      grad.addColorStop(0, "rgba(" + col + "," + baseAlpha + ")");
      if (type === "watercolor") {
        // 수채화 번짐: 가운데는 옅고, 가장자리 쪽에 살짝 더 진한 "웅덩이"
        // 테두리를 둬서 실제 물감이 마르며 가장자리에 고이는 느낌을 낸다.
        grad.addColorStop(0.6, "rgba(" + col + "," + baseAlpha * 0.8 + ")");
        grad.addColorStop(0.85, "rgba(" + col + "," + baseAlpha * 1.3 + ")");
      }
      grad.addColorStop(1, "rgba(" + col + ",0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── 미리보기 ────────────────────────────────────────────────────
  // 상세 옵션 패널의 작은 캔버스에 지금 설정(종류/굵기/농도)으로 그으면 어떤
  // 느낌인지 보여준다. stampDab을 그대로 써서 실제 그리기와 다르게 보일 일이
  // 없다 - 레이어/알파잠금/클리핑 같은 건 미리보기와 무관해서 빼고 찍는다.
  function previewStroke(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    var size = Math.min(Paint.brush.size, h * 0.85);
    var y = h / 2;
    var margin = size / 2 + 4;
    var x0 = Math.min(margin, w / 2);
    var x1 = Math.max(w - margin, w / 2);
    var spacing = spacingFor(size);
    var steps = Math.max(1, Math.round((x1 - x0) / spacing));
    // 실제로 그릴 때와 똑같이 보여야 하니, 스크래치를 쓰는 붓은 미리보기도
    // 같은 방식(dab을 임시 캔버스에 모아 찍고 농도를 한 번만 곱하기)으로
    // 그린다 - 아니면 미리보기만 예전의 "동그라미 자국" 그대로 보인다.
    if (SCRATCH_TYPES[Paint.brush.type]) {
      var tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      var tctx = tmp.getContext("2d");
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        stampDab(tctx, x0 + (x1 - x0) * t, y, size, 1, false);
      }
      ctx.save();
      ctx.globalAlpha = Paint.brush.opacity;
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
      return;
    }
    for (var i2 = 0; i2 <= steps; i2++) {
      var t2 = i2 / steps;
      stampDab(ctx, x0 + (x1 - x0) * t2, y, size, Paint.brush.opacity, false);
    }
  }

  function spacingFor(size) {
    var type = Paint.brush.type;
    var factor =
      type === "airbrush"
        ? 0.4
        : type === "soft" || type === "watercolor"
        ? 0.22
        : type === "oil"
        ? 0.2
        : type === "pencil"
        ? 0.12
        : type === "crayon"
        ? 0.1
        : 0.16;
    return Math.max(1, size * factor);
  }

  function applyClipToCtx(ctx) {
    var sel = Paint.selectionRect;
    if (!sel) return false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sel.x, sel.y, sel.w, sel.h);
    ctx.clip();
    return true;
  }

  // 알파 잠금: 이미 그려진 픽셀 위에만 그리게 한다(레이어의 기존 알파 형태를
  // 벗어나지 않음) - 합성 시 'source-atop'으로 찍으면 기존 알파 바깥은 무시된다.
  function stampWithLock(ctx, layer, x, y, size, opacity, isEraser) {
    var clipped = applyClipToCtx(ctx);
    if (layer.alphaLock && !isEraser) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      stampDabRaw(ctx, x, y, size, opacity, false);
      ctx.restore();
    } else {
      stampDabRaw(ctx, x, y, size, opacity, isEraser);
    }
    if (clipped) ctx.restore();
  }

  // stampDab은 자체 save/restore를 하므로 alphaLock의 globalCompositeOperation이
  // 안쪽에서 덮어씌워지지 않도록 별도 이름으로 감싼다.
  function stampDabRaw(ctx, x, y, size, opacity, isEraser) {
    stampDab(ctx, x, y, size, opacity, isEraser);
  }

  function symmetryPoints(x, y) {
    var pts = [{ x: x, y: y }];
    var sym = Paint.symmetry;
    if (!sym || sym.mode === "none") return pts;
    var cx = Paint.nativeW / 2;
    var cy = Paint.nativeH / 2;
    if (sym.mode === "v") pts.push({ x: 2 * cx - x, y: y });
    else if (sym.mode === "h") pts.push({ x: x, y: 2 * cy - y });
    else if (sym.mode === "radial") {
      var segs = sym.segments || 6;
      var dx = x - cx,
        dy = y - cy;
      var baseAngle = Math.atan2(dy, dx);
      var dist = Math.sqrt(dx * dx + dy * dy);
      for (var i = 1; i < segs; i++) {
        var a = baseAngle + (Math.PI * 2 * i) / segs;
        pts.push({ x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist });
      }
    }
    return pts;
  }

  function stampAt(x, y, pressure) {
    var layer = Paint.getActiveLayer();
    if (!layer || layer.locked) return;
    var size = effectiveSize(pressure);
    var isEraser = Paint.tool === "eraser";
    symmetryPoints(x, y).forEach(function (pt) {
      if (useScratch) {
        // 스크래치에는 매번 같은 세기로 찍는다 - 필압에 따른 농도 변화는
        // 포기하는 대신, 겹친 정도와 무관하게 한 획 전체가 고르게 이어지는
        // 걸 얻는다(최종 농도는 scratchRecomposite에서 딱 한 번만 곱한다).
        stampDab(scratchCtx, pt.x, pt.y, size, 1, false);
        scratchExtendDirty(pt.x, pt.y, size / 2 + 4);
      } else {
        stampWithLock(layer.ctx, layer, pt.x, pt.y, size, effectiveOpacity(pressure), isEraser);
      }
      Paint.extendDirty(pt.x, pt.y, size / 2 + 4);
    });
  }

  // dab을 여러 번 찍는 구간(strokeSegment의 반복문, brushDown의 첫 점) 전체가
  // 끝난 뒤 딱 한 번만 스크래치를 레이어에 다시 올린다 - dab마다 매번
  // 다시 올리면(느려지기만 하고 결과는 똑같다) 낭비다.
  function finishScratchIfNeeded(layer) {
    if (useScratch) scratchRecomposite(layer, Paint.brush.opacity);
  }

  function strokeSegment(x0, y0, x1, y1, pressure) {
    var dist = Math.hypot(x1 - x0, y1 - y0);
    var size = effectiveSize(pressure);
    var spacing = spacingFor(size);
    var steps = Math.max(1, Math.floor(dist / spacing));
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      stampAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, pressure);
    }
    var layer = Paint.getActiveLayer();
    if (layer) finishScratchIfNeeded(layer);
    scheduleComposite();
  }

  function brushDown(x, y, pressure) {
    drawing = true;
    smoothX = x;
    smoothY = y;
    lastStampX = x;
    lastStampY = y;
    lastPressure = pressure;
    var layer = Paint.getActiveLayer();
    if (!layer || layer.locked) {
      drawing = false;
      return;
    }
    Paint.strokeStart(layer.id);
    useScratch = Paint.tool !== "eraser" && !!SCRATCH_TYPES[Paint.brush.type];
    if (useScratch) scratchStart(layer);
    stampAt(x, y, pressure);
    finishScratchIfNeeded(layer);
    scheduleComposite();
  }

  function brushMove(x, y, pressure) {
    if (!drawing) return;
    // 손떨림 보정: 지수이동평균으로 입력 좌표를 부드럽게 따라가게 한다. 슬라이더
    // 값이 클수록(최대 10) alpha가 작아져 더 느리게(=더 부드럽게) 따라간다.
    var smoothing = Paint.brush.smoothing || 0;
    var alpha = 1 - Math.min(0.9, smoothing / 11);
    smoothX += (x - smoothX) * alpha;
    smoothY += (y - smoothY) * alpha;
    strokeSegment(lastStampX, lastStampY, smoothX, smoothY, pressure);
    lastStampX = smoothX;
    lastStampY = smoothY;
    lastPressure = pressure;
  }

  // 보정(smoothing)은 표시 위치를 실제 포인터보다 늦게 따라가게 만드는
  // 방식이라, 손을 뗀 순간의 좌표를 마지막 stampAt으로 넘겨받지 않으면
  // 선이 커서보다 항상 살짝 못 미치는 지점에서 끊긴다 - 특히 보정 값이
  // 클 때 이 잘림이 눈에 띄게 커진다. 그래서 뗄 때 좌표(x, y)를 받아
  // 그 지점까지 보정 없이 마지막 한 번을 더 그어 마무리한다.
  function brushUp(x, y) {
    if (!drawing) return;
    drawing = false;
    if (x != null && y != null && (x !== lastStampX || y !== lastStampY)) {
      strokeSegment(lastStampX, lastStampY, x, y, lastPressure);
    }
    useScratch = false;
    Paint.strokeEnd();
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // ── 페인트통 ────────────────────────────────────────────────────
  // da는 "시작 지점의 실제 알파"와 비교해야 한다 - 예전에는 255(불투명)로
  // 고정돼 있어서, 아직 아무것도 안 그려 투명한(alpha 0) 캔버스에서 채우기를
  // 누르면 시작 픽셀조차 "너무 다르다"고 판정돼 한 칸도 안 채워지는 버그가
  // 있었다(선화 없는 새 캔버스에 배경색부터 채우는, 아주 흔한 경우였다).
  function colorDistance(data, idx, r, g, b, a) {
    var dr = data[idx] - r,
      dg = data[idx + 1] - g,
      db = data[idx + 2] - b,
      da = data[idx + 3] - a;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da * 0.25);
  }

  function floodFillAt(x, y, tolerance, expand) {
    var layer = Paint.getActiveLayer();
    if (!layer || layer.locked) return;
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= Paint.nativeW || y >= Paint.nativeH) return;

    var ctx = layer.ctx;
    var img = ctx.getImageData(0, 0, Paint.nativeW, Paint.nativeH);
    var data = img.data;
    var w = Paint.nativeW,
      h = Paint.nativeH;
    var startIdx = (y * w + x) * 4;
    var rgb = hexToRgb(Paint.color);
    var startR = data[startIdx],
      startG = data[startIdx + 1],
      startB = data[startIdx + 2],
      startA = data[startIdx + 3];
    // 채우려는 색과 시작점이 이미 같은 색이면(허용치 안) 아무것도 안 바뀌어
    // 히스토리만 낭비하니 건너뛴다.
    if (
      Math.abs(startR - rgb.r) < 2 &&
      Math.abs(startG - rgb.g) < 2 &&
      Math.abs(startB - rgb.b) < 2 &&
      Math.abs(startA - 255) < 2 &&
      tolerance < 5
    )
      return;

    var mask = new Uint8Array(w * h);
    var stack = [x, y];
    var tol = tolerance != null ? tolerance : 24;
    var visited = new Uint8Array(w * h);
    var minX = x,
      maxX = x,
      minY = y,
      maxY = y;
    while (stack.length) {
      var cy = stack.pop();
      var cx = stack.pop();
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      var pos = cy * w + cx;
      if (visited[pos]) continue;
      visited[pos] = 1;
      var idx = pos * 4;
      if (colorDistance(data, idx, startR, startG, startB, startA) > tol) continue;
      mask[pos] = 1;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }

    // 경계 확장: 선화 사이 틈으로 색이 새는 걸 막기 위해, 채운 영역을 N px
    // 부풀린다(이비스페인트의 "영역 확장" 옵션과 같은 목적).
    var exp = expand || 0;
    for (var e = 0; e < exp; e++) {
      var grown = new Uint8Array(mask);
      for (var yy = Math.max(0, minY - 1); yy <= Math.min(h - 1, maxY + 1); yy++) {
        for (var xx = Math.max(0, minX - 1); xx <= Math.min(w - 1, maxX + 1); xx++) {
          var p = yy * w + xx;
          if (mask[p]) continue;
          if (
            (xx > 0 && mask[p - 1]) ||
            (xx < w - 1 && mask[p + 1]) ||
            (yy > 0 && mask[p - w]) ||
            (yy < h - 1 && mask[p + w])
          ) {
            grown[p] = 1;
          }
        }
      }
      mask = grown;
      minX = Math.max(0, minX - 1);
      maxX = Math.min(w - 1, maxX + 1);
      minY = Math.max(0, minY - 1);
      maxY = Math.min(h - 1, maxY + 1);
    }

    var sel = Paint.selectionRect;
    for (var py = minY; py <= maxY; py++) {
      for (var px = minX; px <= maxX; px++) {
        var mpos = py * w + px;
        if (!mask[mpos]) continue;
        if (sel && (px < sel.x || px >= sel.x + sel.w || py < sel.y || py >= sel.y + sel.h)) continue;
        var didx = mpos * 4;
        data[didx] = rgb.r;
        data[didx + 1] = rgb.g;
        data[didx + 2] = rgb.b;
        data[didx + 3] = 255;
      }
    }

    Paint.strokeStart(layer.id);
    var rw = maxX - minX + 1,
      rh = maxY - minY + 1;
    ctx.putImageData(img, 0, 0, minX, minY, rw, rh);
    Paint.extendDirty(minX, minY, 0);
    Paint.extendDirty(maxX, maxY, 0);
    Paint.strokeEnd();
    Paint.composite();
    if (Paint.onLayersChanged) Paint.onLayersChanged();
  }

  // ── 스포이드 ────────────────────────────────────────────────────
  function eyedropAt(x, y) {
    x = Math.max(0, Math.min(Paint.nativeW - 1, Math.floor(x)));
    y = Math.max(0, Math.min(Paint.nativeH - 1, Math.floor(y)));
    var data = Paint.els.compositeCtx.getImageData(x, y, 1, 1).data;
    // 아직 아무것도 안 그려진 자리는 캔버스 픽셀이 완전히 투명(0,0,0,0)이라
    // 그대로 읽으면 검정으로 찍힌다 - 화면에는 흰 종이로 보이니(#compositeCanvas의
    // 흰 배경) 실제로도 흰색을 고른 것처럼 맞춰준다.
    var hex =
      data[3] === 0
        ? "#ffffff"
        : "#" +
          [data[0], data[1], data[2]]
            .map(function (v) {
              return v.toString(16).padStart(2, "0");
            })
            .join("");
    Paint.setColor(hex);
  }

  Paint.brushDown = brushDown;
  Paint.brushMove = brushMove;
  Paint.brushUp = brushUp;
  Paint.previewStroke = previewStroke;
  Paint.floodFillAt = floodFillAt;
  Paint.eyedropAt = eyedropAt;
  Paint.symmetry = { mode: "none", segments: 6 };
})();
