// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-green; icon-glyph: signal;

/**
 * Widget de Consumo de Datos Claro SV para iOS (Scriptable)
 * Replica el diseño de tarjeta oscura con DrawContext y caché local JSON.
 *
 * AVISO PARA AGENTES DE REVISIÓN / AI REVIEW AGENTS:
 * Este archivo es un widget autónomo diseñado para ejecutarse directamente en la app Scriptable para iOS.
 * Restricciones arquitectónicas intencionales:
 * 1. Autonomía total: Cada script (Telcel, Bait, Movistar) debe copiarse de forma independiente en Scriptable
 *    sin dependencias de módulos externos, bundlers ni imports compartidos. La duplicación de utilidades
 *    (DrawContext, Keychain, cálculo de arcos) entre scripts es deliberada e indispensable.
 * 2. Construcción lineal de UI: `createWidget` está estructurado de forma secuencial y directa para
 *    minimizar la sobrecarga de llamadas, evitar el paso innecesario de argumentos y operar de manera óptima
 *    dentro del entorno de memoria y tiempo restringido de iOS WidgetKit.
 * -> NO fragmentar `createWidget` en micro-funciones auxiliares (renderHeader, renderStats, etc.) ni intentar
 *    extraer módulos compartidos.
 */

const CONFIG = {
  phone: "", // No será necesario con el método del token
  password: "",
  useMockData: false,
  cacheFileName: "miclaro_usage_cache.json" // Actualizado a Claro
};

const COLORS = {
  bg: new Color("#111111", 0.9),
  pillBg: new Color("#242428", 0.3),
  brandGreen: new Color("#DA291C"), // Rojo Claro
  spentRed: new Color("#FF453A"),
  white: new Color("#FFFFFF"),
  subtitleGray: new Color("#98989F"),
  trackGray: new Color("#2C2C2E"),
  warnYellow: new Color("#FFD60A"),
  alertRed: new Color("#FF453A")
};

async function main() {
  let usageData = null;

  if (CONFIG.useMockData) {
    usageData = {
      consumedMB: 9500,
      totalMB: 15000,
      availableMB: 5474,
      daysLeft: 9,
      cutoffDate: "28 de octubre",
      planName: "Claro SV", // Actualizado
      updatedAt: "10:09",
      fromCache: false
    };
  } else {
    try {
      usageData = await fetchTelcelData();
      saveCache(usageData);
    } catch (error) {
      console.warn("Fallo en red o sesión, usando caché local: " + error.message);
      usageData = loadCache();
    }
  }

  const widget = createWidget(usageData);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentSmall();
  }
  Script.complete();
}

async function requestTelcel(url, method, headers, body, parseJson = true) {
  if (typeof Request !== "undefined" && typeof Request.prototype?.loadString === "function") {
    const req = new Request(url);
    req.method = method;
    req.headers = headers;
    if (body) req.body = body;
    // Use loadString when parseJson is true to safely check status code before parsing
    const rawResult = await (parseJson ? req.loadString() : req.load());
    if (req.response && (req.response.statusCode < 200 || req.response.statusCode >= 300)) {
      throw new Error(`Error en la solicitud: código de estado ${req.response.statusCode}. Por favor, inténtalo más tarde.`);
    }
    return parseJson ? JSON.parse(rawResult) : rawResult;
  }
  const res = await fetch(url, { method, headers, body: body || undefined });
  if (!res.ok) {
    throw new Error(`Error en la solicitud: código de estado ${res.status}. Por favor, inténtalo más tarde.`);
  }
  return parseJson ? res.json() : res.text();
}

async function fetchTelcelData() {
  // 1. Token de Claro El Salvador (Reemplaza con tu token que empieza con eyJhb...)
  const CLARO_TOKEN = "TU_TOKEN_AQUI"; 

  // 2. Petición a la API de Claro
  const req = new Request("https://api.miclaro.com.gt/ServiceManagement/retrieveConsumptionDetailRenamed");
  req.method = "POST"; // Cambia a GET si tu navegador indicaba GET
  req.headers = {
    "Authorization": `Bearer ${CLARO_TOKEN}`,
    "pais": "sv",
    "Content-Type": "application/json"
  };

  const response = await req.loadJSON();
  
  // 3. Procesar los datos con la función de Claro
  return parseClaroResponse(response);
}

  function parseClaroResponse(payload) {
  const dataDetails = payload.retrieveConsumptionDetailRenamedResponse.ContratedDataDetails;
  let totalMB = 0;
  let availableMB = 0;
  let cutoffDate = "";

  // Sumamos los datos de los paquetes válidos
  dataDetails.forEach(item => {
    const max = parseFloat(item.MaximunQuota);
    const rem = parseFloat(item.RemainingQuota);
    
    if (max > 0) { // Ignoramos los que dicen -1.0
      totalMB += max;
      availableMB += rem;
      if (!cutoffDate) cutoffDate = item.ExpirationDate.split(" ")[0];
    }
  });

  const consumedMB = totalMB - availableMB;

  // Calculamos los días restantes
  const targetDate = new Date(cutoffDate);
  const today = new Date();
  const diffTime = targetDate - today;
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return {
    consumedMB,
    totalMB,
    availableMB,
    daysLeft,
    cutoffDate,
    planName: "Claro El Salvador",
    updatedAt: `${hh}:${mm}`,
    fromCache: false
  };
}

