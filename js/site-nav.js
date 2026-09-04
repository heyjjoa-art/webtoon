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

    var brandName = Session.isLoggedIn() ? ProfileStore.getSiteName() + "의 낙서장" : "낙서장";

    mount.className = "site-nav";
    mount.innerHTML =
      '<a class="nav-brand" href="index.html">✏️ <span class="nav-brand-text">' + brandName + '</span></a>' +
      '<div class="nav-links">' +
      '<a class="' + linkClass("home") + '" href="index.html">홈</a>' +
      '<a class="' + linkClass("about") + '" href="about.html">나의소개</a>' +
      '<a class="' + linkClass("toon") + '" href="toon.html">웹툰</a>' +
      '<a class="' + linkClass("art") + '" href="art.html">그림 게시판</a>' +
      '<a class="' + linkClass("board") + '" href="board.html">글 게시판</a>' +
      "</div>" +
      '<button class="nav-admin-pill" id="navAdminPill"></button>';

    var pill = mount.querySelector("#navAdminPill");
    if (Session.isLoggedIn()) {
      pill.textContent = "🔓 " + Session.accountName();
      pill.classList.add("active");
    } else {
      pill.textContent = "🔒 로그인";
      pill.classList.remove("active");
    }
    pill.addEventListener("click", function () {
      if (Session.isLoggedIn()) {
        Session.logOut();
      } else {
        Session.openAuthModal(function () {});
      }
    });
  }

  // 낙서장 이름(about.html에서 수정)이 바뀌면 이 브랜드 텍스트도 바로 반영한다.
  window.__webtoonOnProfileChanged = render;
  Session.onChange(render);
})();
