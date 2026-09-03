# 낙서장

개인 홈페이지 + 웹툰 · 그림 게시판 · 글 게시판. 빌드 도구 없이 순수 HTML/CSS/JS로
만들어져 있고 GitHub Pages에서 그대로 서빙된다. 글쓰기(회차 만들기·그림 그리기·글
작성)는 전부 관리자 PIN 로그인이 있어야 할 수 있고, 나머지는 누구나 볼 수 있다.

- `index.html` — 홈: 세 게시판 허브
- `toon.html` / `read.html` / `admin.html` / `edit.html` / `paint.html` — 웹툰(회차 목록·읽기·관리·컷 편집·그림판)
- `art.html` / `art-post.html` — 그림 게시판(목록·그림 보기, 그리기는 paint.html 재사용)
- `board.html` / `board-post.html` / `board-write.html` — 글 게시판(목록·글 보기·글쓰기)

`edit.html`(컷 편집기)과 `paint.html`(그림판)만 몰입해서 쓰는 도구라 상단 공용
내비게이션이 없고, 나머지 화면은 전부 `js/site-nav.js`가 그리는 같은 내비게이션을 쓴다.

## 로컬에서 열어보기

```
python -m http.server 8000
```

그 다음 `http://localhost:8000/` 접속.

## Firebase 연결(선택)

`js/firebase-config.js` 를 비워두면 이 브라우저에만 저장되는 로컬 전용 모드로 동작한다.
여러 기기에서 같은 내용을 보려면 Firebase 콘솔에서 프로젝트를 만들고
(Firestore Database를 테스트 모드로 생성 후) 웹 앱을 추가해 나오는 설정값을
`js/firebase-config.js` 에 붙여넣으면 된다. Firebase Storage는 유료라 쓰지 않고,
그림은 Firestore 문서 안에 압축된 base64로 저장한다(문서당 900KB 제한, `firestore.rules` 참고).

## 배포

```
node tools/bump-cache-version.js
git add -A && git commit -m "..."
git push
```

GitHub 저장소 설정의 Pages를 `main` 브랜치 `/ (root)` 로 지정해두면 push할 때마다 반영된다.
`tools/bump-cache-version.js`는 저장소 루트의 모든 `*.html`을 자동으로 찾아 처리하므로,
새 화면을 추가해도 이 스크립트를 따로 고칠 필요는 없다.
