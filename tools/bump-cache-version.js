#!/usr/bin/env node
// GitHub Pages는 이 저장소의 .js/.css 파일을 한동안 캐싱하고, 브라우저도 그보다
// 더 오래 들고 있는 경우가 흔하다 - 그래서 배포는 됐는데 방문자는 새로고침해도
// 예전 스크립트를 계속 쓰는 일이 생긴다. 이 스크립트는 저장소 루트의 모든
// *.html 파일을 자동으로 찾아서, 그 안의 로컬 <script src>/<link href>에
// "?v=<버전>"을 새로 붙여준다 - 그래서 배포할 때마다 URL 자체가 바뀌어 캐시를
// 우회한다. haing 프로젝트와 달리 HTML 파일 목록을 하드코딩하지 않는다: 새
// 화면을 추가해도 이 스크립트를 고칠 필요가 없다.
//
// 사용법: 커밋 직전에 저장소 루트에서 `node tools/bump-cache-version.js`
// 외부 CDN URL(https://...)은 건드리지 않는다 - 이 저장소 파일이 바뀔 때만
// 버전이 바뀌면 된다.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function findHtmlFiles(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findHtmlFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(full);
    }
  });
  return out;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function makeVersion() {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

const VERSION = makeVersion();

// src="js/foo.js" 또는 src="js/foo.js?v=123" -> src="js/foo.js?v=<새버전>"
// 로컬 파일만 대상으로 한다: http(s):// 로 시작하는 외부 CDN 링크는 건드리지 않는다.
const ATTR_RE = /((?:src|href)=")((?!https?:\/\/)[^"?]+\.(?:js|css))(?:\?v=[^"]*)?(")/g;

function bumpFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let count = 0;
  const updated = original.replace(ATTR_RE, (match, prefix, url, suffix) => {
    count++;
    return prefix + url + "?v=" + VERSION + suffix;
  });
  if (count > 0 && updated !== original) {
    fs.writeFileSync(filePath, updated, "utf8");
    console.log(`  ${path.relative(ROOT, filePath)} (${count}개 태그)`);
  }
}

const htmlFiles = findHtmlFiles(ROOT, []);
console.log(`캐시 버전을 ${VERSION} 로 갱신합니다 (${htmlFiles.length}개 HTML 파일 검사):`);
htmlFiles.forEach(bumpFile);
console.log("완료.");
