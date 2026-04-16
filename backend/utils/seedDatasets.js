const Dataset = require('../models/Dataset');
const User = require('../models/User');

const MIN_PUBLISHED_DATASETS = 18;

const contributorSeeds = [
  { username: 'healthlab', name: 'Health Data Lab', organization: 'Global Health Institute', avatar: '' },
  { username: 'techgrid', name: 'Tech Grid Research', organization: 'Open Systems Group', avatar: '' },
  { username: 'ecowatch', name: 'Eco Watch Collective', organization: 'Climate Action Network', avatar: '' },
  { username: 'econpulse', name: 'Economic Pulse', organization: 'Urban Policy Center', avatar: '' },
  { username: 'eduopen', name: 'Edu Open Metrics', organization: 'Learning Futures Lab', avatar: '' },
  { username: 'sportmetrics', name: 'Sport Metrics Lab', organization: 'Performance Analytics Hub', avatar: '' },
  { username: 'artsdata', name: 'Arts Data Commons', organization: 'Digital Culture Lab', avatar: '' },
  { username: 'socialsignal', name: 'Social Signal Team', organization: 'Civic Analytics Unit', avatar: '' },
  { username: 'scienceforge', name: 'Science Forge', organization: 'Open Science Foundation', avatar: '' },
  { username: 'geolab', name: 'GeoLab Earth Data', organization: 'Geo Intelligence Center', avatar: '' }
];

