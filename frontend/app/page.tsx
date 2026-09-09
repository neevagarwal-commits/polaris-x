"use client";

import dynamic from "next/dynamic";

const CesiumGlobe = dynamic(
  () => import("./components/CesiumGlobe"),
  {
    ssr: false,
    loading: () => (
      <div className="w-screen h-screen bg-[#03070b] flex items-center justify-center text-cyan-400 font-mono text-sm tracking-widest">
        INITIALIZING POLARIS-X 3D GLOBE...
      </div>
    ),
  }
);

export default function Home() {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        margin: 0,
        padding: 0,
        background: "#03070b",
      }}
    >
      <CesiumGlobe />
    </main>
  );
}