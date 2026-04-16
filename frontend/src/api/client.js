import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const normalizeUser = (user) => {
  if (!user) return null;
  return {
    ...user,
    name: user.name || user.username || "Unknown"
  };
};

const normalizeDataset = (dataset) => {
  if (!dataset) return null;
  return {
    ...dataset,
    downloadsCount: dataset.downloadsCount ?? dataset.downloadCount ?? 0,
    contributor: normalizeUser(dataset.contributor)
  };
};

const normalizeDiscussion = (discussion) => {
  if (!discussion) return null;
  return {
    ...discussion,
    author: normalizeUser(discussion.author),
    comment: discussion.comment || discussion.content || ""
  };
};

const normalizeVersion = (version) => {
  if (!version) return null;
  return {
    ...version,
    createdBy: normalizeUser(version.createdBy)
  };
};

const normalizeIssue = (issue) => {
  if (!issue) return null;
  return {
    ...issue,
    createdBy: normalizeUser(issue.createdBy),
    resolvedBy: normalizeUser(issue.resolvedBy)
  };
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (payload) => api.post("/auth/register", payload),
  login: (payload) => api.post("/auth/login", payload),
  me: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout")
};

export const datasetAPI = {
  list: (params) => api.get("/datasets", { params }).then(({ data }) => ({
    ...data,
    items: (data.items || data.datasets || []).map(normalizeDataset)
  })),
  leaderboard: () => api.get("/datasets/stats").then(({ data }) => {
    const topContributors = data?.stats?.topContributors || [];
    return topContributors.map((entry) => ({
      _id: {
        _id: entry._id,
        name: entry.username || "Unknown"
      },
      datasetsContributed: entry.totalUploads ?? 0,
      totalDownloads: entry.totalDownloads ?? 0
    }));
  }),
  create: (formData) => api.post("/datasets", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  detail: (id) => api.get(`/datasets/${id}`).then(({ data }) => ({
    ...data,
    dataset: normalizeDataset(data.dataset || data)
  })),
  preview: (id) => datasetAPI.detail(id).then((data) => ({
    sampleRecords: (data.dataset?.sampleRecords || []).map((item) => item?.data ?? item),
    previewLimited: Boolean(data.previewLimited),
    previewLimit: data.previewLimit || null
  })),
  requestAccess: (id, payload) => api.post(`/datasets/${id}/access-request`, {
    message: payload?.message || payload?.intendedUse || "Access request",
    accessDays: payload?.accessDays ?? 30,
    purpose: payload?.purpose || ""
  }),
  download: async (id) => {
    const { data } = await api.post(`/datasets/${id}/download`);
    const firstFile = data?.files?.[0];
    if (!firstFile?.downloadUrl) {
      throw new Error("No downloadable file returned by API");
    }
    return firstFile.downloadUrl.startsWith("http")
      ? firstFile.downloadUrl
      : `${API_BASE_URL}${firstFile.downloadUrl}`;
  },
  accessRequests: (id) => api.get(`/datasets/${id}`).then(({ data }) => data?.dataset?.accessRequests || []),
  updateAccessRequest: (id, requestId, payload) => api.put(`/datasets/${id}/access-request/${requestId}`, payload),
  downloadLogs: (id) => api.get(`/datasets/${id}`),
  versions: (id) => api.get(`/datasets/${id}/versions`).then(({ data }) => ({
    currentVersion: data?.currentVersion || null,
    versions: (data?.versions || []).map(normalizeVersion)
  })),
  createVersion: (id, payload) => api.post(`/datasets/${id}/versions`, payload),
  rollbackVersion: (id, versionId) => api.post(`/datasets/${id}/versions/${versionId}/rollback`),
  compareVersions: (id, fromVersionId, toVersionId) => api.get(`/datasets/${id}/compare/${fromVersionId}/${toVersionId}`),
  issues: (id) => api.get(`/datasets/${id}/issues`).then(({ data }) =>
    (data?.issues || []).map(normalizeIssue)
  ),
  createIssue: (id, payload) => api.post(`/datasets/${id}/issues`, payload),
  updateIssue: (id, issueId, payload) => api.patch(`/datasets/${id}/issues/${issueId}`, payload),
  qualityReport: (id) => api.get(`/datasets/${id}/quality-report`).then(({ data }) => data),
  timeline: (id) => api.get(`/datasets/${id}/timeline`).then(({ data }) => data?.timeline || []),
  flagDiscussion: (discussionId, payload) => api.post(`/discussions/${discussionId}/flag`, payload)
};

export const discussionAPI = {
  list: (datasetId) => api.get(`/discussions/dataset/${datasetId}`).then(({ data }) =>
    (data?.discussions || []).map(normalizeDiscussion)
  ),
  create: (datasetId, payload) => api.post("/discussions", {
    datasetId,
    title: payload?.title || "Dataset Feedback",
    content: payload?.content || payload?.comment || "",
    type: payload?.type || "quality_issue"
  }).then(({ data }) => ({
    ...data,
    discussion: normalizeDiscussion(data.discussion)
  }))
};
