/* =========================================================
   SMART ENVIRONMENT DASHBOARD
   USB SERIAL COMMUNICATION
   Arduino Uno R3 / STM32F429I-DISC1
   ========================================================= */

/* CONFIGURATION */

const SERIAL_BAUD_RATE = 9600;
const MAX_HISTORY = 10;
const MAX_CHART_POINTS = 20;

const LIMITS = {
  temperatureMin: 18,
  temperatureMax: 30,
  humidityMin: 30,
  humidityMax: 70,
  gasMax: 350,
};

/* GLOBAL VARIABLES */

let port = null;
let reader = null;
let readTask = null;

let keepReading = false;
let serialBuffer = "";

let chart = null;
let measurements = [];
let activeAlerts = [];

let currentLanguage = "ro";
let lastMeasurement = null;

/* HTML ELEMENTS */

const elements = {
  temperature: document.getElementById("temperature"),
  humidity: document.getElementById("humidity"),
  gas: document.getElementById("gas"),

  temperatureCard: document.getElementById("temperatureCard"),
  humidityCard: document.getElementById("humidityCard"),
  gasCard: document.getElementById("gasCard"),

  fanStatus: document.getElementById("fanStatus"),
  fanIndicator: document.getElementById("fanIndicator"),
  fanInfo: document.getElementById("fanInfo"),
  fanMode: document.getElementById("fanMode"),

  lastUpdate: document.getElementById("lastUpdate"),
  currentTime: document.getElementById("currentTime"),

  alertSummary: document.getElementById("alertSummary"),
  alertIndicator: document.getElementById("alertIndicator"),
  alertTitle: document.getElementById("alertTitle"),
  alertSubtitle: document.getElementById("alertSubtitle"),
  alertList: document.getElementById("alertList"),

  measurementTable: document.getElementById("measurementTable"),

  deviceName: document.getElementById("deviceName"),
  connectionType: document.getElementById("connectionType"),
  systemStatus: document.getElementById("systemStatus"),

  connectionTitle: document.getElementById("connectionTitle"),
  connectionSubtitle: document.getElementById("connectionSubtitle"),
  connectionDot: document.getElementById("connectionDot"),

  usbStatus: document.getElementById("usbStatus"),
  usbDetails: document.getElementById("usbDetails"),
  usbIndicator: document.getElementById("usbIndicator"),

  connectButton: document.getElementById("connectButton"),
  disconnectButton: document.getElementById("disconnectButton"),

  liveLabel: document.getElementById("liveLabel"),

  environmentChart: document.getElementById("environmentChart"),

  clearHistoryButton: document.getElementById("clearHistoryButton"),
};

/* TRANSLATIONS */

const translations = {
  ro: {
    connected: "Conectat",
    disconnected: "Deconectat",
    connecting: "Se conectează...",
    waiting: "Se așteaptă datele dispozitivului...",
    usbReady: "USB pregătit",
    usbUnavailable: "USB nu este disponibil",
    noDevice: "Niciun dispozitiv conectat",
    unknownDevice: "Dispozitiv necunoscut",

    normal: "Normal",
    warning: "Atenție",
    critical: "Critic",

    fanOn: "Pornit",
    fanOff: "Oprit",
    fanUnknown: "Neraportat",

    temperatureHigh: "Temperatură prea mare",
    temperatureLow: "Temperatură prea mică",

    humidityHigh: "Umiditate prea mare",
    humidityLow: "Umiditate prea mică",

    gasHigh: "Nivel ridicat de gaz",

    noAlerts: "Nu există alerte active.",
    activeAlerts: "alerte active",

    waitingData: "Așteptare măsurători",
    dataReceived: "Date recepționate",

    serialError: "Eroare de comunicare USB",
    sensorError: "Eroare la citirea senzorilor",

    noHistory: "Nu există măsurători înregistrate.",

    normalDescription: "Toți parametrii sunt în limitele stabilite.",
    criticalDescription: "Verifică parametrii de mediu!",
  },

  en: {
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting...",
    waiting: "Waiting for device data...",
    usbReady: "USB ready",
    usbUnavailable: "USB unavailable",
    noDevice: "No device connected",
    unknownDevice: "Unknown device",

    normal: "Normal",
    warning: "Warning",
    critical: "Critical",

    fanOn: "ON",
    fanOff: "OFF",
    fanUnknown: "Not reported",

    temperatureHigh: "Temperature too high",
    temperatureLow: "Temperature too low",

    humidityHigh: "Humidity too high",
    humidityLow: "Humidity too low",

    gasHigh: "High gas level",

    noAlerts: "There are no active alerts.",
    activeAlerts: "active alerts",

    waitingData: "Waiting for measurements",
    dataReceived: "Data received",

    serialError: "USB communication error",
    sensorError: "Sensor reading error",

    noHistory: "No measurements recorded.",

    normalDescription: "All parameters are within the established limits.",
    criticalDescription: "Check the environmental parameters!",
  },
};

