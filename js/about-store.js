// "나의 소개" 한 페이지짜리 프로필(사진 1장 + 소개글). 사진은 PanelArtStore를
// 그대로 재사용한다 - key1="about", key2="photo"로 부르면 그림판 컷 그림과 똑같이
// 압축·IndexedDB 캐시·Firestore 900KB 제한 처리를 공짜로 얻는다. 소개글은 아주
// 작은 단일 문서라 journeys 식 "로컬 우선 + 마지막에 쓴 게 이긴다" 정도로 충분하다.
var AboutStore = (function () {
  var BIO_KEY = "webtoonAboutBio";
  var DOC_PATH = "about/meta";

  function getBio() {
    var raw = localStorage.getItem(BIO_KEY);
    if (!raw) return { bio: "", updatedAt: 0 };
    try {
      return JSON.parse(raw) || { bio: "", updatedAt: 0 };
    } catch (e) {
      return { bio: "", updatedAt: 0 };
    }
  }

  function saveBio(text) {
    var record = { bio: text, updatedAt: Date.now() };
    localStorage.setItem(BIO_KEY, JSON.stringify(record));
    Cloud.writeDoc(DOC_PATH, record);
    if (window.__webtoonOnAboutChanged) window.__webtoonOnAboutChanged();
    return record;
  }

  function bootstrap() {
    if (!Cloud.enabled) return;
    Cloud.getDocOnce(DOC_PATH).then(function (remote) {
      var local = getBio();
      if (remote && (remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        localStorage.setItem(BIO_KEY, JSON.stringify(remote));
        if (window.__webtoonOnAboutChanged) window.__webtoonOnAboutChanged();
      } else if (local.updatedAt) {
        Cloud.writeDoc(DOC_PATH, local);
      }
      Cloud.watchDoc(DOC_PATH, function (remoteDoc) {
        if (!remoteDoc) return;
        localStorage.setItem(BIO_KEY, JSON.stringify(remoteDoc));
        if (window.__webtoonOnAboutChanged) window.__webtoonOnAboutChanged();
      });
    });
  }

  bootstrap();

  return {
    getBio: getBio,
    saveBio: saveBio
  };
})();
