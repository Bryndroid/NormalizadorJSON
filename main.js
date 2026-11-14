import { RULES_NORMALIZATION } from "./reglas.js";

// Singleton modular: coordina ingesta, normalización, métricas, render y exportación.
const app = (() => {
  const elements = {
    file: document.querySelector("#json-file"),
    input: document.querySelector("#json-input"),
    currency: document.querySelector("#currency-select"),
    source: document.querySelector("#source-select"),
    process: document.querySelector("#process-button"),
    export: document.querySelector("#export-button"),
    back: document.querySelector("#back-button"),
    inputStatus: document.querySelector("#input-status"),
    resultsStatus: document.querySelector("#results-status"),
    inputSection: document.querySelector(".input-panel"),
    results: document.querySelector("#results-section"),
    metrics: document.querySelector("#metrics"),
    correctionsPanel: document.querySelector("#corrections-panel"),
    correctionsList: document.querySelector("#corrections-list"),
    errorsPanel: document.querySelector("#errors-panel"),
    errorsList: document.querySelector("#errors-list"),
    inputCards: document.querySelector("#input-cards"),
    inputCount: document.querySelector("#input-count"),
    transactionCards: document.querySelector("#results-cards"),
    validCount: document.querySelector("#valid-count"),
    emptyResults: document.querySelector("#empty-results"),
  };

  let latestResult = null;

  const setInputStatus = (message, isError = false) => {
    elements.inputStatus.textContent = message;
    elements.inputStatus.classList.toggle("is-error", isError);
  };

  const setResultsStatus = (message, isError = false) => {
    elements.resultsStatus.textContent = message;
    elements.resultsStatus.classList.toggle("is-error", isError);
  };

  const getField = (record, field) => {
    const aliases = RULES_NORMALIZATION.fieldAliases[field] || [field];
    for (const alias of aliases) {
      const key = Object.keys(record).find(candidate => candidate.toLowerCase() === alias.toLowerCase());
      if (key && record[key] !== null && record[key] !== "") {
        return { value: record[key], key };
      }
    }
    return { value: undefined, key: field };
  };

  const addIssue = (issues, field, reason) => issues.push({ field, reason });

  function normalizeId(raw, issues, corrections) {
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      addIssue(issues, "id", "El identificador es obligatorio.");
      return null;
    }
    const original = String(raw).trim();
    const id = original.slice(0, RULES_NORMALIZATION.maxIdLength);
    if (id.length < original.length) {
      corrections.push({ field: "id", message: `ID truncado a ${RULES_NORMALIZATION.maxIdLength} caracteres.`, successful: true });
    } else if (id !== raw) {
      corrections.push({ field: "id", message: "Se eliminaron espacios alrededor del ID.", successful: true });
    }
    return id;
  }

  function detectCurrency(record, amountRaw) {
    const explicit = getField(record, "currency").value;
    const candidate = explicit === undefined ? "" : String(explicit).trim().toUpperCase();
    const alias = RULES_NORMALIZATION.currencyAliases[candidate];
    if (alias) return { currency: alias, inferredFrom: explicit === undefined ? "símbolo del importe" : "campo de moneda" };

    const text = `${amountRaw === undefined ? "" : amountRaw}`.toUpperCase();
    if (/\bUSD\b|US\$|\$/.test(text)) return { currency: "USD", inferredFrom: "símbolo/código del importe" };
    if (/\bEUR\b|€/.test(text)) return { currency: "EUR", inferredFrom: "símbolo/código del importe" };
    return { currency: null, inferredFrom: "" };
  }

  function parseAmount(raw) {
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    const original = String(raw).trim();
    if (!original) return null;
    let value = original.replace(/(?:USD|EUR|US\$|[$€])/gi, "").replace(/[\s\u00a0]/g, "");
    if (!RULES_NORMALIZATION.amountPattern.test(value)) return null;

    const commas = (value.match(/,/g) || []).length;
    const dots = (value.match(/\./g) || []).length;
    if (commas && dots) {
      const decimalSeparator = value.lastIndexOf(",") > value.lastIndexOf(".") ? "," : ".";
      const groupingSeparator = decimalSeparator === "," ? "." : ",";
      value = value.split(groupingSeparator).join("");
      const decimalIndex = value.lastIndexOf(decimalSeparator);
      value = `${value.slice(0, decimalIndex).replace(new RegExp(`\\${decimalSeparator}`, "g"), "")}.${value.slice(decimalIndex + 1)}`;
    } else if (commas || dots) {
      const separator = commas ? "," : ".";
      const pieces = value.split(separator);
      if (pieces.length > 2) {
        if (!pieces.slice(1).every(piece => piece.length === 3)) return null;
        value = pieces.join("");
      } else {
        const decimals = pieces[1].length;
        value = decimals === 3 ? pieces.join("") : `${pieces[0]}.${pieces[1]}`;
      }
    }

    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const rounded = Math.round((number + Number.EPSILON) * 100) / 100;
    return { value: rounded, numericValue: number, original, rounded: Math.abs(number - rounded) > 1e-9 };
  }

  function normalizeAmount(raw, issues, corrections) {
    if (raw === undefined || raw === null || raw === "") {
      addIssue(issues, "amount", "El importe es obligatorio.");
      return null;
    }
    const parsed = parseAmount(raw);
    if (!parsed) {
      addIssue(issues, "amount", "El importe no tiene un formato numérico reconocido.");
      return null;
    }
    if (parsed.numericValue < RULES_NORMALIZATION.minimumAmount) {
      addIssue(issues, "amount", "El importe no puede ser negativo; la transacción se descarta.");
      return null;
    }
    if (parsed.rounded) {
      corrections.push({ field: "amount", message: "Importe redondeado a dos decimales.", successful: true });
    } else if (typeof raw !== "number" && String(raw).trim() !== parsed.value.toFixed(2)) {
      corrections.push({ field: "amount", message: "Formato del importe normalizado a dos decimales.", successful: true });
    }
    return parsed.value;
  }

  function normalizeTimestamp(raw, issues, corrections) {
    if (raw === undefined || raw === null || raw === "") {
      addIssue(issues, "timestamp", "La fecha y hora son obligatorias.");
      return null;
    }
    let date;
    if (typeof raw === "number" || (typeof raw === "string" && /^\d{10,13}$/.test(raw.trim()))) {
      const numeric = Number(raw);
      const milliseconds = Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric;
      date = new Date(milliseconds);
    } else {
      date = new Date(raw);
    }
    if (Number.isNaN(date.getTime())) {
      addIssue(issues, "timestamp", "La fecha no se puede interpretar.");
      return null;
    }
    const iso = date.toISOString();
    if (String(raw) !== iso) {
      corrections.push({ field: "timestamp", message: "Fecha convertida a formato ISO-8601 UTC.", successful: true });
    }
    return iso;
  }

  function normalizeStatus(raw, issues, corrections) {
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      addIssue(issues, "status", "El estado es obligatorio.");
      return null;
    }
    const candidate = String(raw).trim().toLowerCase();
    for (const [status, aliases] of Object.entries(RULES_NORMALIZATION.statusAliases)) {
      if (aliases.includes(candidate) || candidate === status.toLowerCase()) {
        if (candidate !== status.toLowerCase()) {
          corrections.push({ field: "status", message: `Estado "${raw}" normalizado a ${status}.`, successful: true });
        }
        return status;
      }
    }
    addIssue(issues, "status", `Estado no reconocido: "${raw}".`);
    return null;
  }

  function detectSource(record) {
    const keys = new Set(Object.keys(record).map(key => key.toLowerCase()));
    for (const pattern of RULES_NORMALIZATION.sourcePatterns) {
      if (pattern.keys.some(key => keys.has(key.toLowerCase()))) return pattern.source;
    }
    return null;
  }

  function normalizeRecord(record, index, options) {
    const issues = [];
    const corrections = [];
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      addIssue(issues, "record", "Cada transacción debe ser un objeto JSON.");
      return { index, inputRecord: record, normalized: null, issues, corrections };
    }

    const id = normalizeId(getField(record, "id").value, issues, corrections);
    const rawAmount = getField(record, "amount").value;
    const amount = normalizeAmount(rawAmount, issues, corrections);
    let currency;
    if (options.currency === "varied") {
      const detected = detectCurrency(record, rawAmount);
      currency = detected.currency;
      if (!currency) addIssue(issues, "currency", "No se pudo determinar USD o EUR desde la moneda o el importe.");
      else if (getField(record, "currency").value === undefined) {
        corrections.push({ field: "currency", message: `Moneda detectada como ${currency} (${detected.inferredFrom}).`, successful: true });
      } else if (String(getField(record, "currency").value).toUpperCase() !== currency) {
        corrections.push({ field: "currency", message: `Moneda normalizada a ${currency}.`, successful: true });
      }
    } else {
      currency = options.currency;
      const currencyField = getField(record, "currency").value;
      const detected = detectCurrency(record, rawAmount);
      if (currencyField === undefined && detected.currency) {
        const message = detected.currency === currency
          ? `Moneda ${detected.currency} detectada en el importe y aplicada.`
          : `Moneda ${detected.currency} detectada en el importe; se aplicó la selección ${currency}.`;
        corrections.push({ field: "currency", message, successful: true });
      } else if (detected.currency && detected.currency !== currency) {
        corrections.push({ field: "currency", message: `Moneda ajustada a la selección ${currency}.`, successful: true });
      }
    }

    const timestamp = normalizeTimestamp(getField(record, "timestamp").value, issues, corrections);
    const status = normalizeStatus(getField(record, "status").value, issues, corrections);
    const sourceField = getField(record, "source").value;
    const sourceValue = typeof sourceField === "string" ? sourceField.trim().toLowerCase() : "";
    const declaredSource = RULES_NORMALIZATION.sourcePatterns.some(pattern => pattern.source === sourceValue)
      ? sourceValue
      : null;
    const source = options.source === "auto" ? declaredSource || detectSource(record) : options.source;
    if (!source) addIssue(issues, "source", "No se detectó una fuente bank, paypal o crypto.");
    else if (options.source === "auto" && (declaredSource === null || sourceField !== declaredSource)) {
      const message = declaredSource === null
        ? `Fuente detectada como ${source}.`
        : `Fuente normalizada a ${source}.`;
      corrections.push({ field: "source", message, successful: true });
    }

    const normalized = { id, amount, currency, timestamp, status, source };
    const validFieldCount = Object.values(normalized).filter(value => value !== null && value !== undefined).length;
    return {
      index,
      inputRecord: record,
      normalized: issues.length === 0 ? normalized : null,
      issues,
      corrections,
      validFieldCount,
    };
  }

  function readTransactions(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.transactions)) return parsed.transactions;
    if (parsed && typeof parsed === "object") return [parsed];
    throw new Error("El JSON debe contener un array, un objeto transactions o una transacción.");
  }

  function serializeTransaction(transaction, indentation = "") {
    const fields = Object.entries(transaction).map(([key, value]) => {
      const serializedValue = key === "amount" ? transaction.amount.toFixed(2) : JSON.stringify(value);
      return `${indentation}  ${JSON.stringify(key)}: ${serializedValue}`;
    });
    return `${indentation}{\n${fields.join(",\n")}\n${indentation}}`;
  }

  function serializeTransactions(transactions) {
    return `[\n${transactions.map(transaction => serializeTransaction(transaction, "  ")).join(",\n")}\n]`;
  }

  function render(result) {
    elements.results.hidden = false;
    const metricData = [
      ["Analizadas", result.metrics.analyzed, ""],
      ["Válidas", result.metrics.valid, "is-good"],
      ["Inválidas", result.metrics.invalid, result.metrics.invalid ? "is-bad" : ""],
      ["Campos válidos", result.metrics.validFields, ""],
      ["Correcciones", result.metrics.corrections, ""],
    ];
    elements.metrics.replaceChildren(...metricData.map(([label, value, modifier]) => {
      const card = document.createElement("div");
      card.className = `metric-card ${modifier}`;
      const heading = document.createElement("span");
      heading.className = "metric-label";
      heading.textContent = label;
      const number = document.createElement("strong");
      number.className = "metric-value";
      number.textContent = String(value);
      card.append(heading, number);
      return card;
    }));

    const createRecordCard = (record, details, className) => {
      const card = document.createElement("article");
      card.className = `record-detail ${className}`;
      const heading = document.createElement("h4");
      const rawId = getField(record.inputRecord || {}, "id").value;
      heading.textContent = `Registro ${record.index + 1}${rawId === undefined ? "" : ` · ID ${String(rawId)}`}`;
      const content = document.createElement("div");
      content.className = "record-detail-content";
      for (const detail of details) {
        const line = document.createElement("div");
        line.className = "record-detail-line";
        const field = document.createElement("strong");
        field.textContent = `${detail.field}: `;
        line.append(field, document.createTextNode(detail.message));
        if (detail.successful) line.append(document.createTextNode(" Corrección exitosa."));
        content.append(line);
      }
      card.append(heading, content);
      return card;
    };

    const correctedRecords = result.records.filter(record => record.corrections.length > 0);
    elements.correctionsPanel.hidden = correctedRecords.length === 0;
    elements.correctionsList.replaceChildren(...correctedRecords.map(record =>
      createRecordCard(record, record.corrections, "correction-item")));

    const invalidRecords = result.records.filter(record => record.issues.length);
    elements.errorsPanel.hidden = invalidRecords.length === 0;
    elements.errorsList.replaceChildren(...invalidRecords.map(record =>
      createRecordCard(record, record.issues.map(issue => ({
        field: issue.field,
        message: issue.reason,
      })), "error-item")));

    elements.inputCards.replaceChildren(...result.records.map(record => {
      const isValid = Boolean(record.normalized);
      const card = document.createElement("article");
      card.className = `transaction-card input-record-card ${isValid ? "is-valid" : "is-invalid"}`;
      const heading = document.createElement("div");
      heading.className = "transaction-card-heading";
      const title = document.createElement("h3");
      const rawId = getField(record.inputRecord || {}, "id").value;
      title.textContent = `Registro ${record.index + 1}${rawId === undefined ? "" : ` · ID ${String(rawId)}`}`;
      const status = document.createElement("span");
      status.className = "record-status";
      status.textContent = isValid ? "Válida" : "Inválida";
      heading.append(title, status);
      const codeBlock = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = JSON.stringify(record.inputRecord, null, 2) ?? "null";
      codeBlock.append(code);
      card.append(heading, codeBlock);
      return card;
    }));
    elements.inputCount.textContent = `${result.records.length} ${result.records.length === 1 ? "registro" : "registros"}`;

    const validRecords = result.records.filter(record => record.normalized);
    elements.transactionCards.replaceChildren(...validRecords.map(record => {
      const card = document.createElement("article");
      card.className = "transaction-card";
      const heading = document.createElement("h3");
      heading.textContent = `Registro ${record.index + 1} · ID ${record.normalized.id}`;
      const codeBlock = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = serializeTransaction(record.normalized);
      codeBlock.append(code);
      card.append(heading, codeBlock);
      return card;
    }));
    elements.validCount.textContent = `${validRecords.length} ${validRecords.length === 1 ? "registro" : "registros"}`;
    elements.emptyResults.hidden = validRecords.length > 0;
    elements.export.disabled = validRecords.length === 0;
  }

  function process() {
    const text = elements.input.value.trim();
    if (!text) {
      setInputStatus("Selecciona un archivo o pega el JSON antes de procesar.", true);
      return;
    }
    let transactions;
    try {
      transactions = readTransactions(JSON.parse(text));
    } catch (error) {
      setInputStatus(`No se pudo leer el JSON: ${error.message}`, true);
      elements.results.hidden = true;
      elements.inputSection.hidden = false;
      latestResult = null;
      return;
    }

    const options = { currency: elements.currency.value, source: elements.source.value };
    const records = transactions.map((record, index) => normalizeRecord(record, index, options));
    const valid = records.filter(record => record.normalized).length;
    latestResult = {
      records,
      metrics: {
        analyzed: records.length,
        valid,
        invalid: records.length - valid,
        validFields: records.reduce((sum, record) => sum + record.validFieldCount, 0),
        corrections: records.reduce((sum, record) => sum + record.corrections.length, 0),
      },
    };
    render(latestResult);
    elements.inputSection.hidden = true;
    setResultsStatus(`Procesamiento completado: ${valid} de ${records.length} transacciones válidas.`);
  }

  function returnToInput() {
    elements.results.hidden = true;
    elements.inputSection.hidden = false;
    setInputStatus("");
    elements.inputSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadFile() {
    const file = elements.file.files && elements.file.files[0];
    if (!file) return;
    try {
      elements.input.value = await file.text();
      setInputStatus(`Archivo cargado: ${file.name}`);
    } catch (error) {
      setInputStatus(`No se pudo leer el archivo: ${error.message}`, true);
    }
  }

  function exportResult() {
    if (!latestResult) {
      setResultsStatus("Procesa transacciones válidas antes de exportar.", true);
      return;
    }
    const transactions = latestResult.records
      .filter(record => record.normalized)
      .map(record => record.normalized);
    if (transactions.length === 0) {
      setResultsStatus("No hay transacciones válidas para exportar.", true);
      return;
    }
    const payload = serializeTransactions(transactions);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transacciones-normalizadas.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setResultsStatus(`${transactions.length} transacciones exportadas.`);
  }

  elements.file.addEventListener("change", loadFile);
  elements.process.addEventListener("click", process);
  elements.back.addEventListener("click", returnToInput);
  elements.export.addEventListener("click", exportResult);
  return { process, exportResult };
})();

export default app;
