// 웹툰 "시리즈" 여러 개를 관리한다(예전엔 series/meta 문서 하나뿐이었는데, 이제
// 여러 작품을 동시에 연재할 수 있어야 해서 컬렉션으로 바꿨다). 회차 하나하나는
// episode-store.js가 관리하고, 각 회차 문서는 seriesId로 자기가 속한 시리즈를
// 가리킨다 - 플랫 컬렉션 + 클라이언트 필터링은 이 앱 전체가 쓰는 방식과 같다.
var SeriesStore = (function () {
  var LIST_KEY = "webtoonSeriesList";
  var COLLECTION = "seriesList";
  var RECENT_LOCAL_ONLY_MS = 5 * 60 * 1000;

  function loadAll() {
    var raw = localStorage.getItem(LIST_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(map) {
    localStorage.setItem(LIST_KEY, JSON.stringify(map));
  }

  function slugify(text) {
    return (
      String(text || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, "-")
        .replace(/(^-+|-+$)/g, "") || "toon"
    );
  }

  function genId(title) {
    var base = "series-" + slugify(title);
    var all = loadAll();
    var id = base;
    var n = 2;
    while (all[id]) {
      id = base + "-" + n;
      n++;
    }
    return id;
  }

  function blankSeries(title) {
    var t = title || "제목 없는 웹툰";
    return {
      id: genId(t),
      title: t,
      tagline: "",
      status: "ongoing", // "ongoing" | "paused" | "ended"
      scheduleDays: [2, 5],
      scheduleHour: 19,
      coverEpisodeId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function getSeries(id) {
    return loadAll()[id] || null;
  }

  function saveSeries(series) {
    var all = loadAll();
    var merged = Object.assign({}, all[series.id] || {}, series, { updatedAt: Date.now() });
    if (!merged.createdAt) merged.createdAt = merged.updatedAt;
    all[series.id] = merged;
    saveAll(all);
    syncToCloud(series.id, merged);
    if (window.__webtoonOnSeriesListChanged) window.__webtoonOnSeriesListChanged();
    return merged;
  }

  function deleteSeries(id) {
    // 회차 정리(episode-store.js)를 먼저 해야 한다 - 시리즈를 먼저 지우면
    // "이 시리즈에 속한 회차 목록"을 다시 찾을 방법이 없어서 회차가 고아로
    // 남는다(예전에 회차 삭제 때 컷 그림이 고아로 남던 것과 같은 실수).
    if (typeof EpisodeStore !== "undefined") EpisodeStore.deleteEpisodesForSeries(id);
    var all = loadAll();
    delete all[id];
    saveAll(all);
    Cloud.deleteDoc(COLLECTION + "/" + id);
    if (window.__webtoonOnSeriesListChanged) window.__webtoonOnSeriesListChanged();
  }

  var STATUS_ORDER = { ongoing: 0, paused: 1, ended: 2 };

  function listSeries() {
    var all = loadAll();
    return Object.keys(all)
      .map(function (id) {
        var s = all[id];
        return s.id ? s : Object.assign({}, s, { id: id });
      })
      .sort(function (a, b) {
        var oa = STATUS_ORDER[a.status] != null ? STATUS_ORDER[a.status] : 1;
        var ob = STATUS_ORDER[b.status] != null ? STATUS_ORDER[b.status] : 1;
        if (oa !== ob) return oa - ob;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }

  function syncToCloud(id, series) {
    if (!Cloud.enabled) return Promise.resolve();
    return Cloud.writeDoc(COLLECTION + "/" + id, series);
  }

  function applyCloud(remoteDocs) {
    saveAll(remoteDocs || {});
    if (window.__webtoonOnSeriesListChanged) window.__webtoonOnSeriesListChanged();
  }

  function mergeCloudSnapshot(remoteDocs) {
    var local = loadAll();
    var merged = Object.assign({}, remoteDocs);
    Object.keys(local).forEach(function (id) {
      var remote = remoteDocs[id];
      var localItem = local[id];
      if (remote && (localItem.updatedAt || 0) > (remote.updatedAt || 0)) {
        merged[id] = localItem;
      } else if (!remote && Date.now() - (localItem.updatedAt || 0) < RECENT_LOCAL_ONLY_MS) {
        merged[id] = localItem;
        syncToCloud(id, localItem);
      }
    });
    saveAll(merged);
    if (window.__webtoonOnSeriesListChanged) window.__webtoonOnSeriesListChanged();
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
    blankSeries: blankSeries,
    getSeries: getSeries,
    saveSeries: saveSeries,
    deleteSeries: deleteSeries,
    listSeries: listSeries
  };
})();