function t(key) {
  return translations[currentLanguage][key] || key;
}

/* LANGUAGE */

function setLanguage(language) {
  if (!translations[language]) {
    return;
  }

  currentLanguage = language;
  document.documentElement.lang = language;

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.classList.toggle("active-lang", button.dataset.lang === language);
  });

  updateClock();
  updateConnectionLanguage();
  updateFanUI(lastMeasurement);
  updateAlertsUI();
  updateHistoryUI();

  if (chart) {
    chart.data.datasets[0].label =
      language === "ro" ? "Temperatură (°C)" : "Temperature (°C)";

    chart.data.datasets[1].label =
      language === "ro" ? "Umiditate (%)" : "Humidity (%)";

    chart.update();
  }
}

document.querySelectorAll("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    setLanguage(button.dataset.lang);
  });
});

/* CLOCK */

function updateClock() {
  if (!elements.currentTime) return;

  elements.currentTime.textContent = new Date().toLocaleTimeString(
    currentLanguage === "ro" ? "ro-RO" : "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    },
  );
}

setInterval(updateClock, 1000);

/* USB SUPPORT */

function checkUSBSupport() {
  if (!("serial" in navigator)) {
    elements.usbStatus.textContent = t("usbUnavailable");

    elements.usbDetails.textContent =
      "Web Serial API is not supported by this browser.";

    elements.connectButton.disabled = true;

    return false;
  }

  elements.usbStatus.textContent = t("usbReady");

  elements.usbDetails.textContent = "USB Serial communication available.";

  return true;
}

/* CONNECTION UI */

function setConnection(connected, message = null) {
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;

  elements.connectionDot.classList.toggle("connected", connected);
  elements.usbIndicator.classList.toggle("active", connected);

  elements.connectionTitle.textContent = connected
    ? t("connected")
    : t("disconnected");

  elements.connectionSubtitle.textContent =
    message || (connected ? t("waiting") : t("noDevice"));

  elements.usbStatus.textContent = connected
    ? t("connected")
    : t("disconnected");

  elements.connectionType.textContent = connected ? "USB Serial" : "--";

  elements.systemStatus.textContent = connected
    ? t("waitingData")
    : t("disconnected");

  elements.systemStatus.className = connected ? "online" : "offline";

  elements.liveLabel.textContent = connected ? "● LIVE" : "--";

  elements.liveLabel.classList.toggle("waiting", !connected);
}

function updateConnectionLanguage() {
  if (!port) {
    setConnection(false);
  } else {
    setConnection(true, elements.connectionSubtitle.textContent);
  }
}

/* USB CONNECTION */

async function connectUSB() {
  if (!checkUSBSupport()) return;

  try {
    elements.usbDetails.textContent = t("connecting");

    port = await navigator.serial.requestPort();

    await port.open({
      baudRate: SERIAL_BAUD_RATE,
    });

    serialBuffer = "";
    keepReading = true;

    setConnection(true, t("waiting"));

    elements.deviceName.textContent = t("unknownDevice");

    elements.usbDetails.textContent = `Serial communication: ${SERIAL_BAUD_RATE} baud`;

    readTask = readSerial();
  } catch (error) {
    console.error("USB connection error:", error);

    port = null;

    setConnection(false, t("serialError"));

    elements.usbDetails.textContent = error.message;
  }
}

/* USB SERIAL READING */

async function readSerial() {
  if (!port || !port.readable) return;

  const decoder = new TextDecoder();

  try {
    reader = port.readable.getReader();

    while (keepReading) {
      const { value, done } = await reader.read();

      if (done) break;
      if (!value) continue;

      serialBuffer += decoder.decode(value, { stream: true });

      let newlineIndex;

      while ((newlineIndex = serialBuffer.indexOf("\n")) !== -1) {
        const line = serialBuffer
          .slice(0, newlineIndex)
          .replace(/\r$/, "")
          .trim();

        serialBuffer = serialBuffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          console.log("USB DATA:", line);
          parseLine(line);
        }
      }

      if (serialBuffer.length > 4096) {
        serialBuffer = serialBuffer.slice(-1024);
      }
    }
  } catch (error) {
    if (keepReading) {
      console.error("Serial read error:", error);
      setConnection(false, t("serialError"));
    }
  } finally {
    keepReading = false;

    if (reader) {
      try {
        reader.releaseLock();
      } catch (error) {
        console.warn(error);
      }

      reader = null;
    }
  }
}

