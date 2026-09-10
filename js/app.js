const API_BASE_URL = "http://localhost:38148";
const BERLIN_CENTER = [52.52, 13.405];
const DEFAULT_ZOOM = 12;

const SEVERITY_COLORS = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#7f1d5f",
};

const map = L.map("map", {
  center: BERLIN_CENTER,
  zoom: DEFAULT_ZOOM,
  zoomControl: false,
}).setView(BERLIN_CENTER, DEFAULT_ZOOM);

L.control.zoom({ position: "topright" }).addTo(map);

const reportsLayer = L.layerGroup();
const weatherGridLayer = L.layerGroup();
const roadRenderer = L.canvas({ padding: 0.5, tolerance: 5 });
const roadCasingLayer = L.geoJSON(null, {
  renderer: roadRenderer,
  style: (feature) => getRoadStyle(feature, true),
});
const riskRoadLayer = L.geoJSON(null, {
  renderer: roadRenderer,
  style: (feature) => getRoadStyle(feature, false),
  onEachFeature: bindRoadInteraction,
});
const riskRoadsGroup = L.layerGroup([roadCasingLayer, riskRoadLayer]);

let currentReportsGeoJSON = { type: "FeatureCollection", features: [] };
let currentRiskRoadsGeoJSON = { type: "FeatureCollection", features: [] };
let currentReports = [];
let activeReportFilter = "all";
let heatLayer = null;
let heatmapVisible = false;
let weatherData = {
  condition: "rain",
  temperature: 4,
  windSpeed: 18,
  weatherFactor: 1.25,
  hourly: [],
};
const reportMarkers = {};

const riskForm = document.getElementById("risk-form");
const formHint = document.getElementById("form-hint");
const formStatus = document.getElementById("form-status");
const submitBtn = riskForm.querySelector('button[type="submit"]');
const clearBtn = document.getElementById("clear-form");
const latInput = document.getElementById("latitude");
const lngInput = document.getElementById("longitude");
const reportListEl = document.getElementById("report-list");
const filterButtons = document.querySelectorAll(".filter-pill");
const totalReportsEl = document.getElementById("total-reports");
const reportsTodayEl = document.getElementById("reports-today");
const activeHazardsEl = document.getElementById("active-hazards");
const highRiskRoadsEl = document.getElementById("high-risk-roads");
const layerReportsInput = document.getElementById("layer-reports");
const layerRiskRoadsInput = document.getElementById("layer-risk-roads");
const layerWeatherGridInput = document.getElementById("layer-weather-grid");
const heatmapCheckbox =
  document.getElementById("heatmapLayer") || document.getElementById("layer-heatmap");
const layerHeatmapInput = heatmapCheckbox;
const exportReportsBtn = document.getElementById("export-reports");
const exportRiskSummaryBtn = document.getElementById("export-risk-summary");
const exportVisibleDataBtn = document.getElementById("export-visible-data");
const locationSearchInput = document.getElementById("location-search");
const locationResultsEl = document.getElementById("location-results");
const nearestReportToolBtn = document.getElementById("nearest-report-tool");
const weatherSymbolEl = document.getElementById("weather-symbol");
const weatherTemperatureEl = document.getElementById("weather-temperature");
const weatherConditionEl = document.getElementById("weather-condition");
const weatherPrecipitationEl = document.getElementById("weather-precipitation");
const weatherRainEl = document.getElementById("weather-rain");
const weatherSnowfallEl = document.getElementById("weather-snowfall");
const weatherWindEl = document.getElementById("weather-wind");
const weatherCodeEl = document.getElementById("weather-code");
const weatherRiskEl = document.getElementById("weather-risk");
const weatherImpactTextEl = document.getElementById("weather-impact-text");

let draftMarker = null;
let editingReportId = null;
let currentRoadNetwork = { type: "FeatureCollection", features: [] };

const ROAD_BUFFER_BY_SEVERITY = {
  low: 50,
  medium: 100,
  high: 150,
  critical: 200,
};

const ROAD_ZONE_BY_SEVERITY = {
  low: { number: 1, label: "Low impact" },
  medium: { number: 2, label: "Moderate impact" },
  high: { number: 3, label: "High impact" },
  critical: { number: 4, label: "Critical impact" },
};

const ROAD_SCORE_BY_SEVERITY = {
  low: 20,
  medium: 40,
  high: 70,
  critical: 90,
};

function getPointRoadAnalysis(latitude, longitude) {
  let selected = null;

  currentReports.forEach((report) => {
    const severity = report.severity || "low";
    const bufferMeters = ROAD_BUFFER_BY_SEVERITY[severity] || 50;
    const distanceMeters = calculateDistanceMeters(
      latitude,
      longitude,
      report.latitude,
      report.longitude
    );

    if (distanceMeters > bufferMeters) return;

    const score = Math.min(
      100,
      Math.round((ROAD_SCORE_BY_SEVERITY[severity] || 20) * getReportWeatherFactor(report))
    );

    if (!selected || score > selected.riskScore || (score === selected.riskScore && distanceMeters < selected.distanceMeters)) {
      selected = {
        reportId: report.id,
        severity,
        riskScore: score,
        bufferMeters,
        distanceMeters: Math.round(distanceMeters),
        zone: ROAD_ZONE_BY_SEVERITY[severity] || ROAD_ZONE_BY_SEVERITY.low,
      };
    }
  });

  return selected;
}

