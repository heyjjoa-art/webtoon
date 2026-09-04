(function () {
  "use strict";

  var activeCategory = null;

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return d.getMonth() + 1 + "." + d.getDate();
  }

  function renderTabs() {
    CategoryUI.renderTabs(document.getElementById("categoryTabs"), BoardStore.getCategories(), activeCategory, function (id) {
      activeCategory = id;
      renderTabs();
      renderList();
    }, {
      isAdmin: Session.isLoggedIn(),
      getCategories: BoardStore.getCategories,
      saveCategories: BoardStore.saveCategories,
      onManaged: function () {
        renderTabs();
        renderList();
      }
    });
  }

  function renderList() {
    var posts = BoardStore.listPosts().filter(function (p) {
      return !activeCategory || p.category === activeCategory;
    });
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
    Session.requireLogin(function () {
      location.href = "board-write.html" + (activeCategory ? "?category=" + encodeURIComponent(activeCategory) : "");
    });
  });

  window.__webtoonOnBoardChanged = renderList;
  window.__webtoonOnBoardCategoriesChanged = renderTabs;
  Session.onChange(function () {
    renderTabs();
    renderList();
  });
})();
