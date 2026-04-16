const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function withDbName(uri, dbName) {
  const parsed = new URL(uri);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function normalizeIndexOptions(indexSpec) {
  const { key, v, ns, background, name, ...rest } = indexSpec;
  const options = { ...rest, name };

  // Atlas rejects undefined option values.
  Object.keys(options).forEach((k) => {
    if (options[k] === undefined) delete options[k];
  });

  return { key, options };
}

async function copyCollectionData(sourceCollection, targetCollection) {
  await targetCollection.deleteMany({});

  const cursor = sourceCollection.find({});
  const batchSize = 500;
  let copied = 0;
  let batch = [];

  while (await cursor.hasNext()) {
    batch.push(await cursor.next());
    if (batch.length >= batchSize) {
      await targetCollection.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await targetCollection.insertMany(batch, { ordered: false });
    copied += batch.length;
  }

  return copied;
}

async function copyIndexes(sourceCollection, targetCollection) {
  const sourceIndexes = await sourceCollection.indexes();
  let targetIndexes = [];
  try {
    targetIndexes = await targetCollection.indexes();
  } catch (error) {
    if (!String(error.message || '').includes('ns does not exist')) {
      throw error;
    }
  }

  for (const idx of targetIndexes) {
    if (idx.name !== '_id_') {
      await targetCollection.dropIndex(idx.name);
    }
  }

  for (const idx of sourceIndexes) {
    if (idx.name === '_id_') continue;
    const { key, options } = normalizeIndexOptions(idx);
    await targetCollection.createIndex(key, options);
  }
}

async function migrate() {
  const envPath = path.join(__dirname, '..', '.env');
  loadEnvFile(envPath);

  const sourceDb = process.env.SOURCE_DB || 'dataset-collab';
  const targetDb = process.env.TARGET_DB || process.env.MONGO_DB_NAME || 'dataverse';
  const baseUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!baseUri) {
    throw new Error('MONGO_URI (or MONGODB_URI) is required in environment.');
  }

  const sourceUri = withDbName(baseUri, sourceDb);
  const targetUri = withDbName(baseUri, targetDb);

  if (sourceDb === targetDb) {
    throw new Error('SOURCE_DB and TARGET_DB are the same. Nothing to migrate.');
  }

  console.log(`Starting Atlas database copy: ${sourceDb} -> ${targetDb}`);

  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  const targetConn = await mongoose.createConnection(targetUri).asPromise();

  try {
    const collections = await sourceConn.db.listCollections({}, { nameOnly: true }).toArray();
    if (collections.length === 0) {
      console.log(`No collections found in source database ${sourceDb}.`);
      return;
    }

    const failures = [];

    for (const { name } of collections) {
      if (!name || name.startsWith('system.')) continue;

      try {
        const sourceCollection = sourceConn.db.collection(name);
        await targetConn.db.createCollection(name).catch((err) => {
          if (err && err.codeName !== 'NamespaceExists') throw err;
        });
        const targetCollection = targetConn.db.collection(name);

        const copiedCount = await copyCollectionData(sourceCollection, targetCollection);
        await copyIndexes(sourceCollection, targetCollection);
        console.log(`Copied collection ${name}: ${copiedCount} documents`);
      } catch (error) {
        failures.push({ name, message: error.message });
        console.log(`Skipped collection ${name}: ${error.message}`);
      }
    }

    if (failures.length > 0) {
      const summary = failures.map((f) => `${f.name}: ${f.message}`).join('; ');
      throw new Error(`Some collections failed to migrate: ${summary}`);
    }

    console.log(`Database copy completed successfully: ${sourceDb} -> ${targetDb}`);
  } finally {
    await Promise.allSettled([sourceConn.close(), targetConn.close()]);
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Migration failed: ${err.message}`);
    process.exit(1);
  });
