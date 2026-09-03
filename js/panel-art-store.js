// 컷(패널) 하나의 그림을 저장·로드한다. episode-store.js와 달리 그림은 무겁기
// 때문에 localStorage(5MB 한도라 사진 몇 장이면 바로 꽉 참)가 아니라 IndexedDB에
// 캐시하고, Firestore를 여러 기기 사이의 원본으로 삼는다.
//
// 문서 두 종류가 있다:
//  - panelArt/{key}            : 합쳐진 최종 그림(합본). 독자가 받는 것 - 항상 이것만.
//  - panelArt/{key}/layers/*   : 레이어 원본. 다른 기기에서 이어 그릴 때만 필요하고
//                                 뷰어는 절대 읽지 않는다.
// Firebase Storage(유료 Blaze 필요)를 안 쓰므로 문서 하나가 900KB를 넘지 않도록
// 화질을 단계적으로 낮춰가며 압축한다(journeys 앱의 fitUnitForCloud 패턴과 동일).
var PanelArtStore = (function () {
  var COLLECTION = "panelArt";
  var CLOUD_SIZE_LIMIT = 900000;
  var DB_NAME = "webtoonArtCache";
  var DB_VERSION = 1;

  function key(episodeId, panelId) {
    return episodeId + "__" + panelId;
  }

  // ── IndexedDB: 그림을 이 기기에 캐시해서 매번 클라우드를 안 거치게 한다 ──
  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("composite")) db.createObjectStore("composite");
        if (!db.objectStoreNames.contains("layers")) db.createObjectStore("layers");
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        console.warn("[PanelArtStore] IndexedDB 열기 실패, 캐시 없이 진행합니다.", req.error);
        resolve(null);
      };
    });
    return dbPromise;
  }

  function idbGet(storeName, k) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        var tx = db.transaction(storeName, "readonly");
        var req = tx.objectStore(storeName).get(k);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  function idbSet(storeName, k, value) {
    return openDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        var tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(value, k);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
      });
    });
  }

  function idbDelete(storeName, k) {
    return openDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        var tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(k);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
      });
    });
  }

  // ── 이미지 압축 ──────────────────────────────────────────────────
  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function drawScaled(img, maxDim) {
    var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // opaque=true(합본): 알파가 필요 없으니 JPEG로 강하게 줄여도 된다.
  // opaque=false(레이어): 투명도가 필요해서 PNG만 쓰고, 크기만 줄인다.
  function fitDataUrl(dataUrl, opaque) {
    var tiersOpaque = [
      { maxDim: 1600, type: "image/png" },
      { maxDim: 1200, type: "image/jpeg", q: 0.85 },
      { maxDim: 900, type: "image/jpeg", q: 0.75 },
      { maxDim: 700, type: "image/jpeg", q: 0.6 }
    ];
    var tiersAlpha = [
      { maxDim: 1600, type: "image/png" },
      { maxDim: 1200, type: "image/png" },
      { maxDim: 900, type: "image/png" },
      { maxDim: 700, type: "image/png" }
    ];
    var tiers = opaque ? tiersOpaque : tiersAlpha;
    return loadImage(dataUrl).then(function (img) {
      var idx = 0;
      function tryTier() {
        var tier = tiers[idx];
        var canvas = drawScaled(img, tier.maxDim);
        var out = tier.type === "image/jpeg" ? canvas.toDataURL(tier.type, tier.q) : canvas.toDataURL(tier.type);
        if (out.length <= CLOUD_SIZE_LIMIT || idx >= tiers.length - 1) {
          return { dataUrl: out, w: canvas.width, h: canvas.height };
        }
        idx++;
        return tryTier();
      }
      return tryTier();
    });
  }

  // ── 합본(최종 그림) ─────────────────────────────────────────────
  function savePanel(episodeId, panelId, compositeDataUrl) {
    var k = key(episodeId, panelId);
    return fitDataUrl(compositeDataUrl, true).then(function (fitted) {
      var record = { image: fitted.dataUrl, w: fitted.w, h: fitted.h, updatedAt: Date.now() };
      idbSet("composite", k, record);
      var payload = Object.assign({ episodeId: episodeId, panelId: panelId }, record);
      return Cloud.writeDoc(COLLECTION + "/" + k, payload).then(function () {
        return record;
      });
    });
  }

  // 캐시에 있으면 그걸로 바로 그려주고, 없거나 오래됐을 수 있으면 클라우드도 확인한다.
  function loadPanel(episodeId, panelId) {
    var k = key(episodeId, panelId);
    return idbGet("composite", k).then(function (cached) {
      if (cached) return cached;
      if (!Cloud.enabled) return null;
      return Cloud.getDocOnce(COLLECTION + "/" + k).then(function (remote) {
        if (!remote) return null;
        idbSet("composite", k, remote);
        return remote;
      });
    });
  }

  function deletePanel(episodeId, panelId) {
    var k = key(episodeId, panelId);
    idbDelete("composite", k);
    idbDelete("layers", k);
    Cloud.deleteDoc(COLLECTION + "/" + k);
    // layers 서브컬렉션은 클라이언트 SDK에서 컬렉션 삭제 API가 없어 문서를 나열해
    // 하나씩 지운다. 실패해도(오프라인 등) 부모 문서가 이미 지워졌으니 독자에게는
    // 영향이 없고, 다음에 같은 컷 id를 재사용하지 않는 한 orphan 레이어로만 남는다.
    if (Cloud.enabled) {
      Cloud.getCollectionOnce(COLLECTION + "/" + k + "/layers").then(function (docs) {
        Object.keys(docs || {}).forEach(function (layerId) {
          Cloud.deleteDoc(COLLECTION + "/" + k + "/layers/" + layerId);
        });
      });
    }
  }

  function deleteAllForEpisode(episodeId) {
    var ep = EpisodeStore.getEpisode(episodeId);
    if (!ep) return;
    (ep.panels || []).forEach(function (p) {
      deletePanel(episodeId, p.id);
    });
  }

  // ── 레이어(재편집용 원본) ────────────────────────────────────────
  // layers: [{ id, name, order, opacity, visible, locked, alphaLock, clip, blend, image }]
  function saveLayers(episodeId, panelId, layers) {
    var k = key(episodeId, panelId);
    idbSet("layers", k, layers);
    if (!Cloud.enabled) return Promise.resolve();
    return Cloud.getCollectionOnce(COLLECTION + "/" + k + "/layers").then(function (existing) {
      var existingIds = Object.keys(existing || {});
      var keepIds = layers.map(function (l) {
        return l.id;
      });
      var removed = existingIds.filter(function (id) {
        return keepIds.indexOf(id) === -1;
      });
      removed.forEach(function (id) {
        Cloud.deleteDoc(COLLECTION + "/" + k + "/layers/" + id);
      });
      return Promise.all(
        layers.map(function (layer) {
          return fitDataUrl(layer.image, false).then(function (fitted) {
            var payload = Object.assign({}, layer, { image: fitted.dataUrl, w: fitted.w, h: fitted.h, updatedAt: Date.now() });
            return Cloud.writeDoc(COLLECTION + "/" + k + "/layers/" + layer.id, payload);
          });
        })
      );
    });
  }

  function loadLayers(episodeId, panelId) {
    var k = key(episodeId, panelId);
    return idbGet("layers", k).then(function (cached) {
      if (cached && cached.length) return cached;
      if (!Cloud.enabled) return null;
      return Cloud.getCollectionOnce(COLLECTION + "/" + k + "/layers").then(function (docs) {
        if (!docs) return null;
        var layers = Object.keys(docs)
          .map(function (id) {
            return Object.assign({}, docs[id], { id: id });
          })
          .sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
          });
        if (layers.length) idbSet("layers", k, layers);
        return layers;
      });
    });
  }

  return {
    key: key,
    savePanel: savePanel,
    loadPanel: loadPanel,
    deletePanel: deletePanel,
    deleteAllForEpisode: deleteAllForEpisode,
    saveLayers: saveLayers,
    loadLayers: loadLayers
  };
})();
