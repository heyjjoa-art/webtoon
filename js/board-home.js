(function () {
  "use strict";

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return d.getMonth() + 1 + "." + d.getDate();
  }

  function render() {
    var posts = BoardStore.listPosts();
    var listEl = document.getElementById("postList");
    if (!posts.length) {
      listEl.innerHTML = '<div class="center-empty">아직 쓴 글이 없어요. 첫 글을 남겨보세요 ✍️</div>';
      return;
    }
    listEl.innerHTML = posts
      .map(function (p) {
        return (
          '<div class="text-list-item" data-id="' +
          p.id +
          '"><span class="text-list-title">' +
          escapeHtml(p.title || "(제목 없음)") +
          '</span><span class="text-list-date">' +
          formatDate(p.createdAt) +
          "</span></div>"
        );
      })
      .join("");
    listEl.querySelectorAll(".text-list-item").forEach(function (row) {
      row.addEventListener("click", function () {
        location.href = "board-post.html?id=" + encodeURIComponent(row.dataset.id);
      });
    });
  }

  document.getElementById("newPostBtn").addEventListener("click", function () {
    AdminAuth.guard(function () {
      location.href = "board-write.html";
    });
  });

  window.__webtoonOnBoardChanged = render;
  render();
})();
