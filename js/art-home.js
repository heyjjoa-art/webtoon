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
    CategoryUI.renderTabs(document.getElementById("categoryTabs"), ArtStore.getCategories(), activeCategory, function (id) {
      activeCategory = id;
      renderTabs();
      renderGrid();
    }, {
      isAdmin: Session.isLoggedIn(),
      getCategories: ArtStore.getCategories,
      saveCategories: ArtStore.saveCategories,
      onManaged: function () {
        renderTabs();
        renderGrid();
      }
    });
  }

  function renderGrid() {
    var posts = ArtStore.listPosts().filter(function (p) {
      return !activeCategory || p.category === activeCategory;
    });
    var grid = document.getElementById("artGrid");
    if (!posts.length) {
      grid.innerHTML = '<div class="center-empty" style="grid-column:1/-1;">아직 올라온 그림이 없어요. 첫 그림을 그려보세요 🖌️</div>';
      return;
    }
    grid.innerHTML = "";
    posts.forEach(function (post) {
      var card = document.createElement("div");
      card.className = "art-card";
      card.innerHTML =
        '<div class="art-thumb" id="art-thumb-' +
        post.id +
        '">🖼️</div>' +
        '<div class="art-title">' +
        escapeHtml(post.title || "제목 없음") +
        "</div>" +
        '<div class="art-date">' +
        formatDate(post.createdAt) +
        "</div>";
      card.addEventListener("click", function () {
        location.href = "art-post.html?id=" + encodeURIComponent(post.id);
      });
      grid.appendChild(card);
      PanelArtStore.loadPanel(post.id, "main").then(function (art) {
        if (!art) return;
        var thumbEl = document.getElementById("art-thumb-" + post.id);
        if (!thumbEl) return;
        var img = document.createElement("img");
        img.src = art.image;
        thumbEl.innerHTML = "";
        thumbEl.appendChild(img);
      });
    });
  }

  // 관리자 로그인 상태에서만 진짜로 새 글을 만든다 - 아직 로그인 전이면 PIN부터
  // 물어보고, 통과하면 이어서 진행한다.
  function startNewArt() {
    Session.requireLogin(function () {
      askTitle(function (title, category) {
        var post = ArtStore.savePost(Object.assign(ArtStore.blankPost(title), { category: category }));
        location.href = "paint.html?art=" + encodeURIComponent(post.id);
      });
    });
  }

  function askTitle(onDone) {
    var overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML =
      '<div class="card modal-box">' +
      "<h2>🎨 새 그림</h2>" +
      '<div class="field"><label>제목</label><input type="text" id="artTitleInput" placeholder="그림 제목" autofocus></div>' +
      '<div class="field"><label>탭</label><select id="artCategorySelect">' +
      CategoryUI.optionsHtml(ArtStore.getCategories(), activeCategory) +
      "</select></div>" +
      '<button class="btn btn-primary" id="artTitleGo" style="width:100%">그리기 시작</button>' +
      "</div>";
    document.body.appendChild(overlay);
    var input = overlay.querySelector("#artTitleInput");
    function submit() {
      var title = input.value.trim() || "제목 없음";
      var category = overlay.querySelector("#artCategorySelect").value || null;
      overlay.remove();
      onDone(title, category);
    }
    overlay.querySelector("#artTitleGo").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
    input.focus();
  }

  document.getElementById("newArtBtn").addEventListener("click", startNewArt);
  window.__webtoonOnArtChanged = renderGrid;
  window.__webtoonOnArtCategoriesChanged = renderTabs;
  Session.onChange(function () {
    renderTabs();
    renderGrid();
  });
})();
