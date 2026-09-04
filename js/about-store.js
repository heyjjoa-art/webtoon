// "나의 소개" 한 페이지짜리 프로필(사진 1장 + 소개글). 사진은 PanelArtStore를
// 그대로 재사용한다 - key1="about", key2="photo"로 부르면 그림판 컷 그림과 똑같이
// 압축·IndexedDB 캐시·Firestore 900KB 제한 처리를 공짜로 얻는다. 소개글은 아주
// 작은 단일 문서라 journeys 식 "로컬 우선 + 마지막에 쓴 게 이긴다" 정도로 충분하다.
//
// 모든 데이터는 로그인한 계정 것만 본다(Session.lsKey/Session.path) - 로그아웃
// 상태에서는 항상 빈 소개글이다.
var AboutStore = (function () {
  var DOC_PATH = "meta/about";

  function getBio() {
    var key = Session.lsKey("webtoonAboutBio");
    if (!key) return { bio: "", updatedAt: 0 };
    var raw = localStorage.getItem(key);
    if (!raw) return { bio: "", updatedAt: 0 };
    try {
      return JSON.parse(raw) || { bio: "", updatedAt: 0 };
    } catch (e) {
      return { bio: "", updatedAt: 0 };
    }
  }

  function saveBio(text) {
    if (!Session.isLoggedIn()) return { bio: "", updatedAt: 0 };
    var record = { bio: text, updatedAt: Date.now() };
    localStorage.setItem(Session.lsKey("webtoonAboutBio"), JSON.stringify(record));
    Cloud.writeDoc(Session.path(DOC_PATH), record);
    if (window.__webtoonOnAboutChanged) window.__webtoonOnAboutChanged();
    return record;
  }

  function bootstrap() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;
    Cloud.getDocOnce(Session.path(DOC_PATH)).then(function (remote) {
      var local = getBio();
      var key = Session.lsKey("webtoonAboutBio");
      if (!key) return;
      if (remote && (remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        localStorage.setItem(key, JSON.stringify(remote));
        if (window.__webtoonOnAboutChanged) window.__webtoonOnAboutChanged();
      } else if (local.updatedAt) {
        Cloud.writeDoc(Session.path(DOC_PATH), local);
      }
      Cloud.watchDoc(Session.path(DOC_PATH), function (remoteDoc) {
        if (!remoteDoc) return;
        var k = Session.lsKey("webtoonAboutBio");
        if (!k) return;
        localStorage.setItem(k, JSON.stringify(remoteDoc));
        if (window.__webtoonOnAboutChanged) window.__webtoonOnAboutChanged();
      });
    });
  }

  Session.register({ bootstrap: bootstrap });

  return {
    getBio: getBio,
    saveBio: saveBio
  };
})();