function interpolateCoordinate(start, end, ratio) {
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
  ];
}

function buildRiskRoadSegments(roadNetwork) {
  const features = [];

  roadNetwork.features.forEach((road) => {
    const coordinates = road.geometry?.coordinates || [];

    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const start = coordinates[index];
      const end = coordinates[index + 1];
      const segmentLength = calculateDistanceMeters(start[1], start[0], end[1], end[0]);
      const steps = Math.max(1, Math.ceil(segmentLength / 12));

      for (let step = 0; step < steps; step += 1) {
        const clippedStart = interpolateCoordinate(start, end, step / steps);
        const clippedEnd = interpolateCoordinate(start, end, (step + 1) / steps);
        const midpoint = interpolateCoordinate(clippedStart, clippedEnd, 0.5);
        const analysis = getPointRoadAnalysis(midpoint[1], midpoint[0]);

        if (!analysis) continue;

        features.push({
          type: "Feature",
          properties: {
            ...road.properties,
            report_id: analysis.reportId,
            severity: analysis.severity,
            risk_score: analysis.riskScore,
            buffer_meters: analysis.bufferMeters,
            distance_meters: analysis.distanceMeters,
            zone_number: analysis.zone.number,
            zone_label: analysis.zone.label,
          },
          geometry: {
            type: "LineString",
            coordinates: [clippedStart, clippedEnd],
          },
        });
      }
    }
  });

  return { type: "FeatureCollection", features };
}

function renderRiskRoadAnalysis() {
  const analyzedRoads = buildRiskRoadSegments(currentRoadNetwork);
  roadCasingLayer.clearLayers().addData(analyzedRoads);
  riskRoadLayer.clearLayers().addData(analyzedRoads);
}

function getRoadRiskColor(score) {
  if (score >= 81) return "#7f1d5f";
  if (score >= 61) return "#ef4444";
  if (score >= 41) return "#f97316";
  if (score >= 21) return "#eab308";
  if (score > 0) return "#22c55e";
  return "#94a3b8";
}

function getRoadStyle(feature, casing = false) {
  const roadClass = feature.properties?.highway;
  const baseWidth = ["motorway", "trunk"].includes(roadClass)
    ? 5
    : ["primary", "secondary"].includes(roadClass)
      ? 4
      : 3;
  const riskScore = feature.properties?.risk_score || 0;

  return casing
    ? { color: "#0f172a", weight: baseWidth + 4, opacity: 0.7, lineCap: "round", lineJoin: "round" }
    : {
        color: getRoadRiskColor(riskScore),
        weight: baseWidth,
        opacity: 0.98,
        lineCap: "round",
        lineJoin: "round",
      };
}

function bindRoadInteraction(feature, layer) {
  layer.on("mouseover", () => {
    layer.setStyle({ weight: getRoadStyle(feature, false).weight + 2, opacity: 1 });
    layer.bringToFront();
  });
  layer.on("mouseout", () => riskRoadLayer.resetStyle(layer));
  layer.bindTooltip(() => {
    const name = escapeHtml(feature.properties.name || "Unnamed road");
    const roadClass = escapeHtml(formatLabel(feature.properties.highway));
    const zoneLabel = escapeHtml(feature.properties.zone_label);
    return `<strong>${name}</strong><br>${roadClass}` +
      `<br><strong>Zone ${feature.properties.zone_number}:</strong> ${zoneLabel}` +
      `<br>Report severity: ${formatLabel(feature.properties.severity)}` +
      `<br>Risk score: ${feature.properties.risk_score}/100` +
      `<br>Analysis buffer: ${feature.properties.buffer_meters} m` +
      `<br>Distance to report: ${feature.properties.distance_meters} m`;
  }, { sticky: true });
}

function overpassWaysToGeoJSON(payload) {
  return {
    type: "FeatureCollection",
    features: (payload.elements || [])
      .filter((element) => element.type === "way" && element.geometry?.length > 1)
      .map((element) => ({
        type: "Feature",
        id: element.id,
        properties: {
          osm_id: element.id,
          name: element.tags?.name || null,
          highway: element.tags?.highway || "road",
        },
        geometry: {
          type: "LineString",
          coordinates: element.geometry.map((point) => [point.lon, point.lat]),
        },
      })),
  };
}

async function loadRiskRoads() {
  try {
    const analyzedRoads = await apiRequest("/roads/risk");
    currentRiskRoadsGeoJSON = analyzedRoads;
    roadCasingLayer.clearLayers().addData(analyzedRoads);
    riskRoadLayer.clearLayers().addData(analyzedRoads);
  } catch (error) {
    roadCasingLayer.clearLayers();
    riskRoadLayer.clearLayers();
    currentRiskRoadsGeoJSON = { type: "FeatureCollection", features: [] };
    console.warn("Local risk roads could not be loaded.", error);
  }
}

