const API_BASE=(window.MODUGIL_API_BASE||'').replace(/\/$/,'');
const META={walker:{label:'🚶 보행자',color:'#2563eb'},stroller:{label:'👶 유모차',color:'#d97706'},manual_wc:{label:'♿ 수동휠체어',color:'#dc2626'},assist:{label:'⚡ Power Assist',color:'#7c3aed'}};
const map=L.map('map').setView([37.5665,126.9780],12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
let startPoint=null,endPoint=null,startMarker=null,endMarker=null;const routeLayers={};
const guide=document.getElementById('click-guide'),startText=document.getElementById('start-text'),endText=document.getElementById('end-text'),routeBtn=document.getElementById('route-btn'),resetBtn=document.getElementById('reset-btn'),statusBox=document.getElementById('status'),resultsBox=document.getElementById('results');
const fmtCoord=p=>`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
const fmtMeters=v=>v==null||!Number.isFinite(v)?'-':v>=1000?`${(v/1000).toFixed(2)} km`:`${v.toFixed(0)} m`;
const fmtPct=v=>v==null||!Number.isFinite(v)?'-':`${v.toFixed(1)}%`;
function setStatus(t,c=''){statusBox.className=`status ${c}`.trim();statusBox.textContent=t}
function clearRoutes(){Object.values(routeLayers).forEach(l=>map.removeLayer(l));Object.keys(routeLayers).forEach(k=>delete routeLayers[k]);resultsBox.innerHTML=''}
function selectedModes(){return [...document.querySelectorAll('.mode-chip input:checked')].map(el=>el.value)}
function syncRouteVisibility(){const checked=new Set(selectedModes());for(const [mode,layer] of Object.entries(routeLayers)){if(checked.has(mode)){if(!map.hasLayer(layer))layer.addTo(map)}else if(map.hasLayer(layer))map.removeLayer(layer)}}
document.querySelectorAll('.mode-chip input').forEach(i=>i.addEventListener('change',syncRouteVisibility));
map.on('click',e=>{const p={lat:e.latlng.lat,lon:e.latlng.lng};if(!startPoint){startPoint=p;startMarker=L.circleMarker(e.latlng,{radius:8,color:'#15803d',weight:3,fillColor:'#22c55e',fillOpacity:1}).addTo(map).bindTooltip('출발');startText.textContent=fmtCoord(p);guide.textContent='이제 도착점을 클릭해 주세요.'}else if(!endPoint){endPoint=p;endMarker=L.circleMarker(e.latlng,{radius:8,color:'#b91c1c',weight:3,fillColor:'#ef4444',fillOpacity:1}).addTo(map).bindTooltip('도착');endText.textContent=fmtCoord(p);guide.textContent='경로 비교 버튼을 눌러 주세요.';routeBtn.disabled=false}else{endPoint=p;endMarker.setLatLng(e.latlng);endText.textContent=fmtCoord(p);clearRoutes();guide.textContent='도착점이 변경되었습니다. 다시 계산해 주세요.'}});
resetBtn.addEventListener('click',()=>{startPoint=endPoint=null;if(startMarker)map.removeLayer(startMarker);if(endMarker)map.removeLayer(endMarker);startMarker=endMarker=null;startText.textContent='미선택';endText.textContent='미선택';routeBtn.disabled=true;guide.textContent='먼저 출발점을 클릭해 주세요.';clearRoutes();setStatus('아직 계산된 경로가 없습니다.')});
function renderResult(mode, route) {

  const m = META[mode];

  if (route.error) {
    return `
      <div class="result-item">
        <div class="result-head">
          <strong>${m.label}</strong>
        </div>

        <div class="status error">
          ${route.error}
        </div>
      </div>
    `;
  }


  const s = route.summary;

  const steepDistance =
    s.steep8_distance_m || 0;

  const steepMessage =
    steepDistance < 10
      ? "🟢 급경사가 거의 없어요"
      : steepDistance < 100
      ? "🟡 일부 급경사 구간이 있어요"
      : "🔴 급경사 구간이 길어요";


  return `
    <div class="result-item">

      <div class="result-head">
        <strong>${m.label} 추천 경로</strong>
      </div>


      <div
        style="
          margin: 10px 0 14px;
          padding: 10px 12px;
          background: #f8faf9;
          border-radius: 12px;
          font-weight: 600;
        "
      >
        ${steepMessage}
      </div>


      <div class="metrics">

        <div class="metric">
          <small>이동 거리</small>
          <strong>
            ${fmtMeters(s.physical_distance_m)}
          </strong>
        </div>


        <div class="metric">
          <small>8% 이상 가파른 길</small>
          <strong>
            ${fmtMeters(s.steep8_distance_m)}
          </strong>
        </div>


        <div class="metric">
          <small>가장 가파른 오르막</small>
          <strong>
            ${fmtPct(s.max_up_10_pct)}
          </strong>
        </div>

      </div>

    <button
        class="navigation-start-btn"
        type="button"
        data-mode="${mode}"
    >
    🧭 이 경로로 안내 시작
    </button>
  </div>
  `;
}
routeBtn.addEventListener('click',async()=>{if(!startPoint||!endPoint)return;const modes=selectedModes();if(!modes.length){setStatus('최소 한 가지 이동 모드를 선택해 주세요.','error');return}routeBtn.disabled=true;clearRoutes();setStatus('서울 보행 그래프에서 최적 경로를 계산하는 중...','loading');try{const r=await fetch(`${API_BASE}/api/routes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:startPoint,end:endPoint,modes})});if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);const data=await r.json();const bounds=[];for(const mode of modes){const route=data.routes[mode];if(!route||route.error)continue;const layer=L.geoJSON(route.geojson,{style:{color:META[mode].color,weight:mode==='manual_wc'?7:5,opacity:.82}}).addTo(map);routeLayers[mode]=layer;const b=layer.getBounds();if(b.isValid())bounds.push(b.getSouthWest(),b.getNorthEast())}resultsBox.innerHTML=modes.map(m=>renderResult(m,data.routes[m])).join('');setStatus(`완료 · 출발 스냅 ${data.start_snap.distance_m.toFixed(1)}m · 도착 스냅 ${data.end_snap.distance_m.toFixed(1)}m`);if(bounds.length)map.fitBounds(L.latLngBounds(bounds),{padding:[35,35]})}catch(err){console.error(err);setStatus('경로 계산에 실패했습니다. 백엔드 서버가 실행 중인지 확인해 주세요.\n'+err.message,'error')}finally{routeBtn.disabled=false}});