/* SERIAL DATA PARSER */

function parseLine(line) {
  let data;

  try {
    data = JSON.parse(line);
  } catch (error) {
    const match = line.match(
      /TEMP:([-+]?[0-9]*\.?[0-9]+),\s*HUM:([-+]?[0-9]*\.?[0-9]+),\s*GAS:([-+]?[0-9]*\.?[0-9]+)/i,
    );

    if (match) {
      data = {
        type: "data",
        temperature: Number(match[1]),
        humidity: Number(match[2]),
        gas: Number(match[3]),
      };
    } else {
      console.warn("Unknown serial message:", line);
      return;
    }
  }

  if (data.type === "hello") {
    elements.deviceName.textContent = data.device || t("unknownDevice");

    elements.connectionSubtitle.textContent = data.device || t("connected");

    elements.systemStatus.textContent = t("connected");
    elements.systemStatus.className = "online";

    return;
  }

  if (data.type === "error") {
    console.error("Device error:", data.message);

    elements.connectionSubtitle.textContent = `${t("sensorError")}: ${data.message}`;

    return;
  }

  if (
    data.type === "data" ||
    (data.temperature !== undefined &&
      data.humidity !== undefined &&
      data.gas !== undefined)
  ) {
    renderMeasurement(data);
  }
}

/* MEASUREMENT VALIDATION */

function validateMeasurement(data) {
  const temperature = Number(data.temperature);
  const humidity = Number(data.humidity);
  const gas = Number(data.gas);

  if (
    !Number.isFinite(temperature) ||
    !Number.isFinite(humidity) ||
    !Number.isFinite(gas)
  ) {
    return null;
  }

  if (
    temperature < -50 ||
    temperature > 150 ||
    humidity < 0 ||
    humidity > 100 ||
    gas < 0
  ) {
    return null;
  }

  return {
    temperature,
    humidity,
    gas,
    fan: data.fan,
    timestamp: new Date(),
  };
}

/* RENDER MEASUREMENT */

function renderMeasurement(data) {
  const measurement = validateMeasurement(data);

  if (!measurement) {
    console.warn("Invalid measurement:", data);
    return;
  }

  lastMeasurement = measurement;

  elements.temperature.textContent = measurement.temperature.toFixed(2);

  elements.humidity.textContent = measurement.humidity.toFixed(2);

  elements.gas.textContent = Math.round(measurement.gas);

  elements.lastUpdate.textContent = measurement.timestamp.toLocaleTimeString(
    currentLanguage === "ro" ? "ro-RO" : "en-US",
  );

  measurements.unshift(measurement);

  if (measurements.length > MAX_HISTORY) {
    measurements.pop();
  }

  updateChart(measurement);
  updateHistoryUI();
  updateFanUI(measurement);
  checkAlerts(measurement);

  elements.systemStatus.textContent = t("dataReceived");
  elements.systemStatus.className = "online";

  elements.connectionSubtitle.textContent = t("connected");
}

/* CHART INITIALIZATION */

function initializeChart() {
  if (!elements.environmentChart) return;

  if (typeof Chart === "undefined") {
    console.error("Chart.js is not loaded.");
    return;
  }

  const ctx = elements.environmentChart.getContext("2d");

  chart = new Chart(ctx, {
    type: "line",

    data: {
      labels: [],

      datasets: [
        {
          label: "Temperatură (°C)",
          data: [],
          borderColor: "#ff9f43",
          backgroundColor: "rgba(255, 159, 67, 0.10)",
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },

        {
          label: "Umiditate (%)",
          data: [],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.10)",
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
      ],
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      animation: {
        duration: 300,
      },

      interaction: {
        intersect: false,
        mode: "index",
      },

      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#c9d1d9",
          },
        },
      },

      scales: {
        x: {
          ticks: {
            color: "#8b949e",
          },
          grid: {
            color: "rgba(255,255,255,0.05)",
          },
        },

        y: {
          ticks: {
            color: "#8b949e",
          },
          grid: {
            color: "rgba(255,255,255,0.05)",
          },
        },
      },
    },
  });
}

/* UPDATE CHART */

