from pathlib import Path
import heapq
import threading
from typing import List, Literal

import numpy as np
import pandas as pd
import geopandas as gpd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pyproj import Transformer
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
PROCESSED = ROOT / 'data' / 'processed'
LINKS_FILE = PROCESSED / 'seoul_links_routing_connected.gpkg'
NODES_FILE = PROCESSED / 'seoul_routing_nodes_connected.gpkg'
WEB_DIR = ROOT / 'docs'

MODES = {
    'walker': {'label': '보행자', 'fwd': 'route_walker_cost_fwd_m', 'rev': 'route_walker_cost_rev_m'},
    'stroller': {'label': '유모차', 'fwd': 'route_stroller_cost_fwd_m', 'rev': 'route_stroller_cost_rev_m'},
    'manual_wc': {'label': '수동휠체어', 'fwd': 'route_manual_wc_cost_fwd_m', 'rev': 'route_manual_wc_cost_rev_m'},
    'assist': {'label': 'Power Assist', 'fwd': 'route_assist_cost_fwd_m', 'rev': 'route_assist_cost_rev_m'},
}
ModeName = Literal['walker', 'stroller', 'manual_wc', 'assist']

class LatLon(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)

class RouteRequest(BaseModel):
    start: LatLon
    end: LatLon
    modes: List[ModeName] = ['walker', 'stroller', 'manual_wc', 'assist']

