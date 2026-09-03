// 그림판의 뼈대: 레이어 스택 관리, 합성(composite), 되돌리기/다시하기 히스토리,
// 화면 확대/이동/회전(view transform)과 화면좌표<->캔버스좌표 변환. 실제 브러시로
// 어떻게 그리는지는 paint-brush.js, 도구 패널/제스처는 paint-ui.js, 고급 도구는
// paint-extras.js가 이 파일이 만든 Paint 객체에 기능을 덧붙인다.
var Paint = (function () {
  var BLEND_MAP = {
    normal: "source-over",
    multiply: "multiply",
    screen: "screen",
    overlay: "overlay",
    add: "lighter",
    "color-dodge": "color-dodge"
  };

  var MAX_HISTORY = 60;

  var P = {
    key1: null,
    key2: null,
    nativeW: 0,
    nativeH: 0,
    layers: [],
    activeLayerId: null,
    view: { scale: 1, tx: 0, ty: 0, rotation: 0 },
    history: [],
    historyIndex: -1,
    tool: "brush",
    color: "#101010",
    recentColors: [],
    brush: { type: "pen", size: 18, opacity: 1, smoothing: 4 },
    selectionRect: null // { x, y, w, h } in canvas px, or null(=선택 없음=캔버스 전체)
  };

  var els = {};
  var preStrokeCanvas, preStrokeCtx;
  var clipTempCanvas, clipTempCtx;
  var strokeDirty = null;
  var strokeLayerId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function genId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── 초기화 ──────────────────────────────────────────────────────
  // key1/key2: PanelArtStore가 그림을 저장하는 두 단계 키(예: 회차id+컷id,
  // 또는 그림게시판 글id+"main"). w/h: 그리려는 대상의 논리 크기(컷 크기 또는
  // 그림 게시판 캔버스 크기) - paint-core는 이게 웹툰 컷인지 게시판 그림인지
  // 전혀 몰라도 되고, 그 판단은 paint-ui.js가 URL을 보고 미리 해서 넘겨준다.
  function init(key1, key2, w, h) {
    els.area = $("canvasArea");
    els.stage = $("canvasStage");
    els.composite = $("compositeCanvas");
    els.overlay = $("overlayCanvas");
    els.compositeCtx = els.composite.getContext("2d");
    els.overlayCtx = els.overlay.getContext("2d", { willReadFrequently: false });

    if (!key1 || !key2 || !w || !h) return Promise.reject(new Error("invalid paint target"));
    P.key1 = key1;
    P.key2 = key2;

    var longSide = 2048;
    if (w >= h) {
      P.nativeW = Math.min(longSide, Math.round(w * 2));
      P.nativeH = Math.max(1, Math.round((P.nativeW * h) / w));
    } else {
      P.nativeH = Math.min(longSide, Math.round(h * 2));
      P.nativeW = Math.max(1, Math.round((P.nativeH * w) / h));
    }

    els.composite.width = P.nativeW;
    els.composite.height = P.nativeH;
    els.overlay.width = P.nativeW;
    els.overlay.height = P.nativeH;
    els.stage.style.position = "absolute";
    els.stage.style.left = "50%";
    els.stage.style.top = "50%";
    els.stage.style.width = P.nativeW + "px";
    els.stage.style.height = P.nativeH + "px";
    els.stage.style.marginLeft = -P.nativeW / 2 + "px";
    els.stage.style.marginTop = -P.nativeH / 2 + "px";

    preStrokeCanvas = document.createElement("canvas");
    preStrokeCanvas.width = P.nativeW;
    preStrokeCanvas.height = P.nativeH;
    preStrokeCtx = preStrokeCanvas.getContext("2d");
    clipTempCanvas = document.createElement("canvas");
    clipTempCanvas.width = P.nativeW;
    clipTempCanvas.height = P.nativeH;
    clipTempCtx = clipTempCanvas.getContext("2d");

    return PanelArtStore.loadLayers(key1, key2).then(function (savedLayers) {
      var loaders = [];
      if (savedLayers && savedLayers.length) {
        savedLayers.forEach(function (sl) {
          var layer = makeBlankLayer(sl.name, sl.order);
          layer.id = sl.id;
          layer.opacity = sl.opacity != null ? sl.opacity : 1;
          layer.visible = sl.visible !== false;
          layer.locked = !!sl.locked;
          layer.alphaLock = !!sl.alphaLock;
          layer.clip = !!sl.clip;
          layer.blend = sl.blend || "normal";
          loaders.push(drawImageIntoLayer(layer, sl.image));
          P.layers.push(layer);
        });
        P.activeLayerId = P.layers[P.layers.length - 1].id;
        return Promise.all(loaders);
      }
      // 저장된 레이어가 없으면, 이미 업로드된 사진(합본)이 있으면 그것을 배경
      // 레이어로 깔아준다(edit.html에서 "사진 넣기"로 넣은 경우) - 없으면 빈 캔버스.
      return PanelArtStore.loadPanel(key1, key2).then(function (art) {
        var layer = makeBlankLayer("배경", 0);
        P.layers.push(layer);
        P.activeLayerId = layer.id;
        if (art && art.image) return drawImageIntoLayer(layer, art.image);
      });
    }).then(function () {
      fitView();
      composite();
    });
  }

  function drawImageIntoLayer(layer, dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        layer.ctx.drawImage(img, 0, 0, P.nativeW, P.nativeH);
        resolve();
      };
      img.onerror = function () {
        resolve();
      };
      img.src = dataUrl;
    });
  }

  function makeBlankLayer(name, order) {
    var canvas = document.createElement("canvas");
    canvas.width = P.nativeW;
    canvas.height = P.nativeH;
    return {
      id: genId("l"),
      name: name || "레이어",
      canvas: canvas,
      ctx: canvas.getContext("2d", { willReadFrequently: true }),
      opacity: 1,
      visible: true,
      locked: false,
      alphaLock: false,
      clip: false,
      blend: "normal",
      order: order != null ? order : P.layers.length
    };
  }

  // ── 뷰(줌/이동/회전) ───────────────────────────────────────────
  function fitView() {
    var rect = els.area.getBoundingClientRect();
    var s = Math.min((rect.width * 0.92) / P.nativeW, (rect.height * 0.92) / P.nativeH);
    P.view.scale = s;
    P.view.tx = 0;
    P.view.ty = 0;
    P.view.rotation = 0;
    updateStageTransform();
  }

  function updateStageTransform() {
    els.stage.style.transform =
      "translate(" + P.view.tx + "px," + P.view.ty + "px) rotate(" + P.view.rotation + "deg) scale(" + P.view.scale + ")";
  }

  function clientToCanvas(clientX, clientY) {
    var rect = els.area.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dx = clientX - cx - P.view.tx;
    var dy = clientY - cy - P.view.ty;
    var rad = (-P.view.rotation * Math.PI) / 180;
    var rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    var ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    rx /= P.view.scale;
    ry /= P.view.scale;
    return { x: rx + P.nativeW / 2, y: ry + P.nativeH / 2 };
  }

  // ── 레이어 관리 ─────────────────────────────────────────────────
  function getLayer(id) {
    return P.layers.find(function (l) {
      return l.id === id;
    });
  }
  function getActiveLayer() {
    return getLayer(P.activeLayerId);
  }
  function sortedLayers() {
    return P.layers.slice().sort(function (a, b) {
      return a.order - b.order;
    });
  }

  function addLayer() {
    var maxOrder = P.layers.reduce(function (m, l) {
      return Math.max(m, l.order);
    }, -1);
    var layer = makeBlankLayer("레이어 " + (P.layers.length + 1), maxOrder + 1);
    P.layers.push(layer);
    P.activeLayerId = layer.id;
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
    return layer;
  }

  function removeLayer(id) {
    if (P.layers.length <= 1) return;
    P.layers = P.layers.filter(function (l) {
      return l.id !== id;
    });
    if (P.activeLayerId === id) P.activeLayerId = sortedLayers()[sortedLayers().length - 1].id;
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
  }

  function duplicateLayer(id) {
    var src = getLayer(id);
    if (!src) return;
    var maxOrder = P.layers.reduce(function (m, l) {
      return Math.max(m, l.order);
    }, -1);
    var layer = makeBlankLayer(src.name + " 사본", maxOrder + 1);
    layer.ctx.drawImage(src.canvas, 0, 0);
    layer.opacity = src.opacity;
    layer.blend = src.blend;
    P.layers.push(layer);
    P.activeLayerId = layer.id;
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
  }

  function moveLayer(id, dir) {
    var layers = sortedLayers();
    var idx = layers.findIndex(function (l) {
      return l.id === id;
    });
    var swapIdx = dir === "up" ? idx + 1 : idx - 1;
    if (swapIdx < 0 || swapIdx >= layers.length) return;
    var tmp = layers[idx].order;
    layers[idx].order = layers[swapIdx].order;
    layers[swapIdx].order = tmp;
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
  }

  function mergeDown(id) {
    var layers = sortedLayers();
    var idx = layers.findIndex(function (l) {
      return l.id === id;
    });
    if (idx <= 0) return;
    var top = layers[idx];
    var below = layers[idx - 1];
    below.ctx.globalAlpha = top.opacity;
    below.ctx.globalCompositeOperation = BLEND_MAP[top.blend] || "source-over";
    below.ctx.drawImage(top.canvas, 0, 0);
    below.ctx.globalAlpha = 1;
    below.ctx.globalCompositeOperation = "source-over";
    P.layers = P.layers.filter(function (l) {
      return l.id !== top.id;
    });
    P.activeLayerId = below.id;
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
  }

  function setLayerProp(id, prop, value) {
    var l = getLayer(id);
    if (!l) return;
    l[prop] = value;
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
  }

  // ── 합성 ────────────────────────────────────────────────────────
  function composite() {
    var ctx = els.compositeCtx;
    ctx.clearRect(0, 0, P.nativeW, P.nativeH);
    sortedLayers().forEach(function (layer, idx, arr) {
      if (!layer.visible || layer.opacity <= 0) return;
      if (layer.clip && idx > 0) {
        var below = arr[idx - 1];
        clipTempCtx.clearRect(0, 0, P.nativeW, P.nativeH);
        clipTempCtx.globalCompositeOperation = "source-over";
        clipTempCtx.drawImage(layer.canvas, 0, 0);
        clipTempCtx.globalCompositeOperation = "destination-in";
        clipTempCtx.drawImage(below.canvas, 0, 0);
        clipTempCtx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = BLEND_MAP[layer.blend] || "source-over";
        ctx.drawImage(clipTempCanvas, 0, 0);
      } else {
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = BLEND_MAP[layer.blend] || "source-over";
        ctx.drawImage(layer.canvas, 0, 0);
      }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function layerThumbDataUrl(id, size) {
    var l = getLayer(id);
    if (!l) return "";
    var s = size || 32;
    var c = document.createElement("canvas");
    c.width = s;
    c.height = s;
    var ctx = c.getContext("2d");
    var scale = Math.min(s / P.nativeW, s / P.nativeH);
    var w = P.nativeW * scale;
    var h = P.nativeH * scale;
    ctx.drawImage(l.canvas, (s - w) / 2, (s - h) / 2, w, h);
    return c.toDataURL("image/png");
  }

  // ── 히스토리(되돌리기/다시하기) ─────────────────────────────────
  // 획 하나 전체를 저장하지 않고, 실제로 바뀐 사각형 영역의 픽셀만 before/after로
  // 저장한다. 시작 시점엔 아직 어느 영역이 바뀔지 모르므로, 레이어 전체를 가벼운
  // drawImage로 preStrokeCanvas에 복사해두고(픽셀 복사라 getImageData보다 훨씬
  // 싸다) 끝난 뒤에 실제로 바뀐 영역만 잘라 저장한다.
  function strokeStart(layerId) {
    strokeLayerId = layerId;
    strokeDirty = null;
    var layer = getLayer(layerId);
    preStrokeCtx.clearRect(0, 0, P.nativeW, P.nativeH);
    preStrokeCtx.drawImage(layer.canvas, 0, 0);
  }

  function extendDirty(x, y, pad) {
    var x0 = Math.max(0, Math.floor(x - pad));
    var y0 = Math.max(0, Math.floor(y - pad));
    var x1 = Math.min(P.nativeW, Math.ceil(x + pad));
    var y1 = Math.min(P.nativeH, Math.ceil(y + pad));
    if (!strokeDirty) {
      strokeDirty = { x0: x0, y0: y0, x1: x1, y1: y1 };
    } else {
      strokeDirty.x0 = Math.min(strokeDirty.x0, x0);
      strokeDirty.y0 = Math.min(strokeDirty.y0, y0);
      strokeDirty.x1 = Math.max(strokeDirty.x1, x1);
      strokeDirty.y1 = Math.max(strokeDirty.y1, y1);
    }
  }

  function markWholeCanvasDirty() {
    extendDirty(0, 0, 0);
    strokeDirty.x0 = 0;
    strokeDirty.y0 = 0;
    strokeDirty.x1 = P.nativeW;
    strokeDirty.y1 = P.nativeH;
  }

  function strokeEnd() {
    if (!strokeDirty || !strokeLayerId) {
      strokeLayerId = null;
      return;
    }
    var layer = getLayer(strokeLayerId);
    var r = strokeDirty;
    var w = r.x1 - r.x0;
    var h = r.y1 - r.y0;
    if (w <= 0 || h <= 0 || !layer) {
      strokeLayerId = null;
      strokeDirty = null;
      return;
    }
    var before = preStrokeCtx.getImageData(r.x0, r.y0, w, h);
    var after = layer.ctx.getImageData(r.x0, r.y0, w, h);
    P.history = P.history.slice(0, P.historyIndex + 1);
    P.history.push({ layerId: strokeLayerId, rect: { x: r.x0, y: r.y0, w: w, h: h }, before: before, after: after });
    if (P.history.length > MAX_HISTORY) P.history.shift();
    P.historyIndex = P.history.length - 1;
    strokeLayerId = null;
    strokeDirty = null;
    if (P.onHistoryChanged) P.onHistoryChanged();
  }

  // 진행 중이던 strokeStart를 커밋하지 않고 취소한다(자유 변형을 취소할 때 등).
  function cancelStroke() {
    strokeLayerId = null;
    strokeDirty = null;
  }

  function undo() {
    if (P.historyIndex < 0) return;
    var entry = P.history[P.historyIndex];
    var layer = getLayer(entry.layerId);
    if (layer) layer.ctx.putImageData(entry.before, entry.rect.x, entry.rect.y);
    P.historyIndex--;
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
    if (P.onHistoryChanged) P.onHistoryChanged();
  }

  function redo() {
    if (P.historyIndex >= P.history.length - 1) return;
    P.historyIndex++;
    var entry = P.history[P.historyIndex];
    var layer = getLayer(entry.layerId);
    if (layer) layer.ctx.putImageData(entry.after, entry.rect.x, entry.rect.y);
    composite();
    if (P.onLayersChanged) P.onLayersChanged();
    if (P.onHistoryChanged) P.onHistoryChanged();
  }

  // ── 저장 ────────────────────────────────────────────────────────
  function save() {
    composite();
    // 합본은 알파가 필요 없다(컷 모양은 edit.html에서 border-radius/overflow로
    // 처리한다) - 그래서 흰 배경으로 한 번 깔아 JPEG로도 안전하게 압축되게 한다.
    var flat = document.createElement("canvas");
    flat.width = P.nativeW;
    flat.height = P.nativeH;
    var fctx = flat.getContext("2d");
    fctx.fillStyle = "#ffffff";
    fctx.fillRect(0, 0, P.nativeW, P.nativeH);
    fctx.drawImage(els.composite, 0, 0);
    var compositeDataUrl = flat.toDataURL("image/png");

    var layerPayload = sortedLayers().map(function (l) {
      return {
        id: l.id,
        name: l.name,
        order: l.order,
        opacity: l.opacity,
        visible: l.visible,
        locked: l.locked,
        alphaLock: l.alphaLock,
        clip: l.clip,
        blend: l.blend,
        image: l.canvas.toDataURL("image/png")
      };
    });

    return Promise.all([
      PanelArtStore.savePanel(P.key1, P.key2, compositeDataUrl),
      PanelArtStore.saveLayers(P.key1, P.key2, layerPayload)
    ]);
  }

  P.init = init;
  P.$ = $;
  P.els = els;
  P.getLayer = getLayer;
  P.getActiveLayer = getActiveLayer;
  P.sortedLayers = sortedLayers;
  P.addLayer = addLayer;
  P.removeLayer = removeLayer;
  P.duplicateLayer = duplicateLayer;
  P.moveLayer = moveLayer;
  P.mergeDown = mergeDown;
  P.setLayerProp = setLayerProp;
  P.composite = composite;
  P.layerThumbDataUrl = layerThumbDataUrl;
  P.strokeStart = strokeStart;
  P.extendDirty = extendDirty;
  P.markWholeCanvasDirty = markWholeCanvasDirty;
  P.strokeEnd = strokeEnd;
  P.cancelStroke = cancelStroke;
  P.undo = undo;
  P.redo = redo;
  P.save = save;
  P.fitView = fitView;
  P.updateStageTransform = updateStageTransform;
  P.clientToCanvas = clientToCanvas;
  P.genId = genId;
  P.BLEND_MAP = BLEND_MAP;

  return P;
})();
