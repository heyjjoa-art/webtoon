(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var postId = params.get("id");
  var post = null;
  var root = document.getElementById("postRoot");

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
    var found = ArtStore.getCategories().filter(function (c) {
      return c.id === id;
    })[0];
    return found ? found.name : null;
  }

  function render() {
    document.title = (post.title || "그림") + " - 낙서장";
    var isAdmin = Session.isLoggedIn();
    var catName = categoryName(post.category);
    root.innerHTML =
      '<div class="art-post-image" id="artImageWrap"><div class="center-empty">불러오는 중...</div></div>' +
      '<h1 class="post-title">' +
      escapeHtml(post.title || "제목 없음") +
      "</h1>" +
      '<div class="post-meta">' +
      (catName ? escapeHtml(catName) + " · " : "") +
      formatDate(post.createdAt) +
      "</div>" +
      (post.caption
        ? '<div class="post-body">' + escapeHtml(post.caption) + "</div>"
        : isAdmin
        ? '<div class="muted">한마디를 남겨보세요.</div>'
        : "") +
      (isAdmin
        ? '<div class="post-actions">' +
          '<button class="btn btn-ghost btn-sm" id="editCaptionBtn">💬 한마디 수정</button>' +
          '<button class="btn btn-ghost btn-sm" id="redrawBtn">✏️ 다시 그리기</button>' +
          '<button class="btn btn-danger btn-sm" id="deleteBtn">삭제</button>' +
          "</div>"
        : "");

    PanelArtStore.loadPanel(post.id, "main").then(function (art) {
      var wrap = document.getElementById("artImageWrap");
      if (!wrap) return;
      if (!art) {
        wrap.innerHTML = '<div class="center-empty">아직 그림이 없어요.</div>';
        return;
      }
      wrap.innerHTML = '<img src="' + art.image + '" alt="' + escapeHtml(post.title || "") + '">';
    });

    if (isAdmin) {
      document.getElementById("redrawBtn").addEventListener("click", function () {
        location.href = "paint.html?art=" + encodeURIComponent(post.id);
      });
      document.getElementById("deleteBtn").addEventListener("click", function () {
        if (confirm('"' + (post.title || "이 그림") + '"을(를) 삭제할까요? 되돌릴 수 없어요.')) {
          var btn = this;
          btn.disabled = true;
          ArtStore.deletePost(post.id).then(function () {
            location.href = "art.html";
          });
        }
      });
      document.getElementById("editCaptionBtn").addEventListener("click", function () {
        var next = window.prompt("한마디를 입력하세요", post.caption || "");
        if (next === null) return;
        post = ArtStore.savePost(Object.assign({}, post, { caption: next.trim() }));
        render();
      });
    }
  }

  Session.ready.then(function () {
    post = postId ? ArtStore.getPost(postId) : null;
    if (!post) {
      root.innerHTML = '<div class="center-empty">그림을 찾을 수 없어요.</div>';
      return;
    }
    render();
    CommentsWidget.mount(post, "art");
  });
})();