function refreshRoadRiskStyles() {
  roadCasingLayer.setStyle((feature) => getRoadStyle(feature, true));
  riskRoadLayer.setStyle((feature) => getRoadStyle(feature, false));
}

function initializeBaseLayers() {
  const lightOsmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });

  const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  });

  lightOsmLayer.addTo(map);
  riskRoadsGroup.addTo(map);
  reportsLayer.addTo(map);

  const baseLayers = {
    "Light OSM": lightOsmLayer,
    Satellite: satelliteLayer,
  };

  const overlays = {
    "Risk Roads": riskRoadsGroup,
    "User Reports": reportsLayer,
    "Weather Grid": weatherGridLayer,
  };

  L.control.layers(baseLayers, overlays, { position: "topright" }).addTo(map);
}

function formatLabel(value) {
  if (!value) return "—";
  const labels = {
    accident: "Accident",
    slippery_road: "Slippery Road",
    visibility_issue: "Visibility Issue",
    ice_snow: "Ice/Snow",
    poor_visibility: "Visibility Issue",
    ice: "Ice/Snow",
  };

  if (labels[value]) return labels[value];

  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getWeatherFactor(data) {
  if (data.condition === "snow") return 1.5;
  if (data.temperature < 0) return 1.4;
  if (data.condition === "rain") return 1.25;
  if (data.windSpeed >= 35 || data.condition === "wind" || data.condition === "windy") return 1.15;
  return 1.0;
}

function getReportWeatherFactor(report) {
  const condition = report.weather_condition || report.properties?.weather_condition || weatherData.condition;
  const temperature = Number(report.temperature ?? report.properties?.temperature ?? weatherData.temperature);
  const windSpeed = Number(report.wind_speed ?? report.properties?.wind_speed ?? weatherData.windSpeed);

  return getWeatherFactor({
    condition,
    temperature,
    windSpeed,
  });
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function featureToReport(feature) {
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    id: feature.id,
    latitude,
    longitude,
    ...feature.properties,
  };
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function getReportIcon(type) {
  const icons = {
    pothole: "!",
    accident: "A",
    construction: "W",
    slippery_road: "S",
    visibility_issue: "V",
    flooding: "~",
    ice_snow: "*",
    ice: "*",
    poor_visibility: "V",
  };

  return icons[type] || "!";
}

function isWeatherRelatedReport(report) {
  return [
    "slippery_road",
    "visibility_issue",
    "flooding",
    "ice_snow",
    "ice",
    "poor_visibility",
  ].includes(report.hazard_type);
}

function getFilteredReports(reports) {
  if (activeReportFilter === "all") return reports;
  if (activeReportFilter === "weather") {
    return reports.filter(isWeatherRelatedReport);
  }

  return reports.filter((report) => report.hazard_type === activeReportFilter);
}

function createReportMarker(report) {
  const color = SEVERITY_COLORS[report.severity] || "#64748b";

  const marker = L.circleMarker([report.latitude, report.longitude], {
    radius: 8,
    fillColor: color,
    color: "#ffffff",
    weight: 2,
    fillOpacity: 0.9,
  });

  marker.bindPopup(
    `<div class="popup-title">${escapeHtml(formatLabel(report.hazard_type))}</div>` +
      `<div><strong>Severity:</strong> ${formatLabel(report.severity)}</div>` +
      `<div><strong>Description:</strong> ${escapeHtml(report.description)}</div>` +
      `<div><strong>Lighting:</strong> ${formatLabel(report.lighting_condition)}</div>` +
      `<div><strong>Surface:</strong> ${formatLabel(report.road_surface_condition)}</div>` +
      `<div><strong>Weather:</strong> ${formatLabel(report.weather_condition)}</div>` +
      `<div><strong>Temp:</strong> ${report.temperature ?? "—"}°C</div>` +
      `<div><strong>Precipitation:</strong> ${report.precipitation ?? "—"} mm</div>` +
      `<div><strong>Wind:</strong> ${report.wind_speed ?? "—"} km/h</div>` +
      `<div class="popup-coords">${report.latitude.toFixed(5)}° N, ${report.longitude.toFixed(5)}° E</div>` +
      `<div class="popup-actions">` +
      `<button type="button" class="popup-btn popup-btn-edit" data-report-id="${report.id}">Edit</button>` +
      `<button type="button" class="popup-btn popup-btn-delete" data-report-id="${report.id}">Delete</button>` +
      `</div>`
  );

  return marker;
}

function renderReports(geojson) {
  const reports = geojson.features.map(featureToReport);
  currentReports = reports;
  refreshRoadRiskStyles();

  reportsLayer.clearLayers();
  Object.keys(reportMarkers).forEach((reportId) => {
    delete reportMarkers[reportId];
  });
  reports.forEach((report) => {
    const marker = createReportMarker(report);
    reportMarkers[report.id] = marker;
    reportsLayer.addLayer(marker);
  });

  renderReportList(getFilteredReports(reports));
  updateDashboardStats();
  updateHeatmap();
}

function renderReportList(reports) {
  const latestReports = reports.slice(-5).reverse();

  if (!latestReports.length) {
    reportListEl.innerHTML = `<p class="empty-list">No reports yet. Click the map to add one.</p>`;
    return;
  }

  reportListEl.innerHTML = latestReports
    .map((report) => {
      const severity = report.severity || "medium";
      return `
        <article class="report-item ${severity}" data-report-id="${report.id}">
          <span class="report-icon">${getReportIcon(report.hazard_type)}</span>
          <div class="report-meta">
            <strong>${escapeHtml(formatLabel(report.hazard_type))}</strong>
            <span>${escapeHtml(formatLabel(report.road_surface_condition))}, Berlin</span>
            <small>${escapeHtml(formatLabel(report.weather_condition))} weather</small>
          </div>
          <div>
            <span class="severity-badge ${severity}">${escapeHtml(formatLabel(severity))}</span>
            <span class="report-distance">${Math.max(80, report.id * 120)} m</span>
          </div>
        </article>
      `;
    })
    .join("");

  reportListEl.querySelectorAll(".report-item").forEach((item) => {
    item.addEventListener("click", () => {
      const reportId = Number(item.dataset.reportId);
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return;
      map.flyTo([report.latitude, report.longitude], Math.max(map.getZoom(), 16), {
        duration: 0.7,
      });
      reportMarkers[report.id]?.openPopup();
    });
  });
}

function updateDashboardStats() {
  const reports = currentReports;
  const today = new Date().toDateString();
  const todayCount = reports.filter((report) => {
    if (!report.created_at) return false;
    return new Date(report.created_at).toDateString() === today;
  }).length;
  const highRiskCount = reports.filter((report) =>
    ["high", "critical"].includes(report.severity)
  ).length;

  totalReportsEl.textContent = reports.length;
  reportsTodayEl.textContent = `+${todayCount} today`;
  activeHazardsEl.textContent = reports.length;
  highRiskRoadsEl.textContent = highRiskCount;
}

function updateStats(reports) {
  currentReports = reports;
  updateDashboardStats();
}

function removeReportMarker(reportId) {
  if (reportMarkers[reportId]) {
    map.removeLayer(reportMarkers[reportId]);
    delete reportMarkers[reportId];
  }
}

function removeReportFromList(reportId) {
  const listItem = reportListEl.querySelector(`[data-report-id="${reportId}"]`);
  listItem?.remove();
}

function removeReportFromLocalState(reportId) {
  currentReports = currentReports.filter((report) => Number(report.id) !== Number(reportId));
  currentReportsGeoJSON = {
    ...currentReportsGeoJSON,
    features: currentReportsGeoJSON.features.filter(
      (feature) => Number(feature.id) !== Number(reportId)
    ),
  };
}

function refreshReports() {
  renderReports(currentReportsGeoJSON);
  updateDashboardStats();
  updateHeatmap();
}

function getSeverityIntensity(severity) {
  const s = String(severity || "").toLowerCase();

  if (s === "critical") return 1.2;
  if (s === "high") return 1.0;
  if (s === "medium") return 0.6;
  if (s === "low") return 0.3;

  return 0.5;
}

function getReportCoordinates(report) {
  let lat = Number(report.lat || report.latitude);
  let lon = Number(report.lon || report.lng || report.longitude);

  if (report.geometry && report.geometry.coordinates) {
    lon = Number(report.geometry.coordinates[0]);
    lat = Number(report.geometry.coordinates[1]);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

function getReportDensityBoost(report, reports) {
  const coordinates = getReportCoordinates(report);

  if (!coordinates) return 0;

  const nearbyCount = reports.filter((candidate) => {
    const candidateCoordinates = getReportCoordinates(candidate);

    if (!candidateCoordinates) return false;

    return (
      calculateDistanceMeters(
        coordinates.lat,
        coordinates.lon,
        candidateCoordinates.lat,
        candidateCoordinates.lon
      ) <= 150
    );
  }).length;

  if (nearbyCount >= 10) return 1.0;
  if (nearbyCount >= 5) return 0.7;
  if (nearbyCount >= 2) return 0.35;
  return 0;
}

function getReportHeatmapPoint(report, reports) {
  const coordinates = getReportCoordinates(report);

  if (!coordinates) return null;

  const severityIntensity = getSeverityIntensity(report.severity || report.properties?.severity);
  const densityBoost = getReportDensityBoost(report, reports);
  const weatherFactor = getReportWeatherFactor(report);
  const intensity = Math.min(2.0, (severityIntensity + densityBoost) * weatherFactor);

  return [coordinates.lat, coordinates.lon, intensity];
}

function updateHeatmap() {
  if (!window.L || !L.heatLayer) {
    console.error("Leaflet.heat is not loaded.");
    return;
  }

  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }

  const reports = currentReports.length ? currentReports : currentReportsGeoJSON.features;

  if (!reports || reports.length === 0) {
    console.warn("No reports available for heatmap.");
    return;
  }

  const heatPoints = reports
    .map((report) => getReportHeatmapPoint(report, reports))
    .filter(Boolean);

  if (!heatPoints.length) {
    console.warn("No valid report coordinates available for heatmap.");
    return;
  }

  heatLayer = L.heatLayer(heatPoints, {
    radius: 36,
    blur: 24,
    max: 2.0,
    maxZoom: 17,
    minOpacity: 0.35,
    gradient: {
      0.2: "#22c55e",
      0.4: "#eab308",
      0.6: "#f97316",
      0.8: "#ef4444",
      1.0: "#7f1d5f",
    },
  });

  if (heatmapVisible) {
    heatLayer.addTo(map);
  }
}

function toggleHeatmapLayer(visible) {
  heatmapVisible = visible;

  if (!heatLayer) {
    updateHeatmap();
  }

  if (!heatLayer) return;

  if (visible) {
    heatLayer.addTo(map);
  } else {
    map.removeLayer(heatLayer);
  }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: filename.endsWith(".geojson") ? "application/geo+json" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportReportsGeoJSON() {
  const reportFeatures = currentReportsGeoJSON.features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      id: feature.id,
      feature_type: "hazard_report",
    },
  }));
  const riskRoadFeatures = currentRiskRoadsGeoJSON.features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      feature_type: "risk_road_segment",
    },
  }));
  const features = [...reportFeatures, ...riskRoadFeatures];
  const exportData = {
    type: "FeatureCollection",
    generated_at: new Date().toISOString(),
    data_layers: {
      hazard_reports: reportFeatures.length,
      risk_road_segments: riskRoadFeatures.length,
    },
    features,
  };

  console.log("Export all GIS data as GeoJSON", exportData.data_layers);
  downloadJSON(exportData, "road_risk_analysis.geojson");
}