const datasetSeeds = [
  {
    title: 'Global Air Quality Sensor Network 2019-2025',
    description: 'Hourly PM2.5, PM10, NO2, and O3 readings from validated low-cost and regulatory sensors across 120 cities.',
    category: 'environment',
    topic: 'air quality monitoring',
    tags: ['air-quality', 'pm25', 'sensors'],
    contributor: 'ecowatch',
    downloadCount: 18320,
    viewCount: 64210,
    qualityScore: 4.8,
    rows: 2400000,
    columns: 14,
    updateFrequency: 'daily',
    geographicCoverage: 'Global',
    collectionMethod: 'Readings are ingested from city sensor APIs, quality-controlled, and harmonized to UTC hourly bins.',
    usageDescription: 'Useful for exposure modeling, pollution forecasting, and environmental policy evaluation.'
  },
  {
    title: 'Urban Heat Island Hourly Observations',
    description: 'Temperature and humidity differentials between urban cores and nearby rural stations with seasonal annotations.',
    category: 'environment',
    topic: 'urban climate',
    tags: ['temperature', 'urban-heat', 'climate'],
    contributor: 'geolab',
    downloadCount: 12110,
    viewCount: 40120,
    qualityScore: 4.6,
    rows: 1250000,
    columns: 11,
    updateFrequency: 'weekly',
    geographicCoverage: 'North America, Europe, Asia',
    collectionMethod: 'Data pairs nearest urban and rural weather stations and computes normalized hourly deltas.',
    usageDescription: 'Designed for heat risk mapping, city planning studies, and resilience benchmarking.'
  },
  {
    title: 'Hospital Readmission Outcomes 2015-2025',
    description: 'De-identified encounter-level records with demographics, diagnosis groups, length of stay, and 30-day readmission labels.',
    category: 'health',
    topic: 'clinical outcomes',
    tags: ['readmission', 'hospital', 'clinical'],
    contributor: 'healthlab',
    downloadCount: 21150,
    viewCount: 78340,
    qualityScore: 4.9,
    rows: 890000,
    columns: 26,
    updateFrequency: 'monthly',
    geographicCoverage: 'United States',
    collectionMethod: 'Participating hospitals provide standardized discharge extracts transformed to a common schema.',
    usageDescription: 'Supports care quality analytics, intervention impact studies, and risk model development.'
  },
  {
    title: 'ICU Vital Signs Benchmark Pack',
    description: 'Minute-level ICU streams for heart rate, blood pressure, oxygen saturation, and ventilation events with outcome flags.',
    category: 'health',
    topic: 'critical care analytics',
    tags: ['icu', 'vitals', 'time-series'],
    contributor: 'healthlab',
    downloadCount: 16420,
    viewCount: 58890,
    qualityScore: 4.7,
    rows: 3150000,
    columns: 18,
    updateFrequency: 'weekly',
    geographicCoverage: 'Multi-hospital consortium',
    collectionMethod: 'Signals are sampled from bedside devices and merged with admission/discharge metadata.',
    usageDescription: 'Ideal for early warning modeling, trend analysis, and intervention timing studies.'
  },
  {
    title: 'Wearable Sleep and Activity Cohort',
    description: 'Longitudinal wearable summaries including sleep stages, resting heart rate, activity bouts, and adherence quality marks.',
    category: 'health',
    topic: 'digital health',
    tags: ['wearables', 'sleep', 'activity'],
    contributor: 'scienceforge',
    downloadCount: 9850,
    viewCount: 36240,
    qualityScore: 4.4,
    rows: 670000,
    columns: 16,
    updateFrequency: 'monthly',
    geographicCoverage: 'Global',
    collectionMethod: 'Data originates from consenting participants using calibrated consumer devices and survey check-ins.',
    usageDescription: 'Used for lifestyle intervention analysis and circadian rhythm research.'
  },
  {
    title: 'Edge Device Energy Benchmark Suite',
    description: 'Inference latency, memory footprint, and power draw traces for edge AI workloads on heterogeneous hardware.',
    category: 'technology',
    topic: 'edge ai benchmarking',
    tags: ['edge-ai', 'benchmark', 'energy'],
    contributor: 'techgrid',
    downloadCount: 17340,
    viewCount: 55220,
    qualityScore: 4.8,
    rows: 540000,
    columns: 15,
    updateFrequency: 'monthly',
    geographicCoverage: 'Global labs',
    collectionMethod: 'Benchmarks run in controlled environments with repeated trials and thermal stabilization periods.',
    usageDescription: 'Best for model deployment planning, hardware procurement, and optimization tradeoff analysis.'
  },
  {
    title: 'Open Source LLM Prompt Safety Corpus',
    description: 'Prompt and response pairs tagged for policy risk, toxicity, jailbreak intent, and red-team severity.',
    category: 'technology',
    topic: 'ai safety',
    tags: ['llm', 'safety', 'moderation'],
    contributor: 'socialsignal',
    downloadCount: 22780,
    viewCount: 84050,
    qualityScore: 4.9,
    rows: 1320000,
    columns: 12,
    updateFrequency: 'weekly',
    geographicCoverage: 'Global',
    collectionMethod: 'Samples are curated from open benchmarks and expert annotation rounds with adjudication.',
    usageDescription: 'Supports safety classifier training, evaluation dashboards, and incident analysis.'
  },
  {
    title: '5G Network Throughput by Region',
    description: 'Crowdsourced and carrier-reported throughput observations with jitter, packet loss, and connection mode metadata.',
    category: 'technology',
    topic: 'network performance',
    tags: ['5g', 'throughput', 'telecom'],
    contributor: 'techgrid',
    downloadCount: 11430,
    viewCount: 43300,
    qualityScore: 4.5,
    rows: 980000,
    columns: 13,
    updateFrequency: 'daily',
    geographicCoverage: 'Global',
    collectionMethod: 'Client probes and anonymized operator logs are normalized and deduplicated per session key.',
    usageDescription: 'Useful for capacity planning, QoS analysis, and regional connectivity comparisons.'
  },
  {
    title: 'Household Energy Consumption Diaries',
    description: 'Smart meter and appliance-level usage summaries with seasonal labels and weather-joined context variables.',
    category: 'economics',
    topic: 'energy economics',
    tags: ['energy', 'consumption', 'household'],
    contributor: 'econpulse',
    downloadCount: 10220,
    viewCount: 35110,
    qualityScore: 4.3,
    rows: 760000,
    columns: 17,
    updateFrequency: 'monthly',
    geographicCoverage: 'Europe and North America',
    collectionMethod: 'Household panel participants consent to anonymized utility and appliance telemetry collection.',
    usageDescription: 'Designed for pricing elasticity studies and household demand forecasting.'
  },
  {
    title: 'Inflation and Commodity Basket Index 2000-2025',
    description: 'Country-level inflation components with weighted commodity baskets and supply-shock annotations.',
    category: 'economics',
    topic: 'macroeconomic indicators',
    tags: ['inflation', 'commodities', 'macro'],
    contributor: 'econpulse',
    downloadCount: 19640,
    viewCount: 61350,
    qualityScore: 4.7,
    rows: 410000,
    columns: 19,
    updateFrequency: 'monthly',
    geographicCoverage: 'Global',
    collectionMethod: 'Index values are compiled from central bank releases and validated against statistical yearbooks.',
    usageDescription: 'Supports forecasting, policy analysis, and cross-country macroeconomic comparisons.'
  },
  {
    title: 'Public School Attendance and Performance',
    description: 'School-year panel of attendance, standardized scores, staffing ratios, and intervention program indicators.',
    category: 'education',
    topic: 'education outcomes',
    tags: ['schools', 'attendance', 'performance'],
    contributor: 'eduopen',
    downloadCount: 13620,
    viewCount: 48790,
    qualityScore: 4.6,
    rows: 620000,
    columns: 20,
    updateFrequency: 'annually',
    geographicCoverage: 'United States',
    collectionMethod: 'District-level submissions are standardized and audited for reporting consistency.',
    usageDescription: 'Suitable for intervention analysis, district benchmarking, and equity studies.'
  },
  {
    title: 'University Course Completion Analytics',
    description: 'Anonymized student-course trajectories with completion outcomes, grade bands, and support program engagement.',
    category: 'education',
    topic: 'higher education analytics',
    tags: ['university', 'completion', 'student-success'],
    contributor: 'eduopen',
    downloadCount: 9210,
    viewCount: 30220,
    qualityScore: 4.2,
    rows: 540000,
    columns: 22,
    updateFrequency: 'quarterly',
    geographicCoverage: 'Global partner universities',
    collectionMethod: 'Institutions share anonymized longitudinal records mapped to a common academic taxonomy.',
    usageDescription: 'Useful for retention modeling and curriculum effectiveness analysis.'
  },
  {
    title: 'Professional Football Match Events',
    description: 'Event-by-event logs including passes, shots, defensive actions, player positioning zones, and match context.',
    category: 'sports',
    topic: 'sports performance',
    tags: ['football', 'events', 'analytics'],
    contributor: 'sportmetrics',
    downloadCount: 15400,
    viewCount: 56980,
    qualityScore: 4.8,
    rows: 1720000,
    columns: 24,
    updateFrequency: 'weekly',
    geographicCoverage: 'Europe and South America',
    collectionMethod: 'Event feeds are harmonized across providers with consistency checks and temporal alignment.',
    usageDescription: 'Supports tactical analysis, scouting, and match simulation studies.'
  },
  {
    title: 'Community Fitness Tracker Aggregates',
    description: 'Weekly aggregate metrics for distance, pace, active minutes, and goal completion across city fitness programs.',
    category: 'sports',
    topic: 'community health and fitness',
    tags: ['fitness', 'activity', 'community'],
    contributor: 'sportmetrics',
    downloadCount: 8340,
    viewCount: 27890,
    qualityScore: 4.1,
    rows: 350000,
    columns: 10,
    updateFrequency: 'weekly',
    geographicCoverage: 'Major metro areas',
    collectionMethod: 'Participating programs upload anonymized weekly summaries from approved wearable integrations.',
    usageDescription: 'Used for participation trend analysis and program impact measurement.'
  },
  {
    title: 'Museum Visitor Interaction Logs',
    description: 'Gallery-level movement and dwell-time aggregates with exhibit metadata and seasonal attendance patterns.',
    category: 'arts',
    topic: 'cultural analytics',
    tags: ['museum', 'visitor', 'culture'],
    contributor: 'artsdata',
    downloadCount: 7460,
    viewCount: 24990,
    qualityScore: 4.4,
    rows: 420000,
    columns: 12,
    updateFrequency: 'monthly',
    geographicCoverage: 'Europe and North America',
    collectionMethod: 'Privacy-safe sensor summaries are merged with exhibit schedules and ticketing windows.',
    usageDescription: 'Supports exhibit planning, visitor flow optimization, and engagement analysis.'
  },
  {
    title: 'Digital Art Marketplace Transactions',
    description: 'Anonymized transaction history with listing durations, bid activity, creator segments, and price movements.',
    category: 'arts',
    topic: 'creative economy',
    tags: ['digital-art', 'marketplace', 'transactions'],
    contributor: 'artsdata',
    downloadCount: 11870,
    viewCount: 39040,
    qualityScore: 4.6,
    rows: 510000,
    columns: 14,
    updateFrequency: 'daily',
    geographicCoverage: 'Global',
    collectionMethod: 'Public sale events are normalized across marketplaces and enriched with creator metadata.',
    usageDescription: 'Useful for pricing trend studies and creator ecosystem analytics.'
  },
  {
    title: 'Social Platform Toxicity Annotations',
    description: 'Conversation snippets labeled by severity, target group indicators, and moderation outcome categories.',
    category: 'social',
    topic: 'online safety',
    tags: ['toxicity', 'social-media', 'moderation'],
    contributor: 'socialsignal',
    downloadCount: 16830,
    viewCount: 62470,
    qualityScore: 4.8,
    rows: 910000,
    columns: 11,
    updateFrequency: 'weekly',
    geographicCoverage: 'Global',
    collectionMethod: 'Samples are collected from public forums and labeled by trained annotators with quality review.',
    usageDescription: 'Designed for harm detection models and safety policy evaluation.'
  },
  {
    title: 'Civic Participation and Trust Survey Panel',
    description: 'Longitudinal survey responses on civic engagement, institutional trust, and local governance experiences.',
    category: 'social',
    topic: 'public opinion research',
    tags: ['survey', 'civic', 'trust'],
    contributor: 'socialsignal',
    downloadCount: 8920,
    viewCount: 31140,
    qualityScore: 4.3,
    rows: 280000,
    columns: 28,
    updateFrequency: 'quarterly',
    geographicCoverage: 'Global',
    collectionMethod: 'Panel respondents are sampled by region and weighted to maintain demographic representativeness.',
    usageDescription: 'Supports social trend analysis and policy impact studies.'
  },
  {
    title: 'Climate Adaptation Funding Projects Registry',
    description: 'Project-level records of adaptation funding commitments, implementation milestones, and resilience outcomes.',
    category: 'science',
    topic: 'climate adaptation',
    tags: ['climate', 'funding', 'resilience'],
    contributor: 'scienceforge',
    downloadCount: 14210,
    viewCount: 47600,
    qualityScore: 4.7,
    rows: 220000,
    columns: 18,
    updateFrequency: 'monthly',
    geographicCoverage: 'Global',
    collectionMethod: 'Funding disclosures are consolidated from public agencies and validated against project reports.',
    usageDescription: 'Useful for adaptation planning, portfolio tracking, and outcomes benchmarking.'
  }
];

