// 컷(.tn-panel)·텍스트(.tn-text)를 DOM으로 만드는 공용 렌더러.
// js/editor.js(작성)와 js/reader.js(독자)가 똑같은 함수로 똑같은 마크업을
// 만들게 해서, "편집기에서 본 대로 독자에게 보인다"를 구조적으로 보장한다.
//
// 이 파일은 Session/Cloud/PanelArtStore 등 다른 어떤 전역도 모른다 - 그림을
// 언제 어떻게 불러올지(즉시 vs IntersectionObserver로 지연)는 호출부의
// 정책이라 applyArt()는 "이미 가진 art 객체를 엘리먼트에 앉히기"만 한다.
// 그래서 icons.js 바로 다음, Session/Cloud/Store들보다도 먼저 로드해도 된다.
var ToonRender = (function () {
  "use strict";

  // 텍스트에는 높이 필드가 없어(내용에 따라 자동으로 늘어남) 정확한 높이를
  // 알 수 없다 - 대략 40px로 잡는다. 편집기가 예전부터 쓰던 근사치를 그대로
  // 가져와서(editor.js의 옛 contentBottom) 양쪽이 같은 값을 쓰게 만든다.
  var TEXT_APPROX_H = 40;
  // 캔버스 아래쪽 여백 - 마지막 컷/텍스트 바로 아래에서 편집이 답답하지 않게.
  var BOTTOM_PAD = 200;
  var STYLE_CLASSES = ["style-bubble", "style-narration", "style-sfx"];
  // 말풍선/나레이션/효과음 글꼴 선택지 - 편집기(속성 패널의 <select>)와
  // 렌더러(positionText)가 이 하나의 목록만 보고 같은 글꼴을 그리게 한다.
  var FONT_OPTIONS = [
    { key: "default", label: "기본", css: "" },
    { key: "title", label: "타이틀체", css: "var(--font-display)" },
    { key: "impact", label: "임팩트", css: "var(--font-impact)" },
    { key: "hand", label: "손글씨", css: "var(--font-hand)" }
  ];
  function fontCss(key) {
    var found = null;
    FONT_OPTIONS.forEach(function (f) {
      if (f.key === key) found = f;
    });
    return found ? found.css : "";
  }

  // 컷 모양(사각형 외의 대각선/평행사변형 등) - clip-path는 %라 어떤 크기의
  // 컷에도 그대로 맞는다. 편집기(속성 패널)와 렌더러가 이 목록 하나만 본다.
  var SHAPE_OPTIONS = [
    { key: "rect", label: "사각형", clip: "" },
    { key: "para-r", label: "평행사변형 ↗", clip: "polygon(12% 0%, 100% 0%, 88% 100%, 0% 100%)" },
    { key: "para-l", label: "평행사변형 ↖", clip: "polygon(0% 0%, 88% 0%, 100% 100%, 12% 100%)" },
    { key: "diag-tl", label: "대각선(위)", clip: "polygon(0% 18%, 100% 0%, 100% 100%, 0% 100%)" },
    { key: "diag-br", label: "대각선(아래)", clip: "polygon(0% 0%, 100% 0%, 100% 82%, 0% 100%)" }
  ];
  function clipPathFor(key) {
    var found = null;
    SHAPE_OPTIONS.forEach(function (s) {
      if (s.key === key) found = s;
    });
    return (found && found.clip) || "";
  }

  function contentBottom(episode) {
    var maxY = 0;
    (episode.panels || []).forEach(function (p) {
      maxY = Math.max(maxY, p.y + p.h);
    });
    (episode.texts || []).forEach(function (t) {
      maxY = Math.max(maxY, t.y + TEXT_APPROX_H);
    });
    return maxY;
  }

  // 실제 표시 높이(ch)는 저장된 canvasHeight와 "지금 배치된 내용이 차지하는
  // 높이" 중 큰 쪽이다 - 편집기가 setState 없이 캔버스를 늘려온 옛 동작과,
  // 독자가 항상 canvasHeight만 믿던 옛 동작이 서로 어긋나던 것(R1)의 근본
  // 수정이다: 이제 둘 다 이 함수 하나로 ch를 계산한다.
  function metrics(episode) {
    var cw = episode.canvasWidth || 900;
    var ch = Math.max(episode.canvasHeight || 1200, contentBottom(episode) + BOTTOM_PAD);
    return { cw: cw, ch: ch };
  }

  function pct(value, base) {
    return (value / base) * 100 + "%";
  }

  function placeholderHtml() {
    return '<div class="tn-placeholder">' + Icons.svg("photo", 28) + "</div>";
  }

  // 새로 만들 때든(panelEl) 기존 엘리먼트를 갱신할 때든(편집기의 조정 렌더링)
  // 위치·모양 계산은 완전히 같아야 두 경로가 어긋나지 않는다 - 그래서 이
  // "포지셔닝"만 따로 뗀 함수로 둔다. 클래스는 base만 여기서 정하고,
  // "selected" 같은 편집기 전용 상태는 호출부가 따로 toggle한다.
  function positionPanel(el, p, m) {
    el.classList.toggle("fit-contain", p.fit === "contain");
    el.classList.toggle("has-border", !!p.border);
    el.style.left = pct(p.x, m.cw);
    el.style.top = pct(p.y, m.ch);
    el.style.width = pct(p.w, m.cw);
    el.style.height = pct(p.h, m.ch);
    el.style.zIndex = String(p.z || 0);
    el.style.setProperty("--tn-radius", String(p.radius || 0));
    el.style.clipPath = clipPathFor(p.shape);
  }

  function positionText(el, t, m) {
    el.classList.add("tn-text");
    STYLE_CLASSES.forEach(function (c) {
      el.classList.remove(c);
    });
    el.classList.add("style-" + (t.style || "bubble"));
    // 굵게+외곽선은 배경 유무와 독립된 별도 필드(punch)다 - 값이 없는 옛
    // 회차는 "배경없음(sfx)"이면 원래 항상 이 효과가 켜져 있었던 것과 같게
    // 기본값을 맞춘다(그래야 예전에 만든 효과음 텍스트가 그대로 보인다).
    el.classList.toggle("punch", t.punch != null ? !!t.punch : t.style === "sfx");
    el.style.left = pct(t.x, m.cw);
    el.style.top = pct(t.y, m.ch);
    el.style.width = pct(t.w, m.cw);
    el.style.textAlign = t.align || "center";
    el.style.zIndex = String(t.z != null ? t.z : 900);
    el.style.fontFamily = fontCss(t.font);
    el.style.setProperty("--tn-size", String(t.size || 16));
    el.style.color = t.color || "";
  }

  function panelEl(p, m) {
    var el = document.createElement("div");
    el.className = "tn-panel";
    el.dataset.id = p.id;
    el.innerHTML = placeholderHtml();
    positionPanel(el, p, m);
    return el;
  }

  function textEl(t, m) {
    var el = document.createElement("div");
    el.dataset.id = t.id;
    positionText(el, t, m);
    el.textContent = t.text || "";
    return el;
  }

  // 컷 안에 실제 그림을 앉힌다. art가 없으면(아직 안 그림/못 불러옴) 자리
  // 표시자를 그대로 둔다. 언제 부를지(즉시 vs 지연)는 호출부가 정한다.
  function applyArt(el, art) {
    if (!art || !art.image) return;
    var ph = el.querySelector(".tn-placeholder");
    if (ph) ph.remove();
    var img = el.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      img.alt = "";
      el.appendChild(img);
    }
    if (img.src !== art.image) img.src = art.image;
  }

  // 컨테이너(#editorCanvas/#panelCanvas)의 실제 렌더 폭을 재서 배율을 구한다.
  // 위치는 %로 그려서 배율과 무관하지만, radius/글자크기는 "논리 캔버스에서
  // 몇 px인가"를 화면 px로 다시 환산해야 해서 필요하다.
  function currentScale(containerEl, cw) {
    var w = containerEl.getBoundingClientRect().width;
    return w > 0 ? w / cw : 1;
  }

  // 컨테이너 크기가 바뀔 때마다(창 크기 조절, 모바일 회전 등) --tn-scale
  // 변수만 갱신한다 - DOM을 다시 만들지 않으므로 편집기의 옛
  // "window.resize -> render() 전체 재구축"(E8/E2)이 필요 없어진다. 리더가
  // 예전에 쓰던 rescaleText()의 역할도 이 하나로 합쳐진다.
  function watchScale(containerEl, cw) {
    function update() {
      containerEl.style.setProperty("--tn-scale", String(currentScale(containerEl, cw)));
    }
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return function () {
        window.removeEventListener("resize", update);
      };
    }
    var ro = new ResizeObserver(update);
    ro.observe(containerEl);
    return function () {
      ro.disconnect();
    };
  }

  // 컨테이너에 종횡비를 앉힌다 - 이후 창 크기가 바뀌어도 브라우저가 알아서
  // 높이를 다시 계산해서(JS 개입 없이) %로 배치된 자식들이 항상 맞게 보인다.
  function applySceneSize(containerEl, m) {
    containerEl.classList.add("tn-scene");
    containerEl.style.aspectRatio = m.cw + " / " + m.ch;
  }

  return {
    FONT_OPTIONS: FONT_OPTIONS,
    SHAPE_OPTIONS: SHAPE_OPTIONS,
    contentBottom: contentBottom,
    metrics: metrics,
    panelEl: panelEl,
    textEl: textEl,
    positionPanel: positionPanel,
    positionText: positionText,
    applyArt: applyArt,
    currentScale: currentScale,
    watchScale: watchScale,
    applySceneSize: applySceneSize
  };
})();
