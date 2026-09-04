(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var editId = params.get("id");
  var presetCategory = params.get("category");

  Session.requireLogin(function () {
    var titleInput = document.getElementById("titleInput");
    var bodyInput = document.getElementById("bodyInput");
    var categorySelect = document.getElementById("categorySelect");
    var saveBtn = document.getElementById("saveBtn");
    var status = document.getElementById("saveStatus");

    var editing = editId ? BoardStore.getPost(editId) : null;
    categorySelect.innerHTML = CategoryUI.optionsHtml(BoardStore.getCategories(), editing ? editing.category : presetCategory);

    if (editing) {
      titleInput.value = editing.title || "";
      bodyInput.value = editing.body || "";
      document.title = "글 수정 - 낙서장";
      saveBtn.textContent = "수정 저장";
    }

    saveBtn.addEventListener("click", function () {
      var title = titleInput.value.trim();
      var body = bodyInput.value.trim();
      if (!title || !body) {
        status.style.color = "var(--color-danger)";
        status.textContent = "⚠️ 제목과 내용을 모두 입력해주세요.";
        return;
      }
      var category = categorySelect.value || null;
      var payload = editing
        ? Object.assign({}, editing, { title: title, body: body, category: category })
        : Object.assign(BoardStore.blankPost(), { title: title, body: body, category: category });
      var saved = BoardStore.savePost(payload);
      status.style.color = "";
      status.textContent = "✅ 저장했어요!";
      location.href = "board-post.html?id=" + encodeURIComponent(saved.id);
    });
  });
})();