function updateChart(measurement) {
  if (!chart) return;

  const time = measurement.timestamp.toLocaleTimeString(
    currentLanguage === "ro" ? "ro-RO" : "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    },
  );

  chart.data.labels.push(time);

  chart.data.datasets[0].data.push(measurement.temperature);
  chart.data.datasets[1].data.push(measurement.humidity);

  if (chart.data.labels.length > MAX_CHART_POINTS) {
    chart.data.labels.shift();

    chart.data.datasets.forEach((dataset) => {
      dataset.data.shift();
    });
  }

  chart.update("none");
}

/* FAN STATUS */

function isFanOn(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "on"
  );
}

function updateFanUI(measurement) {
  if (!measurement || measurement.fan === undefined) {
    elements.fanStatus.textContent = t("fanUnknown");
    elements.fanInfo.textContent = t("fanUnknown");
    elements.fanMode.textContent = "--";

    elements.fanIndicator.classList.remove("active", "on");

    return;
  }

  const fanIsOn = isFanOn(measurement.fan);

  elements.fanStatus.textContent = fanIsOn ? t("fanOn") : t("fanOff");

  elements.fanInfo.textContent = fanIsOn ? t("fanOn") : t("fanOff");

  elements.fanMode.textContent = fanIsOn ? t("fanOn") : t("fanOff");

  elements.fanIndicator.classList.toggle("active", fanIsOn);
  elements.fanIndicator.classList.toggle("on", fanIsOn);
}

/* ALERT SYSTEM */

function checkAlerts(measurement) {
  activeAlerts = [];

  /* TEMPERATURE */

  if (measurement.temperature > LIMITS.temperatureMax) {
    activeAlerts.push({
      type: "temperature",
      level: "critical",
      message: t("temperatureHigh"),
      value: `${measurement.temperature.toFixed(2)} °C`,
    });
  } else if (measurement.temperature < LIMITS.temperatureMin) {
    activeAlerts.push({
      type: "temperature",
      level: "critical",
      message: t("temperatureLow"),
      value: `${measurement.temperature.toFixed(2)} °C`,
    });
  }

  /* HUMIDITY */

  if (measurement.humidity > LIMITS.humidityMax) {
    activeAlerts.push({
      type: "humidity",
      level: "critical",
      message: t("humidityHigh"),
      value: `${measurement.humidity.toFixed(2)} %`,
    });
  } else if (measurement.humidity < LIMITS.humidityMin) {
    activeAlerts.push({
      type: "humidity",
      level: "critical",
      message: t("humidityLow"),
      value: `${measurement.humidity.toFixed(2)} %`,
    });
  }

  /* GAS */

  if (measurement.gas > LIMITS.gasMax) {
    activeAlerts.push({
      type: "gas",
      level: "critical",
      message: t("gasHigh"),
      value: `${Math.round(measurement.gas)} RAW`,
    });
  }

  updateAlertsUI();
}

/* UPDATE ALERT UI */

function updateAlertsUI() {
  const hasAlerts = activeAlerts.length > 0;

  /* GLOBAL RED BORDER */

  document.body.classList.toggle("alarm-active", hasAlerts);

  /* SENSOR CARD HIGHLIGHT */

  elements.temperatureCard.classList.toggle(
    "sensor-critical",
    activeAlerts.some((alert) => alert.type === "temperature"),
  );

  elements.humidityCard.classList.toggle(
    "sensor-critical",
    activeAlerts.some((alert) => alert.type === "humidity"),
  );

  elements.gasCard.classList.toggle(
    "sensor-critical",
    activeAlerts.some((alert) => alert.type === "gas"),
  );

  /* ALERT SUMMARY */

  elements.alertIndicator.className = hasAlerts
    ? "critical-indicator"
    : "normal-indicator";

  elements.alertIndicator.textContent = hasAlerts ? "!" : "✓";

  elements.alertTitle.textContent = hasAlerts
    ? `${activeAlerts.length} ${t("activeAlerts")}`
    : t("normal");

  elements.alertSubtitle.textContent = hasAlerts
    ? t("criticalDescription")
    : t("normalDescription");

  /* ALERT LIST */

  elements.alertList.innerHTML = "";

  if (!hasAlerts) {
    const message = document.createElement("div");

    message.className = "no-alerts";
    message.textContent = t("noAlerts");

    elements.alertList.appendChild(message);

    return;
  }

  activeAlerts.forEach((alert) => {
    const alertElement = document.createElement("div");

    alertElement.className = `alert-item ${alert.level}`;

    const title = document.createElement("span");

    title.className = "alert-message";
    title.textContent = alert.message;

    const value = document.createElement("span");

    value.className = "alert-value";
    value.textContent = alert.value;

    alertElement.appendChild(title);
    alertElement.appendChild(value);

    elements.alertList.appendChild(alertElement);
  });
}