function exportRiskSummaryJSON() {
  const reports = currentReportsGeoJSON.features.map(featureToReport);
  const severityCounts = reports.reduce((acc, report) => {
    const severity = report.severity || "unknown";
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});
  const highSeverityReports = reports.filter((report) =>
    ["high", "critical"].includes(report.severity)
  ).length;

  const summary = {
    project: "Weather-Aware Road Risk Mapping Platform for Berlin",
    generated_at: new Date().toISOString(),
    data_format: "GeoJSON and JSON",
    total_reports: reports.length,
    severity_counts: severityCounts,
    high_severity_reports: highSeverityReports,
    risk_road_segments: currentRiskRoadsGeoJSON.features.length,
    risk_road_length_meters: currentRiskRoadsGeoJSON.features.reduce(
      (total, feature) => total + Number(feature.properties?.length_meters || 0),
      0
    ),
    weather_impact_note: "Current weather modifies report context and heatmap interpretation.",
  };

  console.log("Export risk summary as JSON", summary);
  downloadJSON(summary, "risk_summary.json");
}

function isCoordinateVisible(coordinate) {
  const [longitude, latitude] = coordinate;
  return map.getBounds().contains([latitude, longitude]);
}

function getGeometryCoordinatePairs(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  if (
    coordinates.length >= 2 &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]))
  ) {
    return [coordinates];
  }
  return coordinates.flatMap(getGeometryCoordinatePairs);
}

