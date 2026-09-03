// 회차 메타데이터(그림은 절대 포함하지 않음 - panel-art-store.js가 담당)를
// localStorage에 우선 저장하고 Firestore와 맞춘다. journeys 앱에서 검증된 "로컬
// 우선 쓰기 → 클라우드 동기화, bootstrap 때는 덮어쓰기가 아니라 병합" 패턴을
// 그대로 따른다: 이 기기가 방금 쓴 변경의 echo(hasPendingWrites)는 건너뛰고, 로컬이
// 더 최신이면 로컬을 살리고, 로컬에만 있는 최근 문서는 다시 밀어올린다.
//
// 시리즈 여러 개를 다루므로(series-store.js) 회차마다 seriesId를 갖고, 컬렉션은
// 여전히 하나(flat)로 두고 클라이언트에서 seriesId로 걸러본다 - 이 앱 전체가
// 쓰는 방식과 같다. 회차 id/번호(no)는 시리즈 단위로 매겨진다.
var EpisodeStore = (function () {
  var EPISODES_KEY = "webtoonEpisodes";
  var EPISODES_COLLECTION = "episodes";
  var RECENT_LOCAL_ONLY_MS = 5 * 60 * 1000;

  function loadAll() {
    var raw = localStorage.getItem(EPISODES_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(map) {
    localStorage.setItem(EPISODES_KEY, JSON.stringify(map));
  }

  function nextNo(seriesId) {
    var all = loadAll();
    var max = 0;
    Object.keys(all).forEach(function (id) {
      var ep = all[id];
      if (ep.seriesId !== seriesId) return;
      var n = Number(ep.no) || 0;
      if (n > max) max = n;
    });
    return max + 1;
  }

  function makeId(seriesId, no) {
    var all = loadAll();
    var base = seriesId + "__ep-" + no;
    var id = base;
    var n = 2;
    while (all[id]) {
      id = base + "-" + n;
      n++;
    }
    return id;
  }

  function blankEpisode(seriesId) {
    var no = nextNo(seriesId);
    return {
      id: makeId(seriesId, no),
      seriesId: seriesId,
      no: no,
      title: "",
      summary: "",
      tags: [],
      canvasWidth: 900,
      canvasHeight: 1200,
      panels: [],
      texts: [],
      status: "draft",
      publishAt: null,
      publishedAt: null,
      updatedAt: Date.now()
    };
  }

  function getEpisode(id) {
    return loadAll()[id] || null;
  }

  function saveEpisode(ep) {
    var all = loadAll();
    var merged = Object.assign({}, all[ep.id] || {}, ep, { updatedAt: Date.now() });
    all[ep.id] = merged;
    saveAll(all);
    merged.cloudSyncPromise = syncEpisodeToCloud(ep.id, merged);
    if (window.__webtoonOnEpisodesChanged) window.__webtoonOnEpisodesChanged();
    return merged;
  }

  function deleteEpisode(id) {
    // 컷 그림 정리(PanelArtStore.deleteAllForEpisode)는 이 회차의 panels 목록을
    // 다시 읽어야 해서, 로컬에서 회차를 지우기 전에 먼저 해야 한다 - 순서를
    // 바꾸면 이미 지워진 회차를 찾지 못해 그림이 고아로 남는다.
    if (typeof PanelArtStore !== "undefined") PanelArtStore.deleteAllForEpisode(id);
    var all = loadAll();
    delete all[id];
    saveAll(all);
    Cloud.deleteDoc(EPISODES_COLLECTION + "/" + id);
    if (window.__webtoonOnEpisodesChanged) window.__webtoonOnEpisodesChanged();
  }

  // 시리즈 자체를 지울 때(series-store.js) 그 안의 회차를 전부 정리한다. 마찬가지
  // 이유로, series-store.js가 시리즈 문서를 지우기 전에 이걸 먼저 불러야 한다.
  function deleteEpisodesForSeries(seriesId) {
    listEpisodes(seriesId).forEach(function (ep) {
      deleteEpisode(ep.id);
    });
  }

  // seriesId를 안 넘기면 전체 회차를(주로 없음), 넘기면 그 시리즈 것만 최신 화
  // 순으로 돌려준다.
  function listEpisodes(seriesId) {
    var all = loadAll();
    return Object.keys(all)
      .map(function (id) {
        var ep = all[id];
        if (!ep.id) ep = Object.assign({}, ep, { id: id });
        return ep;
      })
      .filter(function (ep) {
        return seriesId == null || ep.seriesId === seriesId;
      })
      .sort(function (a, b) {
        return (b.no || 0) - (a.no || 0);
      });
  }

  // 예약 발행 시각이 지나면 관리자가 다시 버튼을 안 눌러도 자동으로 공개된 것으로
  // 친다. status 필드 자체는 "scheduled"로 남겨두고(작가의 원래 의도를 보존),
  // 화면에서는 항상 이 함수로 실제 공개 여부를 판단한다 - 여러 탭/기기가 동시에
  // status를 "published"로 고쳐쓰다 충돌하는 경쟁을 아예 만들지 않기 위해서다.
  function isVisible(ep) {
    if (!ep) return false;
    if (ep.status === "published") return true;
    if (ep.status === "scheduled" && ep.publishAt && Date.now() >= ep.publishAt) return true;
    return false;
  }

  function publishNow(id) {
    var ep = getEpisode(id);
    if (!ep) return null;
    return saveEpisode(
      Object.assign({}, ep, { status: "published", publishAt: null, publishedAt: Date.now() })
    );
  }

  function schedule(id, whenMs) {
    var ep = getEpisode(id);
    if (!ep) return null;
    return saveEpisode(Object.assign({}, ep, { status: "scheduled", publishAt: whenMs }));
  }

  function unpublish(id) {
    var ep = getEpisode(id);
    if (!ep) return null;
    return saveEpisode(Object.assign({}, ep, { status: "draft", publishAt: null }));
  }

  function syncEpisodeToCloud(id, ep) {
    if (!Cloud.enabled) return Promise.resolve();
    var payload = Object.assign({}, ep);
    delete payload.cloudSyncPromise;
    return Cloud.writeDoc(EPISODES_COLLECTION + "/" + id, payload);
  }

  function applyCloudEpisodes(remoteDocs) {
    saveAll(remoteDocs || {});
    if (window.__webtoonOnEpisodesChanged) window.__webtoonOnEpisodesChanged();
  }

  function mergeCloudSnapshotIntoLocal(remoteDocs) {
    var local = loadAll();
    var merged = Object.assign({}, remoteDocs);
    Object.keys(local).forEach(function (id) {
      var remote = remoteDocs[id];
      var localEp = local[id];
      if (remote && (localEp.updatedAt || 0) > (remote.updatedAt || 0)) {
        merged[id] = localEp;
      } else if (!remote && Date.now() - (localEp.updatedAt || 0) < RECENT_LOCAL_ONLY_MS) {
        merged[id] = localEp;
        syncEpisodeToCloud(id, localEp);
      }
    });
    saveAll(merged);
    if (window.__webtoonOnEpisodesChanged) window.__webtoonOnEpisodesChanged();
  }

  function bootstrapEpisodeSync() {
    if (!Cloud.enabled) return;
    Cloud.getCollectionOnce(EPISODES_COLLECTION).then(function (remoteDocs) {
      if (remoteDocs && Object.keys(remoteDocs).length > 0) {
        mergeCloudSnapshotIntoLocal(remoteDocs);
      } else {
        var local = loadAll();
        Object.keys(local).forEach(function (id) {
          syncEpisodeToCloud(id, local[id]);
        });
      }
      Cloud.watchCollection(EPISODES_COLLECTION, applyCloudEpisodes);
    });
  }

  bootstrapEpisodeSync();

  return {
    blankEpisode: blankEpisode,
    getEpisode: getEpisode,
    saveEpisode: saveEpisode,
    deleteEpisode: deleteEpisode,
    deleteEpisodesForSeries: deleteEpisodesForSeries,
    listEpisodes: listEpisodes,
    isVisible: isVisible,
    publishNow: publishNow,
    schedule: schedule,
    unpublish: unpublish
  };
})();
