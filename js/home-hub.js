(function () {
  "use strict";

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  // 여러 시리즈 중 하나를 대표로 뽑아 카드에 보여준다 - SeriesStore.listSeries()가
  // 이미 연재중을 맨 앞으로 정렬해주므로 그냥 첫 번째를 쓰면 된다.
  function toonPreview() {
    var seriesList = SeriesStore.listSeries();
    if (!seriesList.length) {
      return { title: "웹툰", preview: "아직 시리즈가 없어요.<br>첫 시리즈를 만들어보세요!", seriesId: null };
    }
    var featured = seriesList[0];
    var latestEp = EpisodeStore.listEpisodes(featured.id).filter(EpisodeStore.isVisible)[0];
    var preview = latestEp
      ? escapeHtml(latestEp.no + "화 · " + (latestEp.title || ""))
      : "곧 첫 회차가 올라와요!";
    return { title: featured.title, preview: preview, seriesId: featured.id };
  }

  function artFrameHtml() {
    var posts = ArtStore.listPosts();
    if (!posts.length) return { frame: "🖼️", title: "아직 그림이 없어요", preview: "첫 그림을 그려보세요!", id: null };
    var latest = posts[0];
    return { frame: null, title: latest.title || "제목 없음", preview: "최신 그림", id: latest.id };
  }

  function boardPreview() {
    var posts = BoardStore.listPosts();
    if (!posts.length) return { title: "아직 쓴 글이 없어요", preview: "첫 글을 남겨보세요!" };
    var latest = posts[0];
    var snippet = (latest.body || "").replace(/\s+/g, " ").slice(0, 44);
    return { title: latest.title || "(제목 없음)", preview: snippet + ((latest.body || "").length > 44 ? "…" : "") };
  }

  function render() {
    document.getElementById("hubTitle").textContent = "유키의 낙서장";

    var toon = toonPreview();
    var art = artFrameHtml();
    var board = boardPreview();
    var desk = document.getElementById("hubDesk");

    desk.innerHTML =
      '<a class="hub-card toon" href="' +
      (toon.seriesId ? "toon-series.html?series=" + encodeURIComponent(toon.seriesId) : "toon.html") +
      '">' +
      '<div class="hub-card-body"><div class="hub-icon">💬</div>' +
      '<div class="hub-title">' +
      escapeHtml(toon.title) +
      "</div>" +
      '<div class="hub-preview">' +
      toon.preview +
      "</div></div>" +
      '<div class="hub-card-label">웹툰 보러가기</div>' +
      "</a>" +
      '<a class="hub-card art" href="' +
      (art.id ? "art-post.html?id=" + encodeURIComponent(art.id) : "art.html") +
      '">' +
      '<div class="hub-card-body"><div class="washi-tape"></div>' +
      '<div class="hub-art-frame" id="hubArtFrame">' +
      (art.frame || "") +
      "</div>" +
      '<div class="hub-title">' +
      escapeHtml(art.title) +
      "</div>" +
      '<div class="hub-preview">' +
      escapeHtml(art.preview) +
      "</div></div>" +
      '<div class="hub-card-label">그림 게시판 가기</div>' +
      "</a>" +
      '<a class="hub-card board" href="board.html">' +
      '<div class="hub-card-body"><div class="hub-icon">📌</div>' +
      '<div class="hub-title">' +
      escapeHtml(board.title) +
      "</div>" +
      '<div class="hub-preview">' +
      escapeHtml(board.preview) +
      "</div></div>" +
      '<div class="hub-card-label">글 게시판 가기</div>' +
      "</a>";

    if (art.id) {
      PanelArtStore.loadPanel(art.id, "main").then(function (record) {
        var el = document.getElementById("hubArtFrame");
        if (!el || !record) return;
        var img = document.createElement("img");
        img.src = record.image;
        el.innerHTML = "";
        el.appendChild(img);
      });
    }
  }

  window.__webtoonOnEpisodesChanged = render;
  window.__webtoonOnSeriesListChanged = render;
  window.__webtoonOnArtChanged = render;
  window.__webtoonOnBoardChanged = render;
  render();
})();
