"""
xml_layout_service.py
─────────────────────
Parses a Navis SnX (SNX) yard-model XML and returns a fully-normalised
terminal layout dict the frontend can consume directly.

All coordinates are normalised to [0,1]×[0,1] using the yard-model
bounding box so the frontend never needs to know raw metric values.

Coordinate convention:
  normalised X  →  east  (increases right)
  normalised Y  →  north (increases upward, toward quay/sea)

Usage
─────
  from services.xml_layout_service import xml_layout_service

  layout = xml_layout_service.parse("/path/to/terminal.xml")
  layout = xml_layout_service.parse_string(xml_text)
"""

from __future__ import annotations

import re
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("xml_layout_service")


# ─── WKT helpers ─────────────────────────────────────────────────────────────

def _parse_polygon(poly_str: str) -> list[tuple[float, float]]:
    """Parse WKT POLYGON ((...)) → list of (x, y)."""
    inner = re.search(r"POLYGON\s*\(\(\s*(.+?)\s*\)\)", poly_str, re.DOTALL)
    if not inner:
        return []
    pts: list[tuple[float, float]] = []
    for pair in inner.group(1).split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            try:
                pts.append((float(parts[0]), float(parts[1])))
            except ValueError:
                pass
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def _parse_linestring(ls_str: str) -> list[tuple[float, float]]:
    """Parse WKT LINESTRING (...) → list of (x, y)."""
    inner = re.search(r"LINESTRING\s*\(\s*(.+?)\s*\)", ls_str, re.DOTALL)
    if not inner:
        return []
    pts: list[tuple[float, float]] = []
    for pair in inner.group(1).split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            try:
                pts.append((float(parts[0]), float(parts[1])))
            except ValueError:
                pass
    return pts


def _attr(tag_str: str, attr: str) -> str:
    """Extract a single XML attribute value from a raw tag string."""
    m = re.search(rf'\b{re.escape(attr)}="([^"]*)"', tag_str)
    return m.group(1) if m else ""


# ─── Normalisation helpers ────────────────────────────────────────────────────

def _bbox(pts: list[tuple[float, float]]) -> dict[str, float]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return dict(min_x=min(xs), min_y=min(ys), max_x=max(xs), max_y=max(ys),
                width=max(xs)-min(xs), height=max(ys)-min(ys))


def _norm_pts(pts: list[tuple[float, float]], bb: dict) -> list[tuple[float, float]]:
    w, h = bb["width"], bb["height"]
    return [((p[0]-bb["min_x"])/w, (p[1]-bb["min_y"])/h) for p in pts]


def _norm_pt(pt: tuple[float, float], bb: dict) -> tuple[float, float]:
    return ((pt[0]-bb["min_x"])/bb["width"],
            (pt[1]-bb["min_y"])/bb["height"])


def _center(pts: list[tuple[float, float]]) -> tuple[float, float]:
    return (sum(p[0] for p in pts)/len(pts),
            sum(p[1] for p in pts)/len(pts))


def _norm_bbox(norm_pts: list[tuple[float, float]]) -> dict[str, float]:
    return _bbox(norm_pts)


# ─── Main service ─────────────────────────────────────────────────────────────