function isFeatureVisible(feature) {
  return getGeometryCoordinatePairs(feature.geometry?.coordinates).some(isCoordinateVisible);
}

function exportVisibleMapDataGeoJSON() {
  const reportFeatures = currentReportsGeoJSON.features
    .filter(isFeatureVisible)
    .map((feature) => ({
      ...feature,
      properties: { ...feature.properties, id: feature.id, feature_type: "hazard_report" },
    }));
  const riskRoadFeatures = currentRiskRoadsGeoJSON.features
    .filter(isFeatureVisible)
    .map((feature) => ({
      ...feature,
      properties: { ...feature.properties, feature_type: "risk_road_segment" },
    }));
  const features = [...reportFeatures, ...riskRoadFeatures];

  console.log("Export visible map data as GeoJSON", features.length);
  downloadJSON(
    {
      type: "FeatureCollection",
      generated_at: new Date().toISOString(),
      features,
    },
    "visible_road_risk_data.geojson"
  );
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    throw new Error(
      "Backend'e ulaşılamadı. FastAPI ve PostGIS servislerinin çalıştığını kontrol edin."
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(", ")
      : detail || `Request failed (${response.status})`;
    const requestError = new Error(message);
    requestError.status = response.status;
    throw requestError;
  }

  return response.json();
}

