(function () {
  "use strict";

  var WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  var STATUS_LABEL = { ongoing: "🟢 연재중", paused: "⏸ 휴재", ended: "🏁 완결" };

  var params = new URLSearchParams(location.search);
  var seriesId = params.get("series");

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  Session.requireLogin(function () {
    if (seriesId) {
      var series = SeriesStore.getSeries(seriesId);
      if (!series) {
        location.href = "admin.html";
        return;
      }
      document.getElementById("episodeAdminRoot").hidden = false;
      renderSeriesSettings();
      renderEpisodeList();
      window.__webtoonOnEpisodesChanged = renderEpisodeList;
      window.__webtoonOnSeriesListChanged = renderSeriesSettings;
    } else {
      document.getElementById("seriesListRoot").hidden = false;
      renderSeriesList();
      window.__webtoonOnSeriesListChanged = renderSeriesList;
    }
  });

  // ── 시리즈 목록 관리(series 파라미터 없음) ─────────────────────────
  function askTitle(onDone) {
    var overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML =
      '<div class="card modal-box">' +
      "<h2>💬 새 웹툰 시리즈</h2>" +
      '<div class="field"><label>제목</label><input type="text" id="seriesTitleInput" placeholder="시리즈 제목" autofocus></div>' +
      '<button class="btn btn-primary" id="seriesTitleGo" style="width:100%">만들기</button>' +
      "</div>";
    document.body.appendChild(overlay);
    var input = overlay.querySelector("#seriesTitleInput");
    function submit() {
      var title = input.value.trim() || "제목 없는 웹툰";
      overlay.remove();
      onDone(title);
    }
    overlay.querySelector("#seriesTitleGo").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
    input.focus();
  }

  document.getElementById("newSeriesBtn").addEventListener("click", function () {
    askTitle(function (title) {
      var s = SeriesStore.saveSeries(SeriesStore.blankSeries(title));
      location.href = "admin.html?series=" + encodeURIComponent(s.id);
    });
  });

  function renderSeriesList() {
    var all = SeriesStore.listSeries();
    var listEl = document.getElementById("seriesAdminList");
    if (!all.length) {
      listEl.innerHTML = '<div class="center-empty">아직 시리즈가 없어요. + 새 시리즈로 시작해보세요.</div>';
      return;
    }
    listEl.innerHTML = "";
    all.forEach(function (s) {
      var card = document.createElement("div");
      card.className = "card admin-ep-card";
      card.innerHTML =
        '<div class="admin-ep-top">' +
        '<span class="title">' +
        escapeHtml(s.title) +
        "</span>" +
        '<span class="badge badge-' +
        (s.status === "ongoing" ? "published" : s.status === "ended" ? "draft" : "scheduled") +
        '">' +
        STATUS_LABEL[s.status] +
        "</span>" +
        "</div>" +
        '<div class="admin-ep-actions">' +
        '<button class="btn btn-primary btn-sm" data-act="manage">✍️ 회차 관리</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="view">👀 보기</button>' +
        '<button class="btn btn-danger btn-sm" data-act="delete">삭제</button>' +
        "</div>";
      card.querySelector('[data-act="manage"]').addEventListener("click", function () {
        location.href = "admin.html?series=" + encodeURIComponent(s.id);
      });
      card.querySelector('[data-act="view"]').addEventListener("click", function () {
        location.href = "toon-series.html?series=" + encodeURIComponent(s.id);
      });
      card.querySelector('[data-act="delete"]').addEventListener("click", function () {
        if (confirm('"' + s.title + '" 시리즈를 통째로 삭제할까요? 안의 회차와 그림도 전부 지워지고 되돌릴 수 없어요.')) {
          SeriesStore.deleteSeries(s.id);
        }
      });
      listEl.appendChild(card);
    });
  }

  // ── 시리즈 설정 + 회차 관리(series 파라미터 있음) ─────────────────
  function renderSeriesSettings() {
    var s = SeriesStore.getSeries(seriesId);
    if (!s) return;
    var el = document.getElementById("seriesSection");
    el.innerHTML =
      "<h2>📖 시리즈 설정</h2>" +
      '<div class="field"><label>제목</label><input type="text" id="seriesTitle" value="' +
      escapeHtml(s.title) +
      '"></div>' +
      '<div class="field"><label>한 줄 소개</label><input type="text" id="seriesTagline" value="' +
      escapeHtml(s.tagline) +
      '"></div>' +
      '<div class="field"><label>상태</label><select id="seriesStatus">' +
      Object.keys(STATUS_LABEL)
        .map(function (k) {
          return '<option value="' + k + '"' + (s.status === k ? " selected" : "") + ">" + STATUS_LABEL[k] + "</option>";
        })
        .join("") +
      "</select></div>" +
      '<div class="field"><label>연재 요일</label><div class="weekday-picker" id="weekdayPicker"></div></div>' +
      '<div class="field"><label>연재 시각</label><input type="number" id="seriesHour" min="0" max="23" value="' +
      (s.scheduleHour != null ? s.scheduleHour : 19) +
      '" style="max-width:100px"></div>' +
      '<button class="btn btn-primary btn-sm" id="saveSeriesBtn">저장</button>' +
      '<span id="seriesSaveStatus" class="muted" style="margin-left:10px;font-size:13px;"></span>';

    var picker = el.querySelector("#weekdayPicker");
    var selectedDays = (s.scheduleDays || []).slice();
    WEEKDAY_NAMES.forEach(function (name, idx) {
      var chip = document.createElement("div");
      chip.className = "weekday-chip" + (selectedDays.indexOf(idx) !== -1 ? " on" : "");
      chip.textContent = name;
      chip.addEventListener("click", function () {
        var pos = selectedDays.indexOf(idx);
        if (pos === -1) selectedDays.push(idx);
        else selectedDays.splice(pos, 1);
        chip.classList.toggle("on");
      });
      picker.appendChild(chip);
    });

    el.querySelector("#saveSeriesBtn").addEventListener("click", function () {
      SeriesStore.saveSeries({
        id: seriesId,
        title: el.querySelector("#seriesTitle").value.trim() || "제목 없는 웹툰",
        tagline: el.querySelector("#seriesTagline").value.trim(),
        status: el.querySelector("#seriesStatus").value,
        scheduleDays: selectedDays.slice().sort(),
        scheduleHour: Number(el.querySelector("#seriesHour").value) || 0
      });
      el.querySelector("#seriesSaveStatus").textContent = "✅ 저장했어요";
      setTimeout(function () {
        var st = document.getElementById("seriesSaveStatus");
        if (st) st.textContent = "";
      }, 2000);
    });
  }

  document.getElementById("newEpisodeBtn").addEventListener("click", function () {
    var ep = EpisodeStore.saveEpisode(EpisodeStore.blankEpisode(seriesId));
    location.href = "edit.html?ep=" + encodeURIComponent(ep.id);
  });

  function statusBadge(ep) {
    if (ep.status === "published") return '<span class="badge badge-published">공개중</span>';
    if (ep.status === "scheduled") {
      var when = ep.publishAt ? new Date(ep.publishAt) : null;
      var label = when ? when.getMonth() + 1 + "/" + when.getDate() + " " + when.getHours() + "시 예약" : "예약";
      return '<span class="badge badge-scheduled">🕒 ' + label + "</span>";
    }
    return '<span class="badge badge-draft">초안</span>';
  }

  function renderEpisodeList() {
    var episodes = EpisodeStore.listEpisodes(seriesId);
    var listEl = document.getElementById("episodeAdminList");
    if (!episodes.length) {
      listEl.innerHTML = '<div class="center-empty">아직 회차가 없어요. + 새 회차로 시작해보세요.</div>';
      return;
    }
    listEl.innerHTML = "";
    episodes.forEach(function (ep) {
      var card = document.createElement("div");
      card.className = "card admin-ep-card";
      card.innerHTML =
        '<div class="admin-ep-top">' +
        "<span>" +
        ep.no +
        "화</span>" +
        '<span class="title">' +
        escapeHtml(ep.title || "(제목 없음)") +
        "</span>" +
        statusBadge(ep) +
        "</div>" +
        '<div class="admin-ep-actions">' +
        '<button class="btn btn-ghost btn-sm" data-act="edit">✏️ 컷 편집</button>' +
        (ep.status === "published"
          ? '<button class="btn btn-ghost btn-sm" data-act="unpublish">내리기</button>'
          : '<button class="btn btn-primary btn-sm" data-act="publish">🚀 지금 발행</button>') +
        '<button class="btn btn-ghost btn-sm" data-act="schedule">🕒 예약</button>' +
        '<button class="btn btn-danger btn-sm" data-act="delete">삭제</button>' +
        "</div>" +
        '<div class="schedule-row" data-schedule-row hidden>' +
        '<input type="datetime-local" data-schedule-input>' +
        '<button class="btn btn-primary btn-sm" data-act="schedule-confirm">확정</button>' +
        "</div>";

      card.querySelector('[data-act="edit"]').addEventListener("click", function () {
        location.href = "edit.html?ep=" + encodeURIComponent(ep.id);
      });
      card.querySelector('[data-act="delete"]').addEventListener("click", function () {
        if (confirm((ep.no || "") + "화 \"" + (ep.title || "이 회차") + "\"를 삭제할까요? 되돌릴 수 없어요.")) {
          EpisodeStore.deleteEpisode(ep.id);
        }
      });
      var pubBtn = card.querySelector('[data-act="publish"]');
      if (pubBtn) pubBtn.addEventListener("click", function () {
        EpisodeStore.publishNow(ep.id);
      });
      var unpubBtn = card.querySelector('[data-act="unpublish"]');
      if (unpubBtn) unpubBtn.addEventListener("click", function () {
        EpisodeStore.unpublish(ep.id);
      });
      var scheduleRow = card.querySelector("[data-schedule-row]");
      card.querySelector('[data-act="schedule"]').addEventListener("click", function () {
        scheduleRow.hidden = !scheduleRow.hidden;
      });
      card.querySelector('[data-act="schedule-confirm"]').addEventListener("click", function () {
        var val = card.querySelector("[data-schedule-input]").value;
        if (!val) return;
        var when = new Date(val).getTime();
        EpisodeStore.schedule(ep.id, when);
      });

      listEl.appendChild(card);
    });
  }
})();
