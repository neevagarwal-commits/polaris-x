"use client";

if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium/";
}

import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Iceberg {
  Iceberg: string;
  Latitude: string;
  Longitude: string;
  "Length (NM)": string;
  "Width (NM)": string;
  "Area (sqKM)": string;
  "Last Update": string;
}
interface RouteStats { distance_km: number; average_risk: number; maximum_risk: number; high_risk_cells: number; }
interface TrajectoryPoint { hour: number; latitude: number; longitude: number; }
interface LayerState { enabled: boolean; loading: boolean; error: string | null; alpha: number; }

const API = "http://127.0.0.1:8000";

// ─── Layer config ─────────────────────────────────────────────────────────────
const LAYER_DEFS = [
  { id: "sea-ice",        name: "Sea Ice Concentration", sub: "L4 OSI-SAF Satellite · Daily",        color: "#38bdf8", icon: "❄️",  alpha: 0.82 },
  { id: "risk",           name: "Navigation Risk",        sub: "Sea Ice + Iceberg Hazard Fusion",      color: "#ef4444", icon: "⚠️",  alpha: 0.80 },
  { id: "ocean-currents", name: "Ocean Currents",         sub: "ACC · Weddell & Ross Gyres · 6h",     color: "#06b6d4", icon: "🌊",  alpha: 0.85 },
  { id: "wind",           name: "Wind Field",              sub: "10m Winds · Polar Vortex · 3h",       color: "#a855f7", icon: "💨",  alpha: 0.80 },
  { id: "visibility",     name: "Visibility / Weather",   sub: "Maritime Fog & Storm Systems · 6h",   color: "#f59e0b", icon: "🌫️", alpha: 0.82 },
] as const;
type LayerId = typeof LAYER_DEFS[number]["id"];

// ─── Clock ────────────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toUTCString().replace("GMT", "UTC").slice(5));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span>{time}</span>;
}

