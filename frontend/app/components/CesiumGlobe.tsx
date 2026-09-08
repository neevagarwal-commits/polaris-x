"use client";

import {
  useEffect,
  useRef,
} from "react";

type IcebergData = {
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

type TrajectoryPoint = {
  hour: number;
  latitude: number;
  longitude: number;
};

type NavigationStatistics = {
  distance_km: number;
  average_risk: number;
  maximum_risk: number;
  high_risk_cells: number;
};

type NavigationRoutePoint = {
  sequence: number;
  latitude: number;
  longitude: number;
  sea_ice_risk: number;
  iceberg_risk: number;
  total_risk: number;
};

type NavigationResponse = {
  status: string;
  engine?: string;
  risk_dataset?: string;
  grid_resolution_degrees?: number;
  start?: {
    latitude: number;
    longitude: number;
  };
  destination?: {
    latitude: number;
    longitude: number;
  };
  statistics?: NavigationStatistics;
  route?: NavigationRoutePoint[];
  message?: string;
};

type CesiumGlobeProps = {
  onIcebergSelect?: (
    iceberg: IcebergData
  ) => void;

  planMissionRequest?: number;

  onNavigationComplete?: (
    statistics: NavigationStatistics
  ) => void;

  onNavigationError?: () => void;
};

export default function CesiumGlobe({
  onIcebergSelect,
  planMissionRequest = 0,
  onNavigationComplete,
  onNavigationError,
}: CesiumGlobeProps) {

  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const viewerRef =
    useRef<any>(null);

  const cesiumRef =
    useRef<any>(null);

  const clickHandlerRef =
    useRef<any>(null);

  const resizeObserverRef =
    useRef<ResizeObserver | null>(
      null
    );

  const destroyedRef =
    useRef(false);

  const trajectoryRequestRef =
    useRef(0);

  const lastMissionRequestRef =
    useRef(0);

  // ============================================================
  // DRAW NAVIGATION ROUTE
  // ============================================================

  const drawNavigationRoute =
    async () => {

      const viewer =
        viewerRef.current;

      const Cesium =
        cesiumRef.current;

      if (
        !viewer ||
        !Cesium ||
        viewer.isDestroyed()
      ) {
        return;
      }

      console.log(
        "POLARIS-X: Starting A* mission planning..."
      );

      try {

        const response =
          await fetch(
            "http://127.0.0.1:8000/api/navigation/plan?start_lat=-60&start_lon=-70&destination_lat=-65&destination_lon=-30"
          );

        if (!response.ok) {

          throw new Error(
            `Navigation API returned HTTP ${response.status}`
          );
        }

        const data:
          NavigationResponse =
          await response.json();

        if (
          data.status !==
          "success"
        ) {

          throw new Error(
            data.message ||
            "Navigation engine failed."
          );
        }

        if (
          !data.route ||
          data.route.length < 2 ||
          !data.statistics
        ) {

          throw new Error(
            "Navigation API returned an invalid route."
          );
        }

        console.log(
          "POLARIS-X: A* ROUTE RECEIVED:",
          data
        );

        // ======================================================
        // REMOVE PREVIOUS NAVIGATION ROUTE
        // ======================================================

        const oldRouteEntities =
          viewer.entities.values.filter(
            (entity: any) => {

              if (
                typeof entity.id !==
                "string"
              ) {
                return false;
              }

              return (
                entity.id.startsWith(
                  "navigation-route-"
                ) ||
                entity.id.startsWith(
                  "navigation-marker-"
                )
              );
            }
          );

        oldRouteEntities.forEach(
          (entity: any) => {

            viewer.entities.remove(
              entity
            );
          }
        );

        // ======================================================
        // CONVERT ROUTE TO CESIUM POSITIONS
        // ======================================================

        const routePositions =
          data.route.map(
            (point) =>
              Cesium.Cartesian3.fromDegrees(
                point.longitude,
                point.latitude,
                35_000
              )
          );

        // ======================================================
        // ROUTE GLOW
        // ======================================================

        viewer.entities.add({

          id:
            "navigation-route-outer",

          polyline: {

            positions:
              routePositions,

            width: 20,

            material:
              new Cesium.PolylineGlowMaterialProperty(
                {
                  glowPower: 0.35,

                  taperPower: 0.8,

                  color:
                    Cesium.Color.fromCssColorString(
                      "#00ffff"
                    ),
                }
              ),

            arcType:
              Cesium.ArcType.GEODESIC,

            clampToGround:
              false,

            depthFailMaterial:
              new Cesium.PolylineGlowMaterialProperty(
                {
                  glowPower: 0.4,

                  taperPower: 0.7,

                  color:
                    Cesium.Color.fromCssColorString(
                      "#00ffff"
                    ),
                }
              ),
          },
        });

        // ======================================================
        // INNER ROUTE
        // ======================================================

        viewer.entities.add({

          id:
            "navigation-route-inner",

          polyline: {

            positions:
              routePositions,

            width: 7,

            material:
              Cesium.Color.fromCssColorString(
                "#ffffff"
              ),

            arcType:
              Cesium.ArcType.GEODESIC,

            clampToGround:
              false,

            depthFailMaterial:
              Cesium.Color.fromCssColorString(
                "#ffffff"
              ),
          },
        });

        // ======================================================
        // START MARKER
        // ======================================================

        const start =
          data.start!;

        const destination =
          data.destination!;

        viewer.entities.add({

          id:
            "navigation-marker-start",

          position:
            Cesium.Cartesian3.fromDegrees(
              start.longitude,
              start.latitude,
              55_000
            ),

          point: {

            pixelSize: 18,

            color:
              Cesium.Color.fromCssColorString(
                "#22c55e"
              ),

            outlineColor:
              Cesium.Color.WHITE,

            outlineWidth: 3,

            disableDepthTestDistance:
              Number.POSITIVE_INFINITY,
          },

          label: {

            text:
              "MISSION START",

            font:
              "bold 13px Arial",

            fillColor:
              Cesium.Color.WHITE,

            outlineColor:
              Cesium.Color.BLACK,

            outlineWidth: 4,

            style:
              Cesium.LabelStyle.FILL_AND_OUTLINE,

            verticalOrigin:
              Cesium.VerticalOrigin.BOTTOM,

            pixelOffset:
              new Cesium.Cartesian2(
                0,
                -22
              ),

            disableDepthTestDistance:
              Number.POSITIVE_INFINITY,
          },
        });

        // ======================================================
        // DESTINATION MARKER
        // ======================================================

        viewer.entities.add({

          id:
            "navigation-marker-destination",

          position:
            Cesium.Cartesian3.fromDegrees(
              destination.longitude,
              destination.latitude,
              55_000
            ),

          point: {

            pixelSize: 18,

            color:
              Cesium.Color.fromCssColorString(
                "#ef4444"
              ),

            outlineColor:
              Cesium.Color.WHITE,

            outlineWidth: 3,

            disableDepthTestDistance:
              Number.POSITIVE_INFINITY,
          },

          label: {

            text:
              "DESTINATION",

            font:
              "bold 13px Arial",

            fillColor:
              Cesium.Color.WHITE,

            outlineColor:
              Cesium.Color.BLACK,

            outlineWidth: 4,

            style:
              Cesium.LabelStyle.FILL_AND_OUTLINE,

            verticalOrigin:
              Cesium.VerticalOrigin.BOTTOM,

            pixelOffset:
              new Cesium.Cartesian2(
                0,
                -22
              ),

            disableDepthTestDistance:
              Number.POSITIVE_INFINITY,
          },
        });

        // ======================================================
        // CAMERA FRAME
        // ======================================================

        const boundingSphere =
          Cesium.BoundingSphere.fromPoints(
            routePositions
          );

        await viewer.camera.flyToBoundingSphere(
          boundingSphere,
          {

            duration:
              1.8,

            offset:
              new Cesium.HeadingPitchRange(
                0,

                Cesium.Math.toRadians(
                  -55
                ),

                Math.max(
                  boundingSphere.radius *
                    1.5,
                  500_000
                )
              ),
          }
        );

        viewer.scene.requestRender();

        console.log(
          "POLARIS-X: A* ROUTE RENDERED SUCCESSFULLY."
        );

        onNavigationComplete?.(
          data.statistics
        );

      } catch (error) {

        console.error(
          "POLARIS-X: NAVIGATION ERROR:",
          error
        );

        onNavigationError?.();
      }
    };

  // ============================================================
  // INITIALIZE CESIUM
  // ============================================================

  useEffect(() => {

    let viewer: any = null;

    let clickHandler: any = null;

    let resizeObserver:
      ResizeObserver | null =
      null;

    let destroyed = false;

    const initializeCesium =
      async () => {

        if (
          !containerRef.current
        ) {
          return;
        }

        const Cesium =
          await import(
            "cesium"
          );

        if (
          destroyed ||
          !containerRef.current
        ) {
          return;
        }

        cesiumRef.current =
          Cesium;

        destroyedRef.current =
          false;

        // ======================================================
        // CESIUM ION TOKEN
        // ======================================================

        Cesium.Ion.defaultAccessToken =
          process.env
            .NEXT_PUBLIC_CESIUM_ION_TOKEN ||
          "";

        // ======================================================
        // STATIC ASSETS
        // ======================================================

        (
          window as any
        ).CESIUM_BASE_URL =
          "/cesium/";

        // ======================================================
        // CONTAINER
        // ======================================================

        const container =
          containerRef.current;

        container.style.position =
          "absolute";

        container.style.inset =
          "0";

        container.style.width =
          "100%";

        container.style.height =
          "100%";

        container.style.minWidth =
          "0";

        container.style.minHeight =
          "0";

        // ======================================================
        // CREATE VIEWER
        // ======================================================

        viewer =
          new Cesium.Viewer(
            container,
            {
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
              shouldAnimate: false,
            }
          );

        viewerRef.current =
          viewer;

        // ======================================================
        // FORCE VIEWER SIZE
        // ======================================================

        const viewerElement =
          viewer.container.querySelector(
            ".cesium-viewer"
          ) as HTMLElement | null;

        if (viewerElement) {

          viewerElement.style.position =
            "absolute";

          viewerElement.style.inset =
            "0";

          viewerElement.style.width =
            "100%";

          viewerElement.style.height =
            "100%";

          viewerElement.style.margin =
            "0";

          viewerElement.style.padding =
            "0";
        }

        const widgetElement =
          viewer.container.querySelector(
            ".cesium-widget"
          ) as HTMLElement | null;

        if (widgetElement) {

          widgetElement.style.position =
            "absolute";

          widgetElement.style.inset =
            "0";

          widgetElement.style.width =
            "100%";

          widgetElement.style.height =
            "100%";

          widgetElement.style.margin =
            "0";

          widgetElement.style.padding =
            "0";
        }

        // ======================================================
        // CANVAS
        // ======================================================

        const canvas =
          viewer.scene.canvas as HTMLCanvasElement;

        canvas.style.position =
          "absolute";

        canvas.style.left =
          "0";

        canvas.style.top =
          "0";

        canvas.style.width =
          "100%";

        canvas.style.height =
          "100%";

        canvas.style.display =
          "block";

        // ======================================================
        // RESIZE OBSERVER
        // ======================================================

        resizeObserver =
          new ResizeObserver(
            () => {

              if (
                viewer &&
                !viewer.isDestroyed()
              ) {

                viewer.resize();

                viewer.scene.requestRender();
              }
            }
          );

        resizeObserver.observe(
          container
        );

        resizeObserverRef.current =
          resizeObserver;

        viewer.resize();

        requestAnimationFrame(
          () => {

            if (
              viewer &&
              !viewer.isDestroyed()
            ) {

              viewer.resize();

              viewer.scene.requestRender();
            }
          }
        );

        setTimeout(
          () => {

            if (
              viewer &&
              !viewer.isDestroyed()
            ) {

              viewer.resize();

              viewer.scene.requestRender();
            }

          },
          250
        );

        setTimeout(
          () => {

            if (
              viewer &&
              !viewer.isDestroyed()
            ) {

              viewer.resize();

              viewer.scene.requestRender();
            }

          },
          1000
        );

        // ======================================================
        // VISUAL CONFIGURATION
        // ======================================================

        viewer.scene.backgroundColor =
          Cesium.Color.fromCssColorString(
            "#03070b"
          );

        viewer.scene.globe.enableLighting =
          false;

        viewer.scene.globe.depthTestAgainstTerrain =
          false;

        if (
          viewer.scene.skyAtmosphere
        ) {

          viewer.scene.skyAtmosphere.show =
            true;
        }

        // ======================================================
        // BASE WORLD IMAGERY
        // ======================================================

        try {

          const imageryProvider =
            await Cesium.IonImageryProvider.fromAssetId(
              2
            );

          if (
            !viewer ||
            viewer.isDestroyed()
          ) {
            return;
          }

          viewer.imageryLayers.removeAll();

          viewer.imageryLayers.addImageryProvider(
            imageryProvider
          );

        } catch (error) {

          console.error(
            "POLARIS-X: Failed to load Cesium imagery:",
            error
          );
        }

        // ======================================================
        // INITIAL CAMERA
        // ======================================================

        viewer.camera.setView({

          destination:
            Cesium.Cartesian3.fromDegrees(
              0,
              -82,
              3_000_000
            ),
        });

        // ======================================================
        // REAL ANTARCTIC SEA-ICE IMAGERY
        // ======================================================

        try {

          console.log(
            "POLARIS-X: Loading real Antarctic sea-ice imagery..."
          );

          const seaIceUrl =
            "http://127.0.0.1:8000/api/sea-ice/image";

          const seaIceProvider =
            await Cesium.SingleTileImageryProvider.fromUrl(
              seaIceUrl,
              {
                rectangle:
                  Cesium.Rectangle.fromDegrees(
                    -180,
                    -90,
                    180,
                    -45
                  ),
              }
            );

          if (
            !viewer ||
            viewer.isDestroyed()
          ) {
            return;
          }

          const seaIceLayer =
            viewer.imageryLayers.addImageryProvider(
              seaIceProvider
            );

          // IMPORTANT:
          // fromUrl() is awaited above, so this
          // is now the actual ImageryLayer.

          seaIceLayer.alpha =
            0.72;

          seaIceLayer.brightness =
            1.05;

          console.log(
            "POLARIS-X: Sea-ice imagery layer rendered successfully."
          );

        } catch (error) {

          console.error(
            "POLARIS-X: Failed to load sea-ice imagery:",
            error
          );
        }

        // ======================================================
        // NAVIGATION RISK HEATMAP
        // ======================================================

        try {

          console.log(
            "POLARIS-X: Loading navigation risk heatmap..."
          );

          const riskUrl =
            "http://127.0.0.1:8000/api/navigation/risk/image";

          const riskProvider =
            await Cesium.SingleTileImageryProvider.fromUrl(
              riskUrl,
              {
                rectangle:
                  Cesium.Rectangle.fromDegrees(
                    -180,
                    -75,
                    180,
                    -55
                  ),
              }
            );

          if (
            !viewer ||
            viewer.isDestroyed()
          ) {
            return;
          }

          const riskLayer =
            viewer.imageryLayers.addImageryProvider(
              riskProvider
            );

          riskLayer.alpha =
            0.72;

          riskLayer.brightness =
            1.0;

          console.log(
            "POLARIS-X: Navigation risk heatmap rendered successfully."
          );

        } catch (error) {

          console.error(
            "POLARIS-X: Failed to load navigation risk heatmap:",
            error
          );
        }

        // ======================================================
        // LOAD ICEBERGS
        // ======================================================

        try {

          const response =
            await fetch(
              "http://127.0.0.1:8000/api/icebergs"
            );

          if (!response.ok) {

            throw new Error(
              `Iceberg API returned HTTP ${response.status}`
            );
          }

          const data =
            await response.json();

          if (
            !data ||
            !Array.isArray(
              data.icebergs
            )
          ) {

            throw new Error(
              "Invalid iceberg API response."
            );
          }

          const icebergs:
            IcebergData[] =
            data.icebergs;

          console.log(
            `POLARIS-X: Loaded ${icebergs.length} icebergs.`
          );

          icebergs.forEach(
            (iceberg) => {

              const latitude =
                Number(
                  iceberg.Latitude
                );

              const longitude =
                Number(
                  iceberg.Longitude
                );

              if (
                !Number.isFinite(
                  latitude
                ) ||
                !Number.isFinite(
                  longitude
                )
              ) {
                return;
              }

              const position =
                Cesium.Cartesian3.fromDegrees(
                  longitude,
                  latitude,
                  15_000
                );

              viewer.entities.add({

                id:
                  `iceberg-${iceberg.Iceberg}`,

                position,

                point: {

                  pixelSize:
                    10,

                  color:
                    Cesium.Color.fromCssColorString(
                      "#00e5ff"
                    ),

                  outlineColor:
                    Cesium.Color.WHITE,

                  outlineWidth:
                    2,

                  disableDepthTestDistance:
                    Number.POSITIVE_INFINITY,
                },

                label: {

                  text:
                    iceberg.Iceberg,

                  font:
                    "bold 13px Arial",

                  fillColor:
                    Cesium.Color.WHITE,

                  outlineColor:
                    Cesium.Color.BLACK,

                  outlineWidth:
                    4,

                  style:
                    Cesium.LabelStyle.FILL_AND_OUTLINE,

                  verticalOrigin:
                    Cesium.VerticalOrigin.BOTTOM,

                  pixelOffset:
                    new Cesium.Cartesian2(
                      0,
                      -14
                    ),

                  disableDepthTestDistance:
                    Number.POSITIVE_INFINITY,

                  scale:
                    1,
                },

                properties: {

                  icebergData:
                    iceberg,
                },
              });
            }
          );

          console.log(
            "POLARIS-X: Icebergs rendered."
          );

        } catch (error) {

          console.error(
            "POLARIS-X: Failed to load iceberg data:",
            error
          );
        }

        // ======================================================
        // CLICK HANDLER
        // ======================================================

        clickHandler =
          new Cesium.ScreenSpaceEventHandler(
            viewer.scene.canvas
          );

        clickHandlerRef.current =
          clickHandler;

        clickHandler.setInputAction(
          async (movement: any) => {

            if (
              !viewer ||
              viewer.isDestroyed()
            ) {
              return;
            }

            const pickedObject =
              viewer.scene.pick(
                movement.position
              );

            if (
              !Cesium.defined(
                pickedObject
              ) ||
              !pickedObject.id
            ) {
              return;
            }

            const entity =
              pickedObject.id;

            if (
              !entity.properties ||
              !entity.properties.icebergData
            ) {
              return;
            }

            const selectedIceberg =
              entity.properties.icebergData.getValue(
                Cesium.JulianDate.now()
              ) as IcebergData;

            if (
              !selectedIceberg
            ) {
              return;
            }

            const icebergId =
              selectedIceberg.Iceberg;

            console.log(
              "POLARIS-X: SELECTED ICEBERG:",
              icebergId
            );

            onIcebergSelect?.(
              selectedIceberg
            );

            // ==================================================
            // REMOVE OLD TRAJECTORIES
            // ==================================================

            const oldTrajectoryEntities =
              viewer.entities.values.filter(
                (item: any) => {

                  if (
                    typeof item.id !==
                    "string"
                  ) {
                    return false;
                  }

                  return (
                    item.id.startsWith(
                      "trajectory-"
                    ) ||
                    item.id.startsWith(
                      "forecast-point-"
                    )
                  );
                }
              );

            oldTrajectoryEntities.forEach(
              (item: any) => {

                viewer.entities.remove(
                  item
                );
              }
            );

            // ==================================================
            // REQUEST TRAJECTORY
            // ==================================================

            console.log(
              "POLARIS-X: REQUESTING TRAJECTORY:",
              icebergId
            );

            const requestId =
              ++trajectoryRequestRef.current;

            try {

              const trajectoryUrl =
                `http://127.0.0.1:8000/api/icebergs/${encodeURIComponent(
                  icebergId
                )}/trajectory`;

              const trajectoryResponse =
                await fetch(
                  trajectoryUrl
                );

              if (
                !trajectoryResponse.ok
              ) {

                throw new Error(
                  `Trajectory API returned HTTP ${trajectoryResponse.status}`
                );
              }

              const trajectoryData =
                await trajectoryResponse.json();

              if (
                !trajectoryData ||
                !Array.isArray(
                  trajectoryData.trajectory
                )
              ) {

                throw new Error(
                  "Invalid trajectory API response."
                );
              }

              if (
                requestId !==
                trajectoryRequestRef.current
              ) {
                return;
              }

              const trajectory:
                TrajectoryPoint[] =
                trajectoryData.trajectory;

              if (
                trajectory.length <
                2
              ) {
                return;
              }

              console.log(
                "POLARIS-X: TRAJECTORY DATA:",
                trajectory
              );

              const trajectoryPositions =
                trajectory.map(
                  (point) =>
                    Cesium.Cartesian3.fromDegrees(
                      point.longitude,
                      point.latitude,
                      30_000
                    )
                );

              // =================================================
              // OUTER GLOW
              // =================================================

              viewer.entities.add({

                id:
                  `trajectory-${icebergId}-outer`,

                polyline: {

                  positions:
                    trajectoryPositions,

                  width:
                    18,

                  material:
                    new Cesium.PolylineGlowMaterialProperty(
                      {

                        glowPower:
                          0.35,

                        taperPower:
                          0.7,

                        color:
                          Cesium.Color.fromCssColorString(
                            "#7c3aed"
                          ),
                      }
                    ),

                  arcType:
                    Cesium.ArcType.GEODESIC,

                  clampToGround:
                    false,

                  depthFailMaterial:
                    new Cesium.PolylineGlowMaterialProperty(
                      {

                        glowPower:
                          0.4,

                        taperPower:
                          0.6,

                        color:
                          Cesium.Color.fromCssColorString(
                            "#7c3aed"
                          ),
                      }
                    ),
                },
              });

              // =================================================
              // INNER TRAJECTORY
              // =================================================

              viewer.entities.add({

                id:
                  `trajectory-${icebergId}-inner`,

                polyline: {

                  positions:
                    trajectoryPositions,

                  width:
                    7,

                  material:
                    Cesium.Color.fromCssColorString(
                      "#d946ef"
                    ),

                  arcType:
                    Cesium.ArcType.GEODESIC,

                  clampToGround:
                    false,

                  depthFailMaterial:
                    Cesium.Color.fromCssColorString(
                      "#d946ef"
                    ),
                },
              });

              // =================================================
              // FORECAST POINTS
              // =================================================

              trajectory.forEach(
                (point) => {

                  const position =
                    Cesium.Cartesian3.fromDegrees(
                      point.longitude,
                      point.latitude,
                      45_000
                    );

                  const isCurrent =
                    point.hour ===
                    0;

                  const labelText =
                    isCurrent
                      ? "NOW"
                      : `+${point.hour}H`;

                  viewer.entities.add({

                    id:
                      `forecast-point-${icebergId}-${point.hour}`,

                    position,

                    point: {

                      pixelSize:
                        isCurrent
                          ? 16
                          : 11,

                      color:
                        isCurrent
                          ? Cesium.Color.WHITE
                          : Cesium.Color.fromCssColorString(
                              "#f0abfc"
                            ),

                      outlineColor:
                        Cesium.Color.fromCssColorString(
                          "#a855f7"
                        ),

                      outlineWidth:
                        3,

                      disableDepthTestDistance:
                        Number.POSITIVE_INFINITY,
                    },

                    label: {

                      text:
                        labelText,

                      font:
                        isCurrent
                          ? "bold 14px Arial"
                          : "bold 12px Arial",

                      fillColor:
                        Cesium.Color.WHITE,

                      outlineColor:
                        Cesium.Color.BLACK,

                      outlineWidth:
                        4,

                      style:
                        Cesium.LabelStyle.FILL_AND_OUTLINE,

                      verticalOrigin:
                        Cesium.VerticalOrigin.BOTTOM,

                      pixelOffset:
                        new Cesium.Cartesian2(
                          0,
                          -18
                        ),

                      disableDepthTestDistance:
                        Number.POSITIVE_INFINITY,
                    },

                    properties: {

                      trajectoryHour:
                        point.hour,
                    },
                  });
                }
              );

              // =================================================
              // CURRENT HIGHLIGHT
              // =================================================

              const currentPosition =
                Cesium.Cartesian3.fromDegrees(
                  Number(
                    selectedIceberg.Longitude
                  ),
                  Number(
                    selectedIceberg.Latitude
                  ),
                  55_000
                );

              viewer.entities.add({

                id:
                  `trajectory-${icebergId}-current-highlight`,

                position:
                  currentPosition,

                ellipse: {

                  semiMinorAxis:
                    35_000,

                  semiMajorAxis:
                    35_000,

                  height:
                    55_000,

                  material:
                    Cesium.Color.fromCssColorString(
                      "#a855f7"
                    ).withAlpha(
                      0.18
                    ),

                  outline:
                    true,

                  outlineColor:
                    Cesium.Color.fromCssColorString(
                      "#d946ef"
                    ),

                  outlineWidth:
                    3,
                },
              });

              // =================================================
              // CAMERA
              // =================================================

              const boundingSphere =
                Cesium.BoundingSphere.fromPoints(
                  trajectoryPositions
                );

              const cameraRange =
                Math.max(
                  boundingSphere.radius *
                    1.4,
                  180_000
                );

              await viewer.camera.flyToBoundingSphere(
                boundingSphere,
                {

                  duration:
                    1.8,

                  offset:
                    new Cesium.HeadingPitchRange(
                      0,

                      Cesium.Math.toRadians(
                        -48
                      ),

                      cameraRange
                    ),
                }
              );

              viewer.scene.requestRender();

              console.log(
                "POLARIS-X: TRAJECTORY RENDERED SUCCESSFULLY."
              );

            } catch (error) {

              console.error(
                "POLARIS-X: TRAJECTORY ERROR:",
                error
              );
            }
          },

          Cesium.ScreenSpaceEventType.LEFT_CLICK
        );
      };

    initializeCesium();

    // ============================================================
    // CLEANUP
    // ============================================================

    return () => {

      destroyed = true;

      destroyedRef.current =
        true;

      resizeObserver?.disconnect();

      resizeObserverRef.current =
        null;

      if (clickHandler) {

        clickHandler.destroy();

        clickHandler = null;
      }

      clickHandlerRef.current =
        null;

      if (
        viewer &&
        !viewer.isDestroyed()
      ) {

        viewer.destroy();

        viewer = null;
      }

      viewerRef.current =
        null;

      cesiumRef.current =
        null;
    };

  }, [onIcebergSelect]);

  // ============================================================
  // PLAN MISSION EFFECT
  // ============================================================

  useEffect(() => {

    if (
      planMissionRequest ===
      0
    ) {
      return;
    }

    if (
      planMissionRequest ===
      lastMissionRequestRef.current
    ) {
      return;
    }

    lastMissionRequestRef.current =
      planMissionRequest;

    // Give Cesium a moment if the viewer
    // is still completing initialization.

    const timer =
      setTimeout(
        () => {

          drawNavigationRoute();

        },
        100
      );

    return () => {
      clearTimeout(timer);
    };

  }, [
    planMissionRequest,
  ]);

  // ============================================================
  // CONTAINER
  // ============================================================

  return (

    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full min-h-0 min-w-0"
      style={{
        position:
          "absolute",

        inset:
          0,

        width:
          "100%",

        height:
          "100%",

        minWidth:
          0,

        minHeight:
          0,
      }}
    />

  );
}