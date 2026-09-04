// "나의 소개" 페이지 하단 친구소개 목록. about-store.js와 똑같이 작은 단일
// 문서(목록 전체)라 "로컬 우선 + 마지막에 쓴 게 이긴다"로 충분하다. 사진은
// PanelArtStore를 key1="friend", key2=친구id로 재사용해서 압축·캐시를 공짜로 얻는다.
//
// 모든 데이터는 로그인한 계정 것만 본다(Session.lsKey/Session.path). 로그아웃
// 상태에서는 친구 목록이 항상 빈 배열이다 - DEFAULT_FRIENDS는 "이제 막 가입한
// 계정"에만 적용되는 시작 값이지, 로그아웃 상태의 기본값이 아니다.
var FriendsStore = (function () {
  var DOC_PATH = "meta/friends";
  var MAX_FRIENDS = 12;

  var DEFAULT_FRIENDS = [
    { id: "friend-huin", name: "흰이", note: "신생아 인형 같은 백곰", emoji: "🐻", personality: "" },
    { id: "friend-padaki", name: "파닥이", note: "흰이랑 같은 느낌 브라운곰", emoji: "🧸", personality: "" }
  ];

  function blankRecord() {
    return { friends: DEFAULT_FRIENDS.slice(), updatedAt: 0 };
  }

  function getRecord() {
    var key = Session.lsKey("webtoonFriends");
    if (!key) return { friends: [], updatedAt: 0 };
    var raw = localStorage.getItem(key);
    if (!raw) return blankRecord();
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.friends)) return blankRecord();
      return parsed;
    } catch (e) {
      return blankRecord();
    }
  }

  function getFriends() {
    return getRecord().friends;
  }

  function saveFriends(list) {
    if (!Session.isLoggedIn()) return { friends: [], updatedAt: 0 };
    var record = { friends: list, updatedAt: Date.now() };
    localStorage.setItem(Session.lsKey("webtoonFriends"), JSON.stringify(record));
    Cloud.writeDoc(Session.path(DOC_PATH), record);
    if (window.__webtoonOnFriendsChanged) window.__webtoonOnFriendsChanged();
    return record;
  }

  function addFriend(data) {
    var list = getFriends();
    if (list.length >= MAX_FRIENDS) return null;
    var friend = {
      id: "friend-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: (data.name || "").trim() || "이름 없음",
      note: (data.note || "").trim(),
      personality: (data.personality || "").trim(),
      emoji: data.emoji || "🐾"
    };
    list.push(friend);
    saveFriends(list);
    return friend;
  }

  function updateFriend(id, data) {
    var list = getFriends();
    var idx = list.findIndex(function (f) {
      return f.id === id;
    });
    if (idx === -1) return;
    list[idx] = Object.assign({}, list[idx], data);
    saveFriends(list);
  }

  function removeFriend(id) {
    var list = getFriends().filter(function (f) {
      return f.id !== id;
    });
    saveFriends(list);
    PanelArtStore.deletePanel("friend", id);
  }

  function bootstrap() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;
    Cloud.getDocOnce(Session.path(DOC_PATH)).then(function (remote) {
      var local = getRecord();
      var key = Session.lsKey("webtoonFriends");
      if (!key) return;
      if (remote && (remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        localStorage.setItem(key, JSON.stringify(remote));
        if (window.__webtoonOnFriendsChanged) window.__webtoonOnFriendsChanged();
      } else if (local.updatedAt) {
        Cloud.writeDoc(Session.path(DOC_PATH), local);
      }
      Cloud.watchDoc(Session.path(DOC_PATH), function (remoteDoc) {
        if (!remoteDoc) return;
        var k = Session.lsKey("webtoonFriends");
        if (!k) return;
        localStorage.setItem(k, JSON.stringify(remoteDoc));
        if (window.__webtoonOnFriendsChanged) window.__webtoonOnFriendsChanged();
      });
    });
  }

  Session.register({ bootstrap: bootstrap });

  return {
    MAX_FRIENDS: MAX_FRIENDS,
    getFriends: getFriends,
    addFriend: addFriend,
    updateFriend: updateFriend,
    removeFriend: removeFriend
  };
})();
