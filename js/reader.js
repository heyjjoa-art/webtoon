(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var epId = params.get("ep");
  var episode = null;

  var canvasEl = document.getElementById("panelCanvas");
  var readerRoot = document.getElementById("readerRoot");
  var lockedView = document.getElementById("lockedView");

  // 컷·텍스트를 js/toon-render.js(편집기와 공용)로 그린다. 예전에는 이
  // 파일이 직접 %/px을 계산해서, 편집기가 쓰던 계산식과 몰래 어긋나 있었다
  // (컷 높이 초과분이 잘리거나, "전체 보이기"가 안 먹거나, radius가 다르게
  // 보이던 문제들 - 전부 계산식이 두 군데였기 때문이었다).
  function renderCanvas() {
    var m = ToonRender.metrics(episode);

    ToonRender.applySceneSize(canvasEl, m);

    (episode.panels || []).forEach(function (p) {
      var el = ToonRender.panelEl(p, m);
      canvasEl.appendChild(el);

      var obs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            obs.disconnect();
            PanelArtStore.loadPanel(episode.id, p.id).then(function (art) {
              ToonRender.applyArt(el, art);
            });
          });
        },
        { rootMargin: "400px 0px" }
      );
      obs.observe(el);
    });

    (episode.texts || []).forEach(function (t) {
      var el = ToonRender.textEl(t, m);
      canvasEl.appendChild(el);
    });

    ToonRender.watchScale(canvasEl, m.cw);
  }

  function renderNav() {
    var all = EpisodeStore.listEpisodes(episode.seriesId)
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

  Session.ready.then(function () {
    episode = epId ? EpisodeStore.getEpisode(epId) : null;

    if (!episode || !EpisodeStore.isVisible(episode)) {
      readerRoot.hidden = true;
      lockedView.hidden = false;
      document.getElementById("epTitle").textContent = "";
      return;
    }

    document.getElementById("epTitle").textContent = episode.no + "화 · " + (episode.title || "");
    document.title = episode.title + " - 낙서장";
    var backLink = document.getElementById("backLink");
    if (backLink && episode.seriesId) backLink.href = "toon-series.html?series=" + encodeURIComponent(episode.seriesId);

    renderCanvas();
    renderNav();
    CommentsWidget.mount(episode, "toon");
  });
})();
