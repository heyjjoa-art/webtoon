(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var epId = params.get("ep");

  AdminAuth.guard(function () {
    var episode = epId ? EpisodeStore.getEpisode(epId) : null;
    if (!episode) {
      location.href = "admin.html";
      return;
    }
    boot(episode);
  });

  function boot(episode) {
    var canvasEl = document.getElementById("editorCanvas");
    var canvasScroll = document.querySelector(".editor-canvas-scroll");
    var guideV = document.getElementById("guideV");
    var guideH = document.getElementById("guideH");
    var sidePanel = document.getElementById("sidePanel");
    var titleInput = document.getElementById("epTitleInput");
    var saveStatus = document.getElementById("saveStatus");
    var photoInput = document.getElementById("photoInput");

    var GRID = 8;
    var SNAP_TOL = 6;
    var MIN_SIZE = 60;

    var state = {
      canvasWidth: episode.canvasWidth || 900,
      canvasHeight: episode.canvasHeight || 1200,
      panels: (episode.panels || []).map(cloneBox),
      texts: (episode.texts || []).map(cloneBox)
    };

    titleInput.value = episode.title || "";
    var backLink = document.getElementById("backLink");
    if (backLink && episode.seriesId) backLink.href = "admin.html?series=" + encodeURIComponent(episode.seriesId);

    var scale = 1;
    var selection = null; // { type: 'panel'|'text', id }
    var photoTargetPanelId = null;

    function cloneBox(b) {
      return Object.assign({}, b);
    }

    function genId(prefix) {
      return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function findPanel(id) {
      return state.panels.find(function (p) {
        return p.id === id;
      });
    }
    function findText(id) {
      return state.texts.find(function (t) {
        return t.id === id;
      });
    }

    function contentBottom() {
      var maxY = 0;
      state.panels.forEach(function (p) {
        maxY = Math.max(maxY, p.y + p.h);
      });
      state.texts.forEach(function (t) {
        maxY = Math.max(maxY, t.y + 40);
      });
      return maxY;
    }

    function updateCanvasSize() {
      var rectWidth = canvasEl.getBoundingClientRect().width;
      scale = rectWidth / state.canvasWidth;
      var minHeightLogical = Math.max(state.canvasHeight, contentBottom() + 200);
      canvasEl.style.height = Math.round(minHeightLogical * scale) + "px";
    }

    // ── 렌더링 ──────────────────────────────────────────────────────
    function render() {
      updateCanvasSize();
      Array.prototype.slice.call(canvasEl.querySelectorAll(".ed-panel, .ed-text")).forEach(function (el) {
        el.remove();
      });
      state.panels
        .slice()
        .sort(function (a, b) {
          return (a.z || 0) - (b.z || 0);
        })
        .forEach(renderPanel);
      state.texts.forEach(renderText);
      renderSidePanel();
      updateToolbarState();
    }

    function px(v) {
      return Math.round(v * scale) + "px";
    }

    function positionBox(el, box) {
      el.style.left = px(box.x);
      el.style.top = px(box.y);
      el.style.width = px(box.w);
      if (box.h != null) el.style.height = px(box.h);
    }

    function renderPanel(p) {
      var el = document.createElement("div");
      el.className = "ed-panel" + (p.fit === "contain" ? " fit-contain" : "");
      el.dataset.id = p.id;
      el.style.zIndex = String(p.z || 0);
      el.style.borderRadius = px(p.radius || 0);
      positionBox(el, p);
      el.innerHTML = '<div class="ep-placeholder">🖼️</div>';
      canvasEl.appendChild(el);

      PanelArtStore.loadPanel(episode.id, p.id).then(function (art) {
        if (!art) return;
        var img = document.createElement("img");
        img.src = art.image;
        var ph = el.querySelector(".ep-placeholder");
        if (ph) ph.remove();
        el.appendChild(img);
      });

      attachMove(el, p, "panel");
      if (selection && selection.type === "panel" && selection.id === p.id) {
        el.classList.add("selected");
        addPanelHandles(el, p);
      }
    }

    function renderText(t) {
      var el = document.createElement("div");
      el.className = "ed-text style-" + (t.style || "bubble");
      el.dataset.id = t.id;
      el.style.zIndex = "900";
      el.style.fontSize = Math.max(9, (t.size || 16) * scale) + "px";
      el.style.textAlign = t.align || "center";
      positionBox(el, t);
      el.textContent = t.text || "(내용 없음)";
      canvasEl.appendChild(el);

      attachMove(el, t, "text");
      if (selection && selection.type === "text" && selection.id === t.id) {
        el.classList.add("selected");
        addTextHandles(el, t);
      }
    }

    // ── 선택 ────────────────────────────────────────────────────────
    function select(type, id) {
      selection = { type: type, id: id };
      render();
    }

    function deselect() {
      selection = null;
      render();
    }

    canvasEl.addEventListener("pointerdown", function (e) {
      if (e.target === canvasEl) deselect();
    });

    // ── 스냅 ────────────────────────────────────────────────────────
    function snapEdge(value, candidates) {
      var best = null;
      candidates.forEach(function (c) {
        var d = Math.abs(value - c);
        if (d <= SNAP_TOL && (best === null || d < best.dist)) best = { value: c, dist: d };
      });
      return best ? best.value : value;
    }

    function gridSnap(v) {
      var r = Math.round(v / GRID) * GRID;
      return Math.abs(v - r) <= SNAP_TOL / 2 ? r : v;
    }

    function otherPanels(excludeId) {
      return state.panels.filter(function (p) {
        return p.id !== excludeId;
      });
    }

    function showGuideV(logicalX) {
      guideV.hidden = false;
      guideV.style.left = px(logicalX);
    }
    function showGuideH(logicalY) {
      guideH.hidden = false;
      guideH.style.top = px(logicalY);
    }
    function hideGuides() {
      guideV.hidden = true;
      guideH.hidden = true;
    }

    // box를 이동시킬 때 x/y에 그리드 스냅 + 다른 컷 가장자리 스냅을 적용한다.
    function snapMove(box, candX, candY, excludeId) {
      var others = otherPanels(excludeId);
      var xEdges = [0, state.canvasWidth];
      var yEdges = [0];
      others.forEach(function (o) {
        xEdges.push(o.x, o.x + o.w);
        yEdges.push(o.y, o.y + o.h);
      });

      var left = gridSnap(candX);
      var right = gridSnap(candX + box.w);
      var snappedLeft = snapEdge(left, xEdges);
      var snappedRight = snapEdge(right, xEdges.map(function (e) { return e - box.w; }));
      var finalX = left;
      if (snappedLeft !== left) {
        finalX = snappedLeft;
        showGuideV(snappedLeft);
      } else if (snappedRight !== right) {
        finalX = snappedRight;
        showGuideV(snappedRight + box.w);
      }

      var top = gridSnap(candY);
      var bottom = gridSnap(candY + box.h);
      var snappedTop = snapEdge(top, yEdges);
      var snappedBottom = snapEdge(bottom, yEdges.map(function (e) { return e - box.h; }));
      var finalY = top;
      if (snappedTop !== top) {
        finalY = snappedTop;
        showGuideH(snappedTop);
      } else if (snappedBottom !== bottom) {
        finalY = snappedBottom;
        showGuideH(snappedBottom + box.h);
      }

      if (snappedLeft === left && snappedRight === right) guideV.hidden = true;
      if (snappedTop === top && snappedBottom === bottom) guideH.hidden = true;

      finalX = Math.max(0, Math.min(finalX, state.canvasWidth - box.w));
      finalY = Math.max(0, finalY);
      return { x: finalX, y: finalY };
    }

    // ── 드래그 이동 ─────────────────────────────────────────────────
    function attachMove(el, box, type) {
      el.addEventListener("pointerdown", function (e) {
        if (e.target.classList.contains("resize-handle")) return;
        e.preventDefault();
        // select()는 캔버스를 통째로 다시 그린다(render()) - 그러면 지금 이
        // pointerdown을 받은 el은 DOM에서 사라진 채로 이 클로저에만 남는다.
        // 사라진(연결 끊긴) 엘리먼트에 setPointerCapture를 걸면
        // InvalidStateError가 난다 - select() 이후 새로 그려진 같은 박스의
        // 엘리먼트를 다시 찾아서 그걸로 드래그를 이어가야 한다.
        select(type, box.id);
        var liveSelector = (type === "panel" ? ".ed-panel" : ".ed-text") + '[data-id="' + box.id + '"]';
        var liveEl = canvasEl.querySelector(liveSelector);
        if (!liveEl) return;
        liveEl.setPointerCapture(e.pointerId);
        var startClientX = e.clientX;
        var startClientY = e.clientY;
        var startX = box.x;
        var startY = box.y;
        liveEl.style.cursor = "grabbing";

        function onMove(ev) {
          var dx = (ev.clientX - startClientX) / scale;
          var dy = (ev.clientY - startClientY) / scale;
          var snapped =
            type === "panel"
              ? snapMove(box, startX + dx, startY + dy, box.id)
              : {
                  x: Math.max(0, Math.min(gridSnap(startX + dx), state.canvasWidth - box.w)),
                  y: Math.max(0, gridSnap(startY + dy))
                };
          box.x = snapped.x;
          box.y = snapped.y;
          positionBox(liveEl, box);
        }
        function onUp(ev) {
          liveEl.releasePointerCapture(ev.pointerId);
          liveEl.style.cursor = "grab";
          liveEl.removeEventListener("pointermove", onMove);
          liveEl.removeEventListener("pointerup", onUp);
          hideGuides();
          scheduleSave();
        }
        liveEl.addEventListener("pointermove", onMove);
        liveEl.addEventListener("pointerup", onUp);
      });
    }

    // ── 크기 조절: 컷(8방향) ────────────────────────────────────────
    var PANEL_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    function addPanelHandles(el, p) {
      PANEL_HANDLES.forEach(function (dir) {
        var h = document.createElement("div");
        h.className = "resize-handle " + dir;
        el.appendChild(h);
        h.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          h.setPointerCapture(e.pointerId);
          var startClientX = e.clientX;
          var startClientY = e.clientY;
          var start = { x: p.x, y: p.y, w: p.w, h: p.h };

          function onMove(ev) {
            var dx = (ev.clientX - startClientX) / scale;
            var dy = (ev.clientY - startClientY) / scale;
            var box = Object.assign({}, start);
            if (dir.indexOf("e") !== -1) box.w = Math.max(MIN_SIZE, start.w + dx);
            if (dir.indexOf("w") !== -1) {
              var newW = Math.max(MIN_SIZE, start.w - dx);
              box.x = start.x + (start.w - newW);
              box.w = newW;
            }
            if (dir.indexOf("s") !== -1) box.h = Math.max(MIN_SIZE, start.h + dy);
            if (dir === "n" || dir === "nw" || dir === "ne") {
              var newH = Math.max(MIN_SIZE, start.h - dy);
              box.y = start.y + (start.h - newH);
              box.h = newH;
            }
            box.x = gridSnap(box.x);
            box.y = gridSnap(box.y);
            box.w = gridSnap(box.w);
            box.h = gridSnap(box.h);
            box.x = Math.max(0, Math.min(box.x, state.canvasWidth - MIN_SIZE));
            p.x = box.x;
            p.y = Math.max(0, box.y);
            p.w = Math.min(box.w, state.canvasWidth - p.x);
            p.h = box.h;
            positionBox(el, p);
          }
          function onUp(ev) {
            h.releasePointerCapture(ev.pointerId);
            h.removeEventListener("pointermove", onMove);
            h.removeEventListener("pointerup", onUp);
            scheduleSave();
          }
          h.addEventListener("pointermove", onMove);
          h.addEventListener("pointerup", onUp);
        });
      });
    }

    // ── 크기 조절: 텍스트(좌우 폭만) ───────────────────────────────
    function addTextHandles(el, t) {
      ["tw-w", "tw-e"].forEach(function (dir) {
        var h = document.createElement("div");
        h.className = "resize-handle " + dir;
        el.appendChild(h);
        h.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          h.setPointerCapture(e.pointerId);
          var startClientX = e.clientX;
          var start = { x: t.x, w: t.w };
          function onMove(ev) {
            var dx = (ev.clientX - startClientX) / scale;
            if (dir === "tw-e") {
              t.w = Math.max(80, gridSnap(start.w + dx));
            } else {
              var newW = Math.max(80, gridSnap(start.w - dx));
              t.x = start.x + (start.w - newW);
              t.w = newW;
            }
            positionBox(el, t);
          }
          function onUp(ev) {
            h.releasePointerCapture(ev.pointerId);
            h.removeEventListener("pointermove", onMove);
            h.removeEventListener("pointerup", onUp);
            scheduleSave();
          }
          h.addEventListener("pointermove", onMove);
          h.addEventListener("pointerup", onUp);
        });
      });
    }

    // ── 툴바 동작 ───────────────────────────────────────────────────
    function maxZ() {
      return state.panels.reduce(function (m, p) {
        return Math.max(m, p.z || 0);
      }, 0);
    }

    function addPanelBox(x, y, w, h) {
      var p = { id: genId("p"), x: x, y: y, w: w, h: h, z: maxZ() + 1, radius: 0, border: false, fit: "cover" };
      state.panels.push(p);
      return p;
    }

    document.getElementById("addPanelBtn").addEventListener("click", function () {
      var preset = document.getElementById("presetSelect").value;
      var bottom = contentBottom() + (state.panels.length || state.texts.length ? 16 : 0);
      var cw = state.canvasWidth;
      var gap = 12;
      if (preset === "1") {
        addPanelBox(0, bottom, cw, 500);
      } else if (preset === "2col") {
        var w2 = (cw - gap) / 2;
        addPanelBox(0, bottom, w2, 400);
        addPanelBox(w2 + gap, bottom, w2, 400);
      } else if (preset === "3row") {
        var h3 = 260;
        addPanelBox(0, bottom, cw, h3);
        addPanelBox(0, bottom + h3 + gap, cw, h3);
        addPanelBox(0, bottom + (h3 + gap) * 2, cw, h3);
      } else if (preset === "4grid") {
        var w4 = (cw - gap) / 2;
        var h4 = 300;
        addPanelBox(0, bottom, w4, h4);
        addPanelBox(w4 + gap, bottom, w4, h4);
        addPanelBox(0, bottom + h4 + gap, w4, h4);
        addPanelBox(w4 + gap, bottom + h4 + gap, w4, h4);
      }
      render();
      scheduleSave();
    });

    function addTextBox(style) {
      var bottom = contentBottom();
      var t = {
        id: genId("t"),
        x: state.canvasWidth / 2 - 120,
        y: Math.max(0, bottom - 60),
        w: 240,
        text: style === "sfx" ? "쿠구궁" : "대사를 입력하세요",
        style: style,
        size: style === "sfx" ? 28 : 16,
        align: "center"
      };
      state.texts.push(t);
      select("text", t.id);
      scheduleSave();
    }
    document.getElementById("addBubbleBtn").addEventListener("click", function () {
      addTextBox("bubble");
    });
    document.getElementById("addNarrationBtn").addEventListener("click", function () {
      addTextBox("narration");
    });
    document.getElementById("addSfxBtn").addEventListener("click", function () {
      addTextBox("sfx");
    });

    function selectedBox() {
      if (!selection) return null;
      return selection.type === "panel" ? findPanel(selection.id) : findText(selection.id);
    }

    document.getElementById("delBtn").addEventListener("click", function () {
      if (!selection) return;
      if (selection.type === "panel") {
        state.panels = state.panels.filter(function (p) {
          return p.id !== selection.id;
        });
        PanelArtStore.deletePanel(episode.id, selection.id);
      } else {
        state.texts = state.texts.filter(function (t) {
          return t.id !== selection.id;
        });
      }
      selection = null;
      render();
      scheduleSave();
    });

    document.getElementById("dupBtn").addEventListener("click", function () {
      var box = selectedBox();
      if (!box) return;
      var copy = Object.assign({}, box, { id: genId(selection.type === "panel" ? "p" : "t"), x: box.x + 16, y: box.y + 16 });
      if (selection.type === "panel") {
        copy.z = maxZ() + 1;
        state.panels.push(copy);
      } else {
        state.texts.push(copy);
      }
      select(selection.type, copy.id);
      scheduleSave();
    });

    document.getElementById("frontBtn").addEventListener("click", function () {
      if (!selection || selection.type !== "panel") return;
      var p = findPanel(selection.id);
      p.z = maxZ() + 1;
      render();
      scheduleSave();
    });
    document.getElementById("backBtn").addEventListener("click", function () {
      if (!selection || selection.type !== "panel") return;
      var p = findPanel(selection.id);
      var minZ = state.panels.reduce(function (m, x) {
        return Math.min(m, x.z || 0);
      }, 0);
      p.z = minZ - 1;
      render();
      scheduleSave();
    });

    function updateToolbarState() {
      var has = !!selection;
      document.getElementById("delBtn").disabled = !has;
      document.getElementById("dupBtn").disabled = !has;
      document.getElementById("frontBtn").disabled = !(has && selection.type === "panel");
      document.getElementById("backBtn").disabled = !(has && selection.type === "panel");
    }

    // ── 사이드 패널(속성 편집) ─────────────────────────────────────
    function renderSidePanel() {
      if (!selection) {
        sidePanel.innerHTML = '<div class="center-empty" style="padding:40px 16px;">컷이나 말풍선을 눌러 속성을 편집하세요.</div>';
        return;
      }
      if (selection.type === "panel") renderPanelProps(findPanel(selection.id));
      else renderTextProps(findText(selection.id));
    }

    function renderPanelProps(p) {
      sidePanel.innerHTML =
        "<h3>🖼️ 컷 속성</h3>" +
        '<div class="field"><label>채우기</label><select id="propFit"><option value="cover">꽉 채우기</option><option value="contain">전체 보이기</option></select></div>' +
        '<div class="field"><label>모서리 둥글기 (<span id="propRadiusVal">' +
        (p.radius || 0) +
        '</span>px)</label><input type="range" id="propRadius" min="0" max="60" value="' +
        (p.radius || 0) +
        '"></div>' +
        '<div class="field"><label><input type="checkbox" id="propBorder"' +
        (p.border ? " checked" : "") +
        "> 흰색 테두리</label></div>" +
        '<button class="btn btn-primary btn-sm" id="propPhotoBtn" style="width:100%;margin-bottom:8px;">🖼 사진 넣기</button>' +
        '<button class="btn btn-ghost btn-sm" id="propPaintBtn" style="width:100%;">✏️ 그리기</button>';

      sidePanel.querySelector("#propFit").value = p.fit || "cover";
      sidePanel.querySelector("#propFit").addEventListener("change", function (e) {
        p.fit = e.target.value;
        render();
        scheduleSave();
      });
      sidePanel.querySelector("#propRadius").addEventListener("input", function (e) {
        p.radius = Number(e.target.value);
        // 드래그 중(input)에는 render()로 캔버스 전체를 다시 그리지 않는다 - 그러면
        // 슬라이더 자체가 통째로 새 엘리먼트로 교체돼서 드래그가 끊긴다(말풍선 글자
        // 입력이 매 키 입력마다 끊기던 것과 같은 원인). 지금 그려진 컷 엘리먼트만
        // 직접 업데이트한다.
        var liveEl = canvasEl.querySelector('.ed-panel[data-id="' + p.id + '"]');
        if (liveEl) liveEl.style.borderRadius = px(p.radius);
        var valEl = sidePanel.querySelector("#propRadiusVal");
        if (valEl) valEl.textContent = String(p.radius);
      });
      sidePanel.querySelector("#propRadius").addEventListener("change", scheduleSave);
      sidePanel.querySelector("#propBorder").addEventListener("change", function (e) {
        p.border = e.target.checked;
        scheduleSave();
      });
      sidePanel.querySelector("#propPhotoBtn").addEventListener("click", function () {
        photoTargetPanelId = p.id;
        photoInput.click();
      });
      sidePanel.querySelector("#propPaintBtn").addEventListener("click", function () {
        location.href = "paint.html?ep=" + encodeURIComponent(episode.id) + "&panel=" + encodeURIComponent(p.id);
      });
    }

    function renderTextProps(t) {
      sidePanel.innerHTML =
        "<h3>💬 텍스트 속성</h3>" +
        '<div class="field"><label>내용</label><textarea id="propText">' +
        escapeHtml(t.text) +
        "</textarea></div>" +
        '<div class="field"><label>종류</label><select id="propStyle"><option value="bubble">말풍선</option><option value="narration">나레이션</option><option value="sfx">효과음</option></select></div>' +
        '<div class="field"><label>정렬</label><select id="propAlign"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></div>' +
        '<div class="field"><label>글자 크기 (<span id="propSizeVal">' +
        (t.size || 16) +
        '</span>px)</label><input type="range" id="propSize" min="10" max="40" value="' +
        (t.size || 16) +
        '"></div>';

      sidePanel.querySelector("#propText").addEventListener("input", function (e) {
        t.text = e.target.value;
        // render()를 부르면 이 textarea 자체가 통째로 새로 그려져서 포커스가
        // 날아가고, 그다음 키 입력이 아무 데도 들어가지 않는다("키보드 오류"처럼
        // 느껴지는 원인) - 캔버스 위 미리보기 글자만 직접 바꿔준다.
        var liveEl = canvasEl.querySelector('.ed-text[data-id="' + t.id + '"]');
        if (liveEl) liveEl.textContent = t.text || "(내용 없음)";
        scheduleSave();
      });
      sidePanel.querySelector("#propStyle").value = t.style || "bubble";
      sidePanel.querySelector("#propStyle").addEventListener("change", function (e) {
        t.style = e.target.value;
        render();
        scheduleSave();
      });
      sidePanel.querySelector("#propAlign").value = t.align || "center";
      sidePanel.querySelector("#propAlign").addEventListener("change", function (e) {
        t.align = e.target.value;
        render();
        scheduleSave();
      });
      sidePanel.querySelector("#propSize").addEventListener("input", function (e) {
        t.size = Number(e.target.value);
        var liveEl = canvasEl.querySelector('.ed-text[data-id="' + t.id + '"]');
        if (liveEl) liveEl.style.fontSize = Math.max(9, t.size * scale) + "px";
        var valEl = sidePanel.querySelector("#propSizeVal");
        if (valEl) valEl.textContent = String(t.size);
      });
      sidePanel.querySelector("#propSize").addEventListener("change", scheduleSave);
    }

    function escapeHtml(s) {
      var div = document.createElement("div");
      div.textContent = String(s || "");
      return div.innerHTML;
    }

    // ── 사진 업로드 ─────────────────────────────────────────────────
    photoInput.addEventListener("change", function () {
      var file = photoInput.files && photoInput.files[0];
      photoInput.value = "";
      if (!file || !photoTargetPanelId) return;
      var targetId = photoTargetPanelId;
      var reader = new FileReader();
      reader.onload = function () {
        saveStatus.textContent = "☁️ 사진 업로드 중...";
        PanelArtStore.savePanel(episode.id, targetId, reader.result).then(function () {
          saveStatus.textContent = "✅ 저장됨";
          render();
        });
      };
      reader.readAsDataURL(file);
    });

    // ── 저장 ────────────────────────────────────────────────────────
    var saveTimer = null;
    function scheduleSave() {
      saveStatus.textContent = "저장 중...";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 800);
    }
    function doSave() {
      EpisodeStore.saveEpisode({
        id: episode.id,
        seriesId: episode.seriesId,
        no: episode.no,
        title: titleInput.value.trim(),
        summary: episode.summary,
        tags: episode.tags,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        panels: state.panels,
        texts: state.texts,
        status: episode.status,
        publishAt: episode.publishAt,
        publishedAt: episode.publishedAt
      });
      saveStatus.textContent = "☁️ 저장됨";
    }
    titleInput.addEventListener("input", scheduleSave);

    window.addEventListener("resize", render);

    render();
  }
})();
