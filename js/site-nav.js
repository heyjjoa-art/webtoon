// 홈/웹툰/그림 게시판/글 게시판을 오가는 공용 상단 네비게이션. 그림판(paint.html)과
// 컷 편집기(edit.html)는 몰입해서 쓰는 도구 화면이라 이 네비게이션을 넣지 않고
// 자기만의 좁은 툴바를 쓴다 - 나머지 "둘러보는" 화면에는 전부 이걸 넣는다.
// 각 HTML은 <body data-page="home|about|toon|art|board">로 현재 위치를 표시해두면
// 이 스크립트가 해당 링크를 강조해준다.
(function () {
  "use strict";

  function render() {
    var mount = document.getElementById("siteNav");
    if (!mount) return;
    var current = document.body.dataset.page || "";

    function linkClass(key) {
      return "nav-link " + key + (current === key ? " current" : "");
    }

    mount.className = "site-nav";
    mount.innerHTML =
      '<a class="nav-brand" href="index.html">✏️ <span class="nav-brand-text">유키의 낙서장</span></a>' +
      '<div class="nav-links">' +
      '<a class="' + linkClass("home") + '" href="index.html">홈</a>' +
      '<a class="' + linkClass("about") + '" href="about.html">나의소개</a>' +
      '<a class="' + linkClass("toon") + '" href="toon.html">웹툰</a>' +
      '<a class="' + linkClass("art") + '" href="art.html">그림 게시판</a>' +
      '<a class="' + linkClass("board") + '" href="board.html">글 게시판</a>' +
      "</div>" +
      '<button class="nav-admin-pill" id="navAdminPill"></button>';

    var pill = mount.querySelector("#navAdminPill");
    function refreshPill() {
      var active = AdminAuth.isActive();
      pill.textContent = active ? "🔓 관리자" : "🔒 관리자";
      pill.classList.toggle("active", active);
    }
    refreshPill();
    // admin-auth.js가 guard()로 로그인에 성공할 때마다 이 함수를 불러줘서, 페이지
    // 어디서 로그인했든(이 pill을 눌렀든, 글쓰기 버튼을 눌러 guard가 떴든) pill
    // 상태가 항상 맞게 유지된다.
    window.__webtoonRefreshNav = refreshPill;
    pill.addEventListener("click", function () {
      if (AdminAuth.isActive()) {
        AdminAuth.logout();
      } else {
        AdminAuth.guard(function () {});
      }
    });
  }

  render();
})();