// =========================================================
// 출발지 장소 검색
// =========================================================

const startSearchInput =
  document.getElementById("start-search");

const startSearchBtn =
  document.getElementById("start-search-btn");

const startSearchResults =
  document.getElementById("start-search-results");


async function searchStartPlace() {

  const query =
    startSearchInput.value.trim();

  if (query.length < 2) {
    alert("출발지를 2글자 이상 입력해 주세요.");
    return;
  }


  startSearchBtn.disabled = true;
  startSearchBtn.textContent = "…";

  startSearchResults.style.display = "block";

  startSearchResults.innerHTML = `
    <div style="padding:12px; color:#6b7280;">
      장소를 검색하는 중...
    </div>
  `;


  try {

    const response = await fetch(
      `${API_BASE}/api/search?q=${encodeURIComponent(query)}`
    );


    if (!response.ok) {

      throw new Error(
        await response.text()
      );
    }


    const data =
      await response.json();


    if (
      !data.results
      ||
      data.results.length === 0
    ) {

      startSearchResults.innerHTML = `
        <div style="padding:12px; color:#6b7280;">
          검색 결과가 없습니다.
        </div>
      `;

      return;
    }


    startSearchResults.innerHTML = "";


    data.results.forEach(
      (place) => {

        const item =
          document.createElement("button");


        item.type = "button";


        item.style.cssText = `
          width:100%;
          padding:12px;
          border:none;
          border-bottom:1px solid #e5e7eb;
          background:white;
          text-align:left;
          cursor:pointer;
          color:#1f2937;
        `;


        item.textContent =
          place.name;


        item.addEventListener(
          "click",
          () => {

            // -----------------------------
            // 출발점으로 설정
            // -----------------------------

            startPoint = {
              lat: place.lat,
              lon: place.lon
            };


            // 기존 출발 마커가 있으면 제거
            if (startMarker) {
              map.removeLayer(
                startMarker
              );
            }


            // 새 마커 생성
            startMarker =
              L.circleMarker(
                [
                  place.lat,
                  place.lon
                ],
                {
                  radius: 8,
                  color: "#15803d",
                  weight: 3,
                  fillColor: "#22c55e",
                  fillOpacity: 1
                }
              )
              .addTo(map)
              .bindTooltip("출발");


            // 지도 이동
            map.setView(
              [
                place.lat,
                place.lon
              ],
              16
            );


            // 검색창에는 간단히 검색어 유지
            startSearchInput.value =
              query;


            // 기존 출발 표시 업데이트
            startText.textContent =
              place.name;


            // 검색 결과 닫기
            startSearchResults.style.display =
              "none";


            // 안내 문구 변경
            guide.textContent =
              "이제 도착지를 검색하거나 지도에서 클릭해 주세요.";


            // 이미 도착점도 있으면 버튼 활성화
            if (endPoint) {
              routeBtn.disabled = false;
            }

          }
        );


        startSearchResults.appendChild(
          item
        );

      }
    );


  }

  catch (error) {

    console.error(error);


    startSearchResults.innerHTML = `
      <div style="
        padding:12px;
        color:#dc2626;
      ">
        장소 검색에 실패했습니다.
      </div>
    `;

  }

  finally {

    startSearchBtn.disabled = false;
    startSearchBtn.textContent = "🔍";

  }

}