// ─── Coordinate display ───────────────────────────────────────────────────────
function CoordHUD({ vr }: { vr: React.RefObject<Cesium.Viewer | null> }) {
  const [c, setC] = useState<{ lat: number; lon: number; alt: number } | null>(null);
  useEffect(() => {
    const iv = setInterval(() => {
      const v = vr.current;
      if (!v || v.isDestroyed()) return;
      const p = v.camera.positionCartographic;
      if (p) setC({ lat: Cesium.Math.toDegrees(p.latitude), lon: Cesium.Math.toDegrees(p.longitude), alt: p.height / 1000 });
    }, 200);
    return () => clearInterval(iv);
  }, [vr]);
  if (!c) return null;
  const lat = c.lat >= 0 ? `${c.lat.toFixed(3)}°N` : `${Math.abs(c.lat).toFixed(3)}°S`;
  const lon = c.lon >= 0 ? `${c.lon.toFixed(3)}°E` : `${Math.abs(c.lon).toFixed(3)}°W`;
  const alt = c.alt >= 1000 ? `${(c.alt / 1000).toFixed(2)} Mm` : `${c.alt.toFixed(1)} km`;
  return (
    <div style={{
      position: "absolute", bottom: 26, left: "50%", transform: "translateX(-50%)",
      zIndex: 90, pointerEvents: "none",
      background: "rgba(1,5,15,0.90)", backdropFilter: "blur(24px)",
      border: "1px solid rgba(56,189,248,0.22)", borderRadius: 14,
      padding: "8px 28px", color: "#64748b",
      fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: 11,
      display: "flex", gap: 24, letterSpacing: "0.07em",
      boxShadow: "0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(56,189,248,0.04)"
    }}>
      <span><span style={{ color: "#38bdf8", fontWeight: 700 }}>LAT </span>{lat}</span>
      <span style={{ color: "rgba(56,189,248,0.25)" }}>|</span>
      <span><span style={{ color: "#38bdf8", fontWeight: 700 }}>LON </span>{lon}</span>
      <span style={{ color: "rgba(56,189,248,0.25)" }}>|</span>
      <span><span style={{ color: "#38bdf8", fontWeight: 700 }}>ALT </span>{alt}</span>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ online }: { online: boolean }) {
  return (
    <span style={{
      display: "flex", alignItems: "center", gap: 5,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
      color: online ? "#22c55e" : "#ef4444",
      background: online ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
      border: `1px solid ${online ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
      padding: "3px 10px", borderRadius: 6, letterSpacing: "0.06em"
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: online ? "#22c55e" : "#ef4444",
        boxShadow: online ? "0 0 6px #22c55e" : "0 0 6px #ef4444",
        animation: "pulse 2s ease-in-out infinite"
      }} />
      {online ? "LIVE" : "OFFLINE"}
    </span>
  );
}

// ─── Main Globe Component ─────────────────────────────────────────────────────
export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const layerRefsMap = useRef<Record<LayerId, Cesium.ImageryLayer | null>>({
    "sea-ice": null, risk: null, "ocean-currents": null, wind: null, visibility: null,
  });

  const [globeReady, setGlobeReady] = useState(false);
  const [panel, setPanel] = useState<"icebergs" | "route" | "layers">("icebergs");
  const [backendOnline, setBackendOnline] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  // Icebergs
  const [icebergs, setIcebergs] = useState<Iceberg[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Iceberg | null>(null);
  const [trajLoading, setTrajLoading] = useState(false);
  const [trajActive, setTrajActive] = useState(false);

  // Route
  const [startLat, setStartLat] = useState("-60.0");
  const [startLon, setStartLon] = useState("-70.0");
  const [destLat, setDestLat] = useState("-65.0");
  const [destLon, setDestLon] = useState("-30.0");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [routeErr, setRouteErr] = useState<string | null>(null);
  const [routeActive, setRouteActive] = useState(false);

  // Layers — ref-based state to avoid stale closures
  const layerStateRef = useRef<Record<LayerId, LayerState>>({
    "sea-ice":        { enabled: false, loading: false, error: null, alpha: 0.82 },
    risk:             { enabled: false, loading: false, error: null, alpha: 0.80 },
    "ocean-currents": { enabled: false, loading: false, error: null, alpha: 0.85 },
    wind:             { enabled: false, loading: false, error: null, alpha: 0.80 },
    visibility:       { enabled: false, loading: false, error: null, alpha: 0.82 },
  });
  const [layers, setLayersUI] = useState<Record<LayerId, LayerState>>(layerStateRef.current);

  const updateLayerState = useCallback((id: LayerId, patch: Partial<LayerState>) => {
    layerStateRef.current = {
      ...layerStateRef.current,
      [id]: { ...layerStateRef.current[id], ...patch },
    };
    setLayersUI({ ...layerStateRef.current });
  }, []);

  // ── Check backend health ────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      fetch(`${API}/`)
        .then(r => r.ok ? setBackendOnline(true) : setBackendOnline(false))
        .catch(() => setBackendOnline(false));
    };
    check();
    const iv = setInterval(check, 10000);
    return () => clearInterval(iv);
  }, []);

  // ── Highlight & fly to iceberg ─────────────────────────────────────────────
  const focusIceberg = useCallback((iceberg: Iceberg) => {
    setSelected(iceberg);
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    const lat = parseFloat(iceberg.Latitude), lon = parseFloat(iceberg.Longitude);
    if (!isFinite(lat) || !isFinite(lon)) return;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 1_500_000),
      duration: 2.2,
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
    });
    v.entities.values.forEach(e => {
      if (typeof e.id !== "string" || !e.id.startsWith("iceberg-") || !e.point) return;
      (e.point.color as Cesium.ConstantProperty).setValue(
        e.id === `iceberg-${iceberg.Iceberg}`
          ? Cesium.Color.fromCssColorString("#f59e0b")
          : Cesium.Color.fromCssColorString("#00e5ff")
      );
      (e.point.pixelSize as Cesium.ConstantProperty).setValue(
        e.id === `iceberg-${iceberg.Iceberg}` ? 20 : 10
      );
    });
  }, []);

  // ── Cesium viewer init ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let resizeObs: ResizeObserver | null = null;
    let clickHandler: Cesium.ScreenSpaceEventHandler | null = null;

    Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

    // Progress animation
    let prog = 0;
    const progTimer = setInterval(() => {
      prog = Math.min(prog + Math.random() * 12, 85);
      setLoadProgress(Math.round(prog));
    }, 200);

    // Ensure the container has explicit dimensions BEFORE initializing the viewer
    if (containerRef.current) {
      containerRef.current.style.width = "100%";
      containerRef.current.style.height = "100%";
      containerRef.current.style.position = "absolute";
      containerRef.current.style.inset = "0";
    }

    let viewer: Cesium.Viewer | null = null;

    const initGlobe = () => {
      if (!mounted || !containerRef.current) return;
      
      // Wait for layout dimensions to be resolved
      if (containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0) {
        setTimeout(initGlobe, 50);
        return;
      }

      viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.OpenStreetMapImageryProvider({
            url: "https://a.tile.openstreetmap.org/",
          })
        ),
        terrain: Cesium.Terrain.fromWorldTerrain({
          requestWaterMask: false,
          requestVertexNormals: true,
        }),
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: true,
        requestRenderMode: false,
        msaaSamples: 4,
      });

      viewerRef.current = viewer;

      // Force full-size canvas styles
      const fill = (el: Element | null) => {
        if (!el) return;
        Object.assign((el as HTMLElement).style, {
          position: "absolute", inset: "0", width: "100%", height: "100%", margin: "0", padding: "0"
        });
      };
      fill(containerRef.current);
      fill(viewer.container.querySelector(".cesium-viewer"));
      fill(viewer.container.querySelector(".cesium-widget"));
      Object.assign(viewer.scene.canvas.style, {
        position: "absolute", left: "0", top: "0", width: "100%", height: "100%", display: "block"
      });

      viewer.resize();

      // Defer lighting until we are absolutely sure the render pass has completed once
      setTimeout(() => {
        if (!mounted || !viewer || viewer.isDestroyed()) return;
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.depthTestAgainstTerrain = true;
      }, 100);

      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#061a2e");
      viewer.scene.globe.maximumScreenSpaceError = 1.5;
      (viewer.scene.globe as unknown as Record<string, unknown>).atmosphereLightIntensity = 10.0;
      (viewer.scene.globe as unknown as Record<string, unknown>).atmosphereRayleighCoefficient = new Cesium.Cartesian3(5.5e-6, 13.0e-6, 28.4e-6);
      (viewer.scene.globe as unknown as Record<string, unknown>).atmosphereMieCoefficient = new Cesium.Cartesian3(2.1e-5, 2.1e-5, 2.1e-5);
      (viewer.scene.globe as unknown as Record<string, unknown>).atmosphereMieAnisotropy = 0.9;
      viewer.scene.globe.showSkirts = true;
      viewer.scene.postProcessStages.fxaa.enabled = true;
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#010a18");

      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.atmosphereLightIntensity = 15.0;
        viewer.scene.skyAtmosphere.atmosphereRayleighCoefficient = new Cesium.Cartesian3(5.5e-6, 13.0e-6, 28.4e-6);
      }

      if (viewer.scene.skyBox) {
        viewer.scene.skyBox.show = true;
      }

      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.0002;
      viewer.scene.fog.minimumBrightness = 0.05;

      resizeObs = new ResizeObserver(() => {
        if (viewer && !viewer.isDestroyed()) { viewer.resize(); viewer.scene.requestRender(); }
      });
      resizeObs.observe(containerRef.current);

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, -90, 22_000_000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      });

      setTimeout(() => {
        if (!mounted || !viewer || viewer.isDestroyed()) return;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-30, -72, 12_000_000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
          duration: 4.0,
          easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        });
      }, 500);

      // Enhance base imagery when loaded
      (async () => {
        try {
          await new Promise(r => setTimeout(r, 2500));
          if (!mounted || !viewer || viewer.isDestroyed()) return;

          const baseLayer = viewer.imageryLayers.get(0);
          if (baseLayer) {
            baseLayer.brightness = 1.05;
            baseLayer.contrast = 1.1;
            baseLayer.saturation = 1.12;
            baseLayer.gamma = 0.9;
          }

          clearInterval(progTimer);
          setLoadProgress(100);
          setTimeout(() => { if (mounted) setGlobeReady(true); }, 400);
        } catch {
          if (!mounted) return;
          clearInterval(progTimer);
          setLoadProgress(100);
          setTimeout(() => { if (mounted) setGlobeReady(true); }, 400);
        }
      })();

      clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
        if (!viewer || viewer.isDestroyed()) return;
        const picked = viewer.scene.pick(e.position);
        if (!Cesium.defined(picked) || !picked.id?.properties?.icebergData) return;
        const d = picked.id.properties.icebergData.getValue(Cesium.JulianDate.now()) as Iceberg;
        if (d) {
          setIcebergs(prev => {
            const f = prev.find(i => i.Iceberg === d.Iceberg);
            if (f) setSelected(f);
            return prev;
          });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    };

    initGlobe();

    // The globe is initialized via initGlobe() which handles its own resize observers and click handlers.

    return () => {
      mounted = false;
      clearInterval(progTimer);
      resizeObs?.disconnect();
      clickHandler?.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, [focusIceberg]);

  // ── Layer management ───────────────────────────────────────────────────────
  const toggleLayer = useCallback(async (id: LayerId) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const current = layerStateRef.current[id];
    if (current.loading) return;

    if (current.enabled) {
      const existingLayer = layerRefsMap.current[id];
      if (existingLayer) existingLayer.show = false;
      updateLayerState(id, { enabled: false });
      return;
    }

    const existingLayer = layerRefsMap.current[id];
    if (existingLayer) {
      existingLayer.show = true;
      existingLayer.alpha = layerStateRef.current[id].alpha;
      updateLayerState(id, { enabled: true });
      return;
    }

    // First load — fetch from backend
    updateLayerState(id, { loading: true, error: null, enabled: true });

    try {
      // Add cache-busting timestamp for fresh data
      const url = `${API}/api/layers/${id}/image?t=${Date.now()}`;

      // Antarctic coverage rectangle — full globe width, southern hemisphere only
      const rect = Cesium.Rectangle.fromDegrees(-180, -90, 180, -44);

      const provider = await Cesium.SingleTileImageryProvider.fromUrl(url, { rectangle: rect });
      if (viewer.isDestroyed()) return;

      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.alpha = layerStateRef.current[id].alpha;
      layer.show = true;

      // Color enhance based on layer type
      if (id === "sea-ice") {
        layer.colorToAlpha = new Cesium.Color(0, 0.05, 0.15);
        layer.colorToAlphaThreshold = 0.005;
      }

      layerRefsMap.current[id] = layer;
      updateLayerState(id, { enabled: true, loading: false, error: null });

      // Fly to Antarctica if not already there
      const cam = viewer.camera;
      const pos = cam.positionCartographic;
      const camLat = Cesium.Math.toDegrees(pos.latitude);
      if (camLat > -30) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-30, -72, 12_000_000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
          duration: 2.5,
        });
      }
    } catch (err) {
      console.error(`Layer ${id} failed:`, err);
      updateLayerState(id, {
        loading: false, enabled: false,
        error: "Backend unreachable — ensure backend is running on :8000"
      });
    }
  }, [updateLayerState]);

  const setLayerAlpha = useCallback((id: LayerId, alpha: number) => {
    const layer = layerRefsMap.current[id];
    if (layer) layer.alpha = alpha;
    updateLayerState(id, { alpha });
  }, [updateLayerState]);

  const refreshLayer = useCallback(async (id: LayerId) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const existingLayer = layerRefsMap.current[id];
    if (existingLayer) {
      viewer.imageryLayers.remove(existingLayer);
      layerRefsMap.current[id] = null;
    }
    updateLayerState(id, { enabled: false, loading: false, error: null });
    setTimeout(() => toggleLayer(id), 80);
  }, [toggleLayer, updateLayerState]);

  // ── Fetch icebergs ────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${API}/api/icebergs`)
      .then(r => r.json())
      .then(data => {
        if (!active || data.status !== "success") return;
        setIcebergs(data.icebergs);
        const v = viewerRef.current;
        if (!v || v.isDestroyed()) return;
        v.entities.values
          .filter(e => typeof e.id === "string" && e.id.startsWith("iceberg-"))
          .forEach(e => v.entities.remove(e));

        data.icebergs.forEach((icb: Iceberg) => {
          const lat = +icb.Latitude, lon = +icb.Longitude;
          if (!isFinite(lat) || !isFinite(lon)) return;
          v.entities.add({
            id: `iceberg-${icb.Iceberg}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 8_000),
            point: {
              pixelSize: 11,
              color: Cesium.Color.fromCssColorString("#00e5ff"),
              outlineColor: Cesium.Color.fromCssColorString("rgba(0,229,255,0.25)"),
              outlineWidth: 5,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: icb.Iceberg,
              font: "bold 12px 'JetBrains Mono', 'Courier New', monospace",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 4,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -18),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString("rgba(1,5,15,0.88)"),
              backgroundPadding: new Cesium.Cartesian2(7, 4),
              scaleByDistance: new Cesium.NearFarScalar(300_000, 1.4, 15_000_000, 0.3),
            },
            properties: { icebergData: icb },
          });
        });
      })
      .catch(e => console.warn("Icebergs fetch error:", e))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // ── Drift trajectory ───────────────────────────────────────────────────────
  const predictTrajectory = async (iceberg: Iceberg) => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed() || trajLoading) return;
    setTrajLoading(true);
    try {
      const r = await fetch(`${API}/api/icebergs/${iceberg.Iceberg}/trajectory`);
      const data = await r.json();
      if (data.status !== "success" || !Array.isArray(data.trajectory)) return;

      // Clear old trajectory
      v.entities.values
        .filter(e => typeof e.id === "string" && (e.id.startsWith("traj-") || e.id.startsWith("forecast-")))
        .forEach(e => v.entities.remove(e));

      const pts: TrajectoryPoint[] = data.trajectory;
      const positions = pts.map(p => Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, 60_000));

      // Outer glow
      v.entities.add({
        id: `traj-line-glow-${iceberg.Iceberg}`,
        polyline: {
          positions, width: 16,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.55, taperPower: 0.9,
            color: Cesium.Color.fromCssColorString("#d946ef")
          }),
          arcType: Cesium.ArcType.GEODESIC, clampToGround: false,
        },
      });
      // Core line
      v.entities.add({
        id: `traj-line-${iceberg.Iceberg}`,
        polyline: {
          positions, width: 2.5,
          material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString("#f0abfc")),
          arcType: Cesium.ArcType.GEODESIC, clampToGround: false,
        },
      });

      pts.forEach(pt => {
        v.entities.add({
          id: `forecast-${iceberg.Iceberg}-${pt.hour}`,
          position: Cesium.Cartesian3.fromDegrees(pt.longitude, pt.latitude, 60_000),
          point: {
            pixelSize: pt.hour === 0 ? 18 : 11,
            color: pt.hour === 0 ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString("#f0abfc"),
            outlineColor: Cesium.Color.fromCssColorString("#a855f7"),
            outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: pt.hour === 0 ? "NOW" : `+${pt.hour}H`,
            font: pt.hour === 0 ? "bold 14px monospace" : "bold 11px monospace",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      });

      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      v.camera.flyToBoundingSphere(sphere, {
        duration: 2.5,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(sphere.radius * 2.2, 600_000)),
      });
      setTrajActive(true);
    } catch (err) { console.error("Trajectory error:", err); }
    finally { setTrajLoading(false); }
  };

  const clearTrajectory = () => {
    const v = viewerRef.current;
    if (v && !v.isDestroyed()) {
      v.entities.values
        .filter(e => typeof e.id === "string" && (e.id.startsWith("traj-") || e.id.startsWith("forecast-")))
        .forEach(e => v.entities.remove(e));
    }
    setTrajActive(false);
  };

  // ── Route planning ────────────────────────────────────────────────────────
  const planRoute = useCallback(async () => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed() || routeLoading) return;
    setRouteLoading(true); setRouteErr(null); setRouteStats(null);

    v.entities.values
      .filter(e => typeof e.id === "string" && (e.id.startsWith("nav-route-") || e.id.startsWith("nav-marker-")))
      .forEach(e => v.entities.remove(e));

    try {
      const params = new URLSearchParams({ start_lat: startLat, start_lon: startLon, destination_lat: destLat, destination_lon: destLon });
      const res = await fetch(`${API}/api/navigation/plan?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.status !== "success") { setRouteErr(data.message || "Route planning failed"); return; }

      setRouteStats(data.statistics);
      const route: { latitude: number; longitude: number; total_risk: number }[] = data.route;
      const positions = route.map(pt => Cesium.Cartesian3.fromDegrees(pt.longitude, pt.latitude, 50_000));

      // Outer glow
      v.entities.add({
        id: "nav-route-glow",
        polyline: {
          positions, width: 32, arcType: Cesium.ArcType.GEODESIC,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3, taperPower: 0.75,
            color: Cesium.Color.fromCssColorString("#00ffff")
          })
        },
      });
      // Core line
      v.entities.add({
        id: "nav-route-core",
        polyline: {
          positions, width: 3, arcType: Cesium.ArcType.GEODESIC,
          material: new Cesium.ColorMaterialProperty(Cesium.Color.WHITE)
        },
      });

      // Risk-colored segments
      for (let i = 0; i < route.length - 1; i++) {
        const risk = route[i].total_risk;
        const color = risk < 0.25 ? "#22c55e" : risk < 0.5 ? "#eab308" : risk < 0.75 ? "#f97316" : "#ef4444";
        v.entities.add({
          id: `nav-route-seg-${i}`,
          polyline: {
            positions: [positions[i], positions[i + 1]], width: 5,
            arcType: Cesium.ArcType.GEODESIC,
            material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(color)),
          },
        });
      }

      const addMarker = (id: string, lat: number, lon: number, color: string, label: string) =>
        v.entities.add({
          id, position: Cesium.Cartesian3.fromDegrees(lon, lat, 65_000),
          point: {
            pixelSize: 24, color: Cesium.Color.fromCssColorString(color),
            outlineColor: Cesium.Color.WHITE, outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: label, font: "bold 13px monospace", fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK, outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -28),
            disableDepthTestDistance: Number.POSITIVE_INFINITY, showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString("rgba(1,5,15,0.92)"),
            backgroundPadding: new Cesium.Cartesian2(8, 5),
          },
        });

      addMarker("nav-marker-start", data.start.latitude, data.start.longitude, "#22c55e", "⚓ START");
      addMarker("nav-marker-dest", data.destination.latitude, data.destination.longitude, "#ef4444", "🎯 DEST");

      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      v.camera.flyToBoundingSphere(sphere, {
        duration: 2.5,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(sphere.radius * 1.8, 1_000_000)),
      });
      setRouteActive(true);
    } catch (err) {
      setRouteErr("Navigation API error — is the backend running on :8000?");
      console.error("Route error:", err);
    } finally { setRouteLoading(false); }
  }, [startLat, startLon, destLat, destLon, routeLoading]);

  const clearRoute = () => {
    const v = viewerRef.current;
    if (v && !v.isDestroyed()) {
      v.entities.values
        .filter(e => typeof e.id === "string" && (e.id.startsWith("nav-route-") || e.id.startsWith("nav-marker-")))
        .forEach(e => v.entities.remove(e));
    }
    setRouteStats(null); setRouteErr(null); setRouteActive(false);
  };

  // ─── Active layer count ────────────────────────────────────────────────────
  const activeLayers = Object.values(layers).filter(l => l.enabled).length;

  // ─── Styles ───────────────────────────────────────────────────────────────
  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Courier New', Courier, monospace" };
  const panelS: React.CSSProperties = {
    position: "absolute", top: 70, right: 18, width: 390,
    maxHeight: "calc(100vh - 90px)",
    background: "rgba(1,5,14,0.97)",
    backdropFilter: "blur(32px) saturate(1.6)",
    border: "1px solid rgba(56,189,248,0.14)",
    borderRadius: 22, overflow: "hidden",
    display: "flex", flexDirection: "column", zIndex: 100,
    boxShadow: "0 48px 120px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(56,189,248,0.04)",
  };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "14px 0",
    background: active ? "rgba(56,189,248,0.07)" : "transparent",
    border: "none",
    borderBottom: active ? "2px solid #38bdf8" : "2px solid transparent",
    color: active ? "#38bdf8" : "#475569",
    ...mono, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.09em", cursor: "pointer",
    textTransform: "uppercase", transition: "all 0.22s",
  });
  const inputS: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(56,189,248,0.18)",
    borderRadius: 10, color: "#f8fafc", ...mono, fontSize: 12,
    outline: "none", boxSizing: "border-box",
    transition: "border-color 0.2s",
  };
  const ctrlBtn: React.CSSProperties = {
    width: 42, height: 42,
    background: "rgba(1,5,14,0.94)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(56,189,248,0.16)",
    borderRadius: 13, color: "#64748b",
    fontSize: 18, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    transition: "all 0.18s",
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#010a18" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes spinSlow { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.5; transform:scale(0.92) } }
        @keyframes slideIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes layerPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(56,189,248,0) } 60% { box-shadow: 0 0 18px 2px rgba(56,189,248,0.2) } }
        @keyframes scanline { 0% { top: -10% } 100% { top: 110% } }
        @keyframes progressFill { from { width: 0% } }
        @keyframes borderGlow { 0%,100% { border-color: rgba(56,189,248,0.14) } 50% { border-color: rgba(56,189,248,0.28) } }
        .layer-card-active { animation: layerPulse 3s ease-in-out infinite; }
        .ctrl-btn:hover { background: rgba(56,189,248,0.1) !important; border-color: rgba(56,189,248,0.4) !important; color: #38bdf8 !important; transform: scale(1.08) !important; }
        .tab-btn:hover { color: #94a3b8 !important; background: rgba(56,189,248,0.03) !important; }
        .iceberg-row:hover { background: rgba(56,189,248,0.07) !important; cursor: pointer; }
        .preset-btn:hover { background: rgba(56,189,248,0.1) !important; border-color: rgba(56,189,248,0.25) !important; color: #7dd3fc !important; }
        .layer-toggle { transition: background 0.28s !important; }
        .layer-toggle:active { transform: scale(0.94); }
        .refresh-btn:hover { color: #38bdf8 !important; background: rgba(56,189,248,0.1) !important; }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 3px; border-radius: 2px; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; cursor: pointer; box-shadow: 0 0 8px currentColor; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(56,189,248,0.18); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(56,189,248,0.38); }
        .cesium-widget-credits { display: none !important; }
        .cesium-viewer-bottom { display: none !important; }
        .cesium-performanceDisplay-defaultContainer { display: none !important; }
      `}</style>

      {/* Globe canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Loading overlay */}
      {!globeReady && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at center, rgba(2,10,24,0.99) 0%, rgba(1,4,12,1) 100%)",
          zIndex: 200, pointerEvents: "none", gap: 28,
        }}>
          {/* Scanning line effect */}
          <div style={{
            position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none"
          }}>
            <div style={{
              position: "absolute", left: 0, right: 0, height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.4), transparent)",
              animation: "scanline 2.5s linear infinite"
            }} />
          </div>

          {/* Spinner */}
          <div style={{ position: "relative", width: 96, height: 96 }}>
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none" style={{ position: "absolute", inset: 0, animation: "spin 2s linear infinite" }}>
              <circle cx="48" cy="48" r="44" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="240" strokeDashoffset="160" strokeLinecap="round"/>
            </svg>
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none" style={{ position: "absolute", inset: 0, animation: "spin 3.5s linear infinite reverse" }}>
              <circle cx="48" cy="48" r="28" stroke="rgba(56,189,248,0.3)" strokeWidth="1" strokeDasharray="140" strokeDashoffset="60" strokeLinecap="round"/>
            </svg>
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none" style={{ position: "absolute", inset: 0, animation: "spinSlow 8s linear infinite" }}>
              <circle cx="48" cy="48" r="14" stroke="rgba(56,189,248,0.15)" strokeWidth="1" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round"/>
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: "#38bdf8",
                boxShadow: "0 0 20px #38bdf8, 0 0 40px rgba(56,189,248,0.5)",
                animation: "pulse 1.5s ease-in-out infinite"
              }} />
            </div>
          </div>

          {/* Text */}
          <div style={{ textAlign: "center", animation: "fadeIn 0.8s ease" }}>
            <div style={{ ...mono, color: "#38bdf8", fontSize: 22, fontWeight: 800, letterSpacing: "0.2em", marginBottom: 4 }}>
              POLARIS<span style={{ color: "#7dd3fc" }}>-X</span>
            </div>
            <div style={{ ...mono, color: "#1e3a5f", fontSize: 10, letterSpacing: "0.1em", marginBottom: 20 }}>
              ANTARCTIC NAVIGATION INTELLIGENCE
            </div>
            {/* Progress bar */}
            <div style={{ width: 240, height: 2, background: "rgba(56,189,248,0.1)", borderRadius: 1, overflow: "hidden", margin: "0 auto" }}>
              <div style={{
                height: "100%", borderRadius: 1,
                background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                width: `${loadProgress}%`,
                transition: "width 0.3s ease",
                boxShadow: "0 0 8px #38bdf8",
              }} />
            </div>
            <div style={{ ...mono, color: "#1e3a5f", fontSize: 10, marginTop: 10, letterSpacing: "0.06em", animation: "pulse 2s ease-in-out infinite" }}>
              {loadProgress < 30 ? "INITIALIZING CESIUM ION…" :
               loadProgress < 60 ? "LOADING WORLD TERRAIN…" :
               loadProgress < 85 ? "CALIBRATING GLOBE…" : "RENDERING…"}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 64,
        background: "linear-gradient(180deg,rgba(1,5,14,0.97) 0%,rgba(1,5,14,0.75) 70%,transparent 100%)",
        display: "flex", alignItems: "center", padding: "0 22px", gap: 14, zIndex: 90,
        pointerEvents: "none",
      }}>
        {/* Logo mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="#38bdf8" strokeWidth="1.5" />
            <path d="M16 4L16 28M4 16L28 16" stroke="#38bdf8" strokeWidth="1" opacity="0.35" />
            <ellipse cx="16" cy="16" rx="7" ry="14" stroke="#38bdf8" strokeWidth="0.8" opacity="0.25" />
            <circle cx="16" cy="16" r="3.5" fill="#38bdf8" style={{ filter: "drop-shadow(0 0 8px #38bdf8)" }} />
          </svg>
          <div>
            <div style={{ ...mono, fontWeight: 800, fontSize: 20, letterSpacing: "0.16em", color: "#f8fafc", lineHeight: 1 }}>
              POLARIS<span style={{ color: "#38bdf8" }}>-X</span>
            </div>
            <div style={{ ...mono, fontSize: 8, color: "#1e3a5f", letterSpacing: "0.1em" }}>
              ANTARCTIC NAVIGATION INTELLIGENCE
            </div>
          </div>
        </div>

        <StatusBadge online={backendOnline} />

        {activeLayers > 0 && (
          <span style={{
            ...mono, fontSize: 9, fontWeight: 700,
            color: "#7dd3fc", background: "rgba(56,189,248,0.08)",
            border: "1px solid rgba(56,189,248,0.2)", padding: "2px 9px",
            borderRadius: 5, letterSpacing: "0.06em",
          }}>
            {activeLayers} LAYER{activeLayers > 1 ? "S" : ""} ACTIVE
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ ...mono, fontSize: 9, color: "#1e3a5f" }}>
            <LiveClock />
          </span>
          <span style={{ ...mono, fontSize: 9, color: "#1e3a5f" }}>
            {icebergs.length} ICEBERGS · CESIUM ION
          </span>
        </div>
      </header>

      {/* Side panel */}
      <aside style={panelS}>
        {/* Panel top glow */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.5), transparent)",
        }} />

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(56,189,248,0.08)", flexShrink: 0 }}>
          {([ ["icebergs", "❄ ICEBERGS"], ["route", "⬡ A* ROUTE"], ["layers", "◈ LAYERS"]] as const).map(([id, label]) => (
            <button key={id} id={`tab-${id}`} onClick={() => setPanel(id)} style={tabStyle(panel === id)} className="tab-btn">
              {label}
            </button>
          ))}
        </div>

        {/* ── ICEBERGS TAB ──────────────────────────────────────────────── */}
        {panel === "icebergs" && (
          <div style={{ overflowY: "auto", flex: 1, animation: "slideIn 0.2s ease" }}>
            <div style={{ padding: "10px 16px 6px", fontSize: 10, ...mono, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: loading ? "#f59e0b" : "#22c55e", display: "flex", alignItems: "center", gap: 6 }}>
                {loading && <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", animation: "pulse 0.9s infinite" }} />}
                {loading ? "FETCHING TELEMETRY…" : `${icebergs.length} ICEBERGS TRACKED`}
              </span>
              <span style={{ color: "#38bdf8", fontSize: 9, opacity: 0.6 }}>USNIC LIVE FEED</span>
            </div>

            {icebergs.map(icb => {
              const sel = selected?.Iceberg === icb.Iceberg;
              return (
                <div key={icb.Iceberg} id={`iceberg-item-${icb.Iceberg}`}
                  onClick={() => focusIceberg(icb)}
                  className="iceberg-row"
                  style={{
                    padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.025)",
                    background: sel ? "rgba(56,189,248,0.09)" : "transparent",
                    transition: "background 0.15s",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    borderLeft: sel ? "3px solid #38bdf8" : "3px solid transparent",
                  }}>
                  <div>
                    <div style={{ color: sel ? "#38bdf8" : "#e2e8f0", fontWeight: 700, fontSize: 13, ...mono }}>
                      {icb.Iceberg}
                    </div>
                    <div style={{ color: "#334155", fontSize: 10, marginTop: 2 }}>
                      {parseFloat(icb.Latitude).toFixed(2)}°, {parseFloat(icb.Longitude).toFixed(2)}°
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#475569", fontSize: 11, ...mono }}>
                      {parseFloat(icb["Area (sqKM)"]).toFixed(0)} km²
                    </div>
                    <div style={{ color: "#1e293b", fontSize: 9, marginTop: 2 }}>{icb["Last Update"]}</div>
                  </div>
                </div>
              );
            })}

            {selected && (
              <div style={{
                margin: "12px 14px", padding: 15,
                background: "rgba(56,189,248,0.04)",
                border: "1px solid rgba(56,189,248,0.2)",
                borderRadius: 15, animation: "slideIn 0.2s ease",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: "#38bdf8", fontWeight: 800, ...mono, fontSize: 13 }}>❄ {selected.Iceberg}</span>
                  <button onClick={() => focusIceberg(selected)} style={{
                    background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.28)",
                    borderRadius: 7, color: "#38bdf8", fontSize: 10, ...mono,
                    padding: "3px 10px", cursor: "pointer",
                  }}>FOCUS</button>
                </div>
                {([
                  ["Length", `${selected["Length (NM)"]} NM`],
                  ["Width", `${selected["Width (NM)"]} NM`],
                  ["Area", `${parseFloat(selected["Area (sqKM)"]).toFixed(1)} km²`],
                  ["Position", `${selected.Latitude}°, ${selected.Longitude}°`],
                  ["Updated", selected["Last Update"]],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#334155", fontSize: 11 }}>{l}</span>
                    <span style={{ color: "#94a3b8", fontSize: 11, ...mono }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: trajActive ? "1fr 1fr" : "1fr", gap: 8 }}>
                  <button id="btn-predict-drift" onClick={() => predictTrajectory(selected)} disabled={trajLoading}
                    style={{
                      padding: "11px 0",
                      background: "linear-gradient(135deg,rgba(168,85,247,0.18),rgba(217,70,239,0.18))",
                      border: "1px solid rgba(217,70,239,0.32)", borderRadius: 10,
                      color: "#f3e8ff", fontWeight: 700, ...mono, fontSize: 11,
                      letterSpacing: "0.04em",
                      cursor: trajLoading ? "not-allowed" : "pointer",
                      opacity: trajLoading ? 0.6 : 1, transition: "all 0.2s"
                    }}>
                    {trajLoading ? "⟳ MODELING…" : "⬡ PREDICT 72H DRIFT"}
                  </button>
                  {trajActive && (
                    <button onClick={clearTrajectory} style={{
                      padding: "11px 0", background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10,
                      color: "#fca5a5", fontWeight: 700, ...mono, fontSize: 11, cursor: "pointer"
                    }}>✕ CLEAR</button>
                  )}
                </div>
              </div>
            )}

            {icebergs.length === 0 && !loading && (
              <div style={{ padding: "36px 20px", textAlign: "center", color: "#1e293b", ...mono, fontSize: 11 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🌊</div>
                No iceberg data — backend may be offline
              </div>
            )}
          </div>
        )}

        {/* ── ROUTE TAB ────────────────────────────────────────────────── */}
        {panel === "route" && (
          <div style={{ padding: 16, overflowY: "auto", flex: 1, animation: "slideIn 0.2s ease" }}>
            <p style={{ color: "#334155", fontSize: 11, marginBottom: 14, lineHeight: 1.7, ...mono }}>
              A* hazard-aware routing across Antarctic sea ice and iceberg fields. Valid range: −85° to −45°.
            </p>

            {/* Presets */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ color: "#1e293b", fontSize: 10, ...mono, marginBottom: 8, letterSpacing: "0.07em" }}>— MISSION PRESETS —</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  ["Weddell Passage", "-60.0", "-70.0", "-65.0", "-30.0"],
                  ["Scotia Crossing", "-55.0", "-65.0", "-68.0", "-15.0"],
                  ["Ross Sea Access", "-60.0", "-170.0", "-75.0", "-170.0"],
                  ["Drake Traverse",  "-57.0", "-68.0",  "-62.0", "-55.0"],
                ].map(([name, sLat, sLon, dLat, dLon]) => (
                  <button key={name} className="preset-btn"
                    onClick={() => { setStartLat(sLat); setStartLon(sLon); setDestLat(dLat); setDestLon(dLon); }}
                    style={{
                      padding: "8px 10px",
                      background: "rgba(56,189,248,0.03)",
                      border: "1px solid rgba(56,189,248,0.1)",
                      borderRadius: 10, color: "#38bdf8", fontSize: 10, ...mono,
                      cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                    }}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Waypoints */}
            {[
              ["START WAYPOINT", "#22c55e", startLat, setStartLat, startLon, setStartLon],
              ["DESTINATION", "#ef4444", destLat, setDestLat, destLon, setDestLon],
            ].map(([label, color, lat, setLat, lon, setLon]) => (
              <div key={label as string} style={{ marginBottom: 16 }}>
                <div style={{ color: color as string, fontSize: 11, ...mono, fontWeight: 700, marginBottom: 8 }}>{label as string}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ color: "#1e293b", fontSize: 10, marginBottom: 3 }}>Latitude</div>
                    <input value={lat as string} onChange={e => (setLat as (v: string) => void)(e.target.value)} style={inputS} placeholder="-60.0" />
                  </div>
                  <div>
                    <div style={{ color: "#1e293b", fontSize: 10, marginBottom: 3 }}>Longitude</div>
                    <input value={lon as string} onChange={e => (setLon as (v: string) => void)(e.target.value)} style={inputS} placeholder="-70.0" />
                  </div>
                </div>
              </div>
            ))}

            <div style={{ display: "grid", gridTemplateColumns: routeActive ? "1fr auto" : "1fr", gap: 8, marginBottom: 14 }}>
              <button id="btn-plan-route" onClick={planRoute} disabled={routeLoading}
                style={{
                  padding: 14,
                  background: routeLoading ? "rgba(56,189,248,0.06)" : "linear-gradient(135deg,#0ea5e9,#0369a1)",
                  border: "1px solid rgba(56,189,248,0.3)",
                  borderRadius: 12, color: "white", fontWeight: 700, ...mono, fontSize: 12,
                  letterSpacing: "0.06em", cursor: routeLoading ? "not-allowed" : "pointer",
                  opacity: routeLoading ? 0.7 : 1, transition: "all 0.22s",
                  boxShadow: routeLoading ? "none" : "0 0 28px rgba(14,165,233,0.28)",
                }}>
                {routeLoading ? "⟳ COMPUTING A* PATH…" : "▶ EXECUTE A* ROUTE"}
              </button>
              {routeActive && (
                <button onClick={clearRoute} style={{
                  padding: "14px 15px",
                  background: "rgba(239,68,68,0.07)",
                  border: "1px solid rgba(239,68,68,0.22)",
                  borderRadius: 12, color: "#fca5a5", ...mono, fontWeight: 700, fontSize: 12, cursor: "pointer"
                }}>✕</button>
              )}
            </div>

            {routeErr && (
              <div style={{
                padding: "11px 14px",
                background: "rgba(239,68,68,0.07)",
                border: "1px solid rgba(239,68,68,0.22)",
                borderRadius: 10, color: "#fca5a5", fontSize: 11, lineHeight: 1.6, marginBottom: 12, ...mono
              }}>⚠ {routeErr}</div>
            )}

            {routeStats && (
              <div style={{
                padding: 15,
                background: "rgba(34,197,94,0.05)",
                border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: 12, animation: "slideIn 0.25s ease"
              }}>
                <div style={{ color: "#22c55e", fontWeight: 800, ...mono, fontSize: 11, marginBottom: 12 }}>✓ MISSION PLAN READY</div>
                {([
                  ["Distance", `${routeStats.distance_km.toLocaleString()} km`],
                  ["Mean Risk", `${(routeStats.average_risk * 100).toFixed(1)}%`],
                  ["Peak Risk", `${(routeStats.maximum_risk * 100).toFixed(1)}%`],
                  ["Risk Zones", `${routeStats.high_risk_cells} cells`],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ color: "#334155", fontSize: 11 }}>{l}</span>
                    <span style={{ color: "#f8fafc", fontSize: 11, ...mono }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[["#22c55e", "Low"], ["#eab308", "Moderate"], ["#f97316", "High"], ["#ef4444", "Critical"]].map(([c, l]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#334155" }}>
                      <div style={{ width: 14, height: 4, borderRadius: 2, background: c }} />{l}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LAYERS TAB ───────────────────────────────────────────────── */}
        {panel === "layers" && (
          <div style={{ padding: 14, overflowY: "auto", flex: 1, animation: "slideIn 0.2s ease" }}>
            <p style={{ color: "#334155", fontSize: 11, marginBottom: 16, lineHeight: 1.65, ...mono }}>
              Toggle Antarctic environmental intelligence overlays. Data rendered directly on the globe.
            </p>

            {LAYER_DEFS.map(def => {
              const st = layers[def.id];
              const colorRGB = def.color.slice(1).match(/.{2}/g)!.map(h => parseInt(h, 16)).join(",");
              return (
                <div key={def.id}
                  className={st.enabled ? "layer-card-active" : ""}
                  style={{
                    marginBottom: 10, padding: "13px 14px",
                    background: st.enabled ? `rgba(${colorRGB},0.07)` : "rgba(255,255,255,0.018)",
                    border: `1px solid ${st.enabled ? def.color + "45" : "rgba(255,255,255,0.05)"}`,
                    borderRadius: 14, transition: "all 0.3s",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{def.icon}</span>
                        <div>
                          <div style={{ color: st.enabled ? def.color : "#94a3b8", fontWeight: 600, fontSize: 13, transition: "color 0.25s" }}>
                            {def.name}
                          </div>
                          <div style={{ color: "#1e293b", fontSize: 9, marginTop: 1, ...mono }}>{def.sub}</div>
                        </div>
                        {st.loading && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#f59e0b", fontSize: 9, ...mono, marginLeft: 4 }}>
                            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", animation: "pulse 0.7s infinite" }} />
                            LOADING…
                          </span>
                        )}
                        {st.error && <span style={{ color: "#ef4444", fontSize: 13 }}>⚠</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
                      {st.enabled && (
                        <button className="refresh-btn" onClick={() => refreshLayer(def.id)} title="Refresh layer"
                          style={{
                            width: 28, height: 28,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: 8, color: "#334155",
                            fontSize: 14, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.15s",
                          }}>↻</button>
                      )}
                      <button
                        id={`toggle-${def.id}`}
                        onClick={() => toggleLayer(def.id)}
                        disabled={st.loading}
                        className="layer-toggle"
                        title={st.enabled ? "Disable layer" : "Enable layer"}
                        style={{
                          width: 50, height: 28, borderRadius: 14,
                          background: st.enabled ? def.color : "rgba(255,255,255,0.07)",
                          border: "none", cursor: st.loading ? "not-allowed" : "pointer",
                          position: "relative", flexShrink: 0,
                          opacity: st.loading ? 0.5 : 1,
                          boxShadow: st.enabled ? `0 0 16px ${def.color}55` : "none",
                        }}>
                        <div style={{
                          position: "absolute", top: 4, left: st.enabled ? 25 : 4,
                          width: 20, height: 20, borderRadius: "50%", background: "white",
                          transition: "left 0.28s",
                          boxShadow: "0 1px 8px rgba(0,0,0,0.5)"
                        }} />
                      </button>
                    </div>
                  </div>

                  {/* Opacity slider */}
                  {st.enabled && !st.loading && (
                    <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${def.color}18`, animation: "slideIn 0.2s ease" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                        <span style={{ color: "#1e293b", fontSize: 10, ...mono }}>OPACITY</span>
                        <span style={{ color: def.color, fontSize: 10, ...mono, fontWeight: 700 }}>
                          {Math.round(st.alpha * 100)}%
                        </span>
                      </div>
                      <input type="range" min={0.05} max={1} step={0.01} value={st.alpha}
                        onChange={e => setLayerAlpha(def.id, parseFloat(e.target.value))}
                        style={{ width: "100%", accentColor: def.color, cursor: "pointer" }}
                      />
                    </div>
                  )}

                  {st.error && (
                    <div style={{ color: "#ef4444", fontSize: 10, marginTop: 8, ...mono, lineHeight: 1.5 }}>
                      ⚠ {st.error}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Data sources */}
            <div style={{
              marginTop: 8, padding: 13,
              background: "rgba(255,255,255,0.015)",
              border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12,
            }}>
              <div style={{ color: "#1e293b", fontSize: 10, ...mono, marginBottom: 8, letterSpacing: "0.07em" }}>DATA SOURCES</div>
              <div style={{ color: "#334155", fontSize: 10, lineHeight: 1.9 }}>
                Sea Ice: EUMETSAT OSI-SAF L4 NetCDF<br/>
                Risk: POLARIS-X Fusion Engine<br/>
                Ocean Currents: ACC Physics Model<br/>
                Wind: Polar Vortex + Westerlies<br/>
                Visibility: Ice-edge Storm Model
              </div>
            </div>
          </div>
        )}

        {/* Panel footer */}
        <div style={{
          borderTop: "1px solid rgba(56,189,248,0.06)",
          padding: "8px 16px",
          flexShrink: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ ...mono, fontSize: 9, color: "#0f172a" }}>POLARIS-X v2.1</span>
          <span style={{ ...mono, fontSize: 9, color: "#1e293b" }}>
            {backendOnline ? "API ONLINE" : "API OFFLINE"} · CESIUM ION
          </span>
        </div>
      </aside>

      {/* Camera controls */}
      <div style={{ position: "absolute", bottom: 70, left: 18, display: "flex", flexDirection: "column", gap: 8, zIndex: 90 }}>
        {[
          { id: "btn-zoom-in",  label: "+", title: "Zoom In",   action: () => viewerRef.current?.camera.zoomIn(1_000_000) },
          { id: "btn-zoom-out", label: "−", title: "Zoom Out",  action: () => viewerRef.current?.camera.zoomOut(1_000_000) },
          { id: "btn-home",     label: "⌂", title: "Home View", action: () => viewerRef.current?.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-30, -72, 12_000_000),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 }, duration: 2.0,
          }) },
          { id: "btn-polar",    label: "⊙", title: "Polar View", action: () => viewerRef.current?.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(0, -90, 15_000_000),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 }, duration: 2.2,
          }) },
        ].map(btn => (
          <button key={btn.id} id={btn.id} title={btn.title} onClick={btn.action}
            className="ctrl-btn" style={ctrlBtn}>{btn.label}</button>
        ))}
      </div>

      <CoordHUD vr={viewerRef} />
    </div>
  );
}
