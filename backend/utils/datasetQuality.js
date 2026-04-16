const QUALITY_BASE = 5;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const computeDatasetQuality = (dataset) => {
  const sampleRecords = Array.isArray(dataset.sampleRecords) ? dataset.sampleRecords : [];
  const rows = Math.max(safeNumber(dataset.stats?.rows, sampleRecords.length), sampleRecords.length || 1);
  const columns = safeNumber(dataset.stats?.columns, 0);
  const values = sampleRecords.flatMap((entry) => {
    const data = entry?.data && typeof entry.data === 'object' ? entry.data : entry;
    if (!data || typeof data !== 'object') return [];
    return Object.values(data);
  });

  const totalCells = Math.max(values.length, rows * Math.max(columns, 1));
  const missingCells = values.filter((value) => value === null || value === undefined || value === '').length;
  const nullRate = totalCells ? (missingCells / totalCells) * 100 : 0;

  const normalizedRows = sampleRecords.map((entry) => JSON.stringify(entry?.data ?? entry ?? {}));
  const duplicateRows = normalizedRows.length - new Set(normalizedRows).size;
  const duplicateRate = normalizedRows.length ? (duplicateRows / normalizedRows.length) * 100 : 0;

  const schemaColumns = Array.isArray(dataset.schemaInfo?.columns) ? dataset.schemaInfo.columns : [];
  const observedKeys = new Set();
  sampleRecords.forEach((entry) => {
    const data = entry?.data && typeof entry.data === 'object' ? entry.data : entry;
    if (data && typeof data === 'object') {
      Object.keys(data).forEach((key) => observedKeys.add(key));
    }
  });
  const schemaDrift = schemaColumns.length
    ? Math.abs(observedKeys.size - schemaColumns.length) / schemaColumns.length * 100
    : 0;

  const numericValues = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  const q1Index = Math.floor(numericValues.length * 0.25);
  const q3Index = Math.floor(numericValues.length * 0.75);
  const q1 = numericValues[q1Index] ?? 0;
  const q3 = numericValues[q3Index] ?? 0;
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const outliers = numericValues.filter((value) => value < lower || value > upper).length;
  const outlierRate = numericValues.length ? (outliers / numericValues.length) * 100 : 0;

  const labelConsistency = 100 - clamp((duplicateRate * 0.25) + (schemaDrift * 0.35) + (nullRate * 0.2) + (outlierRate * 0.2), 0, 100);

  const freshnessDays = dataset.updatedAt
    ? Math.floor((Date.now() - new Date(dataset.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const score = clamp(
    QUALITY_BASE
    - (nullRate * 0.02)
    - (duplicateRate * 0.02)
    - (schemaDrift * 0.015)
    - (outlierRate * 0.015)
    + ((labelConsistency - 50) / 100)
    - (clamp(freshnessDays / 365, 0, 1) * 0.4),
    0,
    5
  );

  return {
    score: Math.round(score * 10) / 10,
    metrics: {
      nullRate: Math.round(nullRate * 10) / 10,
      duplicateRate: Math.round(duplicateRate * 10) / 10,
      schemaDrift: Math.round(schemaDrift * 10) / 10,
      outlierRate: Math.round(outlierRate * 10) / 10,
      labelConsistency: Math.round(labelConsistency * 10) / 10,
      freshnessDays
    }
  };
};

const applyDatasetQuality = async (dataset) => {
  const { score, metrics } = computeDatasetQuality(dataset);
  dataset.qualityScore = score;
  dataset.qualityMetrics = metrics;
  await dataset.save({ validateBeforeSave: false });
  return { score, metrics };
};

module.exports = {
  computeDatasetQuality,
  applyDatasetQuality
};