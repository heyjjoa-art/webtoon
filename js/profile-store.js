// 로그인 이름(계정 식별자, 고정)과 낙서장 제목에 보이는 이름(자유롭게 수정 가능)을
// 분리해서 들고 있는다. 가입 직후엔 둘이 같지만, "유키의 낙서장"처럼 화면에 보이는
// 이름만 나중에 바꿀 수 있다 - 로그인 이름 자체는 계정 식별자라 바꿀 수 없다.
//
// about-store.js와 같은 "로컬 우선 + 마지막에 쓴 게 이긴다" 패턴의 아주 작은 단일
// 문서 스토어다.
var ProfileStore = (function () {
  var DOC_PATH = "meta/profile";

  function getRecord() {
    var key = Session.lsKey("webtoonProfile");
    if (!key) return { siteName: "", updatedAt: 0 };
    var raw = localStorage.getItem(key);
    if (!raw) return { siteName: "", updatedAt: 0 };
    try {
      return JSON.parse(raw) || { siteName: "", updatedAt: 0 };
    } catch (e) {
      return { siteName: "", updatedAt: 0 };
    }
  }

  // 낙서장 제목에 쓸 이름. 아직 따로 정한 적이 없으면 로그인 이름을 그대로 쓴다.
  function getSiteName() {
    if (!Session.isLoggedIn()) return "";
    var record = getRecord();
    return record.siteName || Session.accountName();
  }

  function saveSiteName(name) {
    if (!Session.isLoggedIn()) return;
    var record = { siteName: String(name || "").trim() || Session.accountName(), updatedAt: Date.now() };
    localStorage.setItem(Session.lsKey("webtoonProfile"), JSON.stringify(record));
    Cloud.writeDoc(Session.path(DOC_PATH), record);
    if (window.__webtoonOnProfileChanged) window.__webtoonOnProfileChanged();
  }

  function bootstrap() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;
    Cloud.getDocOnce(Session.path(DOC_PATH)).then(function (remote) {
      var local = getRecord();
      var key = Session.lsKey("webtoonProfile");
      if (!key) return;
      if (remote && (remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        localStorage.setItem(key, JSON.stringify(remote));
        if (window.__webtoonOnProfileChanged) window.__webtoonOnProfileChanged();
      } else if (local.updatedAt) {
        Cloud.writeDoc(Session.path(DOC_PATH), local);
      }
      Cloud.watchDoc(Session.path(DOC_PATH), function (remoteDoc) {
        if (!remoteDoc) return;
        var k = Session.lsKey("webtoonProfile");
        if (!k) return;
        localStorage.setItem(k, JSON.stringify(remoteDoc));
        if (window.__webtoonOnProfileChanged) window.__webtoonOnProfileChanged();
      });
    });
  }

  Session.register({ bootstrap: bootstrap });

  return {
    getSiteName: getSiteName,
    saveSiteName: saveSiteName
  };
})();