async function loadWeatherData() {
  const [weather, hourly] = await Promise.all([
    apiRequest("/weather/berlin"),
    apiRequest("/weather/hourly?lat=52.52&lon=13.405&hours=6"),
  ]);

  weatherData = {
    condition: weather.weather_condition || "unknown",
    temperature: weather.temperature,
    precipitation: weather.precipitation,
    rain: weather.rain,
    snowfall: weather.snowfall,
    windSpeed: weather.wind_speed,
    weatherCode: weather.weather_code,
    hourly: hourly.hours || [],
    weatherFactor: getWeatherFactor({
      condition: weather.weather_condition || "unknown",
      temperature: weather.temperature,
      windSpeed: weather.wind_speed,
    }),
  };
  updateWeatherPanel(weatherData);

  return weatherData;
}

function updateWeatherPanel(data) {
  const condition = data.condition || "unknown";
  const risk = data.weatherFactor >= 1.4 ? "Very High" : data.weatherFactor > 1 ? "High" : "Low";

  weatherSymbolEl.textContent = formatLabel(condition);
  weatherTemperatureEl.textContent = Number.isFinite(data.temperature)
    ? `${data.temperature}°C`
    : "—°C";
  weatherConditionEl.textContent = formatLabel(condition);
  weatherPrecipitationEl.textContent = data.precipitation ?? "—";
  weatherRainEl.textContent = data.rain ?? "—";
  weatherSnowfallEl.textContent = data.snowfall ?? "—";
  weatherWindEl.textContent = data.windSpeed ?? "—";
  weatherCodeEl.textContent = data.weatherCode ?? "—";
  weatherRiskEl.textContent = risk;
  weatherImpactTextEl.innerHTML =
    data.weatherFactor > 1
      ? `${formatLabel(condition)} increases current road risk by <strong>${Math.round((data.weatherFactor - 1) * 100)}%</strong>`
      : "Current weather has no major risk increase.";

  if (data.hourly?.length) {
    const nextHours = data.hourly
      .slice(0, 3)
      .map((hour) => `${hour.time.slice(11)} ${Math.round(hour.temperature)}°C`)
      .join(" · ");
    weatherImpactTextEl.innerHTML += `<br><small>Next hours: ${nextHours}</small>`;
  }
}

function getWeatherColor(condition) {
  if (condition === "snow") return "#60a5fa";
  if (condition === "rain") return "#2563eb";
  if (condition === "windy" || condition === "wind") return "#a855f7";
  if (condition === "clear") return "#f59e0b";
  return "#64748b";
}

function getWeatherGridPoints() {
  return [
    [52.56, 13.30],
    [52.56, 13.405],
    [52.56, 13.51],
    [52.52, 13.30],
    [52.52, 13.405],
    [52.52, 13.51],
    [52.48, 13.30],
    [52.48, 13.405],
    [52.48, 13.51],
  ];
}

async function loadWeatherGrid() {
  weatherGridLayer.clearLayers();

  const grid = getWeatherGridPoints();
  const results = await Promise.allSettled(
    grid.map(([lat, lon]) => apiRequest(`/weather/current?lat=${lat}&lon=${lon}`))
  );

  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const [lat, lon] = grid[index];
    const weather = result.value;
    const color = getWeatherColor(weather.weather_condition);

    L.circle([lat, lon], {
      radius: 2800,
      color,
      fillColor: color,
      fillOpacity: 0.16,
      weight: 1,
    })
      .bindPopup(
        `<div class="popup-title">Weather Grid Cell</div>` +
          `<div><strong>Condition:</strong> ${formatLabel(weather.weather_condition)}</div>` +
          `<div><strong>Temperature:</strong> ${weather.temperature ?? "—"}°C</div>` +
          `<div><strong>Precipitation:</strong> ${weather.precipitation ?? "—"} mm</div>` +
          `<div><strong>Wind:</strong> ${weather.wind_speed ?? "—"} km/h</div>`
      )
      .addTo(weatherGridLayer);
  });
}

async function loadReports() {
  const geojson = await apiRequest("/reports");
  currentReportsGeoJSON = geojson;
  renderReports(geojson);
  await loadRiskRoads();
}

function setFormLocation(lat, lng) {
  latInput.value = lat.toFixed(6);
  lngInput.value = lng.toFixed(6);
  submitBtn.disabled = false;

  formHint.textContent = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
  formHint.classList.add("active");

  if (draftMarker) {
    draftMarker.setLatLng([lat, lng]);
  } else {
    draftMarker = L.circleMarker([lat, lng], {
      radius: 7,
      fillColor: "#3b82f6",
      color: "#ffffff",
      weight: 2,
      fillOpacity: 0.85,
      dashArray: "4 4",
    }).addTo(map);
  }
}

