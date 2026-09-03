// AI 팬 댓글. 이 사이트는 서버가 없는 정적 사이트라 진짜 사람도, 외부 API도 없다
// (비용도, 지연도, 실패 처리도 없다는 뜻). 대신 회차 id로부터 "결정론적으로" 댓글을
// 만들어낸다 - 같은 회차라면 어느 기기·어느 방문자가 언제 열어도 항상 같은 댓글이,
// 같은 순서로, 같은 시점에 나타난다. 저장도 안 하고 매번 계산만 한다.
var Fans = (function () {
  // 캐릭터마다 말투 어미와 자주 쓰는 슬롯이 달라야 "댓글창에 진짜 여러 사람이
  // 있다"는 느낌이 난다. templates 안의 {제목}{N번컷}{컷수}{태그}{대사}는
  // fillTemplate에서 실제 값으로 치환된다.
  var FANS = [
    {
      id: "yeol",
      name: "열정만렙",
      emoji: "🔥",
      templates: [
        "미쳤다 진짜... {제목} 이번화 최고예요!!!",
        "{N번컷} 보고 소리질렀어요 ㄹㅇ",
        "작가님 천재세요 이번화도 걸작입니다 🔥🔥",
        "일어나자마자 보는 중인데 심장 나갈 뻔"
      ]
    },
    {
      id: "bunseok",
      name: "구도분석러",
      emoji: "🔍",
      templates: [
        "{N번컷} 구도 잡는 방식이 진짜 영화적이네요",
        "{컷수}컷 호흡 조절 절묘합니다. 특히 마지막 컷 여백 처리 좋아요",
        "색감이랑 톤이 이번화 분위기랑 딱 맞아떨어져요",
        "선 처리 보면 볼수록 디테일이 살아있어요"
      ]
    },
    {
      id: "deurip",
      name: "드립력만렙",
      emoji: "😂",
      templates: [
        "{N번컷} 저거 저 이번주 제 상태인데요??",
        "아니 작가님 저를 어떻게 아세요 ㅋㅋㅋㅋ",
        "이거 보고 회사에서 혼자 웃음 참았습니다",
        "{제목} 이거 실화냐고요 ㅋㅋㅋㅋㅋㅋ"
      ]
    },
    {
      id: "geokjeong",
      name: "걱정인형",
      emoji: "😟",
      templates: [
        "잠깐만요... 주인공 이제 괜찮은 거 맞죠?? 너무 걱정돼요",
        "{N번컷} 보고 심장 철렁했어요... 다음화 빨리 주세요",
        "이러다 무슨 일 생기는 거 아니겠죠 ㅠㅠ 제발요",
        "밤새 이 생각만 날 것 같아요..."
      ]
    },
    {
      id: "paenart",
      name: "팬아트장인",
      emoji: "🎨",
      templates: [
        "이번화 보고 팬아트 그리고 싶어져요 특히 {N번컷}",
        "{제목} 세계관 색감 팔레트 진짜 예뻐요",
        "이 장면 꼭 그려서 올릴게요 기다려주세요!",
        "선화만 봐도 감탄나옵니다..."
      ]
    },
    {
      id: "matchumbeop",
      name: "맞춤법요정",
      emoji: "📝",
      templates: [
        "{N번컷} 대사 오타 있는 거 같아요! 확인 부탁드려요",
        "내용 넘 재밌게 봤습니다, 사소한 오타 하나 발견!",
        "항상 꼼꼼히 챙겨주셔서 감사해요 오늘도 잘 봤습니다",
        "번역투 하나 살짝 걸리네요 그래도 재밌어요"
      ]
    },
    {
      id: "nunmul",
      name: "눈물버튼",
      emoji: "😭",
      templates: [
        "{N번컷}에서 그냥 울어버렸어요 ㅠㅠㅠㅠ",
        "왜 이렇게 슬픈 장면을 이렇게 예쁘게 그리시는 거예요...",
        "{제목} 보면서 계속 눈물 훔치고 있습니다",
        "마지막 대사 \"{대사}\" 보고 무너졌어요"
      ]
    },
    {
      id: "iron",
      name: "이론충",
      emoji: "🧠",
      templates: [
        "{N번컷} 복선인 것 같은데... 다음화에서 터질 듯",
        "이거 초반 {태그} 떡밥이랑 이어지는 거 아닐까요??",
        "제 추측이지만 다음화에 반전 있을 것 같습니다",
        "다시 정주행하면서 복선 찾는 중이에요 소름"
      ]
    },
    {
      id: "goinmul",
      name: "조용한고인물",
      emoji: "🌙",
      templates: [
        "오늘도 잘 보고 갑니다.",
        "꾸준히 챙겨보고 있어요. 항상 감사합니다.",
        "이번화도 좋았어요.",
        "{제목} 연재 응원합니다."
      ]
    },
    {
      id: "sinip",
      name: "정주행신입",
      emoji: "🆕",
      templates: [
        "정주행하다가 실시간 정주행 합류했습니다!! 반갑습니다",
        "1화부터 정주행했는데 이번화 진짜 재밌네요",
        "이제야 이 작품 발견해서 억울해요 왜 이제 봤을까요",
        "{제목} 완전 제 취향이에요, 정주행 완료!"
      ]
    },
    {
      id: "yeongeop",
      name: "영업왕",
      emoji: "📢",
      templates: [
        "이거 친구들한테 다 영업했어요 다들 좋아해요",
        "단톡방에 공유했습니다, 다들 정주행 시작함 ㅋㅋ",
        "{제목} 왜 아직 안 본 사람이 있지 다들 보세요",
        "이번화는 특히 영업하기 좋은 화였어요"
      ]
    },
    {
      id: "jimok",
      name: "특정컷지목러",
      emoji: "📌",
      templates: [
        "{N번컷} 이거 캡처해서 배경화면 했어요",
        "{N번컷}만 열 번 넘게 돌려봤습니다",
        "다들 {N번컷} 보고 오세요 인생컷입니다",
        "{N번컷}에 진심으로 소름돋았어요"
      ]
    }
  ];

  var REPLY_TEMPLATES = [
    "저도 완전 공감이요 {닉네임}님!",
    "ㅋㅋㅋㅋ 맞아요 {닉네임}님 말이 맞음",
    "오 그거 저도 생각했어요",
    "{닉네임}님 댓글 보고 다시 봤는데 진짜 그러네요",
    "저는 다르게 봤는데 그것도 일리 있네요"
  ];

  // 문자열 → 32비트 정수 시드 (djb2 변형). 회차 id가 조금만 달라도(ep-1 vs ep-2)
  // 전혀 다른 댓글 조합이 나오도록 섞는다.
  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32: 시드 하나로 재현 가능한 0~1 난수를 계속 뽑아내는 작은 PRNG.
  // Math.random을 쓰면 방문할 때마다 댓글이 바뀌어버려서 "실제 팬"처럼 안 느껴진다.
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rand, arr) {
    return arr[Math.floor(rand() * arr.length)];
  }

  function fillTemplate(tpl, ctx) {
    return tpl
      .replace(/\{제목\}/g, ctx.title || "이번화")
      .replace(/\{N번컷\}/g, ctx.panelNo + "번컷")
      .replace(/\{컷수\}/g, String(ctx.panelCount))
      .replace(/\{태그\}/g, ctx.tag || "이 작품")
      .replace(/\{대사\}/g, ctx.lastLine || "…");
  }

  function lastLine(episode) {
    var texts = episode.texts || [];
    if (!texts.length) return "";
    return String(texts[texts.length - 1].text || "").slice(0, 24);
  }

  // 회차 하나에 대한 전체 댓글 트리(부모+답글)를 결정론적으로 만든다. delayMinutes는
  // "발행 시각으로부터 몇 분 뒤에 이 댓글이 보일지"이고, 0~48시간 사이에 앞쪽으로
  // 쏠리게(막 올라온 화일수록 몰리고, 시간이 지날수록 뜸해지게) 분포시킨다.
  function generateComments(episode) {
    var panelCount = (episode.panels || []).length || 1;
    var ctx = {
      title: episode.title,
      panelCount: panelCount,
      panelNo: 1,
      tag: (episode.tags || [])[0],
      lastLine: lastLine(episode)
    };
    var rand = mulberry32(hashString(episode.id + "::" + (episode.title || "")));
    var participantCount = 6 + Math.floor(rand() * 6); // 6~11명
    var shuffled = FANS.slice().sort(function () {
      return rand() - 0.5;
    });
    var participants = shuffled.slice(0, participantCount);

    var comments = [];
    participants.forEach(function (fan, idx) {
      var tpl = pick(rand, fan.templates);
      var localCtx = Object.assign({}, ctx, { panelNo: 1 + Math.floor(rand() * panelCount) });
      // rand()^2.2 로 앞쪽(빨리 다는 사람)에 쏠리게 만든다 - 실제 댓글창처럼.
      var delayMinutes = Math.round(Math.pow(rand(), 2.2) * 48 * 60);
      var comment = {
        id: episode.id + "-c" + idx,
        fanId: fan.id,
        name: fan.name,
        emoji: fan.emoji,
        text: fillTemplate(tpl, localCtx),
        delayMinutes: delayMinutes,
        likes: Math.floor(rand() * 40),
        parentId: null
      };
      comments.push(comment);

      if (rand() < 0.35) {
        var replier = pick(
          rand,
          FANS.filter(function (f) {
            return f.id !== fan.id;
          })
        );
        comments.push({
          id: comment.id + "-r",
          fanId: replier.id,
          name: replier.name,
          emoji: replier.emoji,
          text: pick(rand, REPLY_TEMPLATES).replace(/\{닉네임\}/g, fan.name),
          delayMinutes: delayMinutes + 5 + Math.floor(rand() * 115),
          likes: Math.floor(rand() * 15),
          parentId: comment.id
        });
      }
    });

    comments.sort(function (a, b) {
      return a.delayMinutes - b.delayMinutes;
    });
    return comments;
  }

  // 지금 이 순간 보여줄 댓글만 골라낸다. publishedAt이 없으면(아직 정식 발행 전
  // 미리보기 등) 전부 보여준다.
  function visibleComments(episode) {
    var all = generateComments(episode);
    if (!episode.publishedAt) return all;
    var now = Date.now();
    return all.filter(function (c) {
      return now >= episode.publishedAt + c.delayMinutes * 60000;
    });
  }

  function totalCount(episode) {
    return generateComments(episode).length;
  }

  return {
    generateComments: generateComments,
    visibleComments: visibleComments,
    totalCount: totalCount
  };
})();
