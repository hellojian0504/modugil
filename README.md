# MODUGIL Web App Starter

서울 보행 네트워크와 경사 기반 Mobility Cost를 실제 지도에서 비교하는 MVP입니다.

## 필요한 기존 데이터

프로젝트 루트에 STEP 7B 결과가 있어야 합니다.

```text
data/processed/
├─ seoul_links_routing_connected.gpkg
└─ seoul_routing_nodes_connected.gpkg
```

## 설치

```powershell
cd E:\User\Desktop\modugil
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

이미 GeoPandas/Scipy가 설치되어 있다면 우선 아래만 설치해도 됩니다.

```powershell
pip install fastapi uvicorn
```

## 실행

```powershell
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

브라우저에서 다음 주소를 엽니다.

```text
http://127.0.0.1:8000
```

지도에서 출발점 → 도착점 순서로 클릭한 뒤 경로 비교 버튼을 누릅니다.

## GitHub 구조

```text
modugil/
├─ app.py
├─ requirements.txt
├─ run_app.bat
├─ README.md
├─ .gitignore
├─ docs/
│  ├─ index.html
│  └─ static/
│     ├─ style.css
│     ├─ app.js
│     └─ config.js
└─ data/       # 로컬 전용 / GitHub 제외
```

`docs/`를 사용한 이유는 나중에 그대로 GitHub Pages publishing source로 사용할 수 있게 하기 위해서입니다.

## 공개 배포 구조

```text
GitHub Pages (docs/)  →  FastAPI HTTPS backend  →  Seoul routing data
```

GitHub Pages는 정적 HTML/CSS/JS를 호스팅하고, Python 기반 최단경로 계산은 별도 백엔드에서 수행합니다.

백엔드 배포 뒤 `docs/static/config.js`의 API 주소만 바꾸면 됩니다.

```js
window.MODUGIL_API_BASE = "https://YOUR-BACKEND.example.com";
```

## 주의

V0.1은 경사 중심 연구용 prototype입니다. 계단, 턱, 노면, 보도 폭, 엘리베이터 등 실제 접근성 정보를 모두 반영한 완전한 무장애 경로 보장 서비스는 아닙니다.
