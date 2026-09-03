(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var postId = params.get("id");
  var post = postId ? BoardStore.getPost(postId) : null;
  var root = document.getElementById("postRoot");

  if (!post) {
    root.innerHTML = '<div class="center-empty">글을 찾을 수 없어요.</div>';
    return;
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate();
  }

  function categoryName(id) {
    if (!id) return null;
    var found = BoardStore.getCategories().filter(function (c) {
      return c.id === id;
    })[0];
    return found ? found.name : null;
  }

  function render() {
    document.title = (post.title || "글") + " - 낙서장";
    var isAdmin = AdminAuth.isActive();
    var catName = categoryName(post.category);
    root.innerHTML =
      '<h1 class="post-title">' +
      escapeHtml(post.title) +
      "</h1>" +
      '<div class="post-meta">' +
      (catName ? escapeHtml(catName) + " · " : "") +
      formatDate(post.createdAt) +
      "</div>" +
      '<div class="post-body">' +
      escapeHtml(post.body) +
      "</div>" +
      (isAdmin
        ? '<div class="post-actions">' +
          '<button class="btn btn-ghost btn-sm" id="editBtn">✏️ 수정</button>' +
          '<button class="btn btn-danger btn-sm" id="deleteBtn">삭제</button>' +
          "</div>"
        : "");

    if (isAdmin) {
      document.getElementById("editBtn").addEventListener("click", function () {
        location.href = "board-write.html?id=" + encodeURIComponent(post.id);
      });
      document.getElementById("deleteBtn").addEventListener("click", function () {
        if (confirm('"' + (post.title || "이 글") + '"을(를) 삭제할까요? 되돌릴 수 없어요.')) {
          BoardStore.deletePost(post.id);
          location.href = "board.html";
        }
      });
    }
  }

  window.__onAdminLogin = render;
  render();
  CommentsWidget.mount(post, "board");
})();