// 🔍 버튼 클릭
startSearchBtn.addEventListener(
  "click",
  searchStartPlace
);


// Enter 키로도 검색
startSearchInput.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Enter") {

      event.preventDefault();

      searchStartPlace();

    }

  }
);

// =========================================================
// 도착지 장소 검색
// =========================================================

const endSearchInput =
  document.getElementById("end-search");

const endSearchBtn =
  document.getElementById("end-search-btn");

const endSearchResults =
  document.getElementById("end-search-results");


async function searchEndPlace() {

  const query =
    endSearchInput.value.trim();

  if (query.length < 2) {
    alert("도착지를 2글자 이상 입력해 주세요.");
    return;
  }


  endSearchBtn.disabled = true;
  endSearchBtn.textContent = "…";

  endSearchResults.style.display = "block";

  endSearchResults.innerHTML = `
    <div style="padding:12px; color:#6b7280;">
      장소를 검색하는 중...
    </div>
  `;


  try {

    const response = await fetch(
      `${API_BASE}/api/search?q=${encodeURIComponent(query)}`
    );


    if (!response.ok) {
      throw new Error(
        await response.text()
      );
    }


    const data =
      await response.json();


    if (
      !data.results
      ||
      data.results.length === 0
    ) {

      endSearchResults.innerHTML = `
        <div style="padding:12px; color:#6b7280;">
          검색 결과가 없습니다.
        </div>
      `;

      return;
    }


    endSearchResults.innerHTML = "";


    data.results.forEach(
      (place) => {

        const item =
          document.createElement("button");


        item.type = "button";


        item.style.cssText = `
          width:100%;
          padding:12px;
          border:none;
          border-bottom:1px solid #e5e7eb;
          background:white;
          text-align:left;
          cursor:pointer;
          color:#1f2937;
        `;


        item.textContent =
          place.name;


        item.addEventListener(
          "click",
          () => {

            // -----------------------------
            // 도착점 설정
            // -----------------------------

            endPoint = {
              lat: place.lat,
              lon: place.lon
            };


            // 기존 도착 마커 삭제
            if (endMarker) {
              map.removeLayer(
                endMarker
              );
            }


            // 새 도착 마커
            endMarker =
              L.circleMarker(
                [
                  place.lat,
                  place.lon
                ],
                {
                  radius: 8,
                  color: "#b91c1c",
                  weight: 3,
                  fillColor: "#ef4444",
                  fillOpacity: 1
                }
              )
              .addTo(map)
              .bindTooltip("도착");


            // 지도 이동
            map.setView(
              [
                place.lat,
                place.lon
              ],
              16
            );


            // 검색창에는 검색어 표시
            endSearchInput.value =
              query;


            // 기존 도착 정보 업데이트
            endText.textContent =
              place.name;


            // 검색 결과 닫기
            endSearchResults.style.display =
              "none";


            // 안내 문구 변경
            guide.textContent =
              "출발지와 도착지가 설정되었습니다.";


            // 출발점까지 있으면 경로 버튼 활성화
            if (startPoint) {
              routeBtn.disabled = false;
            }

          }
        );


        endSearchResults.appendChild(
          item
        );

      }
    );


  }

  catch (error) {

    console.error(error);


    endSearchResults.innerHTML = `
      <div style="
        padding:12px;
        color:#dc2626;
      ">
        장소 검색에 실패했습니다.
      </div>
    `;

  }

  finally {

    endSearchBtn.disabled = false;
    endSearchBtn.textContent = "🔍";

  }

}


