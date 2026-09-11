// 브러시 프리셋(굵기/농도/보정 조합에 이름 붙여 저장). about-store.js와 같은
// 패턴: 로그인 계정별로 로컬에 우선 저장하고, Firebase가 설정돼 있으면
// 같은 계정의 다른 기기에도 맞춘다. 데이터가 아주 작은 단일 문서라
// "마지막에 쓴 게 이긴다" 정도로 충분하다.
var BrushPresetStore = (function () {
  var DOC_PATH = "meta/brushPresets";

  function readLocal() {
    var key = Session.lsKey("webtoonBrushPresets");
    if (!key) return { presets: [], updatedAt: 0 };
    var raw = localStorage.getItem(key);
    if (!raw) return { presets: [], updatedAt: 0 };
    try {
      return JSON.parse(raw) || { presets: [], updatedAt: 0 };
    } catch (e) {
      return { presets: [], updatedAt: 0 };
    }
  }

  function getAll() {
    return readLocal().presets;
  }

  function persist(presets) {
    if (!Session.isLoggedIn()) return presets;
    var record = { presets: presets, updatedAt: Date.now() };
    localStorage.setItem(Session.lsKey("webtoonBrushPresets"), JSON.stringify(record));
    Cloud.writeDoc(Session.path(DOC_PATH), record);
    return presets;
  }

  // 이름이 같은 프리셋이 있으면 덮어쓴다(설정만 바꿔 다시 저장하는 경우).
  function savePreset(name, brush) {
    var presets = getAll().filter(function (p) {
      return p.name !== name;
    });
    presets.push({
      name: name,
      type: brush.type,
      size: brush.size,
      opacity: brush.opacity,
      smoothing: brush.smoothing
    });
    return persist(presets);
  }

  function deletePreset(name) {
    return persist(
      getAll().filter(function (p) {
        return p.name !== name;
      })
    );
  }

  function bootstrap() {
    if (!Cloud.enabled || !Session.isLoggedIn()) return;
    var key = Session.lsKey("webtoonBrushPresets");
    if (!key) return;
    Cloud.getDocOnce(Session.path(DOC_PATH)).then(function (remote) {
      var local = readLocal();
      if (remote && (remote.updatedAt || 0) >= (local.updatedAt || 0)) {
        localStorage.setItem(key, JSON.stringify(remote));
        if (window.__webtoonOnBrushPresetsChanged) window.__webtoonOnBrushPresetsChanged();
      } else if (local.updatedAt) {
        Cloud.writeDoc(Session.path(DOC_PATH), local);
      }
      Cloud.watchDoc(Session.path(DOC_PATH), function (remoteDoc) {
        if (!remoteDoc) return;
        localStorage.setItem(key, JSON.stringify(remoteDoc));
        if (window.__webtoonOnBrushPresetsChanged) window.__webtoonOnBrushPresetsChanged();
      });
    });
  }

  Session.register({ bootstrap: bootstrap });

  return {
    getAll: getAll,
    savePreset: savePreset,
    deletePreset: deletePreset
  };
})();