class XmlLayoutService:
    """
    Parses any Navis SnX XML into a normalised layout dict.

    Returned structure
    ──────────────────
    {
      "yard_code":    str,
      "model_name":   str,
      "bbox":         { min_x, min_y, max_x, max_y, width, height },  # raw metric
      "yard_polygon": [[nx, ny], ...],   # normalised boundary

      "blocks": {
        "<name>": {
          "name":         str,
          "type":         "TRANSTAINER" | "FORKLIFT" | "HEAP" | "LOGICAL",
          "purpose":      str,
          "polygon":      [[nx, ny], ...],
          "center":       [nx, ny],
          "bbox":         { min_x, min_y, max_x, max_y, width, height },
          "rotation_rad": float,
        }, ...
      },

      "berths": {
        "<name>": {
          "name":       str,
          "polygon":    [[nx, ny], ...],
          "center":     [nx, ny],
          "facing_deg": float,
          "bollards":   [[nx, ny], ...],
        }, ...
      },

      "rail_tracks": [
        { "name": str, "center_line": [[nx, ny], ...] }, ...
      ],

      "roads": [
        { "from_vertex": str, "to_vertex": str,
          "graph": str, "points": [[nx, ny], ...] }, ...
      ],
    }
    """

    # ── Public API ────────────────────────────────────────────────────
    
    def __init__(self):
        self._cache = {}

    def parse(self, path: str | Path) -> dict[str, Any]:
        """Parse an XML file on disk."""
        path_str = str(path)
        if path_str not in self._cache:
            self._cache[path_str] = self.parse_string(Path(path).read_text(encoding="utf-8", errors="replace"))
        return self._cache[path_str]

    def parse_string(self, xml: str) -> dict[str, Any]:
        """Parse XML text → normalised layout dict."""
        result: dict[str, Any] = {}

        # ── 1. Yard model metadata & bounding box ─────────────────────
        ym = re.search(r"<yard-model\s([^>]+)>", xml, re.DOTALL)
        if not ym:
            raise ValueError("No <yard-model> element found")
        ym_tag = ym.group(1)

        yard_poly_raw = _attr(ym_tag, "polygon")
        yard_pts_raw  = _parse_polygon(yard_poly_raw)
        if not yard_pts_raw:
            raise ValueError("Could not parse yard polygon")

        bb = _bbox(yard_pts_raw)

        result["yard_code"]    = _attr(ym_tag, "owning-yard-code") or _attr(ym_tag, "name")
        result["model_name"]   = _attr(ym_tag, "model-name")
        result["bbox"]         = bb
        result["yard_polygon"] = _norm_pts(yard_pts_raw, bb)

        # ── 2. All blocks (stack + non-stack) ─────────────────────────
        blocks: dict[str, Any] = {}

        # Match every <stack-block .../> or <non-stack-block .../>
        for raw_tag in re.findall(
            r"<(?:stack|non-stack)-block\s([^>]+?)/>",
            xml, re.DOTALL
        ):
            name    = _attr(raw_tag, "name")
            if not name:
                continue
            btype   = _attr(raw_tag, "block-type") or "UNKNOWN"
            purpose = _attr(raw_tag, "block-purpose") or "BLCK"
            poly_s  = _attr(raw_tag, "polygon")

            try:
                rot = float(_attr(raw_tag, "geometry-rotation") or "0")
            except ValueError:
                rot = 0.0

            raw_pts = _parse_polygon(poly_s) if poly_s else []

            if raw_pts:
                norm_pts = _norm_pts(raw_pts, bb)
                ctr      = _center(norm_pts)
                nb       = _norm_bbox(norm_pts)
                blocks[name] = {
                    "name":         name,
                    "type":         btype,
                    "purpose":      purpose,
                    "polygon":      norm_pts,
                    "center":       list(ctr),
                    "bbox":         nb,
                    "rotation_rad": rot,
                }
            else:
                blocks[name] = {
                    "name":         name,
                    "type":         btype,
                    "purpose":      purpose,
                    "polygon":      [],
                    "center":       [],
                    "bbox":         {},
                    "rotation_rad": rot,
                }

        result["blocks"] = blocks

        # ── 3. Berths ─────────────────────────────────────────────────
        berths: dict[str, Any] = {}

        for raw_tag in re.findall(r"<berth\s([^>]+?)/>", xml, re.DOTALL):
            name   = _attr(raw_tag, "name")
            if not name:
                continue
            poly_s = _attr(raw_tag, "polygon")
            raw_pts = _parse_polygon(poly_s)
            if not raw_pts:
                continue

            norm_pts = _norm_pts(raw_pts, bb)
            ctr      = _center(norm_pts)
            try:
                facing = float(_attr(raw_tag, "facing-direction-deg") or "0")
            except ValueError:
                facing = 0.0

            berths[name] = {
                "name":       name,
                "polygon":    norm_pts,
                "center":     list(ctr),
                "facing_deg": facing,
                "bollards":   [],
                "ingress_vertices": [],
            }

        # Bollards
        for raw_tag in re.findall(r"<berth-marker\s([^>]+?)/>", xml, re.DOTALL):
            berth_name = _attr(raw_tag, "owning-berth")
            loc_m = re.search(r"POINT\s*\(\s*([0-9.eE+\-]+)\s+([0-9.eE+\-]+)", 
                              _attr(raw_tag, "location"))
            ingress_v = _attr(raw_tag, "ingress-vertex")
            if berth_name in berths:
                if loc_m:
                    raw_pt  = (float(loc_m.group(1)), float(loc_m.group(2)))
                    berths[berth_name]["bollards"].append(list(_norm_pt(raw_pt, bb)))
                if ingress_v and ingress_v not in berths[berth_name]["ingress_vertices"]:
                    berths[berth_name]["ingress_vertices"].append(ingress_v)

        result["berths"] = berths

        # ── 4. Rail tracks ────────────────────────────────────────────
        rail_tracks: list[dict[str, Any]] = []

        for raw_tag in re.findall(r"<rail-track\s([^>]+?)/>", xml, re.DOTALL):
            name   = _attr(raw_tag, "name")
            line_s = _attr(raw_tag, "center-line")
            raw_pts = _parse_linestring(line_s)
            if raw_pts:
                rail_tracks.append({
                    "name":        name,
                    "center_line": _norm_pts(raw_pts, bb),
                })

        result["rail_tracks"] = rail_tracks

        # ── 5. Road network ───────────────────────────────────────────
        roads: list[dict[str, Any]] = []

        for raw_tag in re.findall(r"<graph-path\s([^>]+?)/>", xml, re.DOTALL):
            frm    = _attr(raw_tag, "from-vertex")
            to     = _attr(raw_tag, "to-vertex")
            graph  = _attr(raw_tag, "owning-graph")
            line_s = _attr(raw_tag, "path-space")
            dist_s = _attr(raw_tag, "direct-distance-m")
            raw_pts = _parse_linestring(line_s)
            if raw_pts:
                roads.append({
                    "from_vertex": frm,
                    "to_vertex":   to,
                    "graph":       graph,
                    "points":      _norm_pts(raw_pts, bb),
                    "distance_m":  float(dist_s) if dist_s else 0.0,
                })

        result["roads"] = roads

        # ── 6. Graph vertices ─────────────────────────────────────────
        vertices: dict[str, Any] = {}

        for raw_tag in re.findall(r"<graph-vertex\s([^>]+?)/>", xml, re.DOTALL):
            vid = _attr(raw_tag, "id")
            if not vid:
                continue
            loc_m = re.search(r"POINT\s*\(\s*([0-9.eE+\-]+)\s+([0-9.eE+\-]+)", _attr(raw_tag, "location"))
            if loc_m:
                raw_pt = (float(loc_m.group(1)), float(loc_m.group(2)))
                vertices[vid] = {
                    "id": vid,
                    "location": list(_norm_pt(raw_pt, bb)),
                    "raw_x": raw_pt[0],
                    "raw_y": raw_pt[1],
                }

        result["vertices"] = vertices

        logger.info(
            "Parsed %s: %d blocks, %d berths, %d rail tracks, %d road segs",
            result["yard_code"], len(blocks), len(berths),
            len(rail_tracks), len(roads),
        )
        return result

    # ── Routing Engine ────────────────────────────────────────────────

    def compute_distances(self, xml_path: str | Path | None = None, cached: dict | None = None) -> dict:
        """
        Returns distance matrices (in metres) between all blocks and berths based on XML graph.
        { "block_to_berth": { "1A": { "AECT1": { "distance_m": 342.5, "route": [...] } } } }
        """
        if cached is None and xml_path is not None:
            cached = self.parse(xml_path)
        if cached is None:
            raise ValueError("Provide either cached or xml_path")

        distances = {
            "block_to_berth": {},
            "bbox": cached.get("bbox", {})
        }

        roads = cached.get("roads", [])
        vertices = cached.get("vertices", {})
        blocks = cached.get("blocks", {})
        berths = cached.get("berths", {})

        import heapq

        # 1. Build adjacency list for Dijkstra
        adj = {}
        for r in roads:
            u, v, d = r["from_vertex"], r["to_vertex"], r.get("distance_m", 0.0)
            if u not in adj: adj[u] = []
            if v not in adj: adj[v] = []
            adj[u].append((v, d))
            adj[v].append((u, d))

        # Helper to find nearest vertex to a normalized point
        def find_nearest_vertex(nx, ny):
            best_v = None
            best_dist = float('inf')
            for vid, vdata in vertices.items():
                vx, vy = vdata["location"]
                dist = (nx - vx)**2 + (ny - vy)**2
                if dist < best_dist:
                    best_dist = dist
                    best_v = vid
            return best_v

        # 2. Map blocks to vertices
        block_vertices = {}
        for bname, bdata in blocks.items():
            if bdata.get("center"):
                nx, ny = bdata["center"]
                best_v = find_nearest_vertex(nx, ny)
                if best_v:
                    block_vertices[bname] = best_v

        # 3. Map berths to vertices
        berth_vertices = {}
        for bname, bdata in berths.items():
            ivs = bdata.get("ingress_vertices", [])
            if ivs and ivs[0] in vertices:
                berth_vertices[bname] = ivs[0]
            elif bdata.get("center"):
                nx, ny = bdata["center"]
                best_v = find_nearest_vertex(nx, ny)
                if best_v:
                    berth_vertices[bname] = best_v

        # 4. Dijkstra from each block
        for bname, start_v in block_vertices.items():
            dists = {start_v: 0.0}
            prev = {start_v: None}
            pq = [(0.0, start_v)]
            
            while pq:
                d, u = heapq.heappop(pq)
                if d > dists.get(u, float('inf')):
                    continue
                for v, weight in adj.get(u, []):
                    new_d = d + weight
                    if new_d < dists.get(v, float('inf')):
                        dists[v] = new_d
                        prev[v] = u
                        heapq.heappush(pq, (new_d, v))

            def get_route(tv):
                route = []
                curr = tv
                while curr is not None:
                    route.append(curr)
                    curr = prev.get(curr)
                return route[::-1]

            distances["block_to_berth"][bname] = {}
            for berth_name, target_v in berth_vertices.items():
                if target_v in dists:
                    distances["block_to_berth"][bname][berth_name] = {
                        "distance_m": dists[target_v],
                        "route": get_route(target_v)
                    }
                else:
                    b_center = blocks[bname].get("center")
                    berth_center = berths[berth_name].get("center")
                    if b_center and berth_center:
                        dx = abs(b_center[0] - berth_center[0]) * cached.get("bbox", {}).get("width", 2000)
                        dy = abs(b_center[1] - berth_center[1]) * cached.get("bbox", {}).get("height", 800)
                        fallback_dist = dx + dy
                    else:
                        fallback_dist = 0.0

                    distances["block_to_berth"][bname][berth_name] = {
                        "distance_m": fallback_dist,
                        "route": []
                    }
            
        return distances

    # ── Convenience helper used by _deterministic_layout ─────────────

    def get_normalized_layout(
        self,
        block_names: list[str],
        xml_path: str | Path | None = None,
        cached: dict[str, Any] | None = None,
    ) -> dict[str, dict]:
        """
        Returns simplified layout dict:
          { block_name: { x, y, w, h, polygon } }
        Pass either cached parsed dict or xml_path to parse.
        """
        if cached is None and xml_path is not None:
            cached = self.parse(xml_path)
        if cached is None:
            raise ValueError("Provide either cached or xml_path")

        result: dict[str, dict] = {}
        for name in block_names:
            blk = cached["blocks"].get(name)
            if blk and blk.get("center") and blk.get("bbox"):
                result[name] = {
                    "x":       blk["center"][0],
                    "y":       1.0 - blk["center"][1],
                    "w":       blk["bbox"]["width"],
                    "h":       blk["bbox"]["height"],
                    "polygon": blk["polygon"],
                }
            else:
                idx = block_names.index(name)
                result[name] = {
                    "x": 0.5 + (idx % 3) * 0.1,
                    "y": 0.5 + (idx // 3) * 0.08,
                    "w": 0.08,
                    "h": 0.025,
                    "polygon": [],
                }
        return result


# ── Singleton ─────────────────────────────────────────────────────────────────
xml_layout_service = XmlLayoutService()