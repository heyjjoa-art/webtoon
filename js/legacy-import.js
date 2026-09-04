// 계정 시스템이 생기기 전, 전역 경로에 있던 예전 콘텐츠(웹툰·그림·글·친구·소개글)를
// 지금 로그인한 계정 밑으로 문서 단위 복사한다. about.html 설정 영역의 버튼에서만
// 실행된다. 실패한 문서가 있어도 나머지는 계속 진행하고, 끝나면 각 스토어의
// bootstrap을 다시 돌려서 화면에 반영한다.
var LegacyImport = (function () {
  var COLLECTIONS = ["seriesList", "episodes", "artPosts", "boardPosts"];
  var SINGLE_DOCS = [
    { from: "about/meta", to: "meta/about" },
    { from: "about/friends", to: "meta/friends" },
    { from: "artMeta/categories", to: "meta/artCategories" },
    { from: "boardMeta/categories", to: "meta/boardCategories" }
  ];

  function firestore() {
    return firebase.firestore();
  }

  function copyCollection(name, onProgress) {
    return Cloud.getCollectionOnce(name).then(function (docs) {
      var ids = Object.keys(docs || {});
      var i = 0;
      function next() {
        if (i >= ids.length) return Promise.resolve();
        var id = ids[i++];
        onProgress(name + " (" + i + "/" + ids.length + ")");
        return Cloud.writeDoc(Session.path(name + "/" + id), docs[id]).then(next);
      }
      return next();
    });
  }

  function copyPanelArt(onProgress) {
    return Cloud.getCollectionOnce("panelArt").then(function (docs) {
      var ids = Object.keys(docs || {});
      var i = 0;
      function next() {
        if (i >= ids.length) return Promise.resolve();
        var id = ids[i++];
        onProgress("panelArt (" + i + "/" + ids.length + ")");
        return Cloud.writeDoc(Session.path("panelArt/" + id), docs[id])
          .then(function () {
            return Cloud.getCollectionOnce("panelArt/" + id + "/layers");
          })
          .then(function (layers) {
            var layerIds = Object.keys(layers || {});
            return Promise.all(
              layerIds.map(function (layerId) {
                return Cloud.writeDoc(Session.path("panelArt/" + id + "/layers/" + layerId), layers[layerId]);
              })
            );
          })
          .then(next);
      }
      return next();
    });
  }

  function copySingleDocs(onProgress) {
    var i = 0;
    function next() {
      if (i >= SINGLE_DOCS.length) return Promise.resolve();
      var pair = SINGLE_DOCS[i++];
      onProgress(pair.from);
      return Cloud.getDocOnce(pair.from).then(function (doc) {
        if (!doc) return next();
        return Cloud.writeDoc(Session.path(pair.to), doc).then(next);
      });
    }
    return next();
  }

  function markImported() {
    return firestore()
      .doc(Session.path("meta/profile"))
      .set({ importedAt: Date.now() }, { merge: true });
  }

  function run() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;

    var overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML =
      '<div class="card modal-box">' +
      "<h2>📦 기존 낙서장 내용 가져오기</h2>" +
      '<div style="color:var(--color-text-faint);font-size:13px;margin-bottom:14px;">' +
      "계정이 생기기 전에 만들어둔 웹툰·그림·글·친구·소개글을 지금 이 계정으로 복사해요. " +
      "이미 이 계정에 있는 콘텐츠와 id가 겹치면 덮어써요." +
      "</div>" +
      '<div id="legacyImportBody">' +
      '<button class="btn btn-primary" id="legacyImportGo" style="width:100%">가져오기 시작</button> ' +
      '<button class="btn btn-ghost" id="legacyImportCancel" style="width:100%;margin-top:8px;">취소</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    overlay.querySelector("#legacyImportCancel").addEventListener("click", function () {
      overlay.remove();
    });

    overlay.querySelector("#legacyImportGo").addEventListener("click", function () {
      var body = overlay.querySelector("#legacyImportBody");
      body.innerHTML = '<div id="legacyImportStatus" class="muted" style="font-size:13px;">시작하는 중...</div>';
      var statusEl = overlay.querySelector("#legacyImportStatus");
      function onProgress(label) {
        statusEl.textContent = label + " 가져오는 중...";
      }

      Promise.all(
        COLLECTIONS.map(function (name) {
          return copyCollection(name, onProgress);
        })
      )
        .then(function () {
          return copyPanelArt(onProgress);
        })
        .then(function () {
          return copySingleDocs(onProgress);
        })
        .then(function () {
          return markImported();
        })
        .then(function () {
          statusEl.textContent = "✅ 다 가져왔어요! 새로고침하면 반영돼요.";
          body.innerHTML +=
            '<button class="btn btn-primary" id="legacyImportDone" style="width:100%;margin-top:10px;">새로고침</button>';
          overlay.querySelector("#legacyImportDone").addEventListener("click", function () {
            location.reload();
          });
        })
        .catch(function (err) {
          console.warn("[LegacyImport] 실패", err);
          statusEl.textContent = "⚠️ 가져오다 문제가 생겼어요. 다시 시도해주세요.";
        });
    });
  }

  return { run: run };
})();
