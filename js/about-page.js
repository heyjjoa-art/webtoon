(function () {
  "use strict";

  var root = document.getElementById("aboutRoot");
  var photoInput = document.getElementById("aboutPhotoInput");
  var editingBio = false;

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

  function render() {
    var isAdmin = AdminAuth.isActive();
    var bioRecord = AboutStore.getBio();

    root.innerHTML =
      '<div class="about-photo-frame" id="aboutPhotoFrame">📷' +
      (isAdmin
        ? '<button class="btn btn-primary btn-sm about-photo-edit-btn" id="aboutPhotoBtn">📷 사진 바꾸기</button>'
        : "") +
      "</div>" +
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
          (isAdmin ? '<button class="btn btn-ghost btn-sm" id="aboutBioEditBtn" style="margin-top:12px;">✏️ 소개글 수정</button>' : ""));

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
    }
  }

  photoInput.addEventListener("change", function () {
    var file = photoInput.files && photoInput.files[0];
    photoInput.value = "";
    if (!file) return;
    fileToDataURL(file).then(function (dataUrl) {
      return PanelArtStore.savePanel("about", "photo", dataUrl);
    }).then(render);
  });

  window.__onAdminLogin = render;
  window.__webtoonOnAboutChanged = render;
  render();
})();
