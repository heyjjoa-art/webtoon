// 범용 스냅샷 되돌리기 스택. 컷 편집기의 회차 상태(컷·텍스트 배열)는 몇
// KB밖에 안 되고, editor.js 안에 이미 상태를 바꾸는 지점이 여기저기 흩어져
// 있어서(드래그·리사이즈·속성 패널·삭제·복제...) 그 하나하나를 "커맨드"로
// 감싸는 것보다, 매번 상태 전체를 JSON으로 찍어 쌓아두는 쪽이 훨씬 안전하고
// 빠뜨릴 여지가 없다. 그림판(js/paint-core.js)의 픽셀 단위 되돌리기와는
// 완전히 별개 - 이건 "레이아웃 상태" 전용이다.
//
// 사용법: 상태가 바뀔 만한 지점마다 commit()을 한 번 부른다. 슬라이더
// 드래그나 타이핑처럼 같은 동작이 짧은 시간에 여러 번 반복되면, 매번 같은
// label을 넘겨서 "그 동작 전체"가 되돌리기 한 칸에 담기게 한다(예:
// "text:"+id) - 그러면 글자 하나마다가 아니라 입력 덩어리 단위로 되돌아간다.
// 드래그처럼 끝날 때 한 번만 부르는 동작은 label 없이 그냥 commit()하면 된다.
var UndoStack = (function () {
  "use strict";

  function create(getState, setState, cap) {
    cap = cap || 100;
    var stack = [{ label: null, json: JSON.stringify(getState()) }];
    var index = 0;

    function commit(label) {
      var json = JSON.stringify(getState());
      if (json === stack[index].json) return false; // 실제로 바뀐 게 없으면 기록하지 않는다
      if (label && stack[index].label === label) {
        // 같은 라벨이 연속되면(타이핑/슬라이더 드래그 중) 이번 스냅샷으로
        // 덮어쓴다 - 되돌리기 대상은 그 동작이 "시작하기 전" 상태 그대로
        // index-1에 남아있으므로 그대로 유지된다.
        stack[index] = { label: label, json: json };
        return true;
      }
      stack = stack.slice(0, index + 1);
      stack.push({ label: label || null, json: json });
      if (stack.length > cap) stack.shift();
      index = stack.length - 1;
      return true;
    }

    function undo() {
      if (index <= 0) return false;
      index--;
      setState(JSON.parse(stack[index].json));
      return true;
    }

    function redo() {
      if (index >= stack.length - 1) return false;
      index++;
      setState(JSON.parse(stack[index].json));
      return true;
    }

    function canUndo() {
      return index > 0;
    }

    function canRedo() {
      return index < stack.length - 1;
    }

    // 회차를 새로 불러오는 등 "지금 상태를 새 기준선으로 삼고 싶을 때".
    function reset() {
      stack = [{ label: null, json: JSON.stringify(getState()) }];
      index = 0;
    }

    return { commit: commit, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo, reset: reset };
  }

  return { create: create };
})();
