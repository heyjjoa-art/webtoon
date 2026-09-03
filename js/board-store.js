// 글 게시판 글(제목+본문 텍스트). 그림이 없어서 episode-store.js/art-store.js보다도
// 더 단순하다 - 문서 하나가 거의 항상 900KB를 넘길 일이 없으니 이미지 압축 같은
// 것도 필요 없다.
var BoardStore = (function () {
  var POSTS_KEY = "webtoonBoardPosts";
  var COLLECTION = "boardPosts";
  var RECENT_LOCAL_ONLY_MS = 5 * 60 * 1000;

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
    return "post-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blankPost() {
    return {
      id: genId(),
      title: "",
      body: "",
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
    if (!merged.createdAt) merged.createdAt = merged.updatedAt;
    all[post.id] = merged;
    saveAll(all);
    syncToCloud(post.id, merged);
    if (window.__webtoonOnBoardChanged) window.__webtoonOnBoardChanged();
    return merged;
  }

  function deletePost(id) {
    var all = loadAll();
    delete all[id];
    saveAll(all);
    Cloud.deleteDoc(COLLECTION + "/" + id);
    if (window.__webtoonOnBoardChanged) window.__webtoonOnBoardChanged();
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
    listPosts: listPosts
  };
})();
