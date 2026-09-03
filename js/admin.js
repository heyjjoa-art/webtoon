(function () {
  "use strict";

  var WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  AdminAuth.guard(function () {
    document.getElementById("adminRoot").hidden = false;
    renderSeries();
    renderList();
    window.__webtoonOnEpisodesChanged = renderList;
  });

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  // ── 시리즈 설정 ──────────────────────────────────────────────────
  function renderSeries() {
    var series = EpisodeStore.getSeries();
    var el = document.getElementById("seriesSection");
    el.innerHTML =
      "<h2>📖 시리즈 설정</h2>" +
      '<div class="field"><label>제목</label><input type="text" id="seriesTitle" value="' +
      escapeHtml(series.title) +
      '"></div>' +
      '<div class="field"><label>한 줄 소개</label><input type="text" id="seriesTagline" value="' +
      escapeHtml(series.tagline) +
      '"></div>' +
      '<div class="field"><label>연재 요일</label><div class="weekday-picker" id="weekdayPicker"></div></div>' +
      '<div class="field"><label>연재 시각</label><input type="number" id="seriesHour" min="0" max="23" value="' +
      (series.scheduleHour != null ? series.scheduleHour : 19) +
      '" style="max-width:100px"></div>' +
      '<button class="btn btn-primary btn-sm" id="saveSeriesBtn">저장</button>' +
      '<span id="seriesSaveStatus" class="muted" style="margin-left:10px;font-size:13px;"></span>';

    var picker = el.querySelector("#weekdayPicker");
    var selectedDays = (series.scheduleDays || []).slice();
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
      EpisodeStore.saveSeries({
        title: el.querySelector("#seriesTitle").value.trim() || "제목 없는 웹툰",
        tagline: el.querySelector("#seriesTagline").value.trim(),
        scheduleDays: selectedDays.slice().sort(),
        scheduleHour: Number(el.querySelector("#seriesHour").value) || 0
      });
      el.querySelector("#seriesSaveStatus").textContent = "✅ 저장했어요";
      setTimeout(function () {
        el.querySelector("#seriesSaveStatus").textContent = "";
      }, 2000);
    });
  }

  // ── 회차 목록 ───────────────────────────────────────────────────
  document.getElementById("newEpisodeBtn").addEventListener("click", function () {
    var ep = EpisodeStore.saveEpisode(EpisodeStore.blankEpisode());
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

  function renderList() {
    var episodes = EpisodeStore.listEpisodes();
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