class RouterEngine:
    def __init__(self):
        self.ready = False
        self.error = None
        self._load_lock = threading.Lock()

    def load(self):
        with self._load_lock:
            if self.ready:
                return
            try:
                if not LINKS_FILE.exists():
                    raise FileNotFoundError(f'링크 파일 없음: {LINKS_FILE}')
                if not NODES_FILE.exists():
                    raise FileNotFoundError(f'노드 파일 없음: {NODES_FILE}')

                print('[MODUGIL] Routing data loading...')
                self.links = gpd.read_file(LINKS_FILE, layer='links').reset_index(drop=True)
                self.nodes = gpd.read_file(NODES_FILE, layer='nodes').reset_index(drop=True)

                if self.links.crs.to_epsg() != 5174:
                    self.links = self.links.to_crs('EPSG:5174')
                if self.nodes.crs.to_epsg() != 5174:
                    self.nodes = self.nodes.to_crs('EPSG:5174')

                self.links['시작노드 ID'] = self.links['시작노드 ID'].astype(str).str.strip()
                self.links['종료노드 ID'] = self.links['종료노드 ID'].astype(str).str.strip()
                self.nodes['node_id'] = self.nodes['node_id'].astype(str).str.strip()

                self.node_ids = self.nodes['node_id'].to_numpy()
                self.node_to_idx = {node_id: i for i, node_id in enumerate(self.node_ids)}

                node_xy = np.column_stack([self.nodes.geometry.x.to_numpy(), self.nodes.geometry.y.to_numpy()])
                self.kdtree = cKDTree(node_xy)
                self.to_5174 = Transformer.from_crs('EPSG:4326', 'EPSG:5174', always_xy=True)
                self.to_4326 = Transformer.from_crs('EPSG:5174', 'EPSG:4326', always_xy=True)

                self.adjacency = [[] for _ in range(len(self.nodes))]
                starts = self.links['시작노드 ID'].to_numpy()
                ends = self.links['종료노드 ID'].to_numpy()
                for edge_idx, (u_id, v_id) in enumerate(zip(starts, ends)):
                    u = self.node_to_idx.get(u_id)
                    v = self.node_to_idx.get(v_id)
                    if u is None or v is None:
                        continue
                    self.adjacency[u].append((v, edge_idx, 1))
                    self.adjacency[v].append((u, edge_idx, -1))

                self.weights = {}
                for mode, cfg in MODES.items():
                    fwd = pd.to_numeric(self.links[cfg['fwd']], errors='coerce').to_numpy(dtype=float)
                    rev = pd.to_numeric(self.links[cfg['rev']], errors='coerce').to_numpy(dtype=float)
                    self.weights[mode] = (fwd, rev)

                self.lengths = pd.to_numeric(self.links['routing_length_m'], errors='coerce').fillna(0).to_numpy(dtype=float)
                self.steep8 = pd.to_numeric(self.links.get('steep_8_length_m', 0), errors='coerce').fillna(0).to_numpy(dtype=float)
                self.fwd_up10 = pd.to_numeric(self.links.get('fwd_up_10_pct', np.nan), errors='coerce').to_numpy(dtype=float)
                self.rev_up10 = pd.to_numeric(self.links.get('rev_up_10_pct', np.nan), errors='coerce').to_numpy(dtype=float)

                if 'facility_unknown' in self.links.columns:
                    self.facility_unknown = (
                        self.links['facility_unknown'].astype(str).str.strip().str.lower()
                        .isin(['true', '1', 'yes']).to_numpy(dtype=bool)
                    )
                else:
                    self.facility_unknown = np.zeros(len(self.links), dtype=bool)

                self.ready = True
                print(f'[MODUGIL] Ready: {len(self.links):,} links / {len(self.nodes):,} nodes')
            except Exception as exc:
                self.error = str(exc)
                raise

    def snap(self, lat, lon):
        x, y = self.to_5174.transform(lon, lat)
        distance, idx = self.kdtree.query([x, y], k=1)
        idx = int(idx)
        node = self.nodes.iloc[idx]
        nlon, nlat = self.to_4326.transform(node.geometry.x, node.geometry.y)
        return {'idx': idx, 'node_id': str(node['node_id']), 'distance_m': float(distance), 'lat': float(nlat), 'lon': float(nlon)}

    def shortest_path(self, start_idx, end_idx, mode):
        fwd_weights, rev_weights = self.weights[mode]
        n = len(self.nodes)
        dist = np.full(n, np.inf)
        prev_node = np.full(n, -1, dtype=np.int64)
        prev_edge = np.full(n, -1, dtype=np.int64)
        prev_dir = np.zeros(n, dtype=np.int8)
        visited = np.zeros(n, dtype=bool)
        dist[start_idx] = 0.0
        heap = [(0.0, start_idx)]

        while heap:
            du, u = heapq.heappop(heap)
            if visited[u]:
                continue
            visited[u] = True
            if u == end_idx:
                break
            for v, edge_idx, direction in self.adjacency[u]:
                w = fwd_weights[edge_idx] if direction == 1 else rev_weights[edge_idx]
                if not np.isfinite(w) or w <= 0:
                    continue
                nd = du + w
                if nd < dist[v]:
                    dist[v] = nd
                    prev_node[v] = u
                    prev_edge[v] = edge_idx
                    prev_dir[v] = direction
                    heapq.heappush(heap, (nd, v))

        if not np.isfinite(dist[end_idx]):
            return None

        edges, directions = [], []
        cur = end_idx
        while cur != start_idx:
            edge_idx = int(prev_edge[cur])
            if edge_idx < 0:
                return None
            edges.append(edge_idx)
            directions.append(int(prev_dir[cur]))
            cur = int(prev_node[cur])
        edges.reverse(); directions.reverse()
        return {'cost': float(dist[end_idx]), 'edges': np.asarray(edges, dtype=np.int64), 'directions': np.asarray(directions, dtype=np.int8)}

    def route_response(self, start, end, modes):
        start_snap = self.snap(start.lat, start.lon)
        end_snap = self.snap(end.lat, end.lon)
        results = {}

        for mode in modes:
            result = self.shortest_path(start_snap['idx'], end_snap['idx'], mode)
            if result is None:
                results[mode] = {'error': '경로를 찾지 못했습니다.'}
                continue

            e = result['edges']; d = result['directions']
            physical = float(self.lengths[e].sum())
            steep8 = float(self.steep8[e].sum())
            ups = np.where(d == 1, self.fwd_up10[e], self.rev_up10[e])
            finite_ups = ups[np.isfinite(ups)]
            max_up = float(finite_ups.max()) if len(finite_ups) else None
            unknown_count = int(self.facility_unknown[e].sum())

            route_gdf = self.links.iloc[e][['링크 ID', 'slope_status', 'facility_status', 'geometry']].copy()
            route_gdf['segment_order'] = np.arange(1, len(route_gdf) + 1)
            route_gdf['travel_direction'] = np.where(d == 1, 'FWD', 'REV')
            route_gdf = route_gdf.to_crs('EPSG:4326')

            results[mode] = {
                'label': MODES[mode]['label'],
                'summary': {
                    'physical_distance_m': physical,
                    'equivalent_cost_m': result['cost'],
                    'cost_ratio': result['cost'] / physical if physical > 0 else None,
                    'steep8_distance_m': steep8,
                    'max_up_10_pct': max_up,
                    'facility_unknown_links': unknown_count,
                    'link_count': int(len(e)),
                },
                'geojson': route_gdf.__geo_interface__,
            }

        return {'start_snap': start_snap, 'end_snap': end_snap, 'routes': results}

engine = RouterEngine()
app = FastAPI(title='MODUGIL Routing API', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=False, allow_methods=['GET', 'POST'], allow_headers=['*'])

@app.on_event('startup')
def startup_event():
    engine.load()

@app.get('/api/health')
def health():
    return {'ready': engine.ready, 'error': engine.error, 'links': None if not engine.ready else len(engine.links), 'nodes': None if not engine.ready else len(engine.nodes)}

@app.post('/api/routes')
def routes(request: RouteRequest):
    if not engine.ready:
        raise HTTPException(status_code=503, detail=engine.error or 'Routing engine not ready')
    return engine.route_response(request.start, request.end, list(dict.fromkeys(request.modes)))

@app.get('/')
def index():
    return FileResponse(WEB_DIR / 'index.html')

app.mount('/static', StaticFiles(directory=WEB_DIR / 'static'), name='static')