// 🔍 버튼 클릭
endSearchBtn.addEventListener(
  "click",
  searchEndPlace
);


// Enter 키 검색
endSearchInput.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Enter") {

      event.preventDefault();

      searchEndPlace();

    }

  }
);
// =========================================================
// 출발지 ↔ 도착지 바꾸기
// =========================================================

const swapBtn =
  document.getElementById("swap-btn");


swapBtn.addEventListener(
  "click",
  () => {

    // 둘 다 선택되지 않았다면 아무것도 하지 않음
    if (!startPoint && !endPoint) {
      return;
    }


    // -----------------------------
    // 좌표 교환
    // -----------------------------

    const tempPoint =
      startPoint;

    startPoint =
      endPoint;

    endPoint =
      tempPoint;


    // -----------------------------
    // 검색창 내용 교환
    // -----------------------------

    const tempSearch =
      startSearchInput.value;

    startSearchInput.value =
      endSearchInput.value;

    endSearchInput.value =
      tempSearch;


    // -----------------------------
    // 표시 텍스트 교환
    // -----------------------------

    const tempText =
      startText.textContent;

    startText.textContent =
      endText.textContent;

    endText.textContent =
      tempText;


    // -----------------------------
    // 기존 마커 삭제
    // -----------------------------

    if (startMarker) {
      map.removeLayer(
        startMarker
      );
    }

    if (endMarker) {
      map.removeLayer(
        endMarker
      );
    }


    startMarker = null;
    endMarker = null;


    // -----------------------------
    // 새 출발 마커
    // -----------------------------

    if (startPoint) {

      startMarker =
        L.circleMarker(
          [
            startPoint.lat,
            startPoint.lon
          ],
          {
            radius: 8,
            color: "#15803d",
            weight: 3,
            fillColor: "#22c55e",
            fillOpacity: 1
          }
        )
        .addTo(map)
        .bindTooltip("출발");

    }


    // -----------------------------
    // 새 도착 마커
    // -----------------------------

    if (endPoint) {

      endMarker =
        L.circleMarker(
          [
            endPoint.lat,
            endPoint.lon
          ],
          {
            radius: 8,
            color: "#b91c1c",
            weight: 3,
            fillColor: "#ef4444",
            fillOpacity: 1
          }
        )
        .addTo(map)
        .bindTooltip("도착");

    }


    // -----------------------------
    // 기존 경로 삭제
    // -----------------------------

    clearRoutes();


    // -----------------------------
    // 버튼 활성화 여부
    // -----------------------------

    routeBtn.disabled =
      !(startPoint && endPoint);


    // -----------------------------
    // 지도 위치 조정
    // -----------------------------

    if (startPoint && endPoint) {

      map.fitBounds(
        [
          [
            startPoint.lat,
            startPoint.lon
          ],

          [
            endPoint.lat,
            endPoint.lon
          ]
        ],
        {
          padding: [40, 40]
        }
      );

      guide.textContent =
        "출발지와 도착지를 바꿨습니다.";

    }

  }
);

