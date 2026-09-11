// 그림판 화면 조립: 도구 패널·색상·레이어 패널 DOM을 만들고, 포인터 입력을
// "손가락/펜/마우스 첫 번째 접점=지금 고른 도구로 그리기", "두 번째 손가락이
// 닿으면 그 획을 정상 종료하고 화면 확대·이동·회전으로 전환", "두손가락/
// 세손가락 빠른 탭=되돌리기/다시하기"로 갈라 보낸다. 스타일러스 없이
// 손가락만으로 그리는 사용자가 많아(원래는 손가락=항상 팬/줌이었다) 첫 접점을
// 그대로 그리기에 쓰게 바꿨다 - 팜 등 의도치 않은 두 번째 접점이 닿으면 즉시
// 획을 끝내고 제스처로 넘어가므로 큰 오작동으로 번지지는 않는다.
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
    { key: "fill", icon: "fill", label: "채우기(단색/스크린톤/빗금)" },
    { key: "eyedropper", icon: "eyedropper", label: "스포이드" },
    { key: "select", icon: "select", label: "선택" },
    { key: "transform", icon: "transform", label: "변형" },
    { key: "shape", icon: "rect", label: "도형(직선/사각형/원)" },
    { key: "effect", icon: "focus", label: "효과(집중선/플래시/땀/눈물 등)", sep: true }
  ];

  // 도구 하나하나가 아니라 "옵션 패널이 어느 것을 보여줄지"의 그룹 - 지우개는
  // 브러시와 같은 굵기/농도 설정을 쓰고, 스포이드는 자기 설정이 없는 대신
  // 색상 패널을 보여주는 게 더 쓸모 있다.
  var TOOL_PANEL_FOR = {
    brush: "brush",
    eraser: "brush",
    fill: "fill",
    eyedropper: "color",
    select: "select",
    transform: "transform",
    shape: "shape",
    effect: "effect"
  };

  var BRUSH_TYPES = [
    { key: "pen", label: "펜" },
    { key: "soft", label: "부드러운" },
    { key: "marker", label: "마커" },
    { key: "airbrush", label: "에어브러시" },
    { key: "watercolor", label: "수채" },
    { key: "crayon", label: "크레용" }
  ];

  // 만화 표현에 흔히 쓰는 효과 모음 - 전부 "누르고 끌어서 크기(모션은
  // 방향까지) 정하기"라는 같은 동작을 쓴다(js/paint-extras.js의 effectDown/
  // Move/Up 하나가 종류만 갈라 보낸다).
  var EFFECT_KINDS = [
    { key: "focus", label: "집중선" },
    { key: "flash", label: "플래시" },
    { key: "sweat", label: "땀" },
    { key: "tear", label: "눈물" },
    { key: "chill", label: "오싹" },
    { key: "motion", label: "발효과" },
    { key: "anger", label: "화남" },
    { key: "sparkle", label: "반짝임" }
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
    Paint.onStickerChanged = function () {
      var row = document.getElementById("stickerActionsRow");
      if (row) row.hidden = !Paint.hasSticker();
    };
    showInspectorPage(TOOL_PANEL_FOR[activeToolKey] || "brush");
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
    if (Paint.hasSticker() && activeToolKey === "effect" && key !== "effect") {
      Paint.stickerCommit();
    }
    activeToolKey = key;
    // 직선/사각형/원은 도구 레일에서는 "도형" 하나로 묶여있고, 어떤 모양을
    // 그릴지는 상세 옵션 패널의 세그먼트(shapeKind)가 따로 정한다 - 여기서는
    // 그 값을 그대로 둔다(마지막으로 고른 모양을 기억).
    Paint.tool = key;
    if (key === "transform" && !Paint.isTransforming()) {
      Paint.transformBegin();
    }
    Array.prototype.forEach.call(document.querySelectorAll(".tool-btn"), function (btn) {
      btn.classList.toggle("active", btn.dataset.key === key);
    });
    // 도구를 바꿔도 선택 영역 점선 테두리는 계속 보여야 한다(선택은 도구와
    // 무관하게 채우기/스크린톤/빗금이 참조하는 전역 상태라서).
    if (Paint.refreshSelectionOverlay) Paint.refreshSelectionOverlay();
  }

  var LONG_PRESS_MS = 450;

  // 꾹 누르고 있으면(짧게 탭하는 것과 구분) onLongPress를 한 번만 부른다.
  // 커서가 버튼 밖으로 나가거나 손을 떼면 취소된다.
  function wireLongPress(el, onLongPress) {
    var timer = null;
    function start() {
      clearTimeout(timer);
      timer = setTimeout(onLongPress, LONG_PRESS_MS);
    }
    function cancel() {
      clearTimeout(timer);
    }
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
  }

  // 패널들을 한 화면에 쭉 늘어놓고 스크롤해 찾아가게 하던 것에서, 지금 고른
  // 도구의 패널 "하나만" 보여주는 방식으로 바꿨다 - 브러시 옵션 사이에
  // 채우기·집중선·패턴 설정이 뒤섞여 있던 것도 이걸로 자연스럽게 해결된다.
  // page: "color"|"layer"|TOOL_PANEL_FOR의 값(brush/fill/shape/focus/pattern/
  // select/transform) 중 하나.
  function showInspectorPage(page) {
    var brushSection = document.getElementById("brushSection");
    var colorSection = document.getElementById("colorSection");
    var layerSection = document.getElementById("layerSection");
    var showTools = page !== "color" && page !== "layer";
    brushSection.hidden = !showTools;
    colorSection.hidden = page !== "color";
    layerSection.hidden = page !== "layer";
    if (showTools) {
      Array.prototype.forEach.call(brushSection.querySelectorAll(".tool-panel"), function (el) {
        el.hidden = el.dataset.tool !== page;
      });
    }
  }

  // 도구를 고르는 동시에 그 도구의 상세 옵션 패널을 연다 - 모든 도구가
  // 똑같은 방식(꾹 누르기)으로 상세옵션에 닿을 수 있게 한다.
  function openToolOptions(key) {
    setTool(key);
    setInspectorOpen(true);
    showInspectorPage(TOOL_PANEL_FOR[key] || "brush");
  }

  function buildToolRail() {
    var rail = document.getElementById("toolRail");
    rail.innerHTML = "";
    TOOLS.forEach(function (t) {
      if (t.sep) {
        var sep = document.createElement("div");
        sep.className = "tool-rail-sep";
        rail.appendChild(sep);
      }
      var btn = document.createElement("button");
      btn.className = "tool-btn" + (t.key === activeToolKey ? " active" : "");
      btn.dataset.key = t.key;
      btn.dataset.tooltip = t.label;
      btn.setAttribute("aria-label", t.label);
      btn.innerHTML = Icons.svg(t.icon);
      btn.addEventListener("click", function () {
        setTool(t.key);
      });
      wireLongPress(btn, function () {
        openToolOptions(t.key);
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
    // 선택 테두리/손잡이 굵기는 화면 배율로 나눠서 그리므로, 배율이 바뀔
    // 때마다 다시 그려야 항상 같은 화면 두께를 유지한다.
    if (Paint.refreshSelectionOverlay) Paint.refreshSelectionOverlay();
  }

  // 저장해둔 브러시 프리셋(타입+굵기+농도+보정 묶음) 한 줄. 매번 슬라이더를
  // 다시 맞추지 않아도 되게, 자주 쓰는 조합에 이름을 붙여뒀다 한 번에 적용한다.
  function buildPresetRow(container) {
    container.innerHTML = "";
    BrushPresetStore.getAll().forEach(function (p) {
      var chip = document.createElement("div");
      chip.className = "preset-chip";

      var applyBtn = document.createElement("button");
      applyBtn.className = "brush-chip";
      applyBtn.textContent = p.name;
      applyBtn.dataset.tooltip = p.type + " · " + p.size + "px";
      applyBtn.addEventListener("click", function () {
        Paint.brush.type = p.type;
        Paint.brush.size = p.size;
        Paint.brush.opacity = p.opacity;
        Paint.brush.smoothing = p.smoothing;
        buildBrushSection();
      });

      var delBtn = document.createElement("button");
      delBtn.className = "icon-btn danger";
      delBtn.dataset.tooltip = "프리셋 삭제";
      delBtn.innerHTML = Icons.svg("close", 12);
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        BrushPresetStore.deletePreset(p.name);
        buildBrushSection();
      });

      chip.appendChild(applyBtn);
      chip.appendChild(delBtn);
      container.appendChild(chip);
    });

    var saveBtn = document.createElement("button");
    saveBtn.className = "icon-btn";
    saveBtn.dataset.tooltip = "현재 설정을 프리셋으로 저장";
    saveBtn.innerHTML = Icons.svg("plus", 14);
    saveBtn.addEventListener("click", function () {
      var name = window.prompt("프리셋 이름을 입력하세요", "");
      if (!name) return;
      name = name.trim();
      if (!name) return;
      BrushPresetStore.savePreset(name, Paint.brush);
      buildBrushSection();
    });
    container.appendChild(saveBtn);
  }

  // ── 브러시 섹션 ─────────────────────────────────────────────────
  var fillMode = "solid"; // 채우기 패널의 "단색"/"스크린톤(dot)"/"빗금(line)" 선택 상태

  function buildBrushSection() {
    var el = document.getElementById("brushSection");
    el.innerHTML =
      // ── 브러시(지우개도 같이 씀) ──────────────────────────────────
      '<div class="tool-panel" data-tool="brush">' +
      "<h4>브러시</h4>" +
      '<div class="preset-row" id="presetRow"></div>' +
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
      '<canvas class="tool-preview" id="brushPreviewCanvas" width="240" height="46"></canvas>' +
      "<h4>대칭자</h4>" +
      '<select id="symmetrySelect" style="width:100%;margin-bottom:8px;">' +
      '<option value="none">없음</option><option value="v">좌우</option><option value="h">상하</option><option value="radial">방사</option>' +
      "</select>" +
      '<div class="field-row" id="symSegRow" hidden><span>분할</span><input type="range" id="symSegments" min="2" max="16" value="6"><span id="symSegVal">6</span></div>' +
      "</div>" +
      // ── 채우기(단색/스크린톤/빗금 통합) ─────────────────────────────
      '<div class="tool-panel" data-tool="fill">' +
      "<h4>채우기</h4>" +
      '<div class="segmented" id="fillModeSeg">' +
      '<button class="segmented-btn" data-v="solid">단색</button>' +
      '<button class="segmented-btn" data-v="dot">스크린톤</button>' +
      '<button class="segmented-btn" data-v="line">빗금</button>' +
      "</div>" +
      '<div id="fillSolidFields">' +
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
      '<p class="tool-panel-hint">캔버스를 눌러 그 자리와 이어진 색을 채웁니다.</p>' +
      "</div>" +
      '<div id="fillPatternFields" hidden>' +
      '<div class="field-row"><span>간격</span><input type="range" id="patternSpacing" min="4" max="40" value="10"><span id="patternSpacingVal">10</span></div>' +
      '<div class="field-row"><span id="patternSizeLabel">크기</span><input type="range" id="patternSize" min="1" max="20" value="4"><span id="patternSizeVal">4</span></div>' +
      '<div class="field-row"><span>각도</span><input type="range" id="patternAngle" min="0" max="180" value="45"><span id="patternAngleVal">45</span></div>' +
      '<canvas class="tool-preview" id="patternPreviewCanvas" width="240" height="70"></canvas>' +
      '<button class="btn btn-ghost btn-sm" id="patternApplyBtn" style="width:100%;">선택 영역에 적용</button>' +
      "</div>" +
      "</div>" +
      // ── 도형 ──────────────────────────────────────────────────────
      '<div class="tool-panel" data-tool="shape">' +
      "<h4>도형</h4>" +
      '<div class="segmented" id="shapeKindSeg">' +
      '<button class="segmented-btn" data-v="line">직선</button>' +
      '<button class="segmented-btn" data-v="rect">사각형</button>' +
      '<button class="segmented-btn" data-v="circle">원</button>' +
      "</div>" +
      '<div class="field-row"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="shapeFilled"' +
      (Paint.shapeFilled ? " checked" : "") +
      "> 안쪽 채우기</label></div>" +
      '<div class="field-row" id="shapeRadiusRow"><span>모서리 둥글기</span><input type="range" id="shapeRadius" min="0" max="80" value="' +
      (Paint.shapeRadius || 0) +
      '"><span id="shapeRadiusVal">' +
      (Paint.shapeRadius || 0) +
      "</span></div>" +
      '<p class="tool-panel-hint">굵기·색상은 브러시 패널의 값을 그대로 씁니다.</p>' +
      "</div>" +
      // ── 효과(집중선/플래시 통합) ────────────────────────────────────
      '<div class="tool-panel" data-tool="effect">' +
      "<h4>효과</h4>" +
      '<div class="brush-grid" id="effectKindGrid"></div>' +
      '<div class="field-row" id="focusDensityRow"><span>밀도</span><input type="range" id="focusDensity" min="12" max="120" value="' +
      (Paint.focusLinesDensity || 60) +
      '"><span id="focusDensityVal">' +
      (Paint.focusLinesDensity || 60) +
      "</span></div>" +
      '<div class="field-row" id="flashIntensityRow" hidden><span>밝기</span><input type="range" id="flashIntensity" min="10" max="100" value="' +
      Math.round((Paint.flashIntensity != null ? Paint.flashIntensity : 0.8) * 100) +
      '"><span id="flashIntensityVal">' +
      Math.round((Paint.flashIntensity != null ? Paint.flashIntensity : 0.8) * 100) +
      "</span></div>" +
      '<canvas class="tool-preview" id="effectPreviewCanvas" width="240" height="70"></canvas>' +
      '<p class="tool-panel-hint">캔버스를 눌러 중심을 잡고 드래그해 크기(발효과는 방향도)를 정한 뒤 손을 떼면 스티커처럼 붙습니다. 파란 손잡이로 회전, 주황 손잡이로 크기, 안쪽을 드래그해 이동시킬 수 있어요.</p>' +
      '<div class="field-row" id="stickerActionsRow" hidden><button class="btn btn-primary btn-sm" id="stickerCommitBtn" style="flex:1;">확정</button><button class="btn btn-ghost btn-sm" id="stickerCancelBtn" style="flex:1;">취소</button></div>' +
      "</div>" +
      // ── 선택 ──────────────────────────────────────────────────────
      '<div class="tool-panel" data-tool="select">' +
      "<h4>선택</h4>" +
      '<p class="tool-panel-hint">캔버스를 드래그해 영역을 고르고, 손잡이를 끌어 크기를 바꿀 수 있습니다. 채우기·효과·패턴은 선택된 영역 안에만 적용됩니다.</p>' +
      '<div class="field-row"><button class="btn btn-ghost btn-sm" id="selDupBtn" style="flex:1;">복사(레이어로)</button><button class="btn btn-danger btn-sm" id="selEraseBtn" style="flex:1;">지우기</button></div>' +
      '<div class="field-row"><button class="btn btn-ghost btn-sm" id="selFlipHBtn" style="flex:1;">좌우 반전</button><button class="btn btn-ghost btn-sm" id="selFlipVBtn" style="flex:1;">상하 반전</button></div>' +
      '<button class="btn btn-ghost btn-sm" id="selTransformBtn" style="width:100%;margin-bottom:8px;">변형(크기·회전)으로 보내기</button>' +
      '<button class="btn btn-ghost btn-sm" id="selClearBtn" style="width:100%;">선택 해제</button>' +
      "</div>" +
      // ── 변형 ──────────────────────────────────────────────────────
      '<div class="tool-panel" data-tool="transform">' +
      "<h4>변형</h4>" +
      '<p class="tool-panel-hint">두 손가락으로 오므리거나 벌려서 크기를, 돌려서 회전시킬 수 있습니다. 한 손가락 드래그는 이동입니다.</p>' +
      '<div class="field-row"><button class="btn btn-primary btn-sm" id="xformCommitBtn" style="flex:1;">확정</button><button class="btn btn-ghost btn-sm" id="xformCancelBtn" style="flex:1;">취소</button></div>' +
      "</div>";

    buildPresetRow(el.querySelector("#presetRow"));

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

    function redrawBrushPreview() {
      var c = el.querySelector("#brushPreviewCanvas");
      if (c && Paint.previewStroke) Paint.previewStroke(c.getContext("2d"), c.width, c.height);
    }
    function redrawPatternPreview() {
      var c = el.querySelector("#patternPreviewCanvas");
      if (!c) return;
      var spacing = Number(el.querySelector("#patternSpacing").value);
      var size = Number(el.querySelector("#patternSize").value);
      var angle = Number(el.querySelector("#patternAngle").value);
      if (fillMode === "dot" && Paint.previewScreentone) {
        Paint.previewScreentone(c.getContext("2d"), c.width, c.height, spacing, angle, size);
      } else if (Paint.previewHatching) {
        Paint.previewHatching(c.getContext("2d"), c.width, c.height, spacing, angle, size);
      }
    }

    bindRange(el, "brushSize", "brushSizeVal", function (v) {
      Paint.brush.size = v;
      redrawBrushPreview();
    });
    bindRange(el, "brushOpacity", "brushOpacityVal", function (v) {
      Paint.brush.opacity = v / 100;
      redrawBrushPreview();
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
      redrawEffectPreview();
    });
    bindRange(el, "flashIntensity", "flashIntensityVal", function (v) {
      Paint.flashIntensity = v / 100;
      redrawEffectPreview();
    });
    bindRange(el, "patternSpacing", "patternSpacingVal", redrawPatternPreview);
    bindRange(el, "patternSize", "patternSizeVal", redrawPatternPreview);
    bindRange(el, "patternAngle", "patternAngleVal", redrawPatternPreview);
    bindRange(el, "shapeRadius", "shapeRadiusVal", function (v) {
      Paint.shapeRadius = v;
    });

    redrawBrushPreview();
    redrawPatternPreview();

    // ── 채우기: 단색/스크린톤/빗금 모드 전환 ───────────────────────
    function setFillMode(mode) {
      fillMode = mode;
      Array.prototype.forEach.call(el.querySelectorAll("#fillModeSeg .segmented-btn"), function (b) {
        b.classList.toggle("active", b.dataset.v === mode);
      });
      el.querySelector("#fillSolidFields").hidden = mode !== "solid";
      el.querySelector("#fillPatternFields").hidden = mode === "solid";
      if (mode !== "solid") {
        el.querySelector("#patternSizeLabel").textContent = mode === "dot" ? "점 크기" : "굵기";
        redrawPatternPreview();
      }
    }
    Array.prototype.forEach.call(el.querySelectorAll("#fillModeSeg .segmented-btn"), function (btn) {
      btn.addEventListener("click", function () {
        setFillMode(btn.dataset.v);
      });
    });
    setFillMode(fillMode);

    el.querySelector("#patternApplyBtn").addEventListener("click", function () {
      var spacing = Number(el.querySelector("#patternSpacing").value);
      var size = Number(el.querySelector("#patternSize").value);
      var angle = Number(el.querySelector("#patternAngle").value);
      if (fillMode === "dot") Paint.applyScreentone(spacing, angle, size);
      else if (fillMode === "line") Paint.applyHatching(spacing, angle, size);
    });

    // ── 도형: 종류 + 채우기 여부 + 둥글기 ───────────────────────────
    function syncShapeRadiusRow() {
      el.querySelector("#shapeRadiusRow").hidden = Paint.shapeKind !== "rect";
    }
    Array.prototype.forEach.call(el.querySelectorAll("#shapeKindSeg .segmented-btn"), function (btn) {
      btn.classList.toggle("active", btn.dataset.v === Paint.shapeKind);
      btn.addEventListener("click", function () {
        Paint.shapeKind = btn.dataset.v;
        Array.prototype.forEach.call(el.querySelectorAll("#shapeKindSeg .segmented-btn"), function (b) {
          b.classList.toggle("active", b === btn);
        });
        syncShapeRadiusRow();
      });
    });
    syncShapeRadiusRow();
    el.querySelector("#shapeFilled").addEventListener("change", function (e) {
      Paint.shapeFilled = e.target.checked;
    });

    // ── 효과: 종류 그리드 + 미리보기 ────────────────────────────────
    function redrawEffectPreview() {
      var c = el.querySelector("#effectPreviewCanvas");
      if (c && Paint.previewEffect) Paint.previewEffect(c.getContext("2d"), c.width, c.height, Paint.effectKind);
    }
    var effectGrid = el.querySelector("#effectKindGrid");
    EFFECT_KINDS.forEach(function (k) {
      var chip = document.createElement("div");
      chip.className = "brush-chip" + (Paint.effectKind === k.key ? " active" : "");
      chip.textContent = k.label;
      chip.addEventListener("click", function () {
        setEffectKind(k.key);
      });
      effectGrid.appendChild(chip);
    });
    function setEffectKind(kind) {
      if (Paint.hasSticker()) Paint.stickerCommit();
      Paint.effectKind = kind;
      Array.prototype.forEach.call(effectGrid.querySelectorAll(".brush-chip"), function (chip, i) {
        chip.classList.toggle("active", EFFECT_KINDS[i].key === kind);
      });
      el.querySelector("#focusDensityRow").hidden = kind !== "focus";
      el.querySelector("#flashIntensityRow").hidden = kind !== "flash";
      redrawEffectPreview();
    }
    setEffectKind(Paint.effectKind);
    var stickerActionsRow = el.querySelector("#stickerActionsRow");
    if (stickerActionsRow) stickerActionsRow.hidden = !Paint.hasSticker();
    var stickerCommitBtn = el.querySelector("#stickerCommitBtn");
    if (stickerCommitBtn) {
      stickerCommitBtn.addEventListener("click", function () {
        if (Paint.hasSticker()) Paint.stickerCommit();
      });
    }
    var stickerCancelBtn = el.querySelector("#stickerCancelBtn");
    if (stickerCancelBtn) {
      stickerCancelBtn.addEventListener("click", function () {
        if (Paint.hasSticker()) Paint.stickerCancel();
      });
    }

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

    // ── 선택: 지우기/복사/반전/변형 보내기/해제 ─────────────────────
    el.querySelector("#selClearBtn").addEventListener("click", function () {
      Paint.clearSelection();
    });
    el.querySelector("#selEraseBtn").addEventListener("click", function () {
      Paint.selectionEraseContent();
    });
    el.querySelector("#selDupBtn").addEventListener("click", function () {
      Paint.selectionDuplicate();
    });
    el.querySelector("#selFlipHBtn").addEventListener("click", function () {
      Paint.selectionFlip("h");
    });
    el.querySelector("#selFlipVBtn").addEventListener("click", function () {
      Paint.selectionFlip("v");
    });
    el.querySelector("#selTransformBtn").addEventListener("click", function () {
      openToolOptions("transform");
    });

    el.querySelector("#xformCommitBtn").addEventListener("click", function () {
      if (Paint.isTransforming()) Paint.transformCommit();
    });
    el.querySelector("#xformCancelBtn").addEventListener("click", function () {
      if (Paint.isTransforming()) Paint.transformCancel();
    });

    // 새로 지어진 마크업은 전부 보이는 상태로 시작하므로, 지금 도구에 맞는
    // 패널 하나만 다시 보여준다 - 프리셋 적용/삭제, [ ] 굵기 단축키처럼
    // 이 함수를 다시 부르는 곳마다 따로 챙기지 않아도 되게 여기서 한 번에.
    if (typeof showInspectorPage === "function") {
      showInspectorPage(TOOL_PANEL_FOR[activeToolKey] || "brush");
    }
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
  // 상단 바의 "지금 색상" 스와치 - 드로어를 열지 않아도 항상 보이므로,
  // 색이 바뀌는 모든 경로(피커/스와치/최근색/스포이드)가 buildColorSection을
  // 거치는 김에 여기서 같이 맞춘다.
  function syncColorSwatch() {
    var dot = document.getElementById("currentColorSwatch");
    if (dot) dot.style.background = Paint.color;
  }

  function buildColorSection() {
    syncColorSwatch();
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

  // 옵션이 펼쳐지는 레이어는 항상 하나뿐이다(PC든 모바일이든 동일) - 그리기
  // 대상(Paint.activeLayerId)과는 별개로 둬서, 지금 그리고 있는 레이어를
  // 바꾸지 않고도 다른 레이어의 이름/불투명도/블렌드를 살짝 들여다볼 수 있다.
  var expandedLayerId = null;

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

    // 드래그로 순서를 바꾼 뒤(놓았을 때) 최종 DOM 순서를 그대로 order 값에
    // 반영한다 - 맨 위(화면 첫 줄)가 가장 큰 order(스택 맨 위)가 되도록.
    function commitLayerOrderFromDom() {
      var rows = Array.prototype.slice.call(document.querySelectorAll("#layerRows .layer-row"));
      var total = rows.length;
      rows.forEach(function (row, domIdx) {
        var l = Paint.getLayer(row.dataset.layerId);
        if (l) l.order = total - domIdx;
      });
      Paint.composite();
      if (Paint.onLayersChanged) Paint.onLayersChanged();
    }

    function wireLayerDrag(handle, row) {
      handle.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var rowsContainer = document.getElementById("layerRows");
        row.classList.add("dragging");
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 캡처 실패는 무시 - 드래그 자체는 계속 진행된다 */
        }

        function onMove(ev) {
          var y = ev.clientY;
          var siblings = Array.prototype.slice.call(rowsContainer.querySelectorAll(".layer-row"));
          var target = null;
          for (var i = 0; i < siblings.length; i++) {
            var r = siblings[i];
            if (r === row) continue;
            var rect = r.getBoundingClientRect();
            if (y < rect.top + rect.height / 2) {
              target = r;
              break;
            }
          }
          if (target) {
            if (row.nextSibling !== target) rowsContainer.insertBefore(row, target);
          } else if (rowsContainer.lastElementChild !== row) {
            rowsContainer.appendChild(row);
          }
        }
        function onUp(ev) {
          try {
            handle.releasePointerCapture(ev.pointerId);
          } catch (err) {
            /* 무시 */
          }
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          row.classList.remove("dragging");
          commitLayerOrderFromDom();
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    }

    var rowsEl = el.querySelector("#layerRows");
    layers.forEach(function (layer, idx) {
      var row = document.createElement("div");
      row.className = "layer-row" + (layer.id === Paint.activeLayerId ? " active" : "");
      row.dataset.layerId = layer.id;
      row.innerHTML =
        '<button class="icon-btn layer-drag-handle" data-act="drag" data-tooltip="끌어서 순서 바꾸기">' +
        Icons.svg("menu", 14) +
        "</button>" +
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
        if (e.target.closest("[data-act]")) return;
        Paint.activeLayerId = layer.id;
        expandedLayerId = expandedLayerId === layer.id ? null : layer.id;
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
      wireLayerDrag(row.querySelector('[data-act="drag"]'), row);
      rowsEl.appendChild(row);

      if (layer.id === expandedLayerId) {
        var extra = document.createElement("div");
        extra.className = "layer-details";
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
    // 레이어는 붓이 아니라 그림판 전체에 딸린 개념이라, 어떤 도구를 고르고
    // 있든 상관없이 이 버튼 하나로 바로 레이어 목록에 갈 수 있게 한다.
    document.getElementById("layerMenuBtn").innerHTML = Icons.svg("layers", 18);
    document.getElementById("layerMenuBtn").addEventListener("click", function () {
      setInspectorOpen(true);
      showInspectorPage("layer");
    });
    // 색상도 마찬가지로 도구와 무관하게 항상 필요해서, 상단 바에 지금
    // 색상을 보여주는 스와치를 두고(포토샵 전경색처럼) 눌러서 바로 연다.
    document.getElementById("colorMenuBtn").addEventListener("click", function () {
      setInspectorOpen(true);
      showInspectorPage("color");
    });
    syncColorSwatch();
    document.getElementById("clearBtn").addEventListener("click", function () {
      var layer = Paint.getActiveLayer();
      if (!layer || layer.locked) return;
      if (Paint.hasSticker()) Paint.stickerCancel();
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
      if (Paint.hasSticker()) Paint.stickerCommit();
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
  // 브러시를 꾹 눌렀을 때(buildToolRail) 좁은 화면의 드로어를 곧장 열어주는
  // 용도로도 같이 쓰여서, 열고 닫는 로직을 이 함수 하나로 모아둔다.
  function setInspectorOpen(open) {
    var panel = document.getElementById("inspectorPanel");
    var scrim = document.getElementById("inspectorScrim");
    panel.classList.toggle("open", open);
    scrim.classList.toggle("open", open);
  }

  function wireInspectorDrawer() {
    var toggleBtn = document.getElementById("inspectorToggleBtn");
    var panel = document.getElementById("inspectorPanel");
    var scrim = document.getElementById("inspectorScrim");
    toggleBtn.innerHTML = Icons.svg("adjust", 18);

    toggleBtn.addEventListener("click", function () {
      setInspectorOpen(!panel.classList.contains("open"));
    });
    scrim.addEventListener("click", function () {
      setInspectorOpen(false);
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

    // 브라우저에 따라(특히 두 번째 손가락처럼 동시에 여러 포인터를 잡을 때)
    // setPointerCapture가 예외를 던지는 경우가 있다 - 이게 그냥 새면 이 손가락은
    // 그 뒤로 아무 입력도 못 받는 유령 포인터가 돼버리므로 실패해도 무시하고
    // 계속 진행한다(캡처는 그리기 자체에 필수가 아니라 화면 밖으로 나가도
    // 이벤트를 계속 받기 위한 보조 장치일 뿐이다).
    function trySetCapture(pointerId) {
      try {
        area.setPointerCapture(pointerId);
      } catch (err) {
        /* 캡처 실패는 무시 - 그리기/제스처 로직은 그대로 진행한다 */
      }
    }

    document.addEventListener("keydown", function (e) {
      if (e.code === "Space") spaceHeld = true;
    });
    document.addEventListener("keyup", function (e) {
      if (e.code === "Space") spaceHeld = false;
    });

    var touches = new Map(); // pointerId -> {x,y}
    var gesture = null; // { maxTouches, startTime, moved }
    var pinch = null; // { lastDist, lastAngle }
    // 이보다 가까운 두 번째 접점은 손바닥/보조 손가락으로 보고 무시한다(진짜
    // 두 손가락 제스처는 자연스럽게 이보다 훨씬 떨어진다).
    var PALM_REJECT_DIST = 80;

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
      else if (tool === "fill") {
        if (fillMode === "solid") Paint.floodFillAt(pt.x, pt.y, fillTolerance, fillExpand);
      } else if (tool === "eyedropper") Paint.eyedropAt(pt.x, pt.y);
      else if (tool === "select") Paint.selectDown(pt.x, pt.y);
      else if (tool === "shape") Paint.shapeDown(pt.x, pt.y);
      else if (tool === "effect") {
        // 이미 떠 있는 스티커의 손잡이/내부를 짚었으면 그걸 조작하고, 빈
        // 자리를 짚었으면 그 스티커는 확정하고 새 효과를 시작한다.
        if (Paint.hasSticker()) {
          if (Paint.stickerPointerDown(pt.x, pt.y)) return;
          Paint.stickerCommit();
        }
        Paint.effectDown(pt.x, pt.y);
      } else if (tool === "transform" && Paint.isTransforming()) transformDragStart = pt;
    }

    var transformDragStart = null;

    function dispatchMove(tool, pt) {
      if (tool === "brush" || tool === "eraser") Paint.brushMove(pt.x, pt.y, currentPressure);
      else if (tool === "select") Paint.selectMove(pt.x, pt.y);
      else if (tool === "shape") Paint.shapeMove(pt.x, pt.y);
      else if (tool === "effect") {
        if (Paint.isStickerDragging()) Paint.stickerPointerMove(pt.x, pt.y);
        else Paint.effectMove(pt.x, pt.y);
      } else if (tool === "transform" && transformDragStart) {
        Paint.transformMoveBy(pt.x - transformDragStart.x, pt.y - transformDragStart.y);
        transformDragStart = pt;
      }
    }

    function dispatchUp(tool, pt) {
      if (tool === "brush" || tool === "eraser") Paint.brushUp(pt.x, pt.y);
      else if (tool === "select") Paint.selectUp(pt.x, pt.y);
      else if (tool === "shape") Paint.shapeUp(pt.x, pt.y);
      else if (tool === "effect") {
        if (Paint.isStickerDragging()) Paint.stickerPointerUp();
        else Paint.effectUp(pt.x, pt.y);
      } else if (tool === "transform") transformDragStart = null;
    }

    var currentPressure = 0.5;

    area.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") {
        trySetCapture(e.pointerId);
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        startGestureSessionIfNeeded();
        if (touches.size === 1) {
          // 스타일러스 없이 손가락만으로도 그릴 수 있어야 한다 - 첫 손가락은
          // 마우스와 똑같이 지금 고른 도구를 쓴다. 두 번째 손가락이 닿으면
          // 아래에서 이 획을 정상 종료하고 화면 확대/이동/회전으로 바뀐다.
          drawPointerId = e.pointerId;
          currentPressure = 0.5;
          dispatchDown(activeToolKey, Paint.clientToCanvas(e.clientX, e.clientY), e);
        } else if (touches.size === 2) {
          var pts = touchPointsArray();
          var spacing = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          // 진짜 두 손가락 핀치는 손가락이 자연스럽게 떨어져 있다 - 그리는
          // 중에 손바닥이나 다른 손가락이 살짝 스친 것까지 확대/회전 제스처로
          // 받아들이면, 화면이 조금씩 틀어져서 그 뒤로는 누른 자리와 실제
          // 그려지는 자리가 계속 어긋나 버린다(원인을 찾기도 어려운 버그였다).
          // 두 접점이 가까우면 그냥 잡음으로 보고 무시하고, 그리던 손가락은
          // 손대지 않는다 - 방해가 사라지면(손을 떼면) 자동으로 이어 그려진다.
          if (spacing < PALM_REJECT_DIST) return;
          if (drawPointerId !== null) {
            var lastPt = touches.get(drawPointerId);
            if (lastPt) dispatchUp(activeToolKey, Paint.clientToCanvas(lastPt.x, lastPt.y));
            drawPointerId = null;
          }
          pinch = {
            lastDist: spacing,
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
      trySetCapture(e.pointerId);
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

        if (touches.size === 1 && e.pointerId === drawPointerId) {
          dispatchMove(activeToolKey, Paint.clientToCanvas(e.clientX, e.clientY));
        } else if (touches.size === 2 && pinch) {
          var pts = touchPointsArray();
          var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          var angle = (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;
          var scaleFactor = dist / (pinch.lastDist || dist);
          var deltaAngle = angle - pinch.lastAngle;
          if (activeToolKey === "transform" && Paint.isTransforming()) {
            Paint.transformScaleRotateBy(scaleFactor, deltaAngle);
          } else if (activeToolKey === "effect" && Paint.hasSticker()) {
            Paint.stickerScaleRotateBy(scaleFactor, deltaAngle);
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
        if (e.pointerId === drawPointerId) {
          dispatchUp(activeToolKey, Paint.clientToCanvas(e.clientX, e.clientY));
          drawPointerId = null;
        }
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
