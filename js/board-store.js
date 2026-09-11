// 글 게시판 글(제목+본문 텍스트). 그림이 없어서 episode-store.js/art-store.js보다도
// 더 단순하다 - 문서 하나가 거의 항상 900KB를 넘길 일이 없으니 이미지 압축 같은
// 것도 필요 없다.
//
// 모든 데이터는 로그인한 계정 것만 본다(Session.lsKey/Session.path) - 로그아웃
// 상태에서는 읽으면 빈 목록, 써도 조용히 무시된다.
var BoardStore = (function () {
  var COLLECTION = "boardPosts";
  var RECENT_LOCAL_ONLY_MS = 5 * 60 * 1000;

  function loadAll() {
    var key = Session.lsKey("webtoonBoardPosts");
    if (!key) return {};
    var raw = localStorage.getItem(key);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(map) {
    var key = Session.lsKey("webtoonBoardPosts");
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(map));
  }

  function genId() {
    return "post-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blankPost() {
    return {
      id: genId(),
      title: "",
      body: "",
      category: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function getPost(id) {
    return loadAll()[id] || null;
  }

  function savePost(post) {
    if (!Session.isLoggedIn()) return post;
    var all = loadAll();
    var merged = Object.assign({}, all[post.id] || {}, post, { updatedAt: Date.now() });
    if (!merged.createdAt) merged.createdAt = merged.updatedAt;
    all[post.id] = merged;
    saveAll(all);
    syncToCloud(post.id, merged);
    if (window.__webtoonOnBoardChanged) window.__webtoonOnBoardChanged();
    return merged;
  }

  // 삭제 후 다른 화면(board.html)으로 곧장 이동하는 호출부가 있어서, 클라우드 삭제가
  // 끝나기 전에 이동해버리면 그 화면의 bootstrap()이 "아직 안 지워진" 원격 문서를
  // 다시 읽어와 로컬에 되살려놓는 경합이 생긴다. 그래서 클라우드 삭제가 끝날 때까지
  // 기다릴 수 있도록 Promise를 돌려준다.
  function deletePost(id) {
    if (!Session.isLoggedIn()) return Promise.resolve();
    var all = loadAll();
    delete all[id];
    saveAll(all);
    if (window.__webtoonOnBoardChanged) window.__webtoonOnBoardChanged();
    return Cloud.deleteDoc(Session.path(COLLECTION + "/" + id));
  }

  function listPosts() {
    var all = loadAll();
    return Object.keys(all)
      .map(function (id) {
        var p = all[id];
        return p.id ? p : Object.assign({}, p, { id: id });
      })
      .sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  function syncToCloud(id, post) {
    if (!Cloud.enabled) return Promise.resolve();
    return Cloud.writeDoc(Session.path(COLLECTION + "/" + id), post);
  }

  function applyCloud(remoteDocs) {
    saveAll(remoteDocs || {});
    if (window.__webtoonOnBoardChanged) window.__webtoonOnBoardChanged();
  }

  function mergeCloudSnapshot(remoteDocs) {
    var local = loadAll();
    var merged = Object.assign({}, remoteDocs);
    Object.keys(local).forEach(function (id) {
      var remote = remoteDocs[id];
      var localPost = local[id];
      if (remote && (localPost.updatedAt || 0) > (remote.updatedAt || 0)) {
        merged[id] = localPost;
      } else if (!remote && Date.now() - (localPost.updatedAt || 0) < RECENT_LOCAL_ONLY_MS) {
        merged[id] = localPost;
        syncToCloud(id, localPost);
      }
    });
    saveAll(merged);
    if (window.__webtoonOnBoardChanged) window.__webtoonOnBoardChanged();
  }

  function bootstrap() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;
    Cloud.getCollectionOnce(Session.path(COLLECTION)).then(function (remoteDocs) {
      if (remoteDocs && Object.keys(remoteDocs).length > 0) {
        mergeCloudSnapshot(remoteDocs);
      } else {
        var local = loadAll();
        Object.keys(local).forEach(function (id) {
          syncToCloud(id, local[id]);
        });
      }
      Cloud.watchCollection(Session.path(COLLECTION), applyCloud);
    });
  }

  // ── 탭(카테고리) — 최대 5개, "일기"/"나의생각"처럼 글을 나눠 담는 용도 ──
  var CATS_DOC = "meta/boardCategories";

  function getCategories() {
    var key = Session.lsKey("webtoonBoardCategories");
    if (!key) return [];
    var raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCategories(list) {
    var key = Session.lsKey("webtoonBoardCategories");
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(list));
    Cloud.writeDoc(Session.path(CATS_DOC), { list: list, updatedAt: Date.now() });
    if (window.__webtoonOnBoardCategoriesChanged) window.__webtoonOnBoardCategoriesChanged();
  }

  function bootstrapCategories() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;
    Cloud.getDocOnce(Session.path(CATS_DOC)).then(function (remote) {
      var local = getCategories();
      if (remote && remote.list) {
        localStorage.setItem(Session.lsKey("webtoonBoardCategories"), JSON.stringify(remote.list));
        if (window.__webtoonOnBoardCategoriesChanged) window.__webtoonOnBoardCategoriesChanged();
      } else if (local.length) {
        Cloud.writeDoc(Session.path(CATS_DOC), { list: local, updatedAt: Date.now() });
      }
      Cloud.watchDoc(Session.path(CATS_DOC), function (remoteDoc) {
        if (!remoteDoc) return;
        var key = Session.lsKey("webtoonBoardCategories");
        if (!key) return;
        localStorage.setItem(key, JSON.stringify(remoteDoc.list || []));
        if (window.__webtoonOnBoardCategoriesChanged) window.__webtoonOnBoardCategoriesChanged();
      });
    });
  }

  Session.register({
    bootstrap: function () {
      bootstrap();
      bootstrapCategories();
    }
  });

  return {
    blankPost: blankPost,
    getPost: getPost,
    savePost: savePost,
    deletePost: deletePost,
    listPosts: listPosts,
    getCategories: getCategories,
    saveCategories: saveCategories
  };
})();
