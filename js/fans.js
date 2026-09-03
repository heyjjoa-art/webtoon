// 등록된 친구(about.html 친구소개)들이 남기는 댓글. 이 사이트는 서버가 없는 정적
// 사이트라 진짜 사람도, 외부 AI API도 없다(비용도, 지연도, 실패 처리도 없다는 뜻) -
// 대신 글/그림/회차 id로부터 "결정론적으로" 댓글을 만들어낸다. 같은 게시물이라면
// 어느 기기·어느 방문자가 언제 열어도 항상 같은 댓글이 같은 순서로 나타난다.
//
// 규칙:
//  - 친구 한 명당 게시물 하나에 댓글을 딱 1개만 남긴다 - 그래서 등록된 친구가
//    아무리 많아도(최대 10명) 게시물 하나의 댓글 수는 절대 10개를 넘지 않고,
//    모든 친구가 빠짐없이 골고루 등장한다.
//  - 각 친구는 발행 후 0~4일 사이에 걸쳐 하루에 최대 2~3명씩만 나타나도록
//    순서를 나눠 배정한다(하루 10개 미만을 항상 만족).
//  - 댓글 말투는 친구소개에 적어둔 "성격" 텍스트에서 키워드를 찾아 그에 맞는
//    템플릿을 고른다. 못 찾으면 무난한 기본 말투를 쓴다.
//  - 게시물의 실제 내용(글 본문/그림 한마디/마지막 대사)에서 짧은 한 조각을
//    뽑아 댓글 문장 속에 그대로 인용해서, 아무 말이나 하는 게 아니라 그 글/그림을
//    보고 다는 것처럼 느껴지게 한다.
var Fans = (function () {
  var TONE_KEYWORDS = [
    ["warm", ["다정", "따뜻", "포근", "상냥", "친절"]],
    ["energetic", ["씩씩", "활발", "명랑", "에너지", "텐션", "발랄"]],
    ["playful", ["장난", "유쾌", "개구쟁이", "까불", "엉뚱", "익살"]],
    ["shy", ["수줍", "조용", "차분", "내성적", "낯가림"]],
    ["blunt", ["무뚝뚝", "츤데레", "쿨", "시크", "까칠"]],
    ["caring", ["걱정", "보살핌", "챙김", "예민"]],
    ["curious", ["호기심", "궁금", "질문", "탐구"]]
  ];

  var KIND_WORD = { toon: "이번화", art: "이 그림", board: "이 글" };

  var TEMPLATES = {
    warm: {
      toon: ["{제목} 오늘도 잘 봤어요! 항상 응원할게요 💛", "{대상} 보니까 마음이 따뜻해지네요", "고생 많았어요, 오늘도 수고했어요!", "\"{내용}\" 이 부분 진짜 좋았어요"],
      art: ["{대상} 보니까 마음이 몽글몽글해져요", "오늘도 예쁘게 잘 그렸네요 :)", "이 그림 보고 기분 좋아졌어요!", "'{내용}' 이 한마디도 다정하네요"],
      board: ["{대상} 읽고 마음이 따뜻해졌어요", "항상 좋은 글 남겨줘서 고마워요", "'{내용}' 이 부분 공감돼요", "오늘도 잘 읽었어요, 고생했어요"]
    },
    energetic: {
      toon: ["우와아 {제목} 완전 신난다!!!", "{대상} 진짜 텐션 최고예요!!", "오늘도 파이팅!! 완전 재밌어요", "\"{내용}\" 이 대사 완전 좋아요!!"],
      art: ["{대상} 색감부터 텐션 폭발이에요!!", "우와 진짜 잘그렸다!!", "오늘도 에너지 뿜뿜이네요 ㅎㅎ", "'{내용}' 완전 신나요!!"],
      board: ["{대상} 읽는데 텐션 올라가요!!", "오 완전 재밌어요!!", "'{내용}' 이거 완전 인정!!", "오늘도 신나게 잘 읽었어요!!"]
    },
    playful: {
      toon: ["{대상} 보고 킥킥댔어요 ㅋㅋㅋ", "{제목} 완전 웃겨요 ㅋㅋ", "\"{내용}\" 이거 완전 개그 ㅋㅋㅋ", "저만 웃긴 거 아니죠?? ㅋㅋㅋ"],
      art: ["{대상} 보고 몰래 웃었어요 ㅋㅋ", "이거 저장각인데요? ㅋㅋ", "'{내용}' 진짜 웃김 ㅋㅋㅋ", "장난 아니게 잘 그렸네요 ㅋㅋ"],
      board: ["'{내용}' 이거 완전 웃겨요 ㅋㅋㅋ", "{대상} 읽다가 빵터졌어요", "몰래 친구한테도 보여줬어요 ㅋㅋ", "오늘도 킥킥대며 잘 읽었어요"]
    },
    shy: {
      toon: ["...{대상} 잘 보고 갑니다.", "조용히 응원하고 있어요.", "\"{내용}\" ...좋았어요.", "말은 잘 못하지만 항상 챙겨봐요."],
      art: ["...예쁘네요.", "조용히 저장했어요.", "'{내용}' ...좋아요.", "항상 몰래 보고 있어요."],
      board: ["...잘 읽었어요.", "조용히 응원할게요.", "'{내용}' ...공감해요.", "말주변은 없지만 좋았어요."]
    },
    blunt: {
      toon: ["{대상}... 나쁘지 않네.", "뭐, 괜찮았어.", "...{제목} 좀 봐줄만 하네.", "\"{내용}\"... 인정."],
      art: ["...나쁘지 않네.", "뭐, 잘 그렸네.", "...괜찮게 봤음.", "'{내용}'... 인정."],
      board: ["...읽어봤음.", "뭐, 나쁘지 않네.", "'{내용}'... 그럴듯하네.", "...괜찮게 읽었어."]
    },
    caring: {
      toon: ["{대상} 보면서 괜찮은지 걱정했어요 ㅠㅠ", "무리하지 말고 천천히 해요...", "\"{내용}\" 이 부분 마음이 쓰이네요", "항상 건강 챙기면서 해요!"],
      art: ["{대상} 그리느라 손 안 아팠어요?", "무리하지 말아요, 잘 봤어요", "'{내용}' 왠지 마음이 쓰이네요", "항상 건강 챙겨요!"],
      board: ["{대상} 읽고 괜히 걱정됐어요...", "무리하지 말고 천천히 지내요", "'{내용}' 이 부분 마음이 쓰여요", "항상 잘 지내고 있는 거죠?"]
    },
    curious: {
      toon: ["{대상} 이거 다음엔 어떻게 되나요?? 궁금해요!", "\"{내용}\" 이거 무슨 뜻이에요??", "뒷이야기 너무 궁금해요!", "다음화는 언제 나와요??"],
      art: ["이거 어떻게 그린 거예요? 궁금해요!", "'{내용}' 무슨 의미예요?", "다음엔 뭘 그릴 거예요?", "이 그림 뒷이야기 있나요?"],
      board: ["'{내용}' 이거 더 자세히 알고 싶어요!", "이 얘기 다음편 있나요??", "궁금한 게 생겼어요, 답해줄 수 있어요?", "{대상} 읽고 질문이 생겼어요!"]
    },
    default: {
      toon: ["{대상} 잘 보고 가요!", "{제목} 오늘도 응원해요", "\"{내용}\" 좋았어요", "항상 잘 보고 있어요 :)"],
      art: ["{대상} 잘 보고 가요!", "오늘도 잘 그렸네요", "'{내용}' 좋았어요", "항상 응원해요!"],
      board: ["{대상} 잘 읽었어요!", "오늘도 좋은 글이었어요", "'{내용}' 공감돼요", "항상 잘 보고 있어요"]
    }
  };

  function detectTone(personality) {
    var p = String(personality || "");
    for (var i = 0; i < TONE_KEYWORDS.length; i++) {
      var tone = TONE_KEYWORDS[i][0];
      var words = TONE_KEYWORDS[i][1];
      for (var j = 0; j < words.length; j++) {
        if (p.indexOf(words[j]) !== -1) return tone;
      }
    }
    return "default";
  }

  // 문자열 → 32비트 정수 시드 (djb2 변형). id가 조금만 달라도 전혀 다른 조합이
  // 나오도록 섞는다.
  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32: 시드 하나로 재현 가능한 0~1 난수를 계속 뽑아내는 작은 PRNG.
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
      .replace(/\{대상\}/g, ctx.kindWord)
      .replace(/\{내용\}/g, ctx.snippet || ctx.title || "");
  }

  // 게시물의 실제 내용에서 짧은 한 조각을 뽑아온다 - 댓글이 아무 말이나 하는 게
  // 아니라 그 글/그림/회차를 보고 반응하는 것처럼 느끼게 해준다.
  function contentSnippet(item, kind) {
    var raw = "";
    if (kind === "board") {
      raw = item.body || "";
    } else if (kind === "art") {
      raw = item.caption || item.title || "";
    } else {
      var texts = item.texts || [];
      raw = texts.length ? texts[texts.length - 1].text || "" : item.summary || item.title || "";
    }
    raw = String(raw).replace(/\s+/g, " ").trim();
    if (!raw) return item.title || "";
    return raw.length > 26 ? raw.slice(0, 26) + "…" : raw;
  }

  // 게시물 하나에 대한 전체 댓글 목록을 결정론적으로 만든다. 친구 한 명당
  // 댓글 1개, 순서대로 하루씩 나눠 배정해서(0~3일차) 하루 최대 3명 정도만
  // 몰리게 한다 - 등록 친구가 최대 10명이라 하루 10개는 절대 넘지 않는다.
  function generateComments(item, kind) {
    kind = kind === "art" || kind === "board" ? kind : "toon";
    var friends = (typeof FriendsStore !== "undefined" ? FriendsStore.getFriends() : []) || [];
    if (!friends.length) return [];

    var ctx = {
      title: item.title,
      kindWord: KIND_WORD[kind],
      snippet: contentSnippet(item, kind)
    };

    var DAY_SPAN = 4; // 0~3일차로 순서를 나눈다
    var MINUTES_PER_SLOT = 0.5; // TEMP: 테스트용으로 하루(1440)를 30초로 줄여둠 - 확인 후 1440으로 되돌릴 것
    var comments = friends.map(function (f, idx) {
      var rand = mulberry32(hashString(item.id + "::" + f.id));
      var tone = detectTone(f.personality);
      var pool = (TEMPLATES[tone] && TEMPLATES[tone][kind]) || TEMPLATES.default[kind];
      var dayIndex = idx % DAY_SPAN;
      var delayMinutes = dayIndex * MINUTES_PER_SLOT + rand() * MINUTES_PER_SLOT;
      return {
        id: item.id + "-f-" + f.id,
        fanId: f.id,
        name: f.name,
        emoji: f.emoji,
        text: fillTemplate(pick(rand, pool), ctx),
        delayMinutes: delayMinutes,
        likes: Math.floor(rand() * 40),
        parentId: null
      };
    });

    comments.sort(function (a, b) {
      return a.delayMinutes - b.delayMinutes;
    });
    return comments;
  }

  // 지금 이 순간 보여줄 댓글만 골라낸다. 기준 시각(publishedAt/createdAt)이
  // 없으면(아직 정식 발행 전 미리보기 등) 전부 보여준다.
  function visibleComments(item, kind) {
    var all = generateComments(item, kind);
    var anchor = item.publishedAt || item.createdAt;
    if (!anchor) return all;
    var now = Date.now();
    return all.filter(function (c) {
      return now >= anchor + c.delayMinutes * 60000;
    });
  }

  function totalCount(item, kind) {
    return generateComments(item, kind).length;
  }

  return {
    generateComments: generateComments,
    visibleComments: visibleComments,
    totalCount: totalCount
  };
})();
