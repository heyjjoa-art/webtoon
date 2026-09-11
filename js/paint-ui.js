// 그림판 화면 조립: 도구 패널·색상·레이어 패널 DOM을 만들고, 포인터 입력을
// "펜/마우스=그리기", "손가락=화면 확대·이동·회전 및 두손가락/세손가락 탭
// (되돌리기/다시하기)"로 갈라 보낸다. 팜리젝션은 이 갈라치기 자체로 해결된다 -
// 손바닥이 닿아도 touch 포인터는 절대 그림을 그리지 않기 때문이다.
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var epId = params.get("ep");
  var panelId = params.get("panel");
  var artId = params.get("art");

  // 이 화면은 두 가지 용도로 쓰인다: 웹툰 컷(ep+panel)을 그리거나, 그림
  // 게시판 글(art) 하나를 그린다. paint-core는 이 구분을 몰라도 되게(그냥
  // key1/key2/가로/세로만 받게) 여기서 URL을 보고 미리 정리해 넘긴다.
  //
  // 로그인 계정의 데이터를 읽어야 하므로(EpisodeStore/ArtStore) Firebase 인증
  // 상태가 확정된 뒤에야 계산할 수 있다 - resolveTarget()으로 미뤄둔다.
  var target = null; // { key1, key2, w, h, backHref }
  function resolveTarget() {
    if (epId && panelId) {
      var epForPanel = EpisodeStore.getEpisode(epId);
      var panelForSize = epForPanel && (epForPanel.panels || []).find(function (p) {
        return p.id === panelId;
      });
      if (epForPanel && panelForSize) {
        return {
          key1: epId,
          key2: panelId,
          w: panelForSize.w,
          h: panelForSize.h,
          backHref: "edit.html?ep=" + encodeURIComponent(epId)
        };
      }
    } else if (artId) {
      var artPost = typeof ArtStore !== "undefined" ? ArtStore.getPost(artId) : null;
      if (artPost) {
        return {
          key1: artId,
          key2: "main",
          w: artPost.canvasWidth || ArtStore.CANVAS_W,
          h: artPost.canvasHeight || ArtStore.CANVAS_H,
          backHref: "art-post.html?id=" + encodeURIComponent(artId)
        };
      }
    }
    return null;
  }

  var TOOLS = [
    { key: "brush", icon: "brush", label: "브러시" },
    { key: "eraser", icon: "eraser", label: "지우개" },
    { key: "fill", icon: "fill", label: "채우기" },
    { key: "eyedropper", icon: "eyedropper", label: "스포이드" },
    { key: "select", icon: "select", label: "선택" },
    { key: "transform", icon: "transform", label: "변형" },
    { key: "line", icon: "line", label: "직선" },
    { key: "rect", icon: "rect", label: "사각형" },
    { key: "circle", icon: "circle", label: "원" },
    { key: "focus", icon: "focus", label: "집중선" }
  ];

  var BRUSH_TYPES = [
    { key: "pen", label: "펜" },
    { key: "soft", label: "부드러운" },
    { key: "marker", label: "마커" },
    { key: "airbrush", label: "에어브러시" },
    { key: "watercolor", label: "수채" },
    { key: "crayon", label: "크레용" }
  ];

  var PALETTE = [
    "#101010", "#ffffff", "#7a7a7a", "#c94f4f", "#e0893f", "#e8c34b",
    "#5fae5f", "#4f8fe0", "#7a5fe0", "#e05fb0", "#8a5a3c", "#3c2a1e",
    "#ffb4c0", "#ffe08a", "#b0e0a0", "#a0d0e0"
  ];

  var activeToolKey = "brush";
  var fillTolerance = 24;
  var fillExpand = 1;

  Session.requireLogin(function () {
    target = resolveTarget();
    if (!target) {
      location.href = "admin.html";
      return;
    }
    Paint.init(target.key1, target.key2, target.w, target.h)
      .then(boot)
      .catch(function (err) {
        console.warn(err);
        alert("그릴 대상을 찾을 수 없어요.");
        location.href = target.backHref;
      });
  });

  function boot() {
    buildToolRail();
    buildBrushSection();
    buildColorSection();
    buildLayerSection();
    buildZoomBar();
    wireTopbar();
    wirePointerDispatch();
    wireKeyboard();
    Paint.onLayersChanged = function () {
      buildLayerSection();
    };
    Paint.onHistoryChanged = updateUndoRedoState;
    Paint.onColorPicked = function () {
      buildColorSection();
    };
    Paint.onSelectionChanged = function () {};
    updateUndoRedoState();
    window.addEventListener("resize", function () {
      Paint.updateStageTransform();
    });
  }

  // ── 도구 레일 ───────────────────────────────────────────────────
  function setTool(key) {
    if (Paint.isTransforming() && activeToolKey === "transform" && key !== "transform") {
      Paint.transformCommit();
    }
    activeToolKey = key;
    if (key === "line") {
      Paint.tool = "shape";
      Paint.shapeKind = "line";
    } else if (key === "rect") {
      Paint.tool = "shape";
      Paint.shapeKind = "rect";
    } else if (key === "circle") {
      Paint.tool = "shape";
      Paint.shapeKind = "circle";
    } else {
      Paint.tool = key;
    }
    if (key === "transform" && !Paint.isTransforming()) {
      Paint.transformBegin();
    }
    Array.prototype.forEach.call(document.querySelectorAll(".tool-btn"), function (btn) {
      btn.classList.toggle("active", btn.dataset.key === key);
    });
  }

  function buildToolRail() {
    var rail = document.getElementById("toolRail");
    rail.innerHTML = "";
    TOOLS.forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "tool-btn" + (t.key === activeToolKey ? " active" : "");
      btn.dataset.key = t.key;
      btn.dataset.tooltip = t.label;
      btn.setAttribute("aria-label", t.label);
      btn.innerHTML = Icons.svg(t.icon);
      btn.addEventListener("click", function () {
        setTool(t.key);
      });
      rail.appendChild(btn);
    });
  }

  // ── 줌/회전 배지(캔버스 아래 가운데) ───────────────────────────
  function buildZoomBar() {
    var bar = document.getElementById("zoomBar");
    bar.innerHTML =
      '<button class="icon-btn" id="zoomOutBtn" data-tooltip="축소">' + Icons.svg("zoomOut", 16) + "</button>" +
      '<span class="zoom-val" id="zoomVal"></span>' +
      '<button class="icon-btn" id="zoomInBtn" data-tooltip="확대">' + Icons.svg("zoomIn", 16) + "</button>" +
      '<button class="icon-btn" id="zoomFitBtn" data-tooltip="화면에 맞추기">' + Icons.svg("zoomFit", 16) + "</button>" +
      '<button class="icon-btn" id="rotateResetBtn" data-tooltip="회전 초기화">' + Icons.svg("rotateReset", 16) + "</button>";
    bar.querySelector("#zoomOutBtn").addEventListener("click", function () {
      zoomBy(1 / 1.2);
    });
    bar.querySelector("#zoomInBtn").addEventListener("click", function () {
      zoomBy(1.2);
    });
    bar.querySelector("#zoomFitBtn").addEventListener("click", function () {
      Paint.fitView();
      syncZoomVal();
    });
    bar.querySelector("#rotateResetBtn").addEventListener("click", function () {
      Paint.view.rotation = 0;
      Paint.updateStageTransform();
      syncZoomVal();
    });
    syncZoomVal();
  }

  function zoomBy(factor) {
    Paint.view.scale = Math.max(0.05, Math.min(8, Paint.view.scale * factor));
    Paint.updateStageTransform();
    syncZoomVal();
  }

  // 휠/핀치로 배율이 바뀌는 곳(wirePointerDispatch)에서도 그때그때 불러서
  // 배지 숫자가 실제 확대율과 항상 같게 유지한다.
  function syncZoomVal() {
    var el = document.getElementById("zoomVal");
    if (el) el.textContent = Math.round(Paint.view.scale * 100) + "%";
  }

  // ── 브러시 섹션 ─────────────────────────────────────────────────
  function buildBrushSection() {
    var el = document.getElementById("brushSection");
    el.innerHTML =
      "<h4>브러시</h4>" +
      '<div class="brush-grid" id="brushTypeGrid"></div>' +
      '<div class="field-row"><span>굵기</span><input type="range" id="brushSize" min="1" max="180" value="' +
      Paint.brush.size +
      '"><span id="brushSizeVal">' +
      Paint.brush.size +
      "</span></div>" +
      '<div class="field-row"><span>농도</span><input type="range" id="brushOpacity" min="5" max="100" value="' +
      Math.round(Paint.brush.opacity * 100) +
      '"><span id="brushOpacityVal">' +
      Math.round(Paint.brush.opacity * 100) +
      "</span></div>" +
      '<div class="field-row"><span>보정</span><input type="range" id="brushSmoothing" min="0" max="10" value="' +
      Paint.brush.smoothing +
      '"><span id="brushSmoothingVal">' +
      Paint.brush.smoothing +
      "</span></div>" +
      "<h4>대칭자</h4>" +
      '<select id="symmetrySelect" style="width:100%;margin-bottom:8px;">' +
      '<option value="none">없음</option><option value="v">좌우</option><option value="h">상하</option><option value="radial">방사</option>' +
      "</select>" +
      '<div class="field-row" id="symSegRow" hidden><span>분할</span><input type="range" id="symSegments" min="2" max="16" value="6"><span id="symSegVal">6</span></div>' +
      "<h4>채우기 옵션</h4>" +
      '<div class="field-row"><span>허용치</span><input type="range" id="fillTolerance" min="0" max="120" value="' +
      fillTolerance +
      '"><span id="fillToleranceVal">' +
      fillTolerance +
      "</span></div>" +
      '<div class="field-row"><span>경계확장</span><input type="range" id="fillExpand" min="0" max="6" value="' +
      fillExpand +
      '"><span id="fillExpandVal">' +
      fillExpand +
      "</span></div>" +
      "<h4>집중선</h4>" +
      '<div class="field-row"><span>밀도</span><input type="range" id="focusDensity" min="12" max="120" value="' +
      (Paint.focusLinesDensity || 60) +
      '"><span id="focusDensityVal">' +
      (Paint.focusLinesDensity || 60) +
      "</span></div>" +
      "<h4>스크린톤</h4>" +
      '<div class="field-row"><span>간격</span><input type="range" id="toneSpacing" min="4" max="30" value="10"><span id="toneSpacingVal">10</span></div>' +
      '<div class="field-row"><span>각도</span><input type="range" id="toneAngle" min="0" max="90" value="45"><span id="toneAngleVal">45</span></div>' +
      '<button class="btn btn-ghost btn-sm" id="toneApplyBtn" style="width:100%;">선택 영역에 스크린톤 적용</button>';

    var grid = el.querySelector("#brushTypeGrid");
    BRUSH_TYPES.forEach(function (b) {
      var chip = document.createElement("div");
      chip.className = "brush-chip" + (Paint.brush.type === b.key ? " active" : "");
      chip.textContent = b.label;
      chip.addEventListener("click", function () {
        Paint.brush.type = b.key;
        buildBrushSection();
      });
      grid.appendChild(chip);
    });

    bindRange(el, "brushSize", "brushSizeVal", function (v) {
      Paint.brush.size = v;
    });
    bindRange(el, "brushOpacity", "brushOpacityVal", function (v) {
      Paint.brush.opacity = v / 100;
    });
    bindRange(el, "brushSmoothing", "brushSmoothingVal", function (v) {
      Paint.brush.smoothing = v;
    });
    bindRange(el, "fillTolerance", "fillToleranceVal", function (v) {
      fillTolerance = v;
    });
    bindRange(el, "fillExpand", "fillExpandVal", function (v) {
      fillExpand = v;
    });
    bindRange(el, "focusDensity", "focusDensityVal", function (v) {
      Paint.focusLinesDensity = v;
    });
    bindRange(el, "toneSpacing", "toneSpacingVal", function () {});
    bindRange(el, "toneAngle", "toneAngleVal", function () {});

    var symSelect = el.querySelector("#symmetrySelect");
    symSelect.value = Paint.symmetry.mode;
    el.querySelector("#symSegRow").hidden = symSelect.value !== "radial";
    symSelect.addEventListener("change", function () {
      Paint.setSymmetry(symSelect.value, Number(el.querySelector("#symSegments").value));
      el.querySelector("#symSegRow").hidden = symSelect.value !== "radial";
    });
    bindRange(el, "symSegments", "symSegVal", function (v) {
      Paint.setSymmetry(symSelect.value, v);
    });

    el.querySelector("#toneApplyBtn").addEventListener("click", function () {
      var spacing = Number(el.querySelector("#toneSpacing").value);
      var angle = Number(el.querySelector("#toneAngle").value);
      Paint.applyScreentone(spacing, angle, Math.max(2, spacing * 0.45));
    });
  }

  function bindRange(root, inputId, labelId, onChange) {
    var input = root.querySelector("#" + inputId);
    var label = root.querySelector("#" + labelId);
    input.addEventListener("input", function () {
      if (label) label.textContent = input.value;
      onChange(Number(input.value));
    });
  }

  // ── 색상 섹션 ───────────────────────────────────────────────────
  function buildColorSection() {
    var el = document.getElementById("colorSection");
    el.innerHTML =
      "<h4>색상</h4>" +
      '<input type="color" id="colorPicker" class="color-current" value="' +
      Paint.color +
      '">' +
      (Paint.recentColors.length
        ? '<div class="field-row" style="margin-bottom:4px;"><span>최근</span></div><div class="swatch-grid" id="recentGrid" style="margin-bottom:10px;"></div>'
        : "") +
      '<div class="swatch-grid" id="swatchGrid"></div>';
    el.querySelector("#colorPicker").addEventListener("input", function (e) {
      Paint.setColor(e.target.value);
    });

    function makeSwatch(c, container) {
      var sw = document.createElement("div");
      sw.className = "swatch" + (c === Paint.color ? " active" : "");
      sw.style.background = c;
      sw.addEventListener("click", function () {
        Paint.setColor(c);
      });
      container.appendChild(sw);
    }

    var recentGrid = el.querySelector("#recentGrid");
    if (recentGrid) Paint.recentColors.forEach(function (c) { makeSwatch(c, recentGrid); });

    var grid = el.querySelector("#swatchGrid");
    PALETTE.forEach(function (c) {
      makeSwatch(c, grid);
    });
  }

  // ── 레이어 섹션 ─────────────────────────────────────────────────
  var BLEND_LABELS = {
    normal: "보통",
    multiply: "곱하기",
    screen: "스크린",
    overlay: "오버레이",
    add: "더하기",
    "color-dodge": "색상닷지"
  };

  function buildLayerSection() {
    var el = document.getElementById("layerSection");
    var layers = Paint.sortedLayers().slice().reverse(); // 위 레이어를 목록 위쪽에
    el.innerHTML =
      "<h4>레이어</h4>" +
      '<div class="layer-toolbar">' +
      '<button class="btn btn-ghost btn-sm" id="layerAddBtn">+ 추가</button>' +
      '<button class="btn btn-ghost btn-sm" id="layerDupBtn">복제</button>' +
      '<button class="btn btn-ghost btn-sm" id="layerMergeBtn">병합↓</button>' +
      '<button class="btn btn-danger btn-sm" id="layerDelBtn">삭제</button>' +
      "</div>" +
      '<div id="layerRows"></div>';

    el.querySelector("#layerAddBtn").addEventListener("click", Paint.addLayer);
    el.querySelector("#layerDupBtn").addEventListener("click", function () {
      Paint.duplicateLayer(Paint.activeLayerId);
    });
    el.querySelector("#layerMergeBtn").addEventListener("click", function () {
      Paint.mergeDown(Paint.activeLayerId);
    });
    el.querySelector("#layerDelBtn").addEventListener("click", function () {
      Paint.removeLayer(Paint.activeLayerId);
    });

    var rowsEl = el.querySelector("#layerRows");
    layers.forEach(function (layer, idx) {
      var row = document.createElement("div");
      row.className = "layer-row" + (layer.id === Paint.activeLayerId ? " active" : "");
      row.innerHTML =
        '<div class="layer-thumb"><img src="' +
        Paint.layerThumbDataUrl(layer.id, 40) +
        '"></div>' +
        '<div class="layer-name">' +
        escapeHtml(layer.name) +
        "</div>" +
        '<button class="icon-btn' +
        (layer.visible ? " on" : "") +
        '" data-act="vis" data-tooltip="보이기/숨기기">' +
        Icons.svg(layer.visible ? "eye" : "eyeOff", 16) +
        "</button>" +
        '<button class="icon-btn' +
        (layer.locked ? " on" : "") +
        '" data-act="lock" data-tooltip="잠금">' +
        Icons.svg("lock", 16) +
        "</button>" +
        '<button class="icon-btn' +
        (layer.clip ? " on" : "") +
        '" data-act="clip" data-tooltip="아래 레이어에 클리핑">' +
        Icons.svg("clip", 16) +
        "</button>" +
        (idx > 0
          ? '<button class="icon-btn" data-act="up" data-tooltip="위로">' + Icons.svg("chevronUp", 16) + "</button>"
          : "") +
        (idx < layers.length - 1
          ? '<button class="icon-btn" data-act="down" data-tooltip="아래로">' + Icons.svg("chevronDown", 16) + "</button>"
          : "");

      row.addEventListener("click", function (e) {
        if (e.target.dataset.act) return;
        Paint.activeLayerId = layer.id;
        buildLayerSection();
      });
      row.querySelector('[data-act="vis"]').addEventListener("click", function (e) {
        e.stopPropagation();
        Paint.setLayerProp(layer.id, "visible", !layer.visible);
      });
      row.querySelector('[data-act="lock"]').addEventListener("click", function (e) {
        e.stopPropagation();
        Paint.setLayerProp(layer.id, "locked", !layer.locked);
      });
      row.querySelector('[data-act="clip"]').addEventListener("click", function (e) {
        e.stopPropagation();
        Paint.setLayerProp(layer.id, "clip", !layer.clip);
      });
      var upBtn = row.querySelector('[data-act="up"]');
      if (upBtn) upBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        Paint.moveLayer(layer.id, "up");
      });
      var downBtn = row.querySelector('[data-act="down"]');
      if (downBtn) downBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        Paint.moveLayer(layer.id, "down");
      });
      rowsEl.appendChild(row);

      if (layer.id === Paint.activeLayerId) {
        var extra = document.createElement("div");
        extra.style.padding = "0 4px 8px";
        extra.innerHTML =
          '<div class="field-row"><span>이름</span><input type="text" id="layerNameInput" value="' +
          escapeHtml(layer.name) +
          '" style="flex:1;background:var(--color-surface);border:1px solid var(--color-border);color:var(--color-text);border-radius:6px;padding:4px 6px;"></div>' +
          '<div class="field-row"><span>불투명도</span><input type="range" id="layerOpacity" min="0" max="100" value="' +
          Math.round(layer.opacity * 100) +
          '"><span id="layerOpacityVal">' +
          Math.round(layer.opacity * 100) +
          "</span></div>" +
          '<div class="field-row"><span>알파잠금</span><input type="checkbox" id="layerAlphaLock"' +
          (layer.alphaLock ? " checked" : "") +
          "></div>" +
          '<div class="field-row"><span>블렌드</span><select id="layerBlend" style="flex:1;">' +
          Object.keys(BLEND_LABELS)
            .map(function (k) {
              return '<option value="' + k + '"' + (layer.blend === k ? " selected" : "") + ">" + BLEND_LABELS[k] + "</option>";
            })
            .join("") +
          "</select></div>";
        rowsEl.appendChild(extra);
        extra.querySelector("#layerNameInput").addEventListener("change", function (e) {
          Paint.setLayerProp(layer.id, "name", e.target.value.trim() || layer.name);
        });
        bindRange(extra, "layerOpacity", "layerOpacityVal", function (v) {
          Paint.setLayerProp(layer.id, "opacity", v / 100);
        });
        extra.querySelector("#layerAlphaLock").addEventListener("change", function (e) {
          Paint.setLayerProp(layer.id, "alphaLock", e.target.checked);
        });
        extra.querySelector("#layerBlend").addEventListener("change", function (e) {
          Paint.setLayerProp(layer.id, "blend", e.target.value);
        });
      }
    });
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  // ── 상단 바 ─────────────────────────────────────────────────────
  function updateUndoRedoState() {
    document.getElementById("undoBtn").disabled = Paint.historyIndex < 0;
    document.getElementById("redoBtn").disabled = Paint.historyIndex >= Paint.history.length - 1;
  }

  function wireTopbar() {
    document.getElementById("undoBtn").innerHTML = Icons.svg("undo", 18);
    document.getElementById("undoBtn").addEventListener("click", Paint.undo);
    document.getElementById("redoBtn").innerHTML = Icons.svg("redo", 18);
    document.getElementById("redoBtn").addEventListener("click", Paint.redo);
    wireInspectorDrawer();
    document.getElementById("clearBtn").addEventListener("click", function () {
      var layer = Paint.getActiveLayer();
      if (!layer || layer.locked) return;
      if (!confirm("이 레이어를 전부 지울까요?")) return;
      Paint.strokeStart(layer.id);
      layer.ctx.clearRect(0, 0, Paint.nativeW, Paint.nativeH);
      Paint.markWholeCanvasDirty();
      Paint.strokeEnd();
      Paint.composite();
      buildLayerSection();
    });
    document.getElementById("paintBackBtn").addEventListener("click", function () {
      if (Paint.isTransforming()) Paint.transformCommit();
      var status = document.getElementById("paintSaveStatus");
      status.textContent = "☁️ 저장 중...";
      Paint.save().then(function () {
        location.href = target.backHref;
      });
    });
  }

  // 900px 이하에서는 브러시·색상·레이어 패널이 오른쪽 고정폭 대신 슬라이드
  // 드로어가 된다(css/tool-ui.css의 .inspector.is-drawer). 예전에는 이 "open"
  // 클래스를 붙였다 떼는 주체가 아무 데도 없어서 좁은 화면에서는 패널 자체에
  // 손을 댈 방법이 없었다 - 그 빠진 스위치가 이 함수다.
  function wireInspectorDrawer() {
    var toggleBtn = document.getElementById("inspectorToggleBtn");
    var panel = document.getElementById("inspectorPanel");
    var scrim = document.getElementById("inspectorScrim");
    toggleBtn.innerHTML = Icons.svg("adjust", 18);

    function setOpen(open) {
      panel.classList.toggle("open", open);
      scrim.classList.toggle("open", open);
    }

    toggleBtn.addEventListener("click", function () {
      setOpen(!panel.classList.contains("open"));
    });
    scrim.addEventListener("click", function () {
      setOpen(false);
    });
  }

  // ── 키보드 단축키(PC) ───────────────────────────────────────────
  function wireKeyboard() {
    document.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        Paint.undo();
      } else if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        Paint.redo();
      } else if (e.key === "[") {
        Paint.brush.size = Math.max(1, Paint.brush.size - 4);
        buildBrushSection();
      } else if (e.key === "]") {
        Paint.brush.size = Math.min(300, Paint.brush.size + 4);
        buildBrushSection();
      } else if (e.key.toLowerCase() === "b") {
        setTool("brush");
      } else if (e.key.toLowerCase() === "e") {
        setTool("eraser");
      } else if (e.key.toLowerCase() === "g") {
        setTool("fill");
      } else if (e.key.toLowerCase() === "i") {
        setTool("eyedropper");
      }
    });
  }

  // ── 포인터 입력 갈라치기 ────────────────────────────────────────
  function wirePointerDispatch() {
    var area = document.getElementById("canvasArea");
    area.style.touchAction = "none";

    var drawPointerId = null;
    var spaceHeld = false;
    var panDragMouse = null;

    document.addEventListener("keydown", function (e) {
      if (e.code === "Space") spaceHeld = true;
    });
    document.addEventListener("keyup", function (e) {
      if (e.code === "Space") spaceHeld = false;
    });

    var touches = new Map(); // pointerId -> {x,y}
    var gesture = null; // { maxTouches, startTime, moved }
    var pinch = null; // { lastDist, lastAngle }

    function touchPointsArray() {
      return Array.from(touches.values());
    }

    function startGestureSessionIfNeeded() {
      if (!gesture) gesture = { maxTouches: touches.size, startTime: Date.now(), moved: 0 };
      else gesture.maxTouches = Math.max(gesture.maxTouches, touches.size);
    }

    function endGestureSessionIfDone() {
      if (touches.size > 0) return;
      if (gesture) {
        var quick = Date.now() - gesture.startTime < 350 && gesture.moved < 16;
        if (quick && gesture.maxTouches === 2) Paint.undo();
        else if (quick && gesture.maxTouches === 3) Paint.redo();
      }
      gesture = null;
      pinch = null;
    }

    function dispatchDown(tool, pt, e) {
      if (tool === "brush" || tool === "eraser") Paint.brushDown(pt.x, pt.y, e.pressure);
      else if (tool === "fill") Paint.floodFillAt(pt.x, pt.y, fillTolerance, fillExpand);
      else if (tool === "eyedropper") Paint.eyedropAt(pt.x, pt.y);
      else if (tool === "select") Paint.selectDown(pt.x, pt.y);
      else if (tool === "line" || tool === "rect" || tool === "circle") Paint.shapeDown(pt.x, pt.y);
      else if (tool === "focus") Paint.focusLinesDown(pt.x, pt.y);
      else if (tool === "transform" && Paint.isTransforming()) transformDragStart = pt;
    }

    var transformDragStart = null;

    function dispatchMove(tool, pt) {
      if (tool === "brush" || tool === "eraser") Paint.brushMove(pt.x, pt.y, currentPressure);
      else if (tool === "select") Paint.selectMove(pt.x, pt.y);
      else if (tool === "line" || tool === "rect" || tool === "circle") Paint.shapeMove(pt.x, pt.y);
      else if (tool === "focus") Paint.focusLinesMove(pt.x, pt.y);
      else if (tool === "transform" && transformDragStart) {
        Paint.transformMoveBy(pt.x - transformDragStart.x, pt.y - transformDragStart.y);
        transformDragStart = pt;
      }
    }

    function dispatchUp(tool, pt) {
      if (tool === "brush" || tool === "eraser") Paint.brushUp();
      else if (tool === "select") Paint.selectUp(pt.x, pt.y);
      else if (tool === "line" || tool === "rect" || tool === "circle") Paint.shapeUp(pt.x, pt.y);
      else if (tool === "focus") Paint.focusLinesUp(pt.x, pt.y);
      else if (tool === "transform") transformDragStart = null;
    }

    var currentPressure = 0.5;

    area.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") {
        area.setPointerCapture(e.pointerId);
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        startGestureSessionIfNeeded();
        if (touches.size === 2) {
          var pts = touchPointsArray();
          pinch = {
            lastDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
            lastAngle: (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI
          };
        }
        return;
      }
      if (drawPointerId !== null) return;
      if (spaceHeld && e.pointerType === "mouse") {
        panDragMouse = { x: e.clientX, y: e.clientY };
        return;
      }
      drawPointerId = e.pointerId;
      currentPressure = e.pressure;
      area.setPointerCapture(e.pointerId);
      var pt = Paint.clientToCanvas(e.clientX, e.clientY);
      dispatchDown(activeToolKey, pt, e);
    });

    area.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") {
        if (!touches.has(e.pointerId)) return;
        var prev = touches.get(e.pointerId);
        var dx = e.clientX - prev.x,
          dy = e.clientY - prev.y;
        if (gesture) gesture.moved += Math.hypot(dx, dy);
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (touches.size === 1) {
          Paint.view.tx += dx;
          Paint.view.ty += dy;
          Paint.updateStageTransform();
        } else if (touches.size === 2 && pinch) {
          var pts = touchPointsArray();
          var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          var angle = (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;
          var scaleFactor = dist / (pinch.lastDist || dist);
          var deltaAngle = angle - pinch.lastAngle;
          if (activeToolKey === "transform" && Paint.isTransforming()) {
            Paint.transformScaleRotateBy(scaleFactor, deltaAngle);
          } else {
            Paint.view.scale = Math.max(0.05, Math.min(8, Paint.view.scale * scaleFactor));
            Paint.view.rotation += deltaAngle;
            Paint.updateStageTransform();
            syncZoomVal();
          }
          pinch.lastDist = dist;
          pinch.lastAngle = angle;
        }
        return;
      }
      if (panDragMouse) {
        Paint.view.tx += e.clientX - panDragMouse.x;
        Paint.view.ty += e.clientY - panDragMouse.y;
        panDragMouse = { x: e.clientX, y: e.clientY };
        Paint.updateStageTransform();
        return;
      }
      if (e.pointerId !== drawPointerId) return;
      currentPressure = e.pressure;
      var pt2 = Paint.clientToCanvas(e.clientX, e.clientY);
      dispatchMove(activeToolKey, pt2);
    });

    function onUp(e) {
      if (e.pointerType === "touch") {
        touches.delete(e.pointerId);
        if (touches.size < 2) pinch = null;
        endGestureSessionIfDone();
        return;
      }
      if (panDragMouse && e.pointerType === "mouse") {
        panDragMouse = null;
        return;
      }
      if (e.pointerId !== drawPointerId) return;
      var pt = Paint.clientToCanvas(e.clientX, e.clientY);
      dispatchUp(activeToolKey, pt);
      drawPointerId = null;
    }
    area.addEventListener("pointerup", onUp);
    area.addEventListener("pointercancel", onUp);

    // 데스크탑 마우스 휠로도 확대/축소할 수 있게(보조 입력).
    area.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        var factor = e.deltaY < 0 ? 1.08 : 0.92;
        Paint.view.scale = Math.max(0.05, Math.min(8, Paint.view.scale * factor));
        Paint.updateStageTransform();
        syncZoomVal();
      },
      { passive: false }
    );
  }
})();
