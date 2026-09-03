// 관리자 화면 하나를 잠그는 공용 PIN. 진짜 보안이 필요한 값이 아니라서(Firestore
// 규칙 자체가 열려있다, firestore.rules 참고) 평문으로 이 기기에만 저장하고,
// "지금 이 브라우저가 관리자로 로그인돼 있는지"만 기억한다.
var AdminAuth = (function () {
  var PIN_KEY = "webtoonAdminPin";
  var ACTIVE_KEY = "webtoonAdminActive";

  function getPin() {
    return localStorage.getItem(PIN_KEY) || "";
  }

  function hasPin() {
    return !!getPin();
  }

  function setPin(pin) {
    var trimmed = String(pin || "").trim();
    if (trimmed) localStorage.setItem(PIN_KEY, trimmed);
  }

  function verifyPin(input) {
    var saved = getPin();
    if (!saved) return true;
    return String(input || "") === saved;
  }

  function isActive() {
    return sessionStorage.getItem(ACTIVE_KEY) === "1";
  }

  function setActive(active) {
    if (active) sessionStorage.setItem(ACTIVE_KEY, "1");
    else sessionStorage.removeItem(ACTIVE_KEY);
  }

  // 관리자 페이지(admin/edit/paint.html) 맨 위에서 호출한다. PIN이 없으면(첫 사용)
  // 새로 만들게 하고, 있으면 입력받아 확인한다. 세션(sessionStorage) 동안은 다시
  // 묻지 않는다 - 같은 브라우저 탭을 오가며 여러 화면을 계속 작업하기 때문.
  // 로그인이 성공한 순간, 이 페이지의 상단 네비 pill과(있다면) 페이지 자체의
  // 콘텐츠(예: 글쓰기 버튼이 나타나야 하는 상세 화면)를 함께 갱신해준다 -
  // guard()를 어디서 불렀든(내비 pill이든, 글쓰기 버튼이든) 항상 같이 맞는다.
  function notifyNav() {
    if (window.__webtoonRefreshNav) window.__webtoonRefreshNav();
    if (window.__onAdminLogin) window.__onAdminLogin();
  }

  function guard(onReady) {
    if (isActive()) {
      onReady();
      return;
    }
    var overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    var isNew = !hasPin();
    overlay.innerHTML =
      '<div class="card modal-box">' +
      "<h2>" +
      (isNew ? "🔐 관리자 PIN 만들기" : "🔐 관리자 PIN 입력") +
      "</h2>" +
      '<div class="field"><input type="password" id="authPinInput" inputmode="numeric" placeholder="숫자 4자리 이상" autofocus></div>' +
      '<div id="authPinError" style="color:var(--color-danger);font-size:13px;min-height:18px;margin-bottom:8px;"></div>' +
      '<button class="btn btn-primary" id="authPinGo" style="width:100%">' +
      (isNew ? "만들고 시작하기" : "확인") +
      "</button>" +
      "</div>";
    document.body.appendChild(overlay);
    var input = overlay.querySelector("#authPinInput");
    var err = overlay.querySelector("#authPinError");
    function submit() {
      var val = input.value.trim();
      if (isNew) {
        if (val.length < 4) {
          err.textContent = "4자리 이상으로 만들어주세요.";
          return;
        }
        setPin(val);
        setActive(true);
        notifyNav();
        overlay.remove();
        onReady();
        return;
      }
      if (verifyPin(val)) {
        setActive(true);
        notifyNav();
        overlay.remove();
        onReady();
      } else {
        err.textContent = "PIN이 맞지 않아요.";
        input.value = "";
        input.focus();
      }
    }
    overlay.querySelector("#authPinGo").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
  }

  function logout() {
    setActive(false);
    location.reload();
  }

  return {
    hasPin: hasPin,
    setPin: setPin,
    verifyPin: verifyPin,
    isActive: isActive,
    guard: guard,
    logout: logout
  };
})();