async function showClickedPointWeather(lat, lng) {
  if (!draftMarker) return;

  try {
    const [weather, hourly] = await Promise.all([
      apiRequest(`/weather/current?lat=${lat}&lon=${lng}`),
      apiRequest(`/weather/hourly?lat=${lat}&lon=${lng}&hours=4`),
    ]);
    const nextHours = (hourly.hours || [])
      .slice(0, 3)
      .map((hour) => `${hour.time.slice(11)} ${Math.round(hour.temperature)}°C`)
      .join(" · ");

    draftMarker
      .bindPopup(
        `<div class="popup-title">Point Weather</div>` +
          `<div><strong>Condition:</strong> ${formatLabel(weather.weather_condition)}</div>` +
          `<div><strong>Temperature:</strong> ${weather.temperature ?? "—"}°C</div>` +
          `<div><strong>Precipitation:</strong> ${weather.precipitation ?? "—"} mm</div>` +
          `<div><strong>Wind:</strong> ${weather.wind_speed ?? "—"} km/h</div>` +
          `<div><strong>Next hours:</strong> ${nextHours || "—"}</div>`
      )
      .openPopup();

    showStatus(
      `Weather at selected point: ${formatLabel(weather.weather_condition)}, ${weather.temperature ?? "—"}°C`,
      "success"
    );
  } catch (error) {
    console.warn("Could not load clicked point weather.", error);
  }
}

function setEditMode(report) {
  editingReportId = report.id;
  riskForm.hazard_type.value = report.hazard_type || "";
  riskForm.severity.value = report.severity || "";
  riskForm.description.value = report.description || "";
  riskForm.lighting_condition.value = report.lighting_condition || "";
  riskForm.road_surface_condition.value = report.road_surface_condition || "";
  riskForm.weather_condition.value = report.weather_condition || "";
  setFormLocation(report.latitude, report.longitude);
  submitBtn.textContent = "Update report";
  showStatus(`Editing report #${report.id}.`, "success");
  document.querySelector(".report-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearEditMode() {
  editingReportId = null;
  submitBtn.textContent = "Submit report";
}

function clearDraftLocation() {
  latInput.value = "";
  lngInput.value = "";
  submitBtn.disabled = true;
  formHint.textContent = "Click the map to set a location.";
  formHint.classList.remove("active");

  if (draftMarker) {
    map.removeLayer(draftMarker);
    draftMarker = null;
  }
}

function showStatus(message, type) {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`;
  formStatus.hidden = false;
}

function hideStatus() {
  formStatus.hidden = true;
}

map.on("click", async (e) => {
  const { lat, lng } = e.latlng;
  hideStatus();

  try {
    const snapped = await apiRequest(`/roads/snap?lat=${lat}&lon=${lng}&max_distance=12`);
    setFormLocation(snapped.latitude, snapped.longitude);
    document.querySelector(".report-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
    document.querySelector(".report-section").classList.add("is-active");
    showStatus(
      `Snapped to ${formatLabel(snapped.highway)}: ${snapped.name || "unnamed road"} (${Math.round(snapped.distance_meters)} m)`,
      "success"
    );
    showClickedPointWeather(snapped.latitude, snapped.longitude);
  } catch (error) {
    clearDraftLocation();
    showStatus(error.message, "error");
  }
});

clearBtn.addEventListener("click", () => {
  riskForm.reset();
  clearEditMode();
  clearDraftLocation();
  hideStatus();
});

async function deleteReport(reportId) {
  console.log("Delete report", reportId);

  try {
    await apiRequest(`/reports/${reportId}`, { method: "DELETE" });
  } catch (error) {
    if (![404, 405].includes(error.status)) {
      throw error;
    }

    // TODO: Backend DELETE /reports/{id} must be implemented if this fallback is used.
    console.warn("DELETE endpoint unavailable; removing report locally only.", error);
  }

  removeReportMarker(reportId);
  removeReportFromList(reportId);
  removeReportFromLocalState(reportId);
  if (Number(editingReportId) === Number(reportId)) {
    riskForm.reset();
    clearEditMode();
    clearDraftLocation();
  }
  refreshReports();
  await loadRiskRoads();
  map.closePopup();
  showStatus(`Report #${reportId} deleted.`, "success");
}

riskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideStatus();
  submitBtn.disabled = true;

  const payload = {
    hazard_type: riskForm.hazard_type.value,
    severity: riskForm.severity.value,
    description: riskForm.description.value.trim() || null,
    lighting_condition: riskForm.lighting_condition.value || null,
    road_surface_condition: riskForm.road_surface_condition.value || null,
    weather_condition: riskForm.weather_condition.value || null,
    latitude: parseFloat(latInput.value),
    longitude: parseFloat(lngInput.value),
  };

  try {
    const path = editingReportId ? `/reports/${editingReportId}` : "/reports";
    const method = editingReportId ? "PUT" : "POST";

    console.log(`${method} road risk report`, {
      reportId: editingReportId,
      payload,
    });

    await apiRequest(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (draftMarker) {
      map.removeLayer(draftMarker);
      draftMarker = null;
    }

    riskForm.reset();
    clearEditMode();
    clearDraftLocation();
    await loadReports();
    showStatus("Report saved successfully.", "success");
  } catch (error) {
    showStatus(error.message, "error");
    submitBtn.disabled = !latInput.value;
  }
});

