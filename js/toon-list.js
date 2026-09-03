(function () {
  "use strict";

  var WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  var STATUS_LABEL = { ongoing: "🟢 연재중", paused: "⏸ 휴재", ended: "🏁 완결" };

  // 시리즈가 여러 개 생기면 다 비슷한 주황 카드로 보여서 서로 구분이 안 됐다 -
  // 시리즈 id로 항상 같은 색이 나오게 뽑아서(같은 시리즈는 항상 같은 색) 목록에서
  // 한눈에 "이건 다른 작품이구나"를 알 수 있게 한다.
  var SERIES_PALETTE = [
    { bg: "#fff0e6", deep: "#ff8a5b", text: "#c24e24" },
    { bg: "#e2fbf6", deep: "#22b8a6", text: "#159384" },
    { bg: "#ece7ff", deep: "#7c6ae0", text: "#5847c4" },
    { bg: "#ffe7f1", deep: "#e0609f", text: "#b8447a" },
    { bg: "#fff3d9", deep: "#f0ac1e", text: "#cf8f0f" },
    { bg: "#e3f2ff", deep: "#4c8dff", text: "#2f6a9e" }
  ];

  function seriesColor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return SERIES_PALETTE[h % SERIES_PALETTE.length];
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function nextScheduledDate(series, now) {
    var days = (series.scheduleDays || []).slice().sort();
    if (!days.length) return null;
    for (var offset = 0; offset < 15; offset++) {
      var d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + offset);
      if (days.indexOf(d.getDay()) === -1) continue;
      d.setHours(series.scheduleHour || 19, 0, 0, 0);
      if (d.getTime() > now.getTime()) return d;
    }
    return null;
  }

  function formatDday(target, now) {
    var diffMs = target.getTime() - now.getTime();
    var diffDays = Math.floor(diffMs / 86400000);
    var weekday = WEEKDAY_NAMES[target.getDay()];
    var hh = target.getHours();
    var timeLabel = hh + "시";
    if (diffDays <= 0) return "오늘 " + weekday + "요일 " + timeLabel;
    return "D-" + diffDays + " · " + weekday + "요일 " + timeLabel;
  }

  function latestVisibleEpisode(seriesId) {
    var visible = EpisodeStore.listEpisodes(seriesId).filter(EpisodeStore.isVisible);
    if (!visible.length) return null;
    return visible[0]; // listEpisodes already sorts by no desc
  }

  function loadThumbInto(elId, seriesId) {
    var latest = latestVisibleEpisode(seriesId);
    var firstPanel = latest && (latest.panels || [])[0];
    if (!firstPanel) return;
    PanelArtStore.loadPanel(latest.id, firstPanel.id).then(function (art) {
      if (!art) return;
      var el = document.getElementById(elId);
      if (!el) return;
      var img = document.createElement("img");
      img.src = art.image;
      el.innerHTML = "";
      el.appendChild(img);
    });
  }

  function render() {
    var all = SeriesStore.listSeries();
    var ongoing = all.filter(function (s) {
      return s.status === "ongoing";
    });
    var others = all.filter(function (s) {
      return s.status !== "ongoing";
    });

    document.getElementById("emptyState").hidden = all.length > 0;
    document.getElementById("ongoingSection").hidden = ongoing.length === 0;
    document.getElementById("otherSection").hidden = others.length === 0;

    var ongoingGrid = document.getElementById("ongoingGrid");
    ongoingGrid.innerHTML = "";
    ongoing.forEach(function (s) {
      var next = nextScheduledDate(s, new Date());
      var col = seriesColor(s.id);
      var epCount = EpisodeStore.listEpisodes(s.id).filter(EpisodeStore.isVisible).length;
      var card = document.createElement("div");
      card.className = "card series-featured-card";
      card.style.borderColor = col.deep;
      card.style.background = "linear-gradient(135deg," + col.bg + ", var(--color-surface))";
      card.innerHTML =
        '<div class="series-featured-thumb" id="sf-thumb-' +
        s.id +
        '" style="background:linear-gradient(135deg,' +
        col.deep +
        "," +
        col.text +
        ')">💬</div>' +
        '<div class="series-featured-info">' +
        '<div class="series-title-row">' +
        '<span class="series-title">' +
        escapeHtml(s.title) +
        "</span>" +
        '<span class="series-live-badge" style="background:' +
        col.deep +
        '">🟢 연재중</span>' +
        "</div>" +
        (s.tagline ? '<div class="series-tagline">' + escapeHtml(s.tagline) + "</div>" : "") +
        '<div class="series-next" style="color:' +
        col.text +
        '">' +
        (epCount ? epCount + "화 연재 · " : "") +
        (next ? "🗓️ 다음 회차 " + formatDday(next, new Date()) : "곧 첫 회차가 올라와요") +
        "</div>" +
        "</div>";
      card.addEventListener("click", function () {
        location.href = "toon-series.html?series=" + encodeURIComponent(s.id);
      });
      ongoingGrid.appendChild(card);
      loadThumbInto("sf-thumb-" + s.id, s.id);
    });

    var otherGrid = document.getElementById("otherGrid");
    otherGrid.innerHTML = "";
    others.forEach(function (s) {
      var col = seriesColor(s.id);
      var card = document.createElement("div");
      card.className = "card series-compact-card";
      card.style.borderTopColor = col.deep;
      card.innerHTML =
        '<div class="series-compact-thumb" id="sc-thumb-' +
        s.id +
        '" style="background:' +
        col.bg +
        '">💬</div>' +
        '<div class="series-title">' +
        escapeHtml(s.title) +
        "</div>" +
        '<div class="series-status-label" style="color:' +
        col.text +
        '">' +
        STATUS_LABEL[s.status] +
        "</div>";
      card.addEventListener("click", function () {
        location.href = "toon-series.html?series=" + encodeURIComponent(s.id);
      });
      otherGrid.appendChild(card);
      loadThumbInto("sc-thumb-" + s.id, s.id);
    });
  }

  function askTitle(onDone) {
    var overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML =
      '<div class="card modal-box">' +
      "<h2>💬 새 웹툰 시리즈</h2>" +
      '<div class="field"><label>제목</label><input type="text" id="seriesTitleInput" placeholder="시리즈 제목" autofocus></div>' +
      '<button class="btn btn-primary" id="seriesTitleGo" style="width:100%">만들기</button>' +
      "</div>";
    document.body.appendChild(overlay);
    var input = overlay.querySelector("#seriesTitleInput");
    function submit() {
      var title = input.value.trim() || "제목 없는 웹툰";
      overlay.remove();
      onDone(title);
    }
    overlay.querySelector("#seriesTitleGo").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
    input.focus();
  }

  document.getElementById("newSeriesBtn").addEventListener("click", function () {
    AdminAuth.guard(function () {
      askTitle(function (title) {
        var series = SeriesStore.saveSeries(SeriesStore.blankSeries(title));
        location.href = "admin.html?series=" + encodeURIComponent(series.id);
      });
    });
  });

  window.__webtoonOnSeriesListChanged = render;
  window.__webtoonOnEpisodesChanged = render;
  render();
})();
