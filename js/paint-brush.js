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
      // 매 dab마다 좌표 기반 의사난수로 알파를 흔들어 거친 질감을 낸다(패턴
      // 이미지를 매번 합성하는 것보다 훨씬 가볍다).
      var n = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      ctx.globalAlpha = opacity * (0.4 + n * 0.5);
      ctx.fillStyle = isEraser ? "#000" : Paint.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // soft / airbrush / watercolor 공통: 부드러운 방사형 그라디언트
      var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      var baseAlpha = type === "airbrush" ? opacity * 0.35 : type === "watercolor" ? opacity * 0.45 : opacity;
      var col = isEraser ? "0,0,0" : rgb.r + "," + rgb.g + "," + rgb.b;
      grad.addColorStop(0, "rgba(" + col + "," + baseAlpha + ")");
      if (type === "watercolor") grad.addColorStop(0.7, "rgba(" + col + "," + baseAlpha * 0.85 + ")");
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
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      stampDab(ctx, x0 + (x1 - x0) * t, y, size, Paint.brush.opacity, false);
    }
  }

  function spacingFor(size) {
    var type = Paint.brush.type;
    var factor = type === "airbrush" ? 0.4 : type === "soft" || type === "watercolor" ? 0.22 : 0.16;
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
    var opacity = effectiveOpacity(pressure);
    var isEraser = Paint.tool === "eraser";
    symmetryPoints(x, y).forEach(function (pt) {
      stampWithLock(layer.ctx, layer, pt.x, pt.y, size, opacity, isEraser);
      Paint.extendDirty(pt.x, pt.y, size / 2 + 4);
    });
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
    stampAt(x, y, pressure);
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