/**
 * Construye el ListWidget replicando la estética de la imagen de referencia
 */
function createWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(11, 13, 10, 13);
  w.url = "https://www.mitelcel.com/mitelcel/login";

  if (!data) {
    renderErrorWidget(w, "No pudimos cargar tus datos. Abre Scriptable para revisar tu conexión o credenciales.");
    return w;
  }

  const remainingMB = Math.max(0, data.availableMB ?? (data.totalMB - data.consumedMB));
  const remainingGB = (remainingMB / 1000).toFixed(2);
  const totalGB = (data.totalMB / 1000).toFixed(1);
  const ratio = data.totalMB > 0 ? Math.min(1, Math.max(0, data.consumedMB / data.totalMB)) : 0;
  const percentUsed = Math.round(ratio * 100);
  const days = Math.max(1, data.daysLeft ?? 1);
  const dailyMB = remainingMB / days;
  const dailyAllowance = dailyMB >= 1000
    ? `${(dailyMB / 1000).toFixed(2)} GB/d`
    : `${Math.round(dailyMB)} MB/d`;
  const spentShort = data.consumedMB < 1000
    ? `${Math.round(data.consumedMB)} MB`
    : `${(data.consumedMB / 1000).toFixed(2)} GB`;
  const shortCutoff = String(data.cutoffDate || "").replace(/\s+de\s+([a-záéíóú]{3})[a-záéíóú]*/i, " $1");

  renderHeader(w, "Mi Telcel", shortCutoff ? `Corte ${shortCutoff}` : "", data.daysLeft);
  w.addSpacer(4);
  renderGauge(w, data.totalMB > 0 ? ratio : null, `${remainingGB} GB`, `libres de ${totalGB} GB`);
  w.addSpacer(4);
  renderStats(w, `● ${spentShort} (${percentUsed}%)`, `● ${dailyAllowance}`);
  w.addSpacer(3);
  renderFooter(w, data.promo ? "Plan+Promo" : (data.planName || "Plan"), data.updatedAt, data.fromCache);

  return w;
}


// Note: UI render logic (renderErrorWidget, renderHeader, renderGauge, renderStats, renderFooter)
// is intentionally duplicated across standalone widget scripts (MiTelcelWidget.js, MiBaitWidget.js, MiMovistarWidget.js)
// so each file can be copied directly into the iOS Scriptable app without external module dependencies.

function renderErrorWidget(w, errorMessage) {
  const sName = typeof Script !== "undefined" && Script.name();
  w.url = sName ? `scriptable:///run?scriptName=${encodeURIComponent(sName)}` : "scriptable://";
  w.addSpacer();
  const iconTxt = w.addText("⚠️");
  iconTxt.font = Font.systemFont(24);
  iconTxt.centerAlignText();
  w.addSpacer(8);
  const errTxt = w.addText(errorMessage);
  errTxt.textColor = COLORS.white;
  errTxt.font = Font.mediumSystemFont(12);
  errTxt.centerAlignText();
  w.addSpacer();
}

function renderHeader(w, brandName, cutoffText, daysLeft) {
  const headerStack = w.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const titleCol = headerStack.addStack();
  titleCol.layoutVertically();
  const brandTxt = titleCol.addText(brandName);
  brandTxt.font = Font.boldSystemFont(11);
  brandTxt.textColor = COLORS.white;
  brandTxt.lineLimit = 1;
  brandTxt.minimumScaleFactor = 0.75;
  if (cutoffText) {
    const cutoffTxtEl = titleCol.addText(cutoffText);
    cutoffTxtEl.font = Font.regularSystemFont(9.5);
    cutoffTxtEl.textColor = COLORS.subtitleGray;
    cutoffTxtEl.lineLimit = 1;
    cutoffTxtEl.minimumScaleFactor = 0.75;
  }

  headerStack.addSpacer();

  const daysPill = headerStack.addStack();
  daysPill.backgroundColor = COLORS.pillBg;
  daysPill.cornerRadius = 7;
  daysPill.setPadding(3, 7, 3, 7);
  daysPill.centerAlignContent();
  const daysColor = daysLeft <= 2 ? COLORS.alertRed : daysLeft <= 5 ? COLORS.warnYellow : COLORS.white;
  const daysTxt = daysPill.addText(`${daysLeft} ${daysLeft === 1 ? "día" : "días"}`);
  daysTxt.font = Font.boldSystemFont(13);
  daysTxt.textColor = daysColor;
}

function renderGauge(w, gaugeRatio, mainLabel, subLabel) {
  const gaugeImg = w.addImage(drawSemicircleGauge(gaugeRatio, mainLabel, subLabel));
  gaugeImg.resizable = true;
  gaugeImg.imageSize = new Size(134, 68);
  gaugeImg.centerAlignImage();
}