/* MEASUREMENT HISTORY */

function getMeasurementAlerts(measurement) {
  const alerts = [];

  if (
    measurement.temperature > LIMITS.temperatureMax ||
    measurement.temperature < LIMITS.temperatureMin
  ) {
    alerts.push("temperature");
  }

  if (
    measurement.humidity > LIMITS.humidityMax ||
    measurement.humidity < LIMITS.humidityMin
  ) {
    alerts.push("humidity");
  }

  if (measurement.gas > LIMITS.gasMax) {
    alerts.push("gas");
  }

  return alerts;
}

function updateHistoryUI() {
  if (!elements.measurementTable) return;

  elements.measurementTable.innerHTML = "";

  if (measurements.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 6;
    cell.className = "empty-row";
    cell.textContent = t("noHistory");

    row.appendChild(cell);
    elements.measurementTable.appendChild(row);

    return;
  }

  measurements.forEach((measurement) => {
    const row = document.createElement("tr");

    const timeCell = document.createElement("td");

    timeCell.textContent = measurement.timestamp.toLocaleTimeString(
      currentLanguage === "ro" ? "ro-RO" : "en-US",
    );

    const temperatureCell = document.createElement("td");
    temperatureCell.textContent = `${measurement.temperature.toFixed(2)} °C`;

    const humidityCell = document.createElement("td");
    humidityCell.textContent = `${measurement.humidity.toFixed(2)} %`;

    const gasCell = document.createElement("td");
    gasCell.textContent = `${Math.round(measurement.gas)} RAW`;

    const fanCell = document.createElement("td");

    if (measurement.fan === undefined) {
      fanCell.textContent = t("fanUnknown");
    } else {
      fanCell.textContent = isFanOn(measurement.fan) ? t("fanOn") : t("fanOff");
    }

    const statusCell = document.createElement("td");
    const measurementAlerts = getMeasurementAlerts(measurement);

    statusCell.className =
      measurementAlerts.length > 0 ? "table-status critical" : "table-status";

    statusCell.textContent =
      measurementAlerts.length > 0 ? t("critical") : t("normal");

    row.appendChild(timeCell);
    row.appendChild(temperatureCell);
    row.appendChild(humidityCell);
    row.appendChild(gasCell);
    row.appendChild(fanCell);
    row.appendChild(statusCell);

    elements.measurementTable.appendChild(row);
  });
}

/* CLEAR HISTORY */

function clearHistory() {
  measurements = [];

  updateHistoryUI();

  if (chart) {
    chart.data.labels = [];

    chart.data.datasets.forEach((dataset) => {
      dataset.data = [];
    });

    chart.update();
  }
}

elements.clearHistoryButton.addEventListener("click", clearHistory);

/* USB DISCONNECTION */

async function disconnectUSB() {
  keepReading = false;

  if (reader) {
    try {
      await reader.cancel();
    } catch (error) {
      console.warn("Reader cancellation:", error);
    }
  }

  if (readTask) {
    try {
      await readTask;
    } catch (error) {
      console.warn("Read task:", error);
    }

    readTask = null;
  }

  if (port) {
    try {
      await port.close();
    } catch (error) {
      console.warn("Port closing error:", error);
    }
  }

  port = null;
  reader = null;
  serialBuffer = "";

  setConnection(false);

  elements.deviceName.textContent = t("noDevice");
  elements.usbDetails.textContent = "USB Serial disconnected.";
  elements.systemStatus.textContent = t("disconnected");
  elements.systemStatus.className = "offline";

  activeAlerts = [];
  updateAlertsUI();
}

/* PHYSICAL USB DISCONNECTION */

if ("serial" in navigator) {
  navigator.serial.addEventListener("disconnect", async (event) => {
    if (port === event.target) {
      console.warn("USB device disconnected.");
      await disconnectUSB();
    }
  });
}

/* BUTTON EVENTS */

elements.connectButton.addEventListener("click", connectUSB);

elements.disconnectButton.addEventListener("click", disconnectUSB);

/* INITIALIZATION */

function initializeDashboard() {
  console.log("Smart Environment Dashboard initialized.");

  checkUSBSupport();

  initializeChart();

  updateClock();
  updateHistoryUI();
  updateFanUI(null);
  updateAlertsUI();

  setConnection(false);

  elements.deviceName.textContent = t("noDevice");
  elements.usbDetails.textContent = "Waiting for USB connection...";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeDashboard);
} else {
  initializeDashboard();
}
