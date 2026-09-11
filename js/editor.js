(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var epId = params.get("ep");

  Session.requireLogin(function () {
    var episode = epId ? EpisodeStore.getEpisode(epId) : null;
    if (!episode) {
      location.href = "admin.html";
      return;
    }
    boot(episode);
  });

  function boot(episode) {
    var canvasEl = document.getElementById("editorCanvas");
    var guideV = document.getElementById("guideV");
    var guideH = document.getElementById("guideH");
    var selectionOverlay = document.getElementById("selectionOverlay");
    var sidePanel = document.getElementById("sidePanel");
    var titleInput = document.getElementById("epTitleInput");
    var saveStatus = document.getElementById("saveStatus");
    var photoInput = document.getElementById("photoInput");
    var inspectorScrim = document.getElementById("inspectorScrim");
    var inspectorToggleBtn = document.getElementById("inspectorToggleBtn");

    var GRID = 8;
    var SNAP_TOL = 6;
    var MIN_SIZE = 60;
    var MIN_TEXT_W = 80;
    var PANEL_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    var PANEL_HANDLES_CORNER = ["nw", "ne", "se", "sw"];
    var TEXT_HANDLES = ["tw-w", "tw-e"];
    var ALIGN_OPS = [
      { key: "left", icon: "alignLeft", label: "왼쪽 정렬" },
      { key: "centerH", icon: "alignCenterH", label: "가로 가운데" },
      { key: "right", icon: "alignRight", label: "오른쪽 정렬" },
      { key: "top", icon: "alignTop", label: "위 정렬" },
      { key: "middleV", icon: "alignMiddleV", label: "세로 가운데" },
      { key: "bottom", icon: "alignBottom", label: "아래 정렬" }
    ];

    var state = {
      canvasWidth: episode.canvasWidth || 900,
      canvasHeight: episode.canvasHeight || 1200,
      panels: (episode.panels || []).map(cloneBox),
      texts: (episode.texts || []).map(cloneBox)
    };

    titleInput.value = episode.title || "";
    var backLink = document.getElementById("backLink");
    if (backLink && episode.seriesId) backLink.href = "admin.html?series=" + encodeURIComponent(episode.seriesId);

    var selection = []; // [{type:'panel'|'text', id}, ...] - 여러 개를 함께 선택할 수 있다
    var photoTargetPanelId = null;
    var nodes = {}; // id -> 지금 DOM에 붙어 있는 엘리먼트(컷/텍스트 공용, id 접두사(p/t)가 달라 안 겹침)
    var lastMetrics = { cw: state.canvasWidth, ch: state.canvasHeight };
    var clipboard = null; // Ctrl+C로 복사해둔 항목들의 스냅샷

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
    function findAny(type, id) {
      return type === "panel" ? findPanel(id) : findText(id);
    }
    function maxZ() {
      return state.panels.reduce(function (m, p) {
        return Math.max(m, p.z || 0);
      }, 0);
    }
    function maxTextZ() {
      return state.texts.reduce(function (m, t) {
        return Math.max(m, t.z != null ? t.z : 900);
      }, 900);
    }

    // ── 되돌리기 ────────────────────────────────────────────────────
    // 컷/텍스트 배열은 몇 KB밖에 안 되고, 상태를 바꾸는 지점이 이 파일
    // 여기저기 흩어져 있어서(드래그·리사이즈·삭제·정렬...) 하나하나 커맨드로
    // 감싸는 대신 매번 전체 스냅샷을 찍는다(js/undo-stack.js).
    function snapshotState() {
      return { canvasWidth: state.canvasWidth, canvasHeight: state.canvasHeight, panels: state.panels, texts: state.texts };
    }
    function restoreState(snap) {
      state.canvasWidth = snap.canvasWidth;
      state.canvasHeight = snap.canvasHeight;
      state.panels = snap.panels;
      state.texts = snap.texts;
      selection = selection.filter(function (s) {
        return !!findAny(s.type, s.id);
      });
      render();
      scheduleSave();
    }
    var history = UndoStack.create(snapshotState, restoreState, 100);

    // ── 선택 ────────────────────────────────────────────────────────
    function isSelected(type, id) {
      return selection.some(function (s) {
        return s.type === type && s.id === id;
      });
    }
    function setSelection(list) {
      selection = list;
      render();
    }
    function selectOnly(type, id) {
      setSelection([{ type: type, id: id }]);
    }
    function toggleSelect(type, id) {
      if (isSelected(type, id)) {
        setSelection(
          selection.filter(function (s) {
            return !(s.type === type && s.id === id);
          })
        );
      } else {
        setSelection(selection.concat([{ type: type, id: id }]));
      }
    }
    function clearSelection() {
      if (!selection.length) return;
      setSelection([]);
    }
    function selectedBoxes() {
      return selection
        .map(function (s) {
          return { type: s.type, id: s.id, box: findAny(s.type, s.id) };
        })
        .filter(function (x) {
          return !!x.box;
        });
    }
    function applySelectedClasses() {
      Object.keys(nodes).forEach(function (id) {
        var type = findPanel(id) ? "panel" : "text";
        nodes[id].classList.toggle("selected", isSelected(type, id));
      });
    }

    // 빈 캔버스를 누르면(드래그 없이) 선택을 비우고, 드래그하면 마퀴로 여러
    // 개를 한 번에 고른다. 옛 코드는 "누르면 무조건 선택 해제"만 했었다.
    canvasEl.addEventListener("pointerdown", function (e) {
      if (e.target !== canvasEl) return;
      startMarquee(e);
    });

    function startMarquee(e) {
      var startClientX = e.clientX;
      var startClientY = e.clientY;
      var box = document.createElement("div");
      box.className = "marquee-box";
      document.body.appendChild(box);
      canvasEl.setPointerCapture(e.pointerId);
      var additive = e.shiftKey || e.ctrlKey || e.metaKey;
      var baseSelection = additive ? selection.slice() : [];
      var moved = false;

      function rectFromPoints(x0, y0, x1, y1) {
        return { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
      }
      function intersects(a, b) {
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }

      function onMove(ev) {
        moved = true;
        var r = rectFromPoints(startClientX, startClientY, ev.clientX, ev.clientY);
        box.style.left = r.left + "px";
        box.style.top = r.top + "px";
        box.style.width = r.right - r.left + "px";
        box.style.height = r.bottom - r.top + "px";
        var hits = [];
        Object.keys(nodes).forEach(function (id) {
          var er = nodes[id].getBoundingClientRect();
          if (intersects(r, er)) hits.push({ type: findPanel(id) ? "panel" : "text", id: id });
        });
        var merged = baseSelection.slice();
        hits.forEach(function (h) {
          if (
            !merged.some(function (s) {
              return s.type === h.type && s.id === h.id;
            })
          )
            merged.push(h);
        });
        selection = merged;
        applySelectedClasses();
        positionSelectionOverlay();
      }
      function onUp(ev) {
        canvasEl.releasePointerCapture(ev.pointerId);
        canvasEl.removeEventListener("pointermove", onMove);
        canvasEl.removeEventListener("pointerup", onUp);
        box.remove();
        if (!moved && !additive) selection = [];
        render();
      }
      canvasEl.addEventListener("pointermove", onMove);
      canvasEl.addEventListener("pointerup", onUp);
    }

    // ── 스냅 ────────────────────────────────────────────────────────
    function gridSnap(v) {
      var r = Math.round(v / GRID) * GRID;
      return Math.abs(v - r) <= SNAP_TOL / 2 ? r : v;
    }

    function snapCandidatesX(excludeType, excludeId) {
      var xs = [0, state.canvasWidth, state.canvasWidth / 2];
      state.panels.forEach(function (o) {
        if (excludeType === "panel" && o.id === excludeId) return;
        xs.push(o.x, o.x + o.w, o.x + o.w / 2);
      });
      state.texts.forEach(function (o) {
        if (excludeType === "text" && o.id === excludeId) return;
        xs.push(o.x, o.x + o.w, o.x + o.w / 2);
      });
      return xs;
    }
    function snapCandidatesY(excludeType, excludeId) {
      var ys = [0];
      state.panels.forEach(function (o) {
        if (excludeType === "panel" && o.id === excludeId) return;
        ys.push(o.y, o.y + o.h);
      });
      state.texts.forEach(function (o) {
        if (excludeType === "text" && o.id === excludeId) return;
        ys.push(o.y);
      });
      return ys;
    }

    function showGuideV(logicalX) {
      guideV.hidden = false;
      guideV.style.left = pct(logicalX, state.canvasWidth);
    }
    function showGuideH(logicalY) {
      guideH.hidden = false;
      guideH.style.top = pct(logicalY, lastMetrics.ch);
    }
    function hideGuides() {
      guideV.hidden = true;
      guideH.hidden = true;
    }
    function pct(v, base) {
      return (v / base) * 100 + "%";
    }

    function bestSnap(candidates, values) {
      var best = null;
      values.forEach(function (v) {
        candidates.forEach(function (c) {
          var d = Math.abs(v - c);
          if (!isFinite(d)) return;
          if (d <= SNAP_TOL && (!best || d < best.dist)) best = { dist: d, delta: c - v, guideAt: c };
        });
      });
      return best;
    }

    // box를 이동시킬 때 그리드 스냅 + 다른 컷/텍스트의 가장자리·중심·캔버스
    // 중심 스냅을 적용한다. 옛 코드는 컷끼리의 가장자리만 봤고 텍스트는 아예
    // 스냅 후보/대상에서 빠져 있었다(E4).
    function snapMove(box, candX, candY, type, excludeId) {
      var xs = snapCandidatesX(type, excludeId);
      var ys = snapCandidatesY(type, excludeId);

      var leftBase = gridSnap(candX);
      var xSnap = bestSnap(xs, [leftBase, leftBase + box.w / 2, leftBase + box.w]);
      var finalX = xSnap ? leftBase + xSnap.delta : leftBase;
      if (xSnap) showGuideV(xSnap.guideAt);
      else guideV.hidden = true;

      var topBase = gridSnap(candY);
      var ySnap = bestSnap(ys, [topBase, topBase + (box.h || 0)]);
      var finalY = ySnap ? topBase + ySnap.delta : topBase;
      if (ySnap) showGuideH(ySnap.guideAt);
      else guideH.hidden = true;

      finalX = Math.max(0, Math.min(finalX, state.canvasWidth - box.w));
      finalY = Math.max(0, finalY);
      return { x: finalX, y: finalY };
    }

    // ── 렌더링(조정) ────────────────────────────────────────────────
    // 예전에는 바뀔 때마다 컷·텍스트 DOM을 통째로 지우고 새로 만들어서,
    // 컷 그림도 매번 다시 불러오고(깜빡임), 드래그 중이던 엘리먼트가
    // 사라지는 땜질들이 필요했다(E2/E8). 지금은 "있으면 갱신, 없으면 생성,
    // 사라졌으면 제거"만 한다 - 엘리먼트가 계속 같은 참조로 살아있다.
    function updateSceneSize() {
      lastMetrics = ToonRender.metrics(state);
      ToonRender.applySceneSize(canvasEl, lastMetrics);
    }

    function upsertPanel(p) {
      var el = nodes[p.id];
      if (!el) {
        el = ToonRender.panelEl(p, lastMetrics);
        el.dataset.editable = "1";
        canvasEl.insertBefore(el, selectionOverlay);
        nodes[p.id] = el;
        attachMove(el, p, "panel");
        PanelArtStore.loadPanel(episode.id, p.id).then(function (art) {
          ToonRender.applyArt(el, art);
        });
      } else {
        ToonRender.positionPanel(el, p, lastMetrics);
      }
      el.classList.toggle("selected", isSelected("panel", p.id));
    }

    function upsertText(t) {
      var el = nodes[t.id];
      if (!el) {
        el = ToonRender.textEl(t, lastMetrics);
        el.dataset.editable = "1";
        canvasEl.insertBefore(el, selectionOverlay);
        nodes[t.id] = el;
        attachMove(el, t, "text");
      } else {
        ToonRender.positionText(el, t, lastMetrics);
        if (el.textContent !== (t.text || "")) el.textContent = t.text || "";
      }
      el.classList.toggle("selected", isSelected("text", t.id));
    }

    function reconcile() {
      var seen = {};
      state.panels.forEach(function (p) {
        seen[p.id] = true;
        upsertPanel(p);
      });
      state.texts.forEach(function (t) {
        seen[t.id] = true;
        upsertText(t);
      });
      Object.keys(nodes).forEach(function (id) {
        if (!seen[id]) {
          nodes[id].remove();
          delete nodes[id];
        }
      });
    }

    function render() {
      updateSceneSize();
      reconcile();
      positionSelectionOverlay();
      renderSidePanel();
      updateToolbarState();
      updateUndoRedoState();
    }

    // ── 선택 오버레이(손잡이) ───────────────────────────────────────
    // 손잡이는 컷/텍스트 엘리먼트의 자식이 아니라 별도의 오버레이 하나에
    // 둔다 - 그래서 select()가 더는 포인터 밑의 엘리먼트를 파괴하지 않고,
    // "재조회하지 않으면 setPointerCapture가 InvalidStateError를 던지던"
    // 옛 땜질이 통째로 필요 없어졌다.
    function positionSelectionOverlay() {
      selectionOverlay.innerHTML = "";
      var boxes = selectedBoxes();
      if (boxes.length !== 1) {
        selectionOverlay.hidden = true;
        return;
      }
      var only = boxes[0];
      var el = nodes[only.id];
      if (!el) {
        selectionOverlay.hidden = true;
        return;
      }
      selectionOverlay.hidden = false;
      if (only.type === "panel") {
        selectionOverlay.style.left = el.style.left;
        selectionOverlay.style.top = el.style.top;
        selectionOverlay.style.width = el.style.width;
        selectionOverlay.style.height = el.style.height;
      } else {
        // 텍스트는 높이가 내용에 따라 자동이라 실제 렌더된 크기를 그대로 잰다.
        var r = el.getBoundingClientRect();
        var cr = canvasEl.getBoundingClientRect();
        selectionOverlay.style.left = r.left - cr.left + "px";
        selectionOverlay.style.top = r.top - cr.top + "px";
        selectionOverlay.style.width = r.width + "px";
        selectionOverlay.style.height = r.height + "px";
      }
      var dirs =
        only.type === "text"
          ? TEXT_HANDLES
          : only.box.w < 90 || only.box.h < 90
          ? PANEL_HANDLES_CORNER
          : PANEL_HANDLES;
      dirs.forEach(function (dir) {
        var h = document.createElement("div");
        h.className = "tn-handle " + dir;
        h.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          startResize(only.type, only.id, dir, h, e);
        });
        selectionOverlay.appendChild(h);
      });
    }

    function startResize(type, id, dir, handleEl, e) {
      var box = findAny(type, id);
      if (!box) return;
      handleEl.setPointerCapture(e.pointerId);
      var startClientX = e.clientX;
      var startClientY = e.clientY;
      var scale = ToonRender.currentScale(canvasEl, state.canvasWidth);
      var start = type === "panel" ? { x: box.x, y: box.y, w: box.w, h: box.h } : { x: box.x, w: box.w };
      var moved = false;

      function onMove(ev) {
        moved = true;
        var dx = (ev.clientX - startClientX) / scale;
        var dy = (ev.clientY - startClientY) / scale;
        if (type === "panel") {
          var b = Object.assign({}, start);
          if (dir.indexOf("e") !== -1) b.w = Math.max(MIN_SIZE, start.w + dx);
          if (dir.indexOf("w") !== -1) {
            var newW = Math.max(MIN_SIZE, start.w - dx);
            b.x = start.x + (start.w - newW);
            b.w = newW;
          }
          if (dir.indexOf("s") !== -1) b.h = Math.max(MIN_SIZE, start.h + dy);
          if (dir === "n" || dir === "nw" || dir === "ne") {
            var newH = Math.max(MIN_SIZE, start.h - dy);
            b.y = start.y + (start.h - newH);
            b.h = newH;
          }
          b.x = gridSnap(b.x);
          b.y = gridSnap(b.y);
          b.w = gridSnap(b.w);
          b.h = gridSnap(b.h);
          b.x = Math.max(0, Math.min(b.x, state.canvasWidth - MIN_SIZE));
          box.x = b.x;
          box.y = Math.max(0, b.y);
          box.w = Math.min(b.w, state.canvasWidth - box.x);
          box.h = b.h;
          ToonRender.positionPanel(nodes[id], box, lastMetrics);
        } else {
          if (dir === "tw-e") {
            box.w = Math.max(MIN_TEXT_W, gridSnap(start.w + dx));
          } else {
            var nW = Math.max(MIN_TEXT_W, gridSnap(start.w - dx));
            box.x = start.x + (start.w - nW);
            box.w = nW;
          }
          ToonRender.positionText(nodes[id], box, lastMetrics);
        }
        positionSelectionOverlay();
      }
      function onUp(ev) {
        handleEl.releasePointerCapture(ev.pointerId);
        handleEl.removeEventListener("pointermove", onMove);
        handleEl.removeEventListener("pointerup", onUp);
        if (moved) {
          updateSceneSize();
          renderSidePanel();
          history.commit();
          scheduleSave();
        }
      }
      handleEl.addEventListener("pointermove", onMove);
      handleEl.addEventListener("pointerup", onUp);
    }

    // ── 드래그 이동(그룹 지원) ──────────────────────────────────────
    function attachMove(el, box, type) {
      el.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var additive = e.shiftKey || e.ctrlKey || e.metaKey;
        var already = isSelected(type, box.id);
        if (additive) {
          toggleSelect(type, box.id);
          if (!isSelected(type, box.id)) return; // 방금 선택을 해제했으면 드래그를 시작하지 않는다
        } else if (!already) {
          selectOnly(type, box.id);
        }

        el.setPointerCapture(e.pointerId);
        var startClientX = e.clientX;
        var startClientY = e.clientY;
        var scale = ToonRender.currentScale(canvasEl, state.canvasWidth);
        var group = selectedBoxes();
        var leadIdx = group.findIndex(function (g) {
          return g.type === type && g.id === box.id;
        });
        var starts = group.map(function (g) {
          return { x: g.box.x, y: g.box.y };
        });
        el.style.cursor = "grabbing";
        var moved = false;

        function onMove(ev) {
          moved = true;
          var dx = (ev.clientX - startClientX) / scale;
          var dy = (ev.clientY - startClientY) / scale;
          var lead = starts[leadIdx];
          var leadCandX = lead.x + dx;
          var leadCandY = lead.y + dy;
          var snapped = snapMove(box, leadCandX, leadCandY, type, box.id);
          var adjX = snapped.x - leadCandX;
          var adjY = snapped.y - leadCandY;
          group.forEach(function (g, i) {
            g.box.x = Math.max(0, starts[i].x + dx + adjX);
            g.box.y = Math.max(0, starts[i].y + dy + adjY);
            ToonRender[g.type === "panel" ? "positionPanel" : "positionText"](nodes[g.id], g.box, lastMetrics);
          });
          positionSelectionOverlay();
        }
        function onUp(ev) {
          el.releasePointerCapture(ev.pointerId);
          el.style.cursor = "grab";
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onUp);
          hideGuides();
          if (moved) {
            updateSceneSize();
            positionSelectionOverlay();
            history.commit();
            scheduleSave();
          } else if (!additive && already && group.length > 1) {
            selectOnly(type, box.id);
          } else {
            render();
          }
        }
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
      });
    }

    // ── 정렬 / 등간격 배치 ──────────────────────────────────────────
    function liveLogicalBox(id) {
      var el = nodes[id];
      var scale = ToonRender.currentScale(canvasEl, state.canvasWidth);
      var cr = canvasEl.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      return { x: (r.left - cr.left) / scale, y: (r.top - cr.top) / scale, w: r.width / scale, h: r.height / scale };
    }

    function applyBoxPosition(item) {
      ToonRender[item.type === "panel" ? "positionPanel" : "positionText"](nodes[item.id], item.box, lastMetrics);
    }

    function alignSelection(key) {
      var items = selectedBoxes();
      if (!items.length) return;
      var lives = items.map(function (it) {
        return { it: it, lb: liveLogicalBox(it.id) };
      });
      var refBox;
      if (lives.length === 1) {
        refBox = { x: 0, y: 0, w: state.canvasWidth, h: lastMetrics.ch };
      } else {
        var minX = Math.min.apply(
          null,
          lives.map(function (l) {
            return l.lb.x;
          })
        );
        var minY = Math.min.apply(
          null,
          lives.map(function (l) {
            return l.lb.y;
          })
        );
        var maxX = Math.max.apply(
          null,
          lives.map(function (l) {
            return l.lb.x + l.lb.w;
          })
        );
        var maxY = Math.max.apply(
          null,
          lives.map(function (l) {
            return l.lb.y + l.lb.h;
          })
        );
        refBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      lives.forEach(function (l) {
        var b = l.it.box;
        var lb = l.lb;
        if (key === "left") b.x = refBox.x;
        else if (key === "right") b.x = refBox.x + refBox.w - lb.w;
        else if (key === "centerH") b.x = refBox.x + (refBox.w - lb.w) / 2;
        else if (key === "top") b.y = refBox.y;
        else if (key === "bottom") b.y = refBox.y + refBox.h - lb.h;
        else if (key === "middleV") b.y = refBox.y + (refBox.h - lb.h) / 2;
        b.x = Math.max(0, Math.round(b.x));
        b.y = Math.max(0, Math.round(b.y));
        applyBoxPosition(l.it);
      });
      updateSceneSize();
      positionSelectionOverlay();
      history.commit();
      scheduleSave();
    }

    function distributeSelection(axis) {
      var items = selectedBoxes();
      if (items.length < 3) return;
      var lives = items.map(function (it) {
        return { it: it, lb: liveLogicalBox(it.id) };
      });
      if (axis === "H") {
        lives.sort(function (a, b) {
          return a.lb.x - b.lb.x;
        });
        var first = lives[0];
        var last = lives[lives.length - 1];
        var totalSpan = last.lb.x + last.lb.w - first.lb.x;
        var totalW = lives.reduce(function (s, l) {
          return s + l.lb.w;
        }, 0);
        var gap = (totalSpan - totalW) / (lives.length - 1);
        var cursor = first.lb.x;
        lives.forEach(function (l) {
          l.it.box.x = Math.max(0, Math.round(cursor));
          cursor += l.lb.w + gap;
          applyBoxPosition(l.it);
        });
      } else {
        lives.sort(function (a, b) {
          return a.lb.y - b.lb.y;
        });
        var firstV = lives[0];
        var lastV = lives[lives.length - 1];
        var totalSpanV = lastV.lb.y + lastV.lb.h - firstV.lb.y;
        var totalH = lives.reduce(function (s, l) {
          return s + l.lb.h;
        }, 0);
        var gapV = (totalSpanV - totalH) / (lives.length - 1);
        var cursorV = firstV.lb.y;
        lives.forEach(function (l) {
          l.it.box.y = Math.max(0, Math.round(cursorV));
          cursorV += l.lb.h + gapV;
          applyBoxPosition(l.it);
        });
      }
      updateSceneSize();
      positionSelectionOverlay();
      history.commit();
      scheduleSave();
    }

    // ── 컷/텍스트 추가 ──────────────────────────────────────────────
    function addPanelBox(x, y, w, h) {
      var p = { id: genId("p"), x: x, y: y, w: w, h: h, z: maxZ() + 1, radius: 0, border: false, fit: "cover" };
      state.panels.push(p);
      return p;
    }

    document.getElementById("addPanelBtn").addEventListener("click", function () {
      var preset = document.getElementById("presetSelect").value;
      var bottom = ToonRender.contentBottom(state) + (state.panels.length || state.texts.length ? 16 : 0);
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
      history.commit();
      scheduleSave();
    });

    // 나레이션·효과음은 예전에 따로 있던 텍스트 종류였는데, 이제 말풍선
    // 하나로 합쳐졌다 - 배경(말풍선/박스/배경없음)·글꼴·굵게 등 속성 패널의
    // 옵션 조합으로 그 느낌을 전부 낼 수 있다.
    function addTextBox() {
      var bottom = ToonRender.contentBottom(state);
      var t = {
        id: genId("t"),
        x: state.canvasWidth / 2 - 120,
        y: Math.max(0, bottom - 60),
        w: 240,
        z: maxTextZ() + 1,
        text: "대사를 입력하세요",
        style: "bubble",
        font: "default",
        size: 16,
        align: "center"
      };
      state.texts.push(t);
      selectOnly("text", t.id);
      history.commit();
      scheduleSave();
    }
    document.getElementById("addBubbleBtn").addEventListener("click", addTextBox);

    // ── 삭제 / 복제 / 앞뒤 순서(다중 선택 지원) ────────────────────
    function deleteSelection() {
      if (!selection.length) return;
      selection.forEach(function (s) {
        if (s.type === "panel") {
          state.panels = state.panels.filter(function (p) {
            return p.id !== s.id;
          });
          PanelArtStore.deletePanel(episode.id, s.id);
        } else {
          state.texts = state.texts.filter(function (t) {
            return t.id !== s.id;
          });
        }
      });
      selection = [];
      render();
      history.commit();
      scheduleSave();
    }

    function duplicateSelection() {
      if (!selection.length) return;
      var newSel = [];
      selection.forEach(function (s) {
        var src = findAny(s.type, s.id);
        if (!src) return;
        var copy = Object.assign({}, src, { id: genId(s.type === "panel" ? "p" : "t"), x: src.x + 16, y: src.y + 16 });
        if (s.type === "panel") {
          copy.z = maxZ() + 1;
          state.panels.push(copy);
        } else {
          copy.z = maxTextZ() + 1;
          state.texts.push(copy);
        }
        newSel.push({ type: s.type, id: copy.id });
      });
      setSelection(newSel);
      history.commit();
      scheduleSave();
    }

    document.getElementById("delBtn").addEventListener("click", deleteSelection);
    document.getElementById("dupBtn").addEventListener("click", duplicateSelection);
    document.getElementById("frontBtn").addEventListener("click", function () {
      if (!selection.length) return;
      var z = Math.max(maxZ(), maxTextZ()) + 1;
      selection.forEach(function (s) {
        var box = findAny(s.type, s.id);
        if (box) box.z = z++;
      });
      render();
      history.commit();
      scheduleSave();
    });
    document.getElementById("backBtn").addEventListener("click", function () {
      if (!selection.length) return;
      var minZ = Math.min(
        state.panels.reduce(function (m, p) {
          return Math.min(m, p.z || 0);
        }, 0),
        state.texts.reduce(function (m, t) {
          return Math.min(m, t.z != null ? t.z : 900);
        }, 900)
      );
      var z = minZ - selection.length;
      selection.forEach(function (s) {
        var box = findAny(s.type, s.id);
        if (box) box.z = z++;
      });
      render();
      history.commit();
      scheduleSave();
    });

    function updateToolbarState() {
      var has = selection.length > 0;
      document.getElementById("delBtn").disabled = !has;
      document.getElementById("dupBtn").disabled = !has;
      document.getElementById("frontBtn").disabled = !has;
      document.getElementById("backBtn").disabled = !has;
    }

    // ── 사이드 패널(속성 편집) ─────────────────────────────────────
    function renderSidePanel() {
      if (selection.length === 0) {
        sidePanel.innerHTML = '<div class="center-empty" style="padding:40px 16px;">컷이나 말풍선을 눌러 속성을 편집하세요.</div>';
        return;
      }
      // 좁은 화면(모바일)에서는 속성 패널이 드로어로 숨어있어서, 컷이나
      // 말풍선을 눌러도 대사 입력칸이 화면 밖에 있으면 "입력이 안 된다"로
      // 보인다 - 뭔가 선택됐으면 드로어를 자동으로 열어 바로 보이게 한다.
      if (getComputedStyle(inspectorToggleBtn).display !== "none") setDrawerOpen(true);
      if (selection.length > 1) {
        renderMultiProps();
        return;
      }
      var s = selection[0];
      if (s.type === "panel") renderPanelProps(findPanel(s.id));
      else renderTextProps(findText(s.id));
    }

    function buildAlignButtons(container) {
      container.innerHTML = "";
      ALIGN_OPS.forEach(function (op) {
        var b = document.createElement("button");
        b.className = "icon-btn";
        b.dataset.tooltip = op.label;
        b.innerHTML = Icons.svg(op.icon, 18);
        b.addEventListener("click", function () {
          alignSelection(op.key);
        });
        container.appendChild(b);
      });
      if (selection.length >= 3) {
        var distH = document.createElement("button");
        distH.className = "icon-btn";
        distH.dataset.tooltip = "가로 간격 균등";
        distH.innerHTML = Icons.svg("distributeH", 18);
        distH.addEventListener("click", function () {
          distributeSelection("H");
        });
        container.appendChild(distH);
      }
    }

    function renderMultiProps() {
      sidePanel.innerHTML =
        "<h3>" +
        selection.length +
        "개 선택됨</h3>" +
        '<div class="field-row"><span>정렬</span></div>' +
        '<div class="align-grid" id="alignGrid"></div>' +
        '<button class="btn btn-ghost btn-sm" id="msDupBtn" style="width:100%;margin:10px 0 6px;"></button>' +
        '<button class="btn btn-danger btn-sm" id="msDelBtn" style="width:100%;"></button>';
      buildAlignButtons(sidePanel.querySelector("#alignGrid"));
      sidePanel.querySelector("#msDupBtn").innerHTML = Icons.svg("duplicate", 15) + " 복제";
      sidePanel.querySelector("#msDelBtn").innerHTML = Icons.svg("trash", 15) + " 삭제";
      sidePanel.querySelector("#msDupBtn").addEventListener("click", duplicateSelection);
      sidePanel.querySelector("#msDelBtn").addEventListener("click", deleteSelection);
    }

    function renderPanelProps(p) {
      sidePanel.innerHTML =
        "<h3>" +
        Icons.svg("photo", 16) +
        " 컷 속성</h3>" +
        '<div class="field-row"><span>X</span><input type="number" id="propX" value="' +
        Math.round(p.x) +
        '"><span>Y</span><input type="number" id="propY" value="' +
        Math.round(p.y) +
        '"></div>' +
        '<div class="field-row"><span>W</span><input type="number" id="propW" value="' +
        Math.round(p.w) +
        '"><span>H</span><input type="number" id="propH" value="' +
        Math.round(p.h) +
        '"></div>' +
        '<div class="field-row"><span>모양</span></div>' +
        '<div class="shape-grid" id="propShapeGrid"></div>' +
        '<div class="field-row"><span>채우기</span></div>' +
        '<div class="segmented" id="propFit">' +
        '<button class="segmented-btn' +
        (p.fit !== "contain" ? " active" : "") +
        '" data-v="cover">꽉 채우기</button>' +
        '<button class="segmented-btn' +
        (p.fit === "contain" ? " active" : "") +
        '" data-v="contain">전체 보이기</button>' +
        "</div>" +
        '<div class="field-row"><span>둥글기</span><input type="range" id="propRadius" min="0" max="60" value="' +
        (p.radius || 0) +
        '"><span class="field-val" id="propRadiusVal">' +
        (p.radius || 0) +
        "</span></div>" +
        '<div class="field-row"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="propBorder"' +
        (p.border ? " checked" : "") +
        "> 흰색 테두리</label></div>" +
        '<button class="btn btn-primary btn-sm" id="propPhotoBtn" style="width:100%;margin-bottom:8px;"></button>' +
        '<button class="btn btn-ghost btn-sm" id="propPaintBtn" style="width:100%;"></button>';

      sidePanel.querySelector("#propPhotoBtn").innerHTML = Icons.svg("photo", 15) + " 사진 넣기";
      sidePanel.querySelector("#propPaintBtn").innerHTML = Icons.svg("brush", 15) + " 그리기";

      var shapeGrid = sidePanel.querySelector("#propShapeGrid");
      ToonRender.SHAPE_OPTIONS.forEach(function (s) {
        var btn = document.createElement("button");
        btn.className = "shape-swatch" + ((p.shape || "rect") === s.key ? " active" : "");
        btn.dataset.tooltip = s.label;
        var fill = document.createElement("div");
        fill.className = "shape-fill";
        if (s.clip) fill.style.clipPath = s.clip;
        btn.appendChild(fill);
        btn.addEventListener("click", function () {
          p.shape = s.key;
          render();
          history.commit();
          scheduleSave();
        });
        shapeGrid.appendChild(btn);
      });

      function bindNum(id, apply) {
        var input = sidePanel.querySelector("#" + id);
        input.addEventListener("change", function () {
          var v = Number(input.value);
          if (!isFinite(v)) return;
          apply(Math.round(v));
          render();
          history.commit();
          scheduleSave();
        });
      }
      bindNum("propX", function (v) {
        p.x = Math.max(0, v);
      });
      bindNum("propY", function (v) {
        p.y = Math.max(0, v);
      });
      bindNum("propW", function (v) {
        p.w = Math.max(MIN_SIZE, v);
      });
      bindNum("propH", function (v) {
        p.h = Math.max(MIN_SIZE, v);
      });

      Array.prototype.forEach.call(sidePanel.querySelectorAll("#propFit .segmented-btn"), function (btn) {
        btn.addEventListener("click", function () {
          p.fit = btn.dataset.v;
          render();
          history.commit();
          scheduleSave();
        });
      });

      var radiusInput = sidePanel.querySelector("#propRadius");
      radiusInput.addEventListener("input", function () {
        p.radius = Number(radiusInput.value);
        ToonRender.positionPanel(nodes[p.id], p, lastMetrics);
        sidePanel.querySelector("#propRadiusVal").textContent = String(p.radius);
      });
      radiusInput.addEventListener("change", function () {
        history.commit();
        scheduleSave();
      });

      // 예전에는 이 체크박스가 상태만 바꾸고 화면을 갱신하지 않아(E7) 다음
      // 재조회 전까지 흰 테두리가 반영된 것처럼 안 보였다 - 이제 조정
      // 렌더링이 싸므로 바로 반영한다.
      sidePanel.querySelector("#propBorder").addEventListener("change", function (e) {
        p.border = e.target.checked;
        ToonRender.positionPanel(nodes[p.id], p, lastMetrics);
        history.commit();
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
        "<h3>" +
        Icons.svg("bubble", 16) +
        " 텍스트 속성</h3>" +
        '<div class="field-row"><span>내용</span></div>' +
        '<textarea id="propText" style="width:100%;min-height:60px;margin-bottom:8px;background:var(--color-surface-soft);border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text);padding:8px;font-family:inherit;font-size:13px;">' +
        escapeHtml(t.text) +
        "</textarea>" +
        '<div class="field-row"><span>배경</span><select id="propStyle">' +
        '<option value="bubble">말풍선</option>' +
        '<option value="bubble-tail">말풍선(꼬리)</option>' +
        '<option value="cloud">생각풍선</option>' +
        '<option value="burst">효과음(폭발)</option>' +
        '<option value="narration">박스</option>' +
        '<option value="sfx">배경없음</option>' +
        "</select></div>" +
        '<div class="field-row"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="propPunch"' +
        ((t.punch != null ? t.punch : t.style === "sfx") ? " checked" : "") +
        "> 굵게+외곽선(효과음 느낌)</label></div>" +
        '<div class="field-row"><span>글꼴</span><select id="propFont">' +
        ToonRender.FONT_OPTIONS.map(function (f) {
          return '<option value="' + f.key + '">' + f.label + "</option>";
        }).join("") +
        "</select></div>" +
        '<div class="field-row"><span>정렬</span><select id="propAlign"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></div>' +
        '<div class="field-row"><span>크기</span><input type="range" id="propSize" min="10" max="60" value="' +
        (t.size || 16) +
        '"><span class="field-val" id="propSizeVal">' +
        (t.size || 16) +
        "</span></div>" +
        '<div class="field-row"><span>색상</span><input type="color" id="propColor" value="' +
        (t.color || (t.style === "sfx" ? "#ffffff" : "#1a1a1a")) +
        '"></div>' +
        '<div class="field-row"><span>X</span><input type="number" id="propX" value="' +
        Math.round(t.x) +
        '"><span>Y</span><input type="number" id="propY" value="' +
        Math.round(t.y) +
        '"><span>W</span><input type="number" id="propW" value="' +
        Math.round(t.w) +
        '"></div>';

      sidePanel.querySelector("#propText").addEventListener("input", function (e) {
        t.text = e.target.value;
        // render()를 부르면 textarea가 통째로 새로 그려져서 포커스가 날아가고
        // 그다음 키 입력이 씹힌다 - 캔버스 미리보기 글자만 직접 바꾼다.
        var liveEl = nodes[t.id];
        if (liveEl) liveEl.textContent = t.text || "";
        updateSceneSize();
        positionSelectionOverlay();
        history.commit("text:" + t.id);
        scheduleSave();
      });
      sidePanel.querySelector("#propStyle").value = t.style || "bubble";
      sidePanel.querySelector("#propStyle").addEventListener("change", function (e) {
        t.style = e.target.value;
        render();
        history.commit();
        scheduleSave();
      });
      sidePanel.querySelector("#propPunch").addEventListener("change", function (e) {
        t.punch = e.target.checked;
        render();
        history.commit();
        scheduleSave();
      });
      sidePanel.querySelector("#propFont").value = t.font || "default";
      sidePanel.querySelector("#propFont").addEventListener("change", function (e) {
        t.font = e.target.value;
        render();
        history.commit();
        scheduleSave();
      });
      sidePanel.querySelector("#propAlign").value = t.align || "center";
      sidePanel.querySelector("#propAlign").addEventListener("change", function (e) {
        t.align = e.target.value;
        render();
        history.commit();
        scheduleSave();
      });
      var sizeInput = sidePanel.querySelector("#propSize");
      sizeInput.addEventListener("input", function () {
        t.size = Number(sizeInput.value);
        ToonRender.positionText(nodes[t.id], t, lastMetrics);
        sidePanel.querySelector("#propSizeVal").textContent = String(t.size);
      });
      sizeInput.addEventListener("change", function () {
        history.commit();
        scheduleSave();
      });
      sidePanel.querySelector("#propColor").addEventListener("input", function (e) {
        t.color = e.target.value;
        ToonRender.positionText(nodes[t.id], t, lastMetrics);
      });
      sidePanel.querySelector("#propColor").addEventListener("change", function () {
        history.commit();
        scheduleSave();
      });

      function bindNum(id, apply) {
        var input = sidePanel.querySelector("#" + id);
        input.addEventListener("change", function () {
          var v = Number(input.value);
          if (!isFinite(v)) return;
          apply(Math.round(v));
          render();
          history.commit();
          scheduleSave();
        });
      }
      bindNum("propX", function (v) {
        t.x = Math.max(0, v);
      });
      bindNum("propY", function (v) {
        t.y = Math.max(0, v);
      });
      bindNum("propW", function (v) {
        t.w = Math.max(MIN_TEXT_W, v);
      });
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
          var el = nodes[targetId];
          if (!el) return;
          PanelArtStore.loadPanel(episode.id, targetId).then(function (art) {
            ToonRender.applyArt(el, art);
          });
        });
      };
      reader.readAsDataURL(file);
    });

    // ── 되돌리기/다시하기 + 키보드 단축키 ───────────────────────────
    // 옛 편집기는 되돌리기가 전혀 없었고(E1) 단축키도 하나도 없었다.
    function updateUndoRedoState() {
      document.getElementById("undoBtn").disabled = !history.canUndo();
      document.getElementById("redoBtn").disabled = !history.canRedo();
    }
    document.getElementById("undoBtn").addEventListener("click", history.undo);
    document.getElementById("redoBtn").addEventListener("click", history.redo);

    function pasteClipboard() {
      if (!clipboard || !clipboard.length) return;
      var newSel = [];
      clipboard.forEach(function (c) {
        var copy = Object.assign({}, c.data, { id: genId(c.type === "panel" ? "p" : "t"), x: c.data.x + 16, y: c.data.y + 16 });
        if (c.type === "panel") {
          copy.z = maxZ() + 1;
          state.panels.push(copy);
        } else {
          copy.z = maxTextZ() + 1;
          state.texts.push(copy);
        }
        newSel.push({ type: c.type, id: copy.id });
      });
      setSelection(newSel);
      history.commit();
      scheduleSave();
    }

    document.addEventListener("keydown", function (e) {
      var tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        history.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        history.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selection.length) {
          e.preventDefault();
          deleteSelection();
        }
      } else if (e.key === "Escape") {
        clearSelection();
      } else if (mod && e.key.toLowerCase() === "d") {
        if (selection.length) {
          e.preventDefault();
          duplicateSelection();
        }
      } else if (mod && e.key.toLowerCase() === "c") {
        if (selection.length) {
          clipboard = selection.map(function (s) {
            return { type: s.type, data: Object.assign({}, findAny(s.type, s.id)) };
          });
        }
      } else if (mod && e.key.toLowerCase() === "v") {
        if (clipboard && clipboard.length) {
          e.preventDefault();
          pasteClipboard();
        }
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) !== -1) {
        if (!selection.length) return;
        e.preventDefault();
        var step = e.shiftKey ? 10 : 1;
        var dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        var dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        selectedBoxes().forEach(function (it) {
          it.box.x = Math.max(0, it.box.x + dx);
          it.box.y = Math.max(0, it.box.y + dy);
        });
        render();
        history.commit("nudge");
        scheduleSave();
      }
    });

    // ── 모바일 속성 패널(드로어) ────────────────────────────────────
    inspectorToggleBtn.innerHTML = Icons.svg("adjust", 18);
    function setDrawerOpen(open) {
      sidePanel.classList.toggle("open", open);
      inspectorScrim.classList.toggle("open", open);
    }
    inspectorToggleBtn.addEventListener("click", function () {
      setDrawerOpen(!sidePanel.classList.contains("open"));
    });
    inspectorScrim.addEventListener("click", function () {
      setDrawerOpen(false);
    });

    // ── 저장 ────────────────────────────────────────────────────────
    var saveTimer = null;
    function scheduleSave() {
      saveStatus.textContent = "저장 중...";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 800);
    }
    function doSave() {
      // 리더가 잘못 그리던 원인(R1)의 재발 방지: 저장할 때마다 canvasHeight를
      // "지금 배치된 내용의 아래쪽"과 같거나 크게 맞춰둔다 - 이 코드가 없던
      // 옛날에 저장된 회차도 다음에 편집하면 자동으로 치유된다.
      state.canvasHeight = Math.max(state.canvasHeight, ToonRender.contentBottom(state));
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

    // ── 툴바 아이콘 채우기 ──────────────────────────────────────────
    document.getElementById("addPanelIcon").innerHTML = Icons.svg("plus", 15);
    document.getElementById("dupBtn").innerHTML = Icons.svg("duplicate", 15) + " 복제";
    document.getElementById("frontBtn").innerHTML = Icons.svg("bringFront", 15) + " 맨앞";
    document.getElementById("backBtn").innerHTML = Icons.svg("sendBack", 15) + " 맨뒤";
    document.getElementById("delBtn").innerHTML = Icons.svg("trash", 15) + " 삭제";
    document.getElementById("addBubbleBtn").innerHTML = Icons.svg("bubble", 15) + " 말풍선";
    document.getElementById("undoBtn").innerHTML = Icons.svg("undo", 18);
    document.getElementById("redoBtn").innerHTML = Icons.svg("redo", 18);

    ToonRender.watchScale(canvasEl, state.canvasWidth);
    render();
  }
})();
