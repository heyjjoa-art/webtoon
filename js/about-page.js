(function () {
  "use strict";

  var root = document.getElementById("aboutRoot");
  var photoInput = document.getElementById("aboutPhotoInput");
  var friendPhotoInput = document.getElementById("friendPhotoInput");
  var editingBio = false;
  var editingFriendId = null;
  var friendPhotoTargetId = null;

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function fileToDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderFriendsSection(isAdmin) {
    var friends = FriendsStore.getFriends();
    var canAdd = isAdmin && friends.length < FriendsStore.MAX_FRIENDS;

    return (
      '<div class="friends-section">' +
      '<div class="friends-header"><h2>친구소개</h2>' +
      (canAdd ? '<button class="btn btn-ghost btn-sm" id="friendAddBtn">+ 친구 추가</button>' : "") +
      "</div>" +
      (friends.length
        ? '<div class="friends-grid">' + friends.map(function (f) { return renderFriendCard(f, isAdmin); }).join("") + "</div>"
        : '<div class="about-bio about-bio-empty">아직 등록된 친구가 없어요.</div>') +
      (isAdmin ? '<div class="friends-count">' + friends.length + " / " + FriendsStore.MAX_FRIENDS + "</div>" : "") +
      "</div>"
    );
  }

  function renderFriendCard(f, isAdmin) {
    if (isAdmin && editingFriendId === f.id) {
      return (
        '<div class="friend-card friend-card-editing" data-id="' + f.id + '">' +
        '<div class="friend-avatar" id="friend-avatar-' + f.id + '">' + escapeHtml(f.emoji || "🐾") + "</div>" +
        '<button class="btn btn-ghost btn-sm friend-photo-btn" data-id="' + f.id + '">📷 사진 바꾸기</button>' +
        '<div class="field"><input type="text" class="friend-name-input" data-id="' + f.id + '" value="' + escapeHtml(f.name) + '" placeholder="이름"></div>' +
        '<div class="field"><input type="text" class="friend-note-input" data-id="' + f.id + '" value="' + escapeHtml(f.note || "") + '" placeholder="한마디 소개"></div>' +
        '<div class="field"><input type="text" class="friend-personality-input" data-id="' + f.id + '" value="' + escapeHtml(f.personality || "") + '" placeholder="성격(예: 다정함, 씩씩함, 장난꾸러기, 무뚝뚝함...) - 댓글 말투에 반영돼요"></div>' +
        '<button class="btn btn-primary btn-sm friend-save-btn" data-id="' + f.id + '">저장</button> ' +
        '<button class="btn btn-ghost btn-sm friend-cancel-btn" data-id="' + f.id + '">취소</button>' +
        "</div>"
      );
    }
    return (
      '<div class="friend-card" data-id="' + f.id + '">' +
      '<div class="friend-avatar" id="friend-avatar-' + f.id + '">' + escapeHtml(f.emoji || "🐾") + "</div>" +
      '<div class="friend-name">' + escapeHtml(f.name) + "</div>" +
      (f.note ? '<div class="friend-note">' + escapeHtml(f.note) + "</div>" : "") +
      (f.personality ? '<div class="friend-personality">성격: ' + escapeHtml(f.personality) + "</div>" : "") +
      (isAdmin
        ? '<button class="btn btn-ghost btn-sm friend-edit-btn" data-id="' + f.id + '">✏️ 수정</button> ' +
          '<button class="btn btn-ghost btn-sm friend-remove-btn" data-id="' + f.id + '">🗑️ 삭제</button>'
        : "") +
      "</div>"
    );
  }

  function bindFriendEvents(isAdmin) {
    var friends = FriendsStore.getFriends();
    friends.forEach(function (f) {
      PanelArtStore.loadPanel("friend", f.id).then(function (art) {
        var avatar = document.getElementById("friend-avatar-" + f.id);
        if (!avatar || !art) return;
        var img = document.createElement("img");
        img.src = art.image;
        avatar.innerHTML = "";
        avatar.appendChild(img);
      });
    });

    if (!isAdmin) return;

    var addBtn = document.getElementById("friendAddBtn");
    if (addBtn) addBtn.addEventListener("click", function () {
      var friend = FriendsStore.addFriend({ name: "새 친구", note: "" });
      if (!friend) return;
      editingFriendId = friend.id;
      render();
    });

    root.querySelectorAll(".friend-edit-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        editingFriendId = btn.dataset.id;
        render();
      });
    });

    root.querySelectorAll(".friend-cancel-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        editingFriendId = null;
        render();
      });
    });

    root.querySelectorAll(".friend-save-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.id;
        var name = root.querySelector('.friend-name-input[data-id="' + id + '"]').value;
        var note = root.querySelector('.friend-note-input[data-id="' + id + '"]').value;
        var personality = root.querySelector('.friend-personality-input[data-id="' + id + '"]').value;
        FriendsStore.updateFriend(id, { name: name.trim() || "이름 없음", note: note.trim(), personality: personality.trim() });
        editingFriendId = null;
        render();
      });
    });

    root.querySelectorAll(".friend-remove-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.id;
        var friend = friends.find(function (f) { return f.id === id; });
        if (!confirm('"' + ((friend && friend.name) || "이 친구") + '"를 삭제할까요? 되돌릴 수 없어요.')) return;
        FriendsStore.removeFriend(id);
        editingFriendId = null;
        render();
      });
    });

    root.querySelectorAll(".friend-photo-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        friendPhotoTargetId = btn.dataset.id;
        friendPhotoInput.click();
      });
    });
  }

  function renderLoggedOut() {
    root.innerHTML =
      '<div class="about-bio about-bio-empty" style="text-align:center;padding:40px 20px;">' +
      "로그인하면 나만의 소개 페이지를 만들 수 있어요." +
      '<div style="margin-top:14px;"><button class="btn btn-primary btn-sm" id="aboutLoginBtn">로그인 / 낙서장 만들기</button></div>' +
      "</div>";
    document.getElementById("aboutLoginBtn").addEventListener("click", function () {
      Session.openAuthModal(function () {});
    });
  }

  function render() {
    var isAdmin = Session.isLoggedIn();
    if (!isAdmin) {
      renderLoggedOut();
      return;
    }
    var bioRecord = AboutStore.getBio();

    root.innerHTML =
      '<div class="about-photo-frame" id="aboutPhotoFrame">📷</div>' +
      (isAdmin
        ? '<button class="btn btn-ghost btn-sm about-photo-edit-btn" id="aboutPhotoBtn">📷 사진 바꾸기</button>'
        : "") +
      (editingBio
        ? '<div class="about-edit-form">' +
          '<div class="field"><textarea id="aboutBioInput" placeholder="나를 소개하는 글을 써보세요">' +
          escapeHtml(bioRecord.bio) +
          "</textarea></div>" +
          '<button class="btn btn-primary btn-sm" id="aboutBioSaveBtn">저장</button> ' +
          '<button class="btn btn-ghost btn-sm" id="aboutBioCancelBtn">취소</button>' +
          "</div>"
        : (bioRecord.bio
            ? '<div class="about-bio">' + escapeHtml(bioRecord.bio) + "</div>"
            : '<div class="about-bio about-bio-empty">' +
              (isAdmin ? "아직 소개글이 없어요. 적어보세요!" : "아직 소개글이 없어요.") +
              "</div>") +
          (isAdmin ? '<button class="btn btn-ghost btn-sm" id="aboutBioEditBtn" style="margin-top:12px;">✏️ 소개글 수정</button>' : "")) +
      renderFriendsSection(isAdmin) +
      (isAdmin
        ? '<div class="admin-settings">' +
          '<button class="btn btn-ghost btn-sm" id="siteNameBtn">✏️ 낙서장 이름 바꾸기</button> ' +
          '<button class="btn btn-ghost btn-sm" id="legacyImportBtn">📦 기존 낙서장 내용 가져오기</button>' +
          "</div>"
        : "");

    PanelArtStore.loadPanel("about", "photo").then(function (art) {
      var frame = document.getElementById("aboutPhotoFrame");
      if (!frame || !art) return;
      var img = document.createElement("img");
      img.src = art.image;
      frame.insertBefore(img, frame.firstChild);
    });

    if (isAdmin) {
      var photoBtn = document.getElementById("aboutPhotoBtn");
      if (photoBtn) photoBtn.addEventListener("click", function () {
        photoInput.click();
      });
      if (editingBio) {
        document.getElementById("aboutBioSaveBtn").addEventListener("click", function () {
          AboutStore.saveBio(document.getElementById("aboutBioInput").value.trim());
          editingBio = false;
          render();
        });
        document.getElementById("aboutBioCancelBtn").addEventListener("click", function () {
          editingBio = false;
          render();
        });
      } else {
        var editBtn = document.getElementById("aboutBioEditBtn");
        if (editBtn) editBtn.addEventListener("click", function () {
          editingBio = true;
          render();
        });
      }
      document.getElementById("siteNameBtn").addEventListener("click", function () {
        var next = window.prompt("낙서장 제목에 쓸 이름을 입력하세요", ProfileStore.getSiteName());
        if (next === null) return;
        ProfileStore.saveSiteName(next);
      });
      document.getElementById("legacyImportBtn").addEventListener("click", function () {
        LegacyImport.run();
      });
    }

    bindFriendEvents(isAdmin);
  }

  photoInput.addEventListener("change", function () {
    var file = photoInput.files && photoInput.files[0];
    photoInput.value = "";
    if (!file) return;
    fileToDataURL(file).then(function (dataUrl) {
      return PanelArtStore.savePanel("about", "photo", dataUrl);
    }).then(render);
  });

  friendPhotoInput.addEventListener("change", function () {
    var file = friendPhotoInput.files && friendPhotoInput.files[0];
    friendPhotoInput.value = "";
    if (!file || !friendPhotoTargetId) return;
    var targetId = friendPhotoTargetId;
    fileToDataURL(file).then(function (dataUrl) {
      return PanelArtStore.savePanel("friend", targetId, dataUrl);
    }).then(render);
  });

  window.__webtoonOnAboutChanged = render;
  window.__webtoonOnFriendsChanged = render;
  Session.onChange(render);
})();
