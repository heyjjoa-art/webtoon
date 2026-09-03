// 회차 읽기 화면(read.html)·그림 상세(art-post.html)·글 상세(board-post.html)가
// 공통으로 쓰는 댓글 UI. #commentCount / #commentsList 두 요소만 있으면 되고,
// 댓글 데이터 자체는 fans.js(Fans.visibleComments)가 만들어준다. 30초마다
// 새로 지날 시간을 확인해서 그 사이 "발행"된 댓글이 있으면 자연스럽게 끼워 넣는다.
var CommentsWidget = (function () {
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

  // item: {id, title, publishedAt|createdAt, ...} / kind: "toon" | "art" | "board"
  function mount(item, kind) {
    var countEl = document.getElementById("commentCount");
    var listEl = document.getElementById("commentsList");
    if (!countEl || !listEl) return;

    var shownIds = {};

    function render() {
      var visible = Fans.visibleComments(item, kind);
      countEl.textContent = visible.length ? "· " + visible.length : "";
      if (!visible.length) {
        listEl.innerHTML = '<div class="muted" style="padding:20px 0;">아직 댓글이 없어요. 조금만 기다려보세요!</div>';
        return;
      }
      var anchor = item.publishedAt || item.createdAt || Date.now();
      visible.forEach(function (c) {
        if (shownIds[c.id]) return;
        shownIds[c.id] = true;
        var el = document.createElement("div");
        el.className = "comment-item";
        el.innerHTML =
          '<div class="comment-avatar" id="cmt-avatar-' + c.id + '">' + c.emoji + "</div>" +
          '<div class="comment-body">' +
          '<div class="comment-name">' + escapeHtml(c.name) + "</div>" +
          '<div class="comment-text">' + escapeHtml(c.text) + "</div>" +
          '<div class="comment-meta">' +
          timeAgoLabel(Math.max(0, Math.round((Date.now() - (anchor + c.delayMinutes * 60000)) / 60000))) +
          " · ❤ " + c.likes +
          "</div>" +
          "</div>";
        listEl.appendChild(el);
        if (typeof PanelArtStore !== "undefined") {
          PanelArtStore.loadPanel("friend", c.fanId).then(function (art) {
            var avatar = document.getElementById("cmt-avatar-" + c.id);
            if (!avatar || !art) return;
            var img = document.createElement("img");
            img.src = art.image;
            avatar.innerHTML = "";
            avatar.appendChild(img);
          });
        }
      });
      if (listEl.children.length === 0) {
        listEl.innerHTML = '<div class="muted" style="padding:20px 0;">아직 댓글이 없어요. 조금만 기다려보세요!</div>';
      }
    }

    render();
    setInterval(render, 30000);
    // 친구소개 목록이 다른 기기에서 바뀌면(성격 수정, 친구 추가 등) 실시간으로
    // 반영되도록 - friends-store.js가 원격 변경을 받을 때 이 훅을 불러준다.
    window.__webtoonOnFriendsChanged = render;
  }

  return { mount: mount };
})();
