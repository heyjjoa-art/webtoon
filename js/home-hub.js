(function () {
  "use strict";

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function toonPreviewHtml() {
    var visible = EpisodeStore.listEpisodes().filter(EpisodeStore.isVisible);
    if (!visible.length) return "아직 회차가 없어요.<br>첫 회차를 올려보세요!";
    var latest = visible.sort(function (a, b) {
      return (b.no || 0) - (a.no || 0);
    })[0];
    return escapeHtml(latest.no + "화 · " + (latest.title || "")) + (latest.summary ? "<br>" + escapeHtml(latest.summary) : "");
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
    var series = EpisodeStore.getSeries();
    document.getElementById("hubTitle").textContent = series.title && series.title !== "제목 없는 웹툰" ? series.title + "네 낙서장" : "오늘의 낙서장";

    var art = artFrameHtml();
    var board = boardPreview();
    var desk = document.getElementById("hubDesk");

    desk.innerHTML =
      '<a class="hub-card toon" href="toon.html">' +
      '<div class="hub-card-body"><div class="hub-icon">💬</div>' +
      '<div class="hub-title">웹툰</div>' +
      '<div class="hub-preview">' +
      toonPreviewHtml() +
      "</div></div>" +
      '<div class="hub-card-label">회차 보러가기</div>' +
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
  window.__webtoonOnArtChanged = render;
  window.__webtoonOnBoardChanged = render;
  window.__webtoonOnSeriesChanged = render;
  render();
})();
