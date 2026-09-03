// 그림 게시판 글(그림 한 장 + 제목/한마디) 메타데이터. 그림 자체는 무거워서
// PanelArtStore(IndexedDB 캐시 + Firestore, 컷 하나당 문서 하나)를 그대로
// 재사용한다 - 그림 게시판 글 하나를 "패널 1개짜리 회차"처럼 취급해서
// PanelArtStore.loadPanel(post.id, "main") / savePanel(post.id, "main", ...) 로
// 부른다. 회차 예약 발행 같은 건 필요 없어서 episode-store.js보다 훨씬 단순하다.
var ArtStore = (function () {
  var POSTS_KEY = "webtoonArtPosts";
  var COLLECTION = "artPosts";
  var RECENT_LOCAL_ONLY_MS = 5 * 60 * 1000;
  var CANVAS_W = 1000;
  var CANVAS_H = 1000;

  function loadAll() {
    var raw = localStorage.getItem(POSTS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(map) {
    localStorage.setItem(POSTS_KEY, JSON.stringify(map));
  }

  function genId() {
    return "art-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blankPost(title) {
    return {
      id: genId(),
      title: title || "제목 없음",
      caption: "",
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
    var all = loadAll();
    var merged = Object.assign({}, all[post.id] || {}, post, { updatedAt: Date.now() });
    all[post.id] = merged;
    saveAll(all);
    syncToCloud(post.id, merged);
    if (window.__webtoonOnArtChanged) window.__webtoonOnArtChanged();
    return merged;
  }

  function deletePost(id) {
    var all = loadAll();
    delete all[id];
    saveAll(all);
    Cloud.deleteDoc(COLLECTION + "/" + id);
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
    return Cloud.writeDoc(COLLECTION + "/" + id, post);
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
    if (!Cloud.enabled) return;
    Cloud.getCollectionOnce(COLLECTION).then(function (remoteDocs) {
      if (remoteDocs && Object.keys(remoteDocs).length > 0) {
        mergeCloudSnapshot(remoteDocs);
      } else {
        var local = loadAll();
        Object.keys(local).forEach(function (id) {
          syncToCloud(id, local[id]);
        });
      }
      Cloud.watchCollection(COLLECTION, applyCloud);
    });
  }

  bootstrap();

  return {
    blankPost: blankPost,
    getPost: getPost,
    savePost: savePost,
    deletePost: deletePost,
    listPosts: listPosts,
    CANVAS_W: CANVAS_W,
    CANVAS_H: CANVAS_H
  };
})();
