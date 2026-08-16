# GitHub 배포 순서

1. 먼저 로컬에서 `http://127.0.0.1:8000` MVP를 확인합니다.
2. GitHub에서 빈 `modugil` repository를 만듭니다.
3. 소스 코드만 push합니다. 대용량 GIS 데이터는 `.gitignore`로 제외합니다.
4. GitHub Repository → Settings → Pages에서 `Deploy from a branch`, `main`, `/docs`를 선택합니다.
5. Python FastAPI는 GitHub Pages에서 실행되지 않으므로 공개 백엔드를 별도로 배포합니다.
6. 배포된 API 주소를 `docs/static/config.js`에 넣고 다시 push합니다.