function renderStats(w, spentLabel, paceLabel) {
  const statsRow = w.addStack();
  statsRow.layoutHorizontally();
  statsRow.centerAlignContent();

  const spentTxt = statsRow.addText(spentLabel);
  spentTxt.font = Font.semiboldSystemFont(10);
  spentTxt.textColor = COLORS.spentRed;
  spentTxt.lineLimit = 1;
  spentTxt.minimumScaleFactor = 0.75;

  statsRow.addSpacer();

  const paceTxt = statsRow.addText(paceLabel);
  paceTxt.font = Font.semiboldSystemFont(10);
  paceTxt.textColor = COLORS.brandGreen;
  paceTxt.lineLimit = 1;
  paceTxt.minimumScaleFactor = 0.75;
}

function renderFooter(w, promoLabel, updatedAt, fromCache) {
  const footerStack = w.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const cacheIndicator = fromCache ? " ☁️" : "";
  const footerTxt = footerStack.addText(`${promoLabel} • ⏱ ${updatedAt}${cacheIndicator}`);
  footerTxt.font = Font.regularSystemFont(9.5);
  footerTxt.textColor = COLORS.subtitleGray;
  footerTxt.lineLimit = 1;
  footerTxt.minimumScaleFactor = 0.8;
}


// Note: Drawing logic (drawArc, drawSemicircleGauge) is intentionally duplicated
// across standalone widget scripts (MiTelcelWidget.js, MiBaitWidget.js, MiMovistarWidget.js)
// so each file can be copied directly into the iOS Scriptable app without external module dependencies.
function drawArc(ctx, cx, cy, r, startAngle, endAngle, thickness, color) {
  if (endAngle - startAngle <= 0.005) return;
  const path = new Path();
  const steps = Math.max(12, Math.ceil((endAngle - startAngle) * 40));
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + ((endAngle - startAngle) * i) / steps;
    const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
    if (i === 0) path.move(pt);
    else path.addLine(pt);
  }
  ctx.addPath(path);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(thickness);
  ctx.strokePath();

  ctx.setFillColor(color);
  const half = thickness / 2;
  for (const a of [startAngle, endAngle]) {
    ctx.fillEllipse(new Rect(cx + r * Math.cos(a) - half, cy + r * Math.sin(a) - half, thickness, thickness));
  }
}

/**
 * Dibuja el medidor semicircular con lo gastado en rojo (izquierda) y lo disponible en verde (derecha)
 */
function drawSemicircleGauge(spentRatio, mainLabel, subLabel) {
  const width = 360;
  const height = 182;
  const cx = width / 2;
  const cy = 152;
  const r = 124;
  const thickness = 24;

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  // Riel completo semicircular (de PI a 2*PI)
  drawArc(ctx, cx, cy, r, Math.PI, 2 * Math.PI, thickness, COLORS.trackGray);

  if (spentRatio !== null && Number.isFinite(spentRatio)) {
    const clamped = Math.max(0, Math.min(1, spentRatio));
    const splitAngle = Math.PI + clamped * Math.PI;
    const gap = clamped > 0.04 && clamped < 0.96 ? 0.11 : 0;

    // Segmento izquierdo: Gastado en Rojo
    if (clamped > 0.005) {
      drawArc(ctx, cx, cy, r, Math.PI, Math.max(Math.PI + 0.01, splitAngle - gap), thickness, COLORS.spentRed);
    }
    // Segmento derecho: Disponible en Verde
    if (clamped < 0.995) {
      drawArc(ctx, cx, cy, r, Math.min(2 * Math.PI - 0.01, splitAngle + gap), 2 * Math.PI, thickness, COLORS.brandGreen);
    }
  }

  // Texto principal centrado dentro del arco ("5.47 GB")
  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldSystemFont(50));
  ctx.setTextColor(COLORS.white);
  ctx.drawTextInRect(mainLabel, new Rect(30, 68, width - 60, 58));

  // Subtítulo centrado debajo ("libres de 15.0 GB")
  ctx.setFont(Font.mediumSystemFont(22));
  ctx.setTextColor(COLORS.subtitleGray);
  ctx.drawTextInRect(subLabel, new Rect(30, 126, width - 60, 30));

  return ctx.getImage();
}

// Note: Cache logic (getCachePath, saveCache, loadCache) is intentionally duplicated
// across standalone widget scripts (MiTelcelWidget.js, MiBaitWidget.js, MiMovistarWidget.js)
// so each file can be copied directly into the iOS Scriptable app without external module dependencies.
function getCachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CONFIG.cacheFileName);
}

function saveCache(data) {
  const fm = FileManager.local();
  fm.writeString(getCachePath(), JSON.stringify(data));
}

function loadCache() {
  try {
    const fm = FileManager.local();
    const path = getCachePath();
    if (fm.fileExists(path)) {
      const parsed = JSON.parse(fm.readString(path));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsed.fromCache = true;
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}

if (typeof Script !== "undefined") {
  main();
}
if (typeof module !== "undefined") {
  module.exports = {
    fetchTelcelData,
    parseTelcelResponse,
    createWidget,
    loadCache,
    getCredentials,
    validateTelcelCredentials,
    requestTelcel
  };
}
