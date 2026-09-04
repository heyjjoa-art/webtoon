// 그림 게시판 글(그림 한 장 + 제목/한마디) 메타데이터. 그림 자체는 무거워서
// PanelArtStore(IndexedDB 캐시 + Firestore, 컷 하나당 문서 하나)를 그대로
// 재사용한다 - 그림 게시판 글 하나를 "패널 1개짜리 회차"처럼 취급해서
// PanelArtStore.loadPanel(post.id, "main") / savePanel(post.id, "main", ...) 로
// 부른다. 회차 예약 발행 같은 건 필요 없어서 episode-store.js보다 훨씬 단순하다.
//
// 모든 데이터는 로그인한 계정 것만 본다(Session.lsKey/Session.path) - 로그아웃
// 상태에서는 읽으면 빈 목록, 써도 조용히 무시된다.
var ArtStore = (function () {
  var COLLECTION = "artPosts";
  var RECENT_LOCAL_ONLY_MS = 5 * 60 * 1000;
  var CANVAS_W = 1000;
  var CANVAS_H = 1000;

  function loadAll() {
    var key = Session.lsKey("webtoonArtPosts");
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
    var key = Session.lsKey("webtoonArtPosts");
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(map));
  }

  function genId() {
    return "art-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blankPost(title) {
    return {
      id: genId(),
      title: title || "제목 없음",
      caption: "",
      category: null,
      canvasWidth: CANVAS_W,
      canvasHeight: CANVAS_H,
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
    all[post.id] = merged;
    saveAll(all);
    syncToCloud(post.id, merged);
    if (window.__webtoonOnArtChanged) window.__webtoonOnArtChanged();
    return merged;
  }

  function deletePost(id) {
    if (!Session.isLoggedIn()) return;
    var all = loadAll();
    delete all[id];
    saveAll(all);
    Cloud.deleteDoc(Session.path(COLLECTION + "/" + id));
    if (typeof PanelArtStore !== "undefined") PanelArtStore.deletePanel(id, "main");
    if (window.__webtoonOnArtChanged) window.__webtoonOnArtChanged();
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
    if (window.__webtoonOnArtChanged) window.__webtoonOnArtChanged();
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
    if (window.__webtoonOnArtChanged) window.__webtoonOnArtChanged();
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

  // ── 탭(카테고리) — 최대 5개, board-store.js와 같은 방식(별도 경로) ──
  var CATS_DOC = "meta/artCategories";

  function getCategories() {
    var key = Session.lsKey("webtoonArtCategories");
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
    var key = Session.lsKey("webtoonArtCategories");
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(list));
    Cloud.writeDoc(Session.path(CATS_DOC), { list: list, updatedAt: Date.now() });
    if (window.__webtoonOnArtCategoriesChanged) window.__webtoonOnArtCategoriesChanged();
  }

  function bootstrapCategories() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;
    Cloud.getDocOnce(Session.path(CATS_DOC)).then(function (remote) {
      var local = getCategories();
      if (remote && remote.list) {
        localStorage.setItem(Session.lsKey("webtoonArtCategories"), JSON.stringify(remote.list));
        if (window.__webtoonOnArtCategoriesChanged) window.__webtoonOnArtCategoriesChanged();
      } else if (local.length) {
        Cloud.writeDoc(Session.path(CATS_DOC), { list: local, updatedAt: Date.now() });
      }
      Cloud.watchDoc(Session.path(CATS_DOC), function (remoteDoc) {
        if (!remoteDoc) return;
        var key = Session.lsKey("webtoonArtCategories");
        if (!key) return;
        localStorage.setItem(key, JSON.stringify(remoteDoc.list || []));
        if (window.__webtoonOnArtCategoriesChanged) window.__webtoonOnArtCategoriesChanged();
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
    saveCategories: saveCategories,
    CANVAS_W: CANVAS_W,
    CANVAS_H: CANVAS_H
  };
})();
