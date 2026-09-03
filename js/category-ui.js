// 글 게시판·그림 게시판이 공용으로 쓰는 탭(카테고리) UI. 최대 5개까지 만들 수
// 있고("일기", "나의생각" 처럼), 목록 화면 위에 탭 줄로 필터링한다. 두 게시판이
// 완전히 같은 UI 로직을 쓰므로 하나로 묶었다 - 실제 데이터 저장은 각자
// board-store.js/art-store.js가 (다른 컬렉션 경로로) 따로 한다.
var CategoryUI = (function () {
  var MAX_CATEGORIES = 5;

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function genId() {
    return "cat-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // mountEl 안에 "전체 + 카테고리들 (+ 관리자면 ⚙️ 관리 버튼)" 탭 줄을 그린다.
  // activeId가 null이면 "전체"가 선택된 것으로 표시한다.
  function renderTabs(mountEl, categories, activeId, onPick, opts) {
    opts = opts || {};
    mountEl.className = "category-tabs";
    mountEl.innerHTML =
      '<button class="category-tab' +
      (activeId ? "" : " active") +
      '" data-id="">전체</button>' +
      categories
        .map(function (c) {
          return (
            '<button class="category-tab' +
            (activeId === c.id ? " active" : "") +
            '" data-id="' +
            c.id +
            '">' +
            escapeHtml(c.name) +
            "</button>"
          );
        })
        .join("") +
      (opts.isAdmin ? '<button class="category-tab category-manage-btn" id="categoryManageBtn">⚙️</button>' : "");

    mountEl.querySelectorAll(".category-tab[data-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        onPick(btn.dataset.id || null);
      });
    });
    if (opts.isAdmin) {
      mountEl.querySelector("#categoryManageBtn").addEventListener("click", function () {
        openManager(opts.getCategories, opts.saveCategories, opts.onManaged);
      });
    }
  }

  // 카테고리 추가/이름바꾸기/삭제 모달. 최대 5개까지만 추가할 수 있다.
  function openManager(getCategories, saveCategories, onDone) {
    var list = getCategories().slice();

    var overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML =
      '<div class="card modal-box">' +
      "<h2>🏷️ 탭(카테고리) 관리</h2>" +
      '<div id="catManagerList"></div>' +
      '<div class="field" id="catAddRow"><input type="text" id="catAddInput" placeholder="새 탭 이름 (최대 ' +
      MAX_CATEGORIES +
      '개)"></div>' +
      '<button class="btn btn-primary" id="catAddBtn" style="width:100%;margin-bottom:8px;">+ 탭 추가</button>' +
      '<button class="btn btn-ghost" id="catCloseBtn" style="width:100%;">닫기</button>' +
      "</div>";
    document.body.appendChild(overlay);

    function renderList() {
      var el = overlay.querySelector("#catManagerList");
      el.innerHTML = list
        .map(function (c, idx) {
          return (
            '<div class="cat-manage-row" data-idx="' +
            idx +
            '">' +
            '<input type="text" class="cat-rename-input" value="' +
            escapeHtml(c.name) +
            '">' +
            '<button class="layer-mini-btn" data-act="del">🗑</button>' +
            "</div>"
          );
        })
        .join("");
      el.querySelectorAll(".cat-manage-row").forEach(function (row) {
        var idx = Number(row.dataset.idx);
        row.querySelector(".cat-rename-input").addEventListener("change", function (e) {
          list[idx].name = e.target.value.trim() || list[idx].name;
          saveCategories(list);
        });
        row.querySelector('[data-act="del"]').addEventListener("click", function () {
          list.splice(idx, 1);
          saveCategories(list);
          renderList();
          updateAddRow();
        });
      });
    }

    function updateAddRow() {
      var full = list.length >= MAX_CATEGORIES;
      overlay.querySelector("#catAddRow").hidden = full;
      overlay.querySelector("#catAddBtn").hidden = full;
    }

    overlay.querySelector("#catAddBtn").addEventListener("click", function () {
      var input = overlay.querySelector("#catAddInput");
      var name = input.value.trim();
      if (!name || list.length >= MAX_CATEGORIES) return;
      list.push({ id: genId(), name: name });
      saveCategories(list);
      input.value = "";
      renderList();
      updateAddRow();
    });

    overlay.querySelector("#catCloseBtn").addEventListener("click", function () {
      overlay.remove();
      if (onDone) onDone();
    });

    renderList();
    updateAddRow();
  }

  // 글/그림 작성 폼에서 쓰는 카테고리 선택 <select> 옵션 문자열.
  function optionsHtml(categories, selectedId) {
    return (
      '<option value=""' +
      (!selectedId ? " selected" : "") +
      ">미분류</option>" +
      categories
        .map(function (c) {
          return '<option value="' + c.id + '"' + (selectedId === c.id ? " selected" : "") + ">" + escapeHtml(c.name) + "</option>";
        })
        .join("")
    );
  }

  return {
    MAX_CATEGORIES: MAX_CATEGORIES,
    renderTabs: renderTabs,
    openManager: openManager,
    optionsHtml: optionsHtml
  };
})();