// =========================================================
// 현재 위치
// =========================================================

const currentLocationBtn =
  document.getElementById("current-location-btn");

let currentLocationMarker = null;


currentLocationBtn.addEventListener(
  "click",
  () => {

    if (!navigator.geolocation) {
      alert("이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다.");
      return;
    }


    currentLocationBtn.disabled = true;
    currentLocationBtn.textContent = "…";


    navigator.geolocation.getCurrentPosition(

      // 위치 찾기 성공
      (position) => {

        const lat =
          position.coords.latitude;

        const lon =
          position.coords.longitude;

        const accuracy =
          position.coords.accuracy;


        // 기존 현재 위치 점 제거
        if (currentLocationMarker) {
          map.removeLayer(
            currentLocationMarker
          );
        }


        // 파란색 현재 위치 점
        currentLocationMarker =
          L.circleMarker(
            [lat, lon],
            {
              radius: 9,
              color: "#1d4ed8",
              weight: 3,
              fillColor: "#3b82f6",
              fillOpacity: 1
            }
          )
          .addTo(map)
          .bindPopup(
            `
              <strong>현재 위치</strong><br>
              정확도 약 ${Math.round(accuracy)} m
            `
          )
          .openPopup();


        // 현재 위치로 지도 이동
        map.setView(
          [lat, lon],
          16
        );

        // =====================================================
        // 현재 위치를 출발점으로 설정
        // =====================================================

        startPoint = {
        lat: lat,
        lon: lon
        };


        // 기존 출발 마커 제거
        if (startMarker) {
        map.removeLayer(startMarker);
        }


        // 초록색 출발 마커 생성
        startMarker =
        L.circleMarker(
            [lat, lon],
            {
            radius: 8,
            color: "#15803d",
            weight: 3,
            fillColor: "#22c55e",
            fillOpacity: 1
            }
        )
        .addTo(map)
        .bindTooltip("출발");


        // 검색창과 출발지 정보 변경
        startSearchInput.value =
        "현재 위치";

        startText.textContent =
        "현재 위치";


        // 도착지가 이미 있으면 경로 버튼 활성화
        routeBtn.disabled =
        !endPoint;


        // 안내 문구
        guide.textContent =
        "현재 위치를 출발점으로 설정했습니다.";

        currentLocationBtn.disabled = false;
        currentLocationBtn.textContent = "◎";

      },


      // 위치 찾기 실패
      (error) => {

        console.error(error);

        alert(
          "현재 위치를 가져오지 못했습니다.\n" +
          "브라우저의 위치 권한을 확인해 주세요."
        );

        currentLocationBtn.disabled = false;
        currentLocationBtn.textContent = "◎";

      },


      // 위치 옵션
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }

    );

  }
);
// =========================================================
// 경로 좌표 → 간단한 방향 안내 생성
// =========================================================

function getBearing(lat1, lon1, lat2, lon2) {

  const toRad = (deg) => deg * Math.PI / 180;
  const toDeg = (rad) => rad * 180 / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y =
    Math.sin(Δλ) * Math.cos(φ2);

  const x =
    Math.cos(φ1) * Math.sin(φ2)
    -
    Math.sin(φ1) *
    Math.cos(φ2) *
    Math.cos(Δλ);

  return (
    toDeg(Math.atan2(y, x)) + 360
  ) % 360;
}


function angleDifference(a, b) {

  let diff = b - a;

  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  return diff;
}


