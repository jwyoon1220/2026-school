#!/usr/bin/env python3
"""
build.py — 콘텐츠 해시 기반 캐시버스팅

js/*.js 파일들의 내용으로부터 짧은 해시를 계산하고,
- 각 파일 내부의 './xxx.js?v=...' (또는 './xxx.js') import 경로
- index.html의 <script type="module" src="./js/main.js?v=...">
를 모두 './xxx.js?v=<hash>' 형태로 자동 치환한다.

사용법:
    python3 build.py

주의: 해시는 "import하는 쪽"이 거는 쿼리이므로, A.js가 바뀌면
A.js를 import하는 모든 파일의 쿼리가 갱신된다. 즉 한 파일만 바꿔도
관련된 모든 import 구문이 새 해시로 교체되어 CDN/브라우저 캐시를
확실히 무효화한다. (반대로 self 쿼리, 즉 해당 파일이 자기 자신을
참조하는 경우는 없으므로 안전)

알고리즘:
1. 1차 패스: 각 .js 파일의 "쿼리 제거 후" 원본 내용으로 해시를 계산해
   파일명 -> 해시 매핑을 만든다.
2. 2차 패스: 모든 .js 파일과 index.html에서 './name.js(?v=...)?' 패턴을
   찾아 매핑된 해시로 교체한다.
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).parent
JS_DIR = ROOT / 'js'
INDEX_HTML = ROOT / 'index.html'

IMPORT_RE = re.compile(r"(\./([\w-]+)\.js)(\?v=[a-f0-9]+)?")


def strip_query(text: str) -> str:
    """해시 계산 전, 기존 ?v=... 쿼리를 제거해 정규화된 내용을 얻는다."""
    return IMPORT_RE.sub(lambda m: m.group(1), text)


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:8]


def main():
    js_files = sorted(JS_DIR.glob('*.js'))

    # 1차 패스: 쿼리 제거된 내용 기준으로 해시 계산
    normalized = {}
    hashes = {}
    for f in js_files:
        raw = f.read_text(encoding='utf-8')
        norm = strip_query(raw)
        normalized[f.name] = norm
        hashes[f.name] = content_hash(norm)

    def replace(match: re.Match) -> str:
        path, name, _ = match.group(1), match.group(2), match.group(3)
        fname = f"{name}.js"
        h = hashes.get(fname)
        if h is None:
            return match.group(0)  # 외부(unpkg 등) 모듈은 건너뜀
        return f"{path}?v={h}"

    # 2차 패스: 각 js 파일에 새 쿼리 적용 후 저장
    changed_js = 0
    for f in js_files:
        new_content = IMPORT_RE.sub(replace, normalized[f.name])
        old_content = f.read_text(encoding='utf-8')
        if new_content != old_content:
            f.write_text(new_content, encoding='utf-8')
            changed_js += 1
        print(f"  {f.name:<20} v={hashes[f.name]}")

    # index.html의 main.js 참조 갱신
    html = INDEX_HTML.read_text(encoding='utf-8')
    new_html = IMPORT_RE.sub(lambda m: replace(re.match(IMPORT_RE, f"./{m.group(2)}.js")) if False else replace(m), html)
    # index.html의 경로는 './js/main.js' 형태라 위 패턴이 안 맞으므로 별도 처리
    def replace_html(match: re.Match) -> str:
        full, name = match.group(0), match.group(2)
        fname = f"{name}.js"
        h = hashes.get(fname)
        if h is None:
            return full
        base = re.sub(r"\?v=[a-f0-9]+$", "", match.group(1))
        return f"{base}?v={h}"

    HTML_RE = re.compile(r"(\./js/([\w-]+)\.js)(?:\?v=[a-f0-9]+)?")
    new_html = HTML_RE.sub(replace_html, html)

    if new_html != html:
        INDEX_HTML.write_text(new_html, encoding='utf-8')
        print("  index.html updated")
    else:
        print("  index.html unchanged")

    print(f"\nDone. {changed_js} js file(s) updated.")


if __name__ == '__main__':
    main()
