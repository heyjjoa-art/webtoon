// 인라인 SVG 아이콘 모음. 지금까지 이모지(✏️🧽🪣...)로 쓰던 아이콘을 이걸로
// 바꾼다 - 이모지는 OS/브라우저마다 모양이 달라서(윈도우·안드로이드·iOS가 전부
// 다르게 그림) "디자인툴 같다"는 인상을 깎아먹는 제일 쉬운 원인이었다.
//
// 의존성이 전혀 없는 순수 데이터 모듈이라(다른 어떤 전역도 참조하지 않음) 로드
// 순서에서 제일 앞에 둘 수 있다. 색은 항상 currentColor라 버튼의 color를
// 바꾸면(예: .tool-btn.active) 아이콘도 같이 바뀐다.
var Icons = (function () {
  "use strict";

  // 24x24 뷰박스, 획 기반(stroke) 라인 아이콘으로 통일한다. path만 갖고 있고
  // <svg> 래퍼는 svg()가 매번 씌운다 - 크기를 호출부에서 자유롭게 정할 수 있게.
  var PATHS = {
    brush:
      '<path d="M14.5 3.5c1 1 1 2.5 0 3.5L8 13.5l-3 1 1-3L12.5 5c1-1 2-1 2 1.5" /><path d="M6 14l-1.5 4.5c-.2.6.3 1.2.9 1L10 18" />',
    eraser:
      '<path d="M9.5 20H20" /><path d="M6.5 16.5l7-7a1.5 1.5 0 0 1 2.1 0l3.4 3.4a1.5 1.5 0 0 1 0 2.1l-5 5H8.5l-4-4a1.5 1.5 0 0 1 0-2.1z" />',
    fill:
      '<path d="M4 11l7-7 7 7-7 7-7-7z" /><path d="M11 4l6 6" /><path d="M17 13c0 1.5 1.2 2.5 1.2 4a1.2 1.2 0 0 1-2.4 0c0-1.5 1.2-2.5 1.2-4z" />',
    eyedropper:
      '<path d="M14.5 6.5l3 3" /><path d="M4 20l1-4 9-9 3 3-9 9-4 1z" /><path d="M15 5l1.5-1.5a2.1 2.1 0 0 1 3 3L18 8" />',
    select: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5" stroke-dasharray="3 2.4" />',
    lasso:
      '<path d="M12 4c-4.4 0-8 2.7-8 6 0 2.4 1.9 4.5 4.7 5.4-.4.8-.6 1.5-.6 2 0 1.1 1 2 2.4 2 1 0 1.9-.5 2.5-1.4" /><circle cx="17" cy="15.5" r="1.4" fill="currentColor" stroke="none" />',
    wand:
      '<path d="M4 20l9-9" /><path d="M15 5l1.3 1.3" /><path d="M11 3.5v2" /><path d="M17.5 6v2" /><path d="M19 9.5h2" /><path d="M14.5 3.5h2" />',
    transform:
      '<path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" /><path d="M7.5 7.5l9 9" /><rect x="8.5" y="8.5" width="7" height="7" rx="1" />',
    line: '<path d="M5 19L19 5" />',
    rect: '<rect x="4.5" y="6" width="15" height="12" rx="1.5" />',
    circle: '<circle cx="12" cy="12" r="7.5" />',
    focus:
      '<circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />',
    text: '<path d="M5 6h14" /><path d="M12 6v13" /><path d="M9 19h6" />',
    gradient: '<rect x="4" y="7" width="16" height="10" rx="2" /><path d="M4 12h16" opacity=".5" />',
    adjust:
      '<path d="M4 7h9M17 7h3" /><circle cx="14" cy="7" r="2" fill="currentColor" stroke="none" /><path d="M4 12h3M11 12h9" /><circle cx="8" cy="12" r="2" fill="currentColor" stroke="none" /><path d="M4 17h9M17 17h3" /><circle cx="14" cy="17" r="2" fill="currentColor" stroke="none" />',
    undo: '<path d="M7 8L4 11l3 3" /><path d="M4 11h10a5 5 0 0 1 0 10h-2" />',
    redo: '<path d="M17 8l3 3-3 3" /><path d="M20 11H10a5 5 0 0 0 0 10h2" />',
    trash: '<path d="M5 7h14" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M7 7l1 12.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5L17 7" /><path d="M10 11v6M14 11v6" />',
    plus: '<path d="M12 5v14M5 12h14" />',
    duplicate: '<rect x="4.5" y="4.5" width="12" height="12" rx="1.5" /><path d="M8.5 19.5H16a3.5 3.5 0 0 0 3.5-3.5V8.5" />',
    merge: '<path d="M8 4v9a3 3 0 0 0 3 3h5" /><path d="M13 13l3 3-3 3" /><path d="M16 4v6" />',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" />',
    eyeOff:
      '<path d="M3 3l18 18" /><path d="M10.6 5.7A10.5 10.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.7 15.7 0 0 1-3.1 3.9M6.7 6.7C4.2 8.3 2.5 10.9 2.5 12c0 0 3.5 6.5 9.5 6.5 1.6 0 3-.4 4.2-1.1" /><path d="M9.6 9.6a2.6 2.6 0 0 0 3.7 3.7" />',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="1.8" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />',
    unlock: '<rect x="5.5" y="10.5" width="13" height="9" rx="1.8" /><path d="M8 10.5V8a4 4 0 0 1 7.4-2.1" />',
    clip: '<path d="M8 4a4 4 0 0 1 8 0v9a2 2 0 0 1-4 0V7" /><rect x="5" y="12" width="7" height="8" rx="1.5" />',
    chevronUp: '<path d="M5 15l7-7 7 7" />',
    chevronDown: '<path d="M5 9l7 7 7-7" />',
    close: '<path d="M6 6l12 12M18 6L6 18" />',
    check: '<path d="M4.5 12.5l5 5 10-11" />',
    back: '<path d="M15 19l-7-7 7-7" />',
    bubble:
      '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />',
    narration: '<rect x="4" y="6" width="16" height="12" rx="1" /><path d="M7.5 10h9M7.5 14h6" />',
    sfx: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" /><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />',
    photo: '<rect x="3.5" y="5" width="17" height="14" rx="1.8" /><circle cx="9" cy="10.5" r="1.6" /><path d="M20 15l-4.5-4.5-3 3-2-2L4 17.5" />',
    zoomIn: '<circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.3 15.3L20 20" /><path d="M10.5 7.5v6M7.5 10.5h6" />',
    zoomOut: '<circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.3 15.3L20 20" /><path d="M7.5 10.5h6" />',
    zoomFit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />',
    rotateReset: '<path d="M4 12a8 8 0 1 1 2.6 5.9" /><path d="M4 20v-5h5" />',
    menu: '<path d="M4 7h16M4 12h16M4 17h16" />',
    palette:
      '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a4 4 0 0 0 4-4c0-4.5-3.6-8.2-8-8.2z" /><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="9.5" cy="7" r="1.1" fill="currentColor" stroke="none" /><circle cx="14" cy="7" r="1.1" fill="currentColor" stroke="none" />',
    alignLeft: '<path d="M4 4v16" /><rect x="7" y="6" width="10" height="4" rx="1" /><rect x="7" y="14" width="6" height="4" rx="1" />',
    alignCenterH: '<path d="M12 4v16" /><rect x="6" y="6" width="12" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" />',
    alignRight: '<path d="M20 4v16" /><rect x="7" y="6" width="10" height="4" rx="1" /><rect x="11" y="14" width="6" height="4" rx="1" />',
    alignTop: '<path d="M4 4h16" /><rect x="6" y="7" width="4" height="10" rx="1" /><rect x="14" y="7" width="4" height="6" rx="1" />',
    alignMiddleV: '<path d="M4 12h16" /><rect x="6" y="6" width="4" height="12" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" />',
    alignBottom: '<path d="M4 20h16" /><rect x="6" y="7" width="4" height="10" rx="1" /><rect x="14" y="11" width="4" height="6" rx="1" />',
    distributeH: '<rect x="3" y="8" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="8" rx="1" /><rect x="17" y="8" width="4" height="8" rx="1" />',
    save: '<path d="M5 4.5h11l3 3V19a.5.5 0 0 1-.5.5H5A.5.5 0 0 1 4.5 19V5a.5.5 0 0 1 .5-.5z" /><path d="M8 4.5V9h7V4.5" /><path d="M7.5 14h9" />',
    bringFront: '<rect x="8" y="8" width="11" height="11" rx="1.5" fill="var(--color-surface, #fff)" /><rect x="5" y="5" width="11" height="11" rx="1.5" />',
    sendBack: '<rect x="5" y="5" width="11" height="11" rx="1.5" fill="var(--color-surface, #fff)" /><rect x="8" y="8" width="11" height="11" rx="1.5" />',
    cloud: '<path d="M7 18a4 4 0 0 1-.6-7.9A5 5 0 0 1 16 8.5a3.8 3.8 0 0 1 1 7.5" />',
    help: '<circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.4a2.2 2.2 0 1 1 3.4 1.8c-.8.5-1.2 1-1.2 1.9" /><circle cx="12" cy="16.5" r="0.2" fill="currentColor" stroke="none" />'
  };

  function svg(name, size, extraClass) {
    var body = PATHS[name] || PATHS.help;
    size = size || 20;
    return (
      '<svg class="icon' +
      (extraClass ? " " + extraClass : "") +
      '" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body +
      "</svg>"
    );
  }

  return { svg: svg, has: function (name) { return Object.prototype.hasOwnProperty.call(PATHS, name); } };
})();