function makeNavigationInstructions(layer) {

  // Leaflet 경로에서 좌표 가져오기
  const points = [];

  layer.eachLayer((subLayer) => {

    if (!subLayer.getLatLngs) {
      return;
    }

    const latlngs =
      subLayer.getLatLngs();


    function collect(arr) {

      arr.forEach((item) => {

        if (Array.isArray(item)) {
          collect(item);
        }

        else if (
          item &&
          typeof item.lat === "number"
        ) {

          points.push(item);

        }

      });

    }

    collect(latlngs);

  });


  if (points.length < 2) {

    return [
      {
        icon: "↑",
        text: "경로를 따라 이동하세요"
      }
    ];

  }


  const instructions = [];

  let lastTurnIndex = 0;


  for (
    let i = 1;
    i < points.length - 1;
    i++
  ) {

    const prev =
      points[i - 1];

    const current =
      points[i];

    const next =
      points[i + 1];


    const bearing1 =
      getBearing(
        prev.lat,
        prev.lng,
        current.lat,
        current.lng
      );


    const bearing2 =
      getBearing(
        current.lat,
        current.lng,
        next.lat,
        next.lng
      );


    const change =
      angleDifference(
        bearing1,
        bearing2
      );


    // 작은 굴곡은 무시
    if (Math.abs(change) < 35) {
      continue;
    }


    // 너무 가까운 곳에서 연속 회전 표시 방지
    const distance =
      map.distance(
        points[lastTurnIndex],
        current
      );


    if (distance < 25) {
      continue;
    }


    let direction;
    let icon;


    if (change > 0) {

      direction =
        "오른쪽으로 이동하세요";

      icon = "↱";

    }

    else {

      direction =
        "왼쪽으로 이동하세요";

      icon = "↰";

    }


    instructions.push({
      icon,
      text:
        `${Math.round(distance)}m 이동 후 ${direction}`
    });


    lastTurnIndex = i;

  }


  // 회전이 하나도 없는 경우
  if (instructions.length === 0) {

    const totalDistance =
      map.distance(
        points[0],
        points[points.length - 1]
      );


    instructions.push({
      icon: "↑",
      text:
        `약 ${Math.round(totalDistance)}m 경로를 따라 이동하세요`
    });

  }


  return instructions;
}

// =========================================================
// 내비게이션 모드 시작
// =========================================================

resultsBox.addEventListener(
  "click",
  (event) => {

    const button =
      event.target.closest(".navigation-start-btn");

    if (!button) {
      return;
    }

    const mode =
      button.dataset.mode;

    const selectedLayer =
      routeLayers[mode];

    if (!selectedLayer) {
      return;
    }


    // 다른 경로는 지도에서 숨기기
    for (
      const [routeMode, layer]
      of Object.entries(routeLayers)
    ) {

      if (routeMode === mode) {

        if (!map.hasLayer(layer)) {
          layer.addTo(map);
        }

        // 선택한 길 강조
        layer.setStyle({
          color: META[mode].color,
          weight: 9,
          opacity: 0.95
        });

      } else {

        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }

      }
    }


    // 선택 경로 전체가 보이도록 이동
    const bounds =
      selectedLayer.getBounds();

    if (bounds.isValid()) {

      map.fitBounds(
        bounds,
        {
          padding: [70, 70]
        }
      );

    }


    // 기존 안내 패널이 있으면 삭제
    const oldPanel =
      document.getElementById(
        "navigation-panel"
      );

    if (oldPanel) {
      oldPanel.remove();
    }


    // 내비게이션 패널 생성
    const panel =
      document.createElement("div");

    panel.id =
      "navigation-panel";

    panel.className =
      "navigation-panel";

    const instructions =
        makeNavigationInstructions(
            selectedLayer
        );

    const firstInstruction =
        instructions[0];


    panel.innerHTML = `
        <div class="navigation-icon">
            ${firstInstruction.icon}
        </div>

        <div class="navigation-text">

            <small>
            ${META[mode].label} 안내 중
            </small>

            <strong>
            ${firstInstruction.text}
            </strong>

        </div>
    `;


    document
      .querySelector(".map-wrap")
      .appendChild(panel);


    guide.textContent =
      "경로 안내를 시작했습니다.";

  }
);