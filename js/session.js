// 계정 시스템의 중심. Firebase Authentication(이메일/비밀번호) 위에 "이름 + 비밀번호"
// 가입/로그인을 얹는다. 한글 이름은 이메일 주소로 못 쓰므로, 이름 하나당 내부 이메일을
// 하나 배정해서 Firestore usernames/{이름} 문서에 적어둔다 - 로그인할 때는 이름으로 이
// 문서를 찾아 진짜 이메일을 알아낸 다음 그걸로 Firebase에 로그인한다. 화면에는 이
// 내부 이메일이 절대 보이지 않는다.
//
// 이 파일이 js/admin-auth.js를 완전히 대체한다: "관리자 1명" 개념이 "로그인한 계정"
// 개념으로 바뀐다. 각 데이터 스토어는 자기 데이터를 어디서/어떻게 읽고 쓸지 그대로
// 담당하되, "지금 누구로 로그인돼 있는지"만 이 모듈에 물어본다(uid(), lsKey(), path()).
//
// Firebase Auth의 로그인 상태 복원은 항상 비동기다(첫 onAuthStateChanged가 오기 전엔
// 로그인 여부를 알 수 없다) - 그래서 스토어는 파일이 로드되자마자 바로 부트스트랩하지
// 않고 register()로 등록만 해두면, 첫 인증 상태가 확정되는 순간 이 모듈이 불러준다.
var Session = (function () {
  var USERNAMES_COLLECTION = "usernames";
  var EMAIL_DOMAIN = "users.nakseojang.local";

  var auth = null;
  var currentUser = null;
  var readyFired = false;
  var readyResolve;
  var ready = new Promise(function (resolve) {
    readyResolve = resolve;
  });
  var changeSubs = [];
  var stores = [];

  try {
    if (typeof firebase !== "undefined" && Cloud.enabled) {
      auth = firebase.auth();
    }
  } catch (e) {
    console.warn("[Session] Firebase Auth 초기화 실패, 로그인 기능 없이 진행합니다.", e);
  }

  function isLoggedIn() {
    return !!currentUser;
  }

  function uid() {
    return currentUser ? currentUser.uid : null;
  }

  function accountName() {
    return currentUser ? currentUser.displayName || "" : "";
  }

  // 다른 기기/탭에서 이름을 바꿀 방법이 없어서(로그인 이름은 고정) 항상 캐시 없이
  // currentUser.displayName을 그대로 쓴다.
  function lsKey(base) {
    return currentUser ? base + "::" + currentUser.uid : null;
  }

  function path(rel) {
    return currentUser ? "users/" + currentUser.uid + "/" + rel : null;
  }

  // 스토어가 자기 bootstrap()을 등록해둔다. 이미 로그인 상태가 확정돼 있으면(즉,
  // 이 스토어의 <script>가 다른 스크립트보다 늦게 실행됐으면) 바로 한 번 불러준다.
  function register(store) {
    stores.push(store);
    if (readyFired && currentUser && store.bootstrap) store.bootstrap();
  }

  function notify() {
    changeSubs.forEach(function (cb) {
      try {
        cb();
      } catch (e) {
        console.error("[Session] onChange 구독자 오류", e);
      }
    });
  }

  function handleAuthChange(user) {
    if (typeof Cloud !== "undefined" && Cloud.detachAll) Cloud.detachAll();
    currentUser = user || null;
    if (currentUser) {
      stores.forEach(function (s) {
        if (s.bootstrap) s.bootstrap();
      });
    }
    if (!readyFired) {
      readyFired = true;
      readyResolve();
    }
    notify();
  }

  if (auth) {
    auth.onAuthStateChanged(handleAuthChange, function (err) {
      console.warn("[Session] onAuthStateChanged 오류", err);
      handleAuthChange(null);
    });
  } else {
    // firebase-config.js가 비어있는 로컬 전용 모드 - 계정 기능 자체가 성립하지 않으니
    // 항상 로그아웃 상태로 취급한다(다른 스크립트와 실행 순서를 맞추려 한 틱 늦춘다).
    setTimeout(function () {
      handleAuthChange(null);
    }, 0);
  }

  // 인증 상태가 처음 확정된 뒤로 구독한다. register()와 달리 화면 갱신용 - 로그인/
  // 로그아웃이 바뀔 때마다(첫 확정 포함) 다시 불린다.
  function onChange(cb) {
    changeSubs.push(cb);
    if (readyFired) cb();
  }

  function requireLogin(cb) {
    ready.then(function () {
      if (isLoggedIn()) {
        cb();
        return;
      }
      openAuthModal(cb);
    });
  }

  function lookupEmail(name) {
    return Cloud.getDocOnce(USERNAMES_COLLECTION + "/" + name).then(function (doc) {
      return doc ? doc.email : null;
    });
  }

  function firestore() {
    return firebase.firestore();
  }

  // usernames/{name} 문서를 딱 한 번만 만든다. 이미 있으면 Firestore 규칙이 거부한다
  // (내 계정 소유가 아닌 문서는 update로 취급돼 막힌다) - 그 실패를 "이미 있는 이름"
  // 신호로 그대로 쓴다.
  function reserveName(name, uidVal, email) {
    return firestore()
      .doc(USERNAMES_COLLECTION + "/" + name)
      .set({ uid: uidVal, email: email, createdAt: Date.now() });
  }

  function signUp(name, password, onDone, onError) {
    name = String(name || "").trim();
    password = String(password || "");
    if (!name) {
      onError("이름을 입력해주세요.");
      return;
    }
    if (name.indexOf("/") !== -1) {
      onError("이름에 '/'는 쓸 수 없어요.");
      return;
    }
    if (password.length < 6) {
      onError("비밀번호는 6자 이상으로 만들어주세요.");
      return;
    }
    if (!auth) {
      onError("클라우드 연결이 꺼져 있어서 가입할 수 없어요.");
      return;
    }
    lookupEmail(name)
      .then(function (existing) {
        if (existing) {
          onError("이미 있는 이름이에요. 다른 이름을 써주세요.");
          return;
        }
        var email = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "@" + EMAIL_DOMAIN;
        var createdUser = null;
        return auth
          .createUserWithEmailAndPassword(email, password)
          .then(function (cred) {
            createdUser = cred.user;
            return cred.user.updateProfile({ displayName: name });
          })
          .then(function () {
            return reserveName(name, createdUser.uid, email);
          })
          .then(function () {
            // createUserWithEmailAndPassword가 곧바로 로그인 상태로 만들어서 이미
            // onAuthStateChanged가 한 번 불렸지만, 그때는 아직 displayName이
            // 없었다(updateProfile 전) - 지금 다시 한번 구독자들을 깨워서 nav pill/
            // 홈 제목 등이 이름을 제대로 보여주게 한다. (updateProfile 자체는
            // onAuthStateChanged를 다시 발생시키지 않는다.)
            notify();
            onDone();
          })
          .catch(function (err) {
            // 이름 예약 단계에서 실패했으면(동시에 같은 이름으로 가입 시도 등) 방금
            // 만든 인증 계정이 고아로 남지 않게 정리한다.
            if (createdUser) createdUser.delete().catch(function () {});
            onError(mapAuthError(err));
          });
      })
      .catch(function (err) {
        onError(mapAuthError(err));
      });
  }

  function logIn(name, password, onDone, onError) {
    name = String(name || "").trim();
    password = String(password || "");
    if (!name || !password) {
      onError("이름과 비밀번호를 모두 입력해주세요.");
      return;
    }
    if (!auth) {
      onError("클라우드 연결이 꺼져 있어서 로그인할 수 없어요.");
      return;
    }
    lookupEmail(name)
      .then(function (email) {
        if (!email) {
          onError("그런 이름으로 가입한 계정이 없어요.");
          return;
        }
        return auth
          .signInWithEmailAndPassword(email, password)
          .then(function () {
            onDone();
          });
      })
      .catch(function (err) {
        onError(mapAuthError(err));
      });
  }

  function logOut() {
    if (auth) auth.signOut();
  }

  function mapAuthError(err) {
    var code = err && err.code;
    if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") {
      return "비밀번호가 맞지 않아요.";
    }
    if (code === "auth/too-many-requests") return "시도가 너무 많아요. 잠시 후 다시 해주세요.";
    if (code === "auth/network-request-failed") return "네트워크 연결을 확인해주세요.";
    return "문제가 생겼어요. 다시 시도해주세요.";
  }

  // ── 로그인/가입 모달 ────────────────────────────────────────────
  function openAuthModal(onSuccess) {
    var overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    var mode = "login"; // "login" | "signup"

    function html() {
      var isSignup = mode === "signup";
      return (
        '<div class="card modal-box">' +
        "<h2>" +
        (isSignup ? "✏️ 낙서장 만들기" : "🔐 로그인") +
        "</h2>" +
        '<div class="field"><input type="text" id="authNameInput" placeholder="이름" autofocus></div>' +
        '<div class="field"><input type="password" id="authPwInput" placeholder="비밀번호' +
        (isSignup ? " (6자 이상)" : "") +
        '"></div>' +
        (isSignup ? '<div class="field"><input type="password" id="authPw2Input" placeholder="비밀번호 확인"></div>' : "") +
        '<div id="authError" style="color:var(--color-danger);font-size:13px;min-height:18px;margin-bottom:8px;"></div>' +
        '<button class="btn btn-primary" id="authGoBtn" style="width:100%">' +
        (isSignup ? "만들고 시작하기" : "로그인") +
        "</button>" +
        '<div style="text-align:center;margin-top:12px;font-size:13px;color:var(--color-text-faint);">' +
        (isSignup
          ? '아직 계정이 있다면 <a href="#" id="authSwitchLink">로그인</a>'
          : '처음이라면 <a href="#" id="authSwitchLink">낙서장 만들기</a>') +
        "</div>" +
        "</div>"
      );
    }

    function render() {
      overlay.innerHTML = html();
      var nameInput = overlay.querySelector("#authNameInput");
      var pwInput = overlay.querySelector("#authPwInput");
      var pw2Input = overlay.querySelector("#authPw2Input");
      var err = overlay.querySelector("#authError");

      function submit() {
        err.textContent = "";
        var name = nameInput.value;
        var pw = pwInput.value;
        if (mode === "signup") {
          if (pw !== (pw2Input && pw2Input.value)) {
            err.textContent = "비밀번호가 서로 달라요.";
            return;
          }
          Session.signUp(
            name,
            pw,
            function () {
              overlay.remove();
              if (onSuccess) onSuccess();
            },
            function (msg) {
              err.textContent = msg;
            }
          );
        } else {
          Session.logIn(
            name,
            pw,
            function () {
              overlay.remove();
              if (onSuccess) onSuccess();
            },
            function (msg) {
              err.textContent = msg;
            }
          );
        }
      }

      overlay.querySelector("#authGoBtn").addEventListener("click", submit);
      [nameInput, pwInput, pw2Input].forEach(function (el) {
        if (!el) return;
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter") submit();
        });
      });
      overlay.querySelector("#authSwitchLink").addEventListener("click", function (e) {
        e.preventDefault();
        mode = mode === "signup" ? "login" : "signup";
        render();
      });
    }

    render();
    document.body.appendChild(overlay);
  }

  return {
    isLoggedIn: isLoggedIn,
    uid: uid,
    accountName: accountName,
    lsKey: lsKey,
    path: path,
    register: register,
    onChange: onChange,
    requireLogin: requireLogin,
    openAuthModal: openAuthModal,
    signUp: signUp,
    logIn: logIn,
    logOut: logOut,
    ready: ready
  };
})();
