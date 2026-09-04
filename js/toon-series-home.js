(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var seriesId = params.get("series");
  var series = null;

  var WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  function nextScheduledDate(s, now) {
    if (s.status !== "ongoing") return null;
    var days = (s.scheduleDays || []).slice().sort();
    if (!days.length) return null;
    for (var offset = 0; offset < 15; offset++) {
      var d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + offset);
      if (days.indexOf(d.getDay()) === -1) continue;
      d.setHours(s.scheduleHour || 19, 0, 0, 0);
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

  var STATUS_LABEL = { ongoing: "🟢 연재중", paused: "⏸ 휴재", ended: "🏁 완결" };

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function renderBanner() {
    series = SeriesStore.getSeries(seriesId) || series;
    var el = document.getElementById("seriesBanner");
    document.title = (series.title || "웹툰") + " - 낙서장";

    var next = nextScheduledDate(series, new Date());
    el.innerHTML =
      "<h1>" +
      escapeHtml(series.title || "제목 없는 웹툰") +
      ' <span class="badge badge-' +
      (series.status === "ongoing" ? "published" : series.status === "ended" ? "draft" : "scheduled") +
      '" style="vertical-align:middle;">' +
      STATUS_LABEL[series.status] +
      "</span></h1>" +
      (series.tagline ? '<div class="tagline">' + escapeHtml(series.tagline) + "</div>" : "") +
      (next
        ? '<div class="next-episode">🗓️ 다음 회차 <span class="dday">' +
          formatDday(next, new Date()) +
          "</span></div>"
        : "") +
      (Session.isLoggedIn()
        ? '<a class="btn btn-primary btn-sm" href="admin.html?series=' +
          encodeURIComponent(seriesId) +
          '" style="margin-top:12px;">✍️ 이 시리즈 관리</a>'
        : "");
  }

  window.__webtoonOnSeriesListChanged = renderBanner;

  function episodeCardHtml(ep, visible) {
    var lockNote = "";
    if (!visible) {
      var when = ep.publishAt ? new Date(ep.publishAt) : null;
      lockNote = when
        ? "🔒 " + (when.getMonth() + 1) + "월 " + when.getDate() + "일 " + when.getHours() + "시 공개"
        : "🔒 준비중";
    }
    return (
      '<div class="card episode-card' +
      (visible ? "" : " locked") +
      '" data-id="' +
      ep.id +
      '">' +
      '<div class="episode-thumb" id="thumb-' +
      ep.id +
      '">📕</div>' +
      '<div class="episode-info">' +
      '<div class="no">' +
      ep.no +
      "화" +
      "</div>" +
      '<div class="title">' +
      escapeHtml(ep.title || "(제목 없음)") +
      "</div>" +
      (visible
        ? '<div class="summary">' + escapeHtml(ep.summary || "") + "</div>"
        : '<div class="summary">' + lockNote + "</div>") +
      (visible
        ? '<div class="episode-meta-row"><span>💬 <span id="cc-' +
          ep.id +
          '">0</span></span></div>'
        : "") +
      "</div>" +
      "</div>"
    );
  }

  function renderList() {
    var episodes = EpisodeStore.listEpisodes(seriesId).filter(function (ep) {
      return ep.status !== "draft";
    });
    var listEl = document.getElementById("episodeList");
    if (!episodes.length) {
      listEl.innerHTML = '<div class="center-empty">아직 공개된 회차가 없어요 📭</div>';
      return;
    }
    listEl.innerHTML = episodes
      .map(function (ep) {
        return episodeCardHtml(ep, EpisodeStore.isVisible(ep));
      })
      .join("");

    listEl.querySelectorAll(".episode-card").forEach(function (card) {
      var id = card.getAttribute("data-id");
      var ep = EpisodeStore.getEpisode(id);
      if (EpisodeStore.isVisible(ep)) {
        card.addEventListener("click", function () {
          location.href = "read.html?ep=" + encodeURIComponent(id);
        });
        loadThumb(ep);
        var ccEl = document.getElementById("cc-" + id);
        if (ccEl && ep.publishedAt) ccEl.textContent = String(Fans.visibleComments(ep).length);
      }
    });
  }

  function loadThumb(ep) {
    var firstPanel = (ep.panels || [])[0];
    if (!firstPanel) return;
    PanelArtStore.loadPanel(ep.id, firstPanel.id).then(function (art) {
      if (!art) return;
      var el = document.getElementById("thumb-" + ep.id);
      if (!el) return;
      var img = document.createElement("img");
      img.src = art.image;
      img.alt = ep.title || "";
      el.innerHTML = "";
      el.appendChild(img);
    });
  }

  window.__webtoonOnEpisodesChanged = renderList;

  // Firebase 인증 상태 확정은 비동기라, 첫 확정 전에는 이 계정의 시리즈 데이터가
  // 아직 로드되지 않은 것뿐이다 - 그걸 "시리즈가 없다"고 착각해 toon.html로
  // 튕겨내지 않도록 Session.ready를 기다린 뒤에야 진짜로 판단한다.
  Session.ready.then(function () {
    series = seriesId ? SeriesStore.getSeries(seriesId) : null;
    if (!series) {
      location.href = "toon.html";
      return;
    }
    renderBanner();
    renderList();

    // 예약 발행이 시각에 맞춰 자동으로 열리도록, 그리고 팬 댓글이 시간에 따라
    // 늘어나는 걸 화면을 켜둔 채로도 볼 수 있도록 1분마다 다시 그린다.
    setInterval(function () {
      renderBanner();
      renderList();
    }, 60000);
  });
})();
