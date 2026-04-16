const { put, del } = require('@vercel/blob');

const isBlobStorageConfigured = () => {
  return Boolean(
    String(process.env.BLOB_READ_WRITE_TOKEN || '').trim() ||
    String(process.env.VERCEL_BLOB_READ_WRITE_TOKEN || '').trim()
  );
};

const sanitizeFileName = (name) => {
  const value = String(name || 'file.bin').trim();
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  const fallback = normalized || 'file.bin';
  return fallback.slice(-140);
};

const isAbsoluteHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const buildBlobPath = (folder, originalName) => {
  const safeFolder = String(folder || 'uploads').replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'uploads';
  const safeName = sanitizeFileName(originalName);
  const token = Math.random().toString(36).slice(2, 10);
  return `${safeFolder}/${Date.now()}-${token}-${safeName}`;
};

const uploadBufferToBlob = async (file, options = {}) => {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error('Upload buffer is missing');
  }

  if (!isBlobStorageConfigured()) {
    throw new Error('Blob storage is not configured. Set BLOB_READ_WRITE_TOKEN.');
  }

  const folder = options.folder || 'uploads';
  const blobPath = buildBlobPath(folder, file.originalname || file.originalName || 'file.bin');

  const blob = await put(blobPath, file.buffer, {
    access: 'public',
    addRandomSuffix: false,
    contentType: file.mimetype || 'application/octet-stream'
  });

  return {
    url: blob.url,
    pathname: blob.pathname || '',
    size: file.size || file.buffer.length,
    contentType: file.mimetype || 'application/octet-stream'
  };
};

const deleteBlobAsset = async (blobUrl) => {
  if (!blobUrl || !isBlobStorageConfigured() || !isAbsoluteHttpUrl(blobUrl)) {
    return false;
  }

  await del(blobUrl);
  return true;
};

module.exports = {
  isBlobStorageConfigured,
  isAbsoluteHttpUrl,
  uploadBufferToBlob,
  deleteBlobAsset
};
