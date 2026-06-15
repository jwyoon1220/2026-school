# Cache-busting build script

`js/*.js` 또는 `index.html`의 모듈 import를 수정한 뒤, push 전에 한 번 실행하세요:

```bash
python3 build.py
```

각 모듈의 콘텐츠 해시(8자리)를 계산해서 모든 `./xxx.js?v=...` import 경로와
`index.html`의 `./js/main.js?v=...`를 자동으로 갱신합니다. GitHub Pages/CDN의
구버전 캐시(stale 404 포함)를 우회하기 위한 장치입니다.

- 변경 없는 파일은 해시가 그대로라 git diff에 안 잡힙니다.
- 여러 번 실행해도 안전합니다(idempotent).
- 외부 CDN(unpkg 등) import는 건드리지 않습니다.