const getSeedPassword = () => {
  const configured = String(process.env.SEED_USER_PASSWORD || '').trim();
  if (configured.length >= 6) return configured;
  return 'SeedPass2026!';
};

const ensureContributor = async (seed) => {
  let user = await User.findOne({ username: seed.username });
  if (!user) {
    user = await User.create({
      username: seed.username,
      name: seed.name,
      email: `${seed.username}@seed.org`,
      password: getSeedPassword(),
      googleId: `seed-${seed.username}`,
      organization: seed.organization || '',
      avatar: seed.avatar || '',
      bio: `${seed.name} contributor profile for curated sample datasets.`,
      isVerified: true,
      authProvider: 'local'
    });
    return user;
  }

  let shouldSave = false;
  if (!user.name && seed.name) {
    user.name = seed.name;
    shouldSave = true;
  }
  if (!user.organization && seed.organization) {
    user.organization = seed.organization;
    shouldSave = true;
  }
  if (!user.avatar && seed.avatar) {
    user.avatar = seed.avatar;
    shouldSave = true;
  }

  if (shouldSave) {
    await user.save({ validateBeforeSave: false });
  }

  return user;
};

const buildDatasetPayload = (seed, contributorId) => ({
  title: seed.title,
  description: seed.description,
  collectionMethod: seed.collectionMethod,
  usageDescription: seed.usageDescription,
  topic: seed.topic,
  tags: (seed.tags || []).slice(0, 5).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
  category: seed.category,
  license: 'CC BY',
  visibility: 'public',
  status: 'published',
  contributor: contributorId,
  stats: {
    rows: Math.max(0, Number(seed.rows) || 0),
    columns: Math.max(0, Number(seed.columns) || 0),
    size: Math.max(4096, (Number(seed.rows) || 0) * Math.max(1, Number(seed.columns) || 1) * 8)
  },
  sampleRecords: [],
  schemaInfo: { columns: [] },
  // Always start seeded datasets from zero so download metrics are real.
  downloadCount: 0,
  viewCount: Math.max(0, Number(seed.viewCount) || 0),
  qualityScore: Math.max(0, Math.min(5, Number(seed.qualityScore) || 0)),
  featured: Number(seed.qualityScore) > 4.5,
  language: 'en',
  updateFrequency: seed.updateFrequency || 'monthly',
  geographicCoverage: seed.geographicCoverage || 'Global',
  version: '1.0',
  versions: [
    {
      version: '1.0',
      summary: 'Seed dataset',
      changelog: 'Initial seeded dataset',
      createdBy: contributorId
    }
  ]
});