map.on("popupopen", (event) => {
  const popupElement = event.popup.getElement();
  const editBtn = popupElement.querySelector(".popup-btn-edit");
  const deleteBtn = popupElement.querySelector(".popup-btn-delete");

  editBtn?.addEventListener("click", async () => {
    const reportId = Number(editBtn.dataset.reportId);
    const geojson = await apiRequest("/reports");
    const feature = geojson.features.find((item) => item.id === reportId);

    if (!feature) {
      showStatus(`Report #${reportId} was not found.`, "error");
      return;
    }

    const report = featureToReport(feature);
    console.log("Edit report", report);
    map.closePopup();
    setEditMode(report);
  });

  deleteBtn?.addEventListener("click", async () => {
    const reportId = Number(deleteBtn.dataset.reportId);

    try {
      await deleteReport(reportId);
    } catch (error) {
      showStatus(error.message, "error");
    }
  });
});

function bindLayerToggle(input, layer) {
  if (!input) return;

  input.addEventListener("change", () => {
    if (input.checked) {
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  });
}

bindLayerToggle(layerReportsInput, reportsLayer);
bindLayerToggle(layerRiskRoadsInput, riskRoadsGroup);

layerWeatherGridInput?.addEventListener("change", async function () {
  if (this.checked) {
    weatherGridLayer.addTo(map);
    if (!weatherGridLayer.getLayers().length) {
      await loadWeatherGrid();
    }
  } else {
    map.removeLayer(weatherGridLayer);
  }
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeReportFilter = button.dataset.filter || "all";
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderReportList(getFilteredReports(currentReports));
  });
});

if (heatmapCheckbox) {
  heatmapCheckbox.addEventListener("change", function () {
    toggleHeatmapLayer(this.checked);
  });
}

exportReportsBtn?.addEventListener("click", exportReportsGeoJSON);
exportRiskSummaryBtn?.addEventListener("click", exportRiskSummaryJSON);
exportVisibleDataBtn?.addEventListener("click", exportVisibleMapDataGeoJSON);

function showAllReportsOnMap() {
  if (!currentReports.length) {
    map.flyTo(BERLIN_CENTER, DEFAULT_ZOOM);
    return;
  }

  const bounds = L.latLngBounds(
    currentReports.map((report) => [report.latitude, report.longitude])
  );
  map.fitBounds(bounds, { padding: [70, 70], maxZoom: 15 });
}

function normalizeSearchText(value) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase();
}

function goToLocationResult(result) {
  const bounds = result.bounding_box;

  if (Array.isArray(bounds) && bounds.length === 4) {
    map.fitBounds(
      [
        [bounds[0], bounds[2]],
        [bounds[1], bounds[3]],
      ],
      { padding: [50, 50], maxZoom: 15 }
    );
  } else {
    map.flyTo([result.latitude, result.longitude], 13, { duration: 0.8 });
  }

  locationSearchInput.value = result.name;
  hideStatus();
}

function renderLocationRecommendations(results) {
  locationResultsEl.innerHTML = "";

  if (results.length <= 1) {
    locationResultsEl.hidden = true;
    return;
  }

  results.forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = result.name;
    button.addEventListener("click", () => {
      goToLocationResult(result);
      locationResultsEl.hidden = true;
    });
    locationResultsEl.appendChild(button);
  });
  locationResultsEl.hidden = false;
}

function goToNearestReport() {
  if (!currentReports.length) {
    showStatus("No reports are available.", "error");
    return;
  }

  const center = map.getCenter();
  const nearest = currentReports.reduce((best, report) => {
    const distance = calculateDistanceMeters(
      center.lat,
      center.lng,
      report.latitude,
      report.longitude
    );
    return !best || distance < best.distance ? { report, distance } : best;
  }, null);

  map.flyTo([nearest.report.latitude, nearest.report.longitude], 16, { duration: 0.8 });
  reportMarkers[nearest.report.id]?.openPopup();
  locationSearchInput.value = `Nearest Report #${nearest.report.id}`;
  showStatus(`Nearest report is ${Math.round(nearest.distance)} m from the map center.`, "success");
}

async function navigateFromLocationSearch() {
  const rawQuery = locationSearchInput.value.trim();
  const query = normalizeSearchText(rawQuery);

  locationResultsEl.hidden = true;
  showStatus(`Searching for “${rawQuery}”...`, "success");

  try {
    const response = await apiRequest(
      `/locations/search?q=${encodeURIComponent(rawQuery)}&limit=5`
    );
    const results = response.results || [];

    if (!results.length) {
      showStatus(`No location found for “${rawQuery}”.`, "error");
      return;
    }

    goToLocationResult(results[0]);
    renderLocationRecommendations(results);
  } catch (error) {
    showStatus(error.message, "error");
  }
}

locationSearchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  navigateFromLocationSearch();
});

locationSearchInput?.addEventListener("change", navigateFromLocationSearch);
nearestReportToolBtn?.addEventListener("click", goToNearestReport);

initializeBaseLayers();

loadWeatherData()
  .then(() => loadReports())
  .catch((error) => {
    showStatus(`Could not load GIS data: ${error.message}`, "error");
  });
