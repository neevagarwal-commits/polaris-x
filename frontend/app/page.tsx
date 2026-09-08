"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

type SelectedIceberg = {
  Iceberg: string;
  "Length (NM)": string;
  "Width (NM)": string;
  Latitude: string;
  Longitude: string;
  "Area (sqMI)": string;
  "Area (sqNM)": string;
  "Area (sqKM)": string;
  "Last Update": string;
};

type NavigationStatistics = {
  distance_km: number;
  average_risk: number;
  maximum_risk: number;
  high_risk_cells: number;
};

const CesiumGlobe = dynamic(
  () => import("./components/CesiumGlobe"),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-[#03070b] text-cyan-300">
        INITIALIZING 3D GLOBE...
      </div>
    ),
  }
);

export default function Home() {
  const [selectedIceberg, setSelectedIceberg] =
    useState<SelectedIceberg | null>(null);

  const [missionRequest, setMissionRequest] =
    useState(0);

  const [navigationStats, setNavigationStats] =
    useState<NavigationStatistics | null>(null);

  const [planning, setPlanning] =
    useState(false);

  const [missionStatus, setMissionStatus] =
    useState<string>("READY");

  const planMission = () => {
    setPlanning(true);
    setNavigationStats(null);
    setMissionStatus("CALCULATING");

    setMissionRequest(
      (previous) => previous + 1
    );
  };

  return (
    <main className="h-screen overflow-hidden bg-black text-white">
      <div className="flex h-screen flex-col">

        {/* =====================================================
            TOP HEADER
        ===================================================== */}

        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6">

          <div>
            <h1 className="text-xl font-bold tracking-widest">
              POLARIS-X
            </h1>

            <p className="text-xs text-white/40">
              Antarctic Intelligence & Navigation System
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">

            <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]" />

            SYSTEM ONLINE

          </div>

        </header>

        {/* =====================================================
            MAIN APPLICATION
        ===================================================== */}

        <section className="flex min-h-0 flex-1">

          {/* ===================================================
              LEFT SIDEBAR
          =================================================== */}

          <aside className="w-72 shrink-0 overflow-y-auto border-r border-white/10 bg-black p-5">

            <p className="mb-4 text-xs font-semibold tracking-widest text-white/40">
              INTELLIGENCE LAYERS
            </p>

            <div className="space-y-2">

              {[
                "Sea Ice Concentration",
                "Sea Ice Forecast",
                "Icebergs",
                "Iceberg Trajectories",
                "Ocean Currents",
                "Wind",
                "Wave Height",
                "Navigation Risk",
              ].map((layer) => (

                <button
                  key={layer}
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-left text-sm transition hover:bg-white/10"
                >

                  <span>
                    {layer}
                  </span>

                  <span className="text-white/30">
                    ON
                  </span>

                </button>

              ))}

            </div>

            {/* SYSTEM STATUS */}

            <div className="mt-8 border-t border-white/10 pt-6">

              <p className="text-xs tracking-widest text-white/40">
                SYSTEM STATUS
              </p>

              <div className="mt-4 space-y-3 text-sm">

                <div className="flex justify-between">

                  <span className="text-white/50">
                    Sea Ice Model
                  </span>

                  <span className="text-green-400">
                    READY
                  </span>

                </div>

                <div className="flex justify-between">

                  <span className="text-white/50">
                    Iceberg Model
                  </span>

                  <span className="text-green-400">
                    READY
                  </span>

                </div>

                <div className="flex justify-between">

                  <span className="text-white/50">
                    Route Engine
                  </span>

                  <span className="text-green-400">
                    READY
                  </span>

                </div>

              </div>

            </div>

          </aside>

          {/* ===================================================
              CENTRAL GLOBE
          =================================================== */}

          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#03070b]">

            <CesiumGlobe
              onIcebergSelect={
                setSelectedIceberg
              }
              planMissionRequest={
                missionRequest
              }
              onNavigationComplete={(
                statistics
              ) => {

                setNavigationStats(
                  statistics
                );

                setPlanning(false);

                setMissionStatus(
                  "ROUTE READY"
                );
              }}
              onNavigationError={() => {

                setPlanning(false);

                setMissionStatus(
                  "ROUTE ERROR"
                );
              }}
            />

            {/* GLOBE TITLE */}

            <div className="pointer-events-none absolute left-5 top-5 z-10">

              <p className="text-xs font-semibold tracking-[0.3em] text-cyan-300">
                LIVE POLAR VIEW
              </p>

              <p className="mt-1 text-xs text-white/40">
                CESIUM 3D EARTH ENGINE
              </p>

            </div>

            {/* LIVE STATUS */}

            <div className="pointer-events-none absolute right-5 top-5 z-10 rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur">

              <div className="flex items-center gap-2 text-[10px] tracking-widest">

                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />

                LIVE DATA

              </div>

            </div>

            {/* =================================================
                FORECAST TIMELINE
            ================================================= */}

            <div className="absolute bottom-6 left-6 right-6 z-20 rounded-xl border border-white/10 bg-black/75 p-4 backdrop-blur-xl">

              <div className="flex items-center justify-between text-xs">

                <span className="text-white/40">
                  FORECAST TIMELINE
                </span>

                <div className="flex gap-4">

                  <span className="text-cyan-300">
                    NOW
                  </span>

                  <span className="text-white/40">
                    +6H
                  </span>

                  <span className="text-white/40">
                    +12H
                  </span>

                  <span className="text-white/40">
                    +24H
                  </span>

                  <span className="text-white/40">
                    +48H
                  </span>

                  <span className="text-white/40">
                    +72H
                  </span>

                </div>

              </div>

              <input
                type="range"
                min="0"
                max="5"
                defaultValue="0"
                className="mt-4 w-full accent-cyan-400"
              />

            </div>

          </div>

          {/* ===================================================
              RIGHT SIDEBAR
          =================================================== */}

          <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-black p-5">

            <p className="text-xs font-semibold tracking-widest text-white/40">
              MISSION INTELLIGENCE
            </p>

            {/* SELECTED ICEBERG */}

            <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">

              <p className="text-xs text-white/40">
                SELECTED OBJECT
              </p>

              {selectedIceberg ? (
                <>

                  <div className="mt-2 flex items-center justify-between">

                    <h2 className="text-2xl font-bold text-cyan-300">
                      {selectedIceberg.Iceberg}
                    </h2>

                    <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-1 text-[10px] text-green-400">
                      TRACKED
                    </span>

                  </div>

                  {/* POSITION */}

                  <div className="mt-5">

                    <p className="text-[10px] tracking-widest text-white/30">
                      POSITION
                    </p>

                    <div className="mt-2 grid grid-cols-2 gap-2">

                      <div className="rounded-lg bg-white/5 p-2">

                        <p className="text-[10px] text-white/30">
                          LATITUDE
                        </p>

                        <p className="mt-1 font-mono text-sm">
                          {Number(
                            selectedIceberg.Latitude
                          ).toFixed(4)}
                          °
                        </p>

                      </div>

                      <div className="rounded-lg bg-white/5 p-2">

                        <p className="text-[10px] text-white/30">
                          LONGITUDE
                        </p>

                        <p className="mt-1 font-mono text-sm">
                          {Number(
                            selectedIceberg.Longitude
                          ).toFixed(4)}
                          °
                        </p>

                      </div>

                    </div>

                  </div>

                  {/* DIMENSIONS */}

                  <div className="mt-4">

                    <p className="text-[10px] tracking-widest text-white/30">
                      DIMENSIONS
                    </p>

                    <div className="mt-2 grid grid-cols-2 gap-2">

                      <div className="rounded-lg bg-white/5 p-2">

                        <p className="text-[10px] text-white/30">
                          LENGTH
                        </p>

                        <p className="mt-1 font-mono text-sm">
                          {selectedIceberg["Length (NM)"]}{" "}
                          NM
                        </p>

                      </div>

                      <div className="rounded-lg bg-white/5 p-2">

                        <p className="text-[10px] text-white/30">
                          WIDTH
                        </p>

                        <p className="mt-1 font-mono text-sm">
                          {selectedIceberg["Width (NM)"]}{" "}
                          NM
                        </p>

                      </div>

                    </div>

                  </div>

                  {/* AREA */}

                  <div className="mt-4 flex items-center justify-between rounded-lg bg-white/5 p-3">

                    <span className="text-xs text-white/40">
                      AREA
                    </span>

                    <span className="font-mono text-sm">
                      {Number(
                        selectedIceberg["Area (sqKM)"]
                      ).toFixed(2)}{" "}
                      km²
                    </span>

                  </div>

                  {/* LAST UPDATE */}

                  <div className="mt-3 flex items-center justify-between">

                    <span className="text-xs text-white/40">
                      LAST UPDATE
                    </span>

                    <span className="font-mono text-xs text-white/70">
                      {selectedIceberg["Last Update"]}
                    </span>

                  </div>

                </>
              ) : (

                <>

                  <h2 className="mt-2 text-xl font-bold">
                    No Iceberg Selected
                  </h2>

                  <p className="mt-2 text-sm text-white/40">
                    Select an iceberg on the 3D globe
                    to inspect its position, dimensions
                    and predicted trajectory.
                  </p>

                </>

              )}

            </div>

            {/* ACTION BUTTONS */}

            {selectedIceberg && (

              <div className="mt-4 grid grid-cols-2 gap-2">

                <button
                  className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-3 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/20"
                >
                  TRACK
                </button>

                <button
                  className="rounded-lg border border-purple-400/30 bg-purple-400/10 px-3 py-3 text-xs font-bold text-purple-300 transition hover:bg-purple-400/20"
                >
                  PREDICT
                </button>

              </div>

            )}

            {/* =================================================
                NAVIGATION
            ================================================= */}

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">

              <div className="flex items-center justify-between">

                <p className="text-xs text-white/40">
                  NAVIGATION
                </p>

                <span
                  className={
                    missionStatus ===
                    "ROUTE READY"
                      ? "text-[10px] text-green-400"
                      : missionStatus ===
                        "ROUTE ERROR"
                        ? "text-[10px] text-red-400"
                        : "text-[10px] text-cyan-300"
                  }
                >
                  {missionStatus}
                </span>

              </div>

              <button
                onClick={planMission}
                disabled={planning}
                className="mt-4 w-full rounded-lg bg-cyan-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
              >
                {planning
                  ? "CALCULATING A*..."
                  : "PLAN MISSION"}
              </button>

              {/* ROUTE RESULTS */}

              {navigationStats && (

                <div className="mt-4 space-y-2">

                  <div className="grid grid-cols-2 gap-2">

                    <div className="rounded-lg bg-black/40 p-3">

                      <p className="text-[9px] tracking-widest text-white/30">
                        DISTANCE
                      </p>

                      <p className="mt-1 font-mono text-sm text-cyan-300">
                        {navigationStats.distance_km.toFixed(
                          1
                        )}{" "}
                        km
                      </p>

                    </div>

                    <div className="rounded-lg bg-black/40 p-3">

                      <p className="text-[9px] tracking-widest text-white/30">
                        AVG RISK
                      </p>

                      <p className="mt-1 font-mono text-sm text-cyan-300">
                        {(
                          navigationStats.average_risk *
                          100
                        ).toFixed(1)}
                        %
                      </p>

                    </div>

                  </div>

                  <div className="grid grid-cols-2 gap-2">

                    <div className="rounded-lg bg-black/40 p-3">

                      <p className="text-[9px] tracking-widest text-white/30">
                        MAX RISK
                      </p>

                      <p className="mt-1 font-mono text-sm text-orange-300">
                        {(
                          navigationStats.maximum_risk *
                          100
                        ).toFixed(1)}
                        %
                      </p>

                    </div>

                    <div className="rounded-lg bg-black/40 p-3">

                      <p className="text-[9px] tracking-widest text-white/30">
                        HIGH-RISK CELLS
                      </p>

                      <p className="mt-1 font-mono text-sm text-orange-300">
                        {
                          navigationStats.high_risk_cells
                        }
                      </p>

                    </div>

                  </div>

                  <div className="rounded-lg border border-green-400/20 bg-green-400/5 p-3">

                    <p className="text-[9px] tracking-widest text-green-400/60">
                      ROUTING ENGINE
                    </p>

                    <p className="mt-1 text-xs text-green-300">
                      A* risk-aware route calculated
                      from real Antarctic data.
                    </p>

                  </div>

                </div>

              )}

            </div>

            {/* PREDICTION ENGINE */}

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">

              <p className="text-xs text-white/40">
                PREDICTION ENGINE
              </p>

              <div className="mt-4 space-y-3 text-sm">

                <div className="flex justify-between">

                  <span className="text-white/50">
                    Sea Ice
                  </span>

                  <span>
                    AI
                  </span>

                </div>

                <div className="flex justify-between">

                  <span className="text-white/50">
                    Icebergs
                  </span>

                  <span>
                    AI + Physics
                  </span>

                </div>

                <div className="flex justify-between">

                  <span className="text-white/50">
                    Routing
                  </span>

                  <span>
                    A*
                  </span>

                </div>

              </div>

            </div>

          </aside>

        </section>

      </div>
    </main>
  );
}