const syncContributorStats = async (contributors) => {
  if (!contributors.length) return;

  const ids = contributors.map((entry) => entry._id);
  const aggregates = await Dataset.aggregate([
    { $match: { contributor: { $in: ids } } },
    {
      $group: {
        _id: '$contributor',
        totalUploads: { $sum: 1 },
        totalDownloads: { $sum: '$downloadCount' }
      }
    }
  ]);

  const aggregateMap = new Map(aggregates.map((item) => [String(item._id), item]));
  for (const contributor of contributors) {
    const metric = aggregateMap.get(String(contributor._id)) || { totalUploads: 0, totalDownloads: 0 };
    await User.updateOne(
      { _id: contributor._id },
      {
        $set: {
          totalUploads: metric.totalUploads,
          totalDownloads: metric.totalDownloads
        }
      }
    );
  }
};

const ensureSeedDatasets = async (options = {}) => {
  const {
    minPublished = MIN_PUBLISHED_DATASETS,
    force = false,
    logger = console
  } = options;

  const publishedQuery = { status: 'published', visibility: 'public' };
  const currentCount = await Dataset.countDocuments(publishedQuery);
  if (!force && currentCount >= minPublished) {
    return {
      seeded: false,
      inserted: 0,
      skipped: datasetSeeds.length,
      totalPublished: currentCount
    };
  }

  const contributors = [];
  for (const contributorSeed of contributorSeeds) {
    const contributor = await ensureContributor(contributorSeed);
    contributors.push(contributor);
  }

  const contributorByUsername = new Map(contributors.map((entry) => [entry.username, entry]));

  let inserted = 0;
  let skipped = 0;

  for (const seed of datasetSeeds) {
    const contributor = contributorByUsername.get(seed.contributor);
    if (!contributor) {
      skipped += 1;
      continue;
    }

    const existing = await Dataset.findOne({ title: seed.title }).select('_id title');
    if (existing && !force) {
      skipped += 1;
      continue;
    }

    if (existing && force) {
      const payload = buildDatasetPayload(seed, contributor._id);
      await Dataset.updateOne({ _id: existing._id }, { $set: payload });
      skipped += 1;
      continue;
    }

    const payload = buildDatasetPayload(seed, contributor._id);
    const dataset = new Dataset(payload);
    await dataset.save();
    inserted += 1;
  }

  await syncContributorStats(contributors);

  const totalPublished = await Dataset.countDocuments(publishedQuery);
  logger.info(
    `[seed] Dummy datasets check complete. inserted=${inserted}, skipped=${skipped}, totalPublished=${totalPublished}`
  );

  return {
    seeded: inserted > 0,
    inserted,
    skipped,
    totalPublished
  };
};

module.exports = {
  ensureSeedDatasets,
  MIN_PUBLISHED_DATASETS,
  datasetSeeds
};
