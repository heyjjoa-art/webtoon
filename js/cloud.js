// 여러 기기 사이에 회차·그림을 맞추기 위한 클라우드 연결 창구. 이 파일은 오직
// "연결하고 공통 함수 몇 개 제공하기"만 한다 - 어떤 데이터를 언제 올리고 받을지는
// 각 스토어(episode-store.js, panel-art-store.js)가 정한다. firebase-config.js가
// 비어있거나 SDK 로딩/초기화가 실패해도 enabled가 false가 될 뿐, 이 기기 로컬
// 저장은 그대로 동작한다 - 클라우드는 어디까지나 "여러 기기 맞추기"를 위한 보조 장치다.
var Cloud = (function () {
  var db = null;
  var enabled = false;

  function isConfigured(cfg) {
    return !!(cfg && cfg.apiKey && cfg.projectId);
  }

  try {
    if (
      typeof firebase !== "undefined" &&
      typeof WEBTOON_FIREBASE_CONFIG !== "undefined" &&
      isConfigured(WEBTOON_FIREBASE_CONFIG)
    ) {
      firebase.initializeApp(WEBTOON_FIREBASE_CONFIG);
      db = firebase.firestore();
      enabled = true;
    } else {
      console.info("[Cloud] firebase-config.js가 비어있어 이 기기에는 로컬 저장만 사용합니다.");
    }
  } catch (e) {
    console.warn("[Cloud] 초기화 실패, 이 기기에는 로컬 저장만 사용합니다.", e);
  }

  // 문서 하나를 실시간 구독한다. 이 기기에서 방금 쓴 변경의 echo(hasPendingWrites)는
  // 건너뛰고, 다른 기기에서 온 변경일 때만 콜백을 부른다.
  function watchDoc(path, onRemoteChange) {
    if (!enabled) return function () {};
    return db.doc(path).onSnapshot(
      function (snap) {
        if (snap.metadata.hasPendingWrites) return;
        onRemoteChange(snap.exists ? snap.data() : null);
      },
      function (err) {
        console.warn("[Cloud] watchDoc 실패", path, err);
      }
    );
  }

  // 컬렉션 전체를 실시간 구독한다. 콜백에는 { 문서id: 데이터 } 형태로 넘어온다.
  function watchCollection(path, onRemoteChange) {
    if (!enabled) return function () {};
    return db.collection(path).onSnapshot(
      function (snap) {
        if (snap.metadata.hasPendingWrites) return;
        var docs = {};
        snap.forEach(function (doc) {
          docs[doc.id] = doc.data();
        });
        onRemoteChange(docs);
      },
      function (err) {
        console.warn("[Cloud] watchCollection 실패", path, err);
      }
    );
  }

  function getDocOnce(path) {
    if (!enabled) return Promise.resolve(null);
    return db
      .doc(path)
      .get()
      .then(function (snap) {
        return snap.exists ? snap.data() : null;
      })
      .catch(function (err) {
        console.warn("[Cloud] getDocOnce 실패", path, err);
        return null;
      });
  }

  function getCollectionOnce(path) {
    if (!enabled) return Promise.resolve(null);
    return db
      .collection(path)
      .get()
      .then(function (snap) {
        var docs = {};
        snap.forEach(function (doc) {
          docs[doc.id] = doc.data();
        });
        return docs;
      })
      .catch(function (err) {
        console.warn("[Cloud] getCollectionOnce 실패", path, err);
        return null;
      });
  }

  // Firestore는 undefined 값이 있는 필드를 그냥 거부한다(에러 발생). JSON 왕복으로
  // undefined 필드를 통째로 지우고 나서 쓴다.
  function stripUndefined(data) {
    return JSON.parse(JSON.stringify(data));
  }

  // 실패해도 이 기기의 로컬 저장은 이미 끝난 뒤라 조용히 무시한다(다음 변경 때 다시 시도됨).
  function writeDoc(path, data) {
    if (!enabled) return Promise.resolve();
    return db
      .doc(path)
      .set(stripUndefined(data))
      .catch(function (err) {
        console.warn("[Cloud] writeDoc 실패", path, err);
      });
  }

  function deleteDoc(path) {
    if (!enabled) return Promise.resolve();
    return db
      .doc(path)
      .delete()
      .catch(function (err) {
        console.warn("[Cloud] deleteDoc 실패", path, err);
      });
  }

  return {
    enabled: enabled,
    watchDoc: watchDoc,
    watchCollection: watchCollection,
    getDocOnce: getDocOnce,
    getCollectionOnce: getCollectionOnce,
    writeDoc: writeDoc,
    deleteDoc: deleteDoc
  };
})();
