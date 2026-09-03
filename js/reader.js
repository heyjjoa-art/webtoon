(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var epId = params.get("ep");
  var episode = epId ? EpisodeStore.getEpisode(epId) : null;

  var canvasEl = document.getElementById("panelCanvas");
  var readerRoot = document.getElementById("readerRoot");
  var lockedView = document.getElementById("lockedView");

  if (!episode || !EpisodeStore.isVisible(episode)) {
    readerRoot.hidden = true;
    lockedView.hidden = false;
    document.getElementById("epTitle").textContent = "";
    return;
  }

  document.getElementById("epTitle").textContent = episode.no + "화 · " + (episode.title || "");
  document.title = episode.title + " - 낙서장";

  renderCanvas();
  renderNav();
  startComments();

  function renderCanvas() {
    var cw = episode.canvasWidth || 900;
    var ch = episode.canvasHeight || 1200;
    canvasEl.style.aspectRatio = cw + " / " + ch;

    var panels = (episode.panels || []).slice().sort(function (a, b) {
      return (a.z || 0) - (b.z || 0);
    });

    panels.forEach(function (p) {
      var box = document.createElement("div");
      box.className = "reader-panel" + (p.fit === "contain" ? " fit-contain" : "");
      box.style.left = (p.x / cw) * 100 + "%";
      box.style.top = (p.y / ch) * 100 + "%";
      box.style.width = (p.w / cw) * 100 + "%";
      box.style.height = (p.h / ch) * 100 + "%";
      box.style.borderRadius = (p.radius || 0) + "px";
      box.style.zIndex = String(p.z || 0);
      if (p.border) box.style.boxShadow = "inset 0 0 0 2px rgba(255,255,255,0.85)";
      box.innerHTML = '<div class="panel-placeholder">🖼️</div>';
      canvasEl.appendChild(box);

      var obs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            obs.disconnect();
            PanelArtStore.loadPanel(episode.id, p.id).then(function (art) {
              if (!art) return;
              var img = document.createElement("img");
              img.src = art.image;
              img.alt = "";
              box.innerHTML = "";
              box.appendChild(img);
            });
          });
        },
        { rootMargin: "400px 0px" }
      );
      obs.observe(box);
    });

    (episode.texts || []).forEach(function (t) {
      var box = document.createElement("div");
      box.className = "reader-text style-" + (t.style || "bubble");
      box.style.left = (t.x / cw) * 100 + "%";
      box.style.top = (t.y / ch) * 100 + "%";
      box.style.width = (t.w / cw) * 100 + "%";
      box.style.textAlign = t.align || "center";
      box.dataset.baseSize = t.size || 16;
      box.textContent = t.text || "";
      box.style.zIndex = "1000";
      canvasEl.appendChild(box);
    });

    rescaleText();
    var ro = new ResizeObserver(rescaleText);
    ro.observe(canvasEl);
  }

  function rescaleText() {
    var cw = episode.canvasWidth || 900;
    var scale = canvasEl.getBoundingClientRect().width / cw;
    canvasEl.querySelectorAll(".reader-text").forEach(function (box) {
      var base = Number(box.dataset.baseSize) || 16;
      box.style.fontSize = Math.max(9, base * scale) + "px";
    });
  }

  function renderNav() {
    var all = EpisodeStore.listEpisodes()
      .filter(function (ep) {
        return EpisodeStore.isVisible(ep);
      })
      .sort(function (a, b) {
        return (a.no || 0) - (b.no || 0);
      });
    var idx = all.findIndex(function (ep) {
      return ep.id === episode.id;
    });
    var prevBtn = document.getElementById("prevBtn");
    var nextBtn = document.getElementById("nextBtn");
    var prev = idx > 0 ? all[idx - 1] : null;
    var next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
    if (prev) prevBtn.addEventListener("click", function () {
      location.href = "read.html?ep=" + encodeURIComponent(prev.id);
    });
    else prevBtn.disabled = true;
    if (next) nextBtn.addEventListener("click", function () {
      location.href = "read.html?ep=" + encodeURIComponent(next.id);
    });
    else nextBtn.disabled = true;
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function timeAgoLabel(minutes) {
    if (minutes < 1) return "방금 전";
    if (minutes < 60) return minutes + "분 전";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "시간 전";
    return Math.floor(hours / 24) + "일 전";
  }

  var shownIds = {};
  function renderComments() {
    var visible = Fans.visibleComments(episode);
    var listEl = document.getElementById("commentsList");
    document.getElementById("commentCount").textContent = visible.length ? "· " + visible.length : "";
    if (!visible.length) {
      listEl.innerHTML = '<div class="muted" style="padding:20px 0;">아직 댓글이 없어요. 조금만 기다려보세요!</div>';
      return;
    }
    visible.forEach(function (c) {
      if (shownIds[c.id]) return;
      shownIds[c.id] = true;
      var item = document.createElement("div");
      item.className = "comment-item" + (c.parentId ? " is-reply" : "");
      item.innerHTML =
        '<div class="comment-avatar">' +
        c.emoji +
        "</div>" +
        '<div class="comment-body">' +
        '<div class="comment-name">' +
        escapeHtml(c.name) +
        "</div>" +
        '<div class="comment-text">' +
        escapeHtml(c.text) +
        "</div>" +
        '<div class="comment-meta">' +
        timeAgoLabel(Math.max(0, Math.round((Date.now() - (episode.publishedAt + c.delayMinutes * 60000)) / 60000))) +
        " · ❤ " +
        c.likes +
        "</div>" +
        "</div>";
      listEl.appendChild(item);
    });
    if (listEl.children.length === 0) {
      listEl.innerHTML = '<div class="muted" style="padding:20px 0;">아직 댓글이 없어요. 조금만 기다려보세요!</div>';
    }
  }

  function startComments() {
    renderComments();
    setInterval(renderComments, 30000);
  }
})();
