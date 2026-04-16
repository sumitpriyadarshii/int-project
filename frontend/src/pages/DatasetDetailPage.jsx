import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { datasetAPI, discussionAPI } from "../api/client";
import { useAuth } from "../context/AuthContext";

const socketBaseUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const realtimeEnabled = import.meta.env.VITE_ENABLE_REALTIME === "true";

export default function DatasetDetailPage() {
  const { id } = useParams();
  const { isAuthenticated, user } = useAuth();
  const [dataset, setDataset] = useState(null);
  const [preview, setPreview] = useState([]);
  const [previewLimited, setPreviewLimited] = useState(false);
  const [previewLimit, setPreviewLimit] = useState(null);
  const [versions, setVersions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [versionForm, setVersionForm] = useState({ version: "", summary: "", changelog: "" });
  const [compareResult, setCompareResult] = useState(null);
  const [qualityReport, setQualityReport] = useState(null);
  const [issues, setIssues] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [accessForm, setAccessForm] = useState({ message: "", intendedUse: "", accessDays: 30, purpose: "" });
  const [discussionForm, setDiscussionForm] = useState({ qualityScore: 4, comment: "", suggestion: "" });
  const [issueForm, setIssueForm] = useState({
    type: "missing_values",
    priority: "medium",
    title: "",
    description: "",
    assignee: "",
    dueDays: 7
  });
  const [note, setNote] = useState("");

  const loadDatasetBundle = useCallback(async () => {
    const [detailRes, previewRes, discussRes, versionsRes, issuesRes] = await Promise.all([
      datasetAPI.detail(id),
      datasetAPI.preview(id),
      discussionAPI.list(id),
      datasetAPI.versions(id).catch(() => ({ currentVersion: null, versions: [] })),
      datasetAPI.issues(id).catch(() => [])
    ]);
    const [qualityRes, timelineRes] = await Promise.all([
      datasetAPI.qualityReport(id).catch(() => null),
      datasetAPI.timeline(id).catch(() => [])
    ]);

    return {
      detailRes,
      previewRes,
      discussRes,
      versionsRes,
      issuesRes,
      qualityRes,
      timelineRes
    };
  }, [id]);

  const applyDatasetBundle = useCallback((bundle) => {
    const {
      detailRes,
      previewRes,
      discussRes,
      versionsRes,
      issuesRes,
      qualityRes,
      timelineRes
    } = bundle;

    setDataset(detailRes.dataset || null);
    setQualityReport(qualityRes);
    setPreview(previewRes.sampleRecords || []);
    setPreviewLimited(Boolean(previewRes.previewLimited));
    setPreviewLimit(previewRes.previewLimit || null);
    setCurrentVersion(versionsRes.currentVersion || detailRes.dataset?.version || null);
    setVersions(versionsRes.versions || []);
    setIssues(issuesRes || []);
    setDiscussions(discussRes || []);
    setTimeline(timelineRes || []);
  }, []);

  const fetchAll = useCallback(async () => {
    const bundle = await loadDatasetBundle();
    applyDatasetBundle(bundle);
  }, [loadDatasetBundle, applyDatasetBundle]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const bundle = await loadDatasetBundle();
        if (!mounted) return;
        applyDatasetBundle(bundle);
      } catch (error) {
        if (mounted) {
          setNote(error?.response?.data?.message || "Failed to load dataset details.");
        }
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [loadDatasetBundle, applyDatasetBundle]);

  useEffect(() => {
    if (!realtimeEnabled) {
      return undefined;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      return undefined;
    }

    const socket = io(socketBaseUrl, { withCredentials: true, auth: { token } });
    socket.emit("join_dataset", id);

    socket.on("discussion_added", ({ discussion }) => {
      if (!discussion) return;
      setDiscussions((prev) => [discussion, ...prev]);
    });

    socket.on("download_count_updated", ({ datasetId, downloadCount }) => {
      if (datasetId === id) {
        setDataset((prev) => (prev ? { ...prev, downloadsCount: downloadCount ?? prev.downloadsCount } : prev));
      }
    });

    return () => {
      socket.emit("leave_dataset", id);
      socket.disconnect();
    };
  }, [id]);

  const previewHeaders = useMemo(() => {
    if (!preview.length || typeof preview[0] !== "object" || Array.isArray(preview[0])) {
      return [];
    }
    return Object.keys(preview[0]);
  }, [preview]);

  const requestAccess = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setNote("Please login to request dataset access.");
      return;
    }
    await datasetAPI.requestAccess(id, accessForm);
    setAccessForm({ message: "", intendedUse: "", accessDays: 30, purpose: "" });
    setNote("Access request submitted.");
  };

  const addDiscussion = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setNote("Please login to post a discussion.");
      return;
    }
    const content = `${discussionForm.comment}${
      discussionForm.suggestion ? `\n\nSuggestion: ${discussionForm.suggestion}` : ""
    }`;
    await discussionAPI.create(id, {
      title: `Quality feedback (${discussionForm.qualityScore}/5)`,
      content
    });
    setDiscussionForm({ qualityScore: 4, comment: "", suggestion: "" });
    setNote("Discussion posted.");
  };

  const createVersion = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setNote("Please login to create versions.");
      return;
    }
    try {
      const { data } = await datasetAPI.createVersion(id, versionForm);
      setVersions((prev) => [data.versions?.[0] || { version: versionForm.version, summary: versionForm.summary, changelog: versionForm.changelog }, ...prev]);
      setCurrentVersion(data.currentVersion || versionForm.version);
      setVersionForm({ version: "", summary: "", changelog: "" });
      setNote("Version created successfully.");
      fetchAll();
    } catch (error) {
      setNote(error?.response?.data?.message || "Failed to create version.");
    }
  };

  const rollbackVersion = async (versionId) => {
    if (!isAuthenticated) return;
    try {
      const { data } = await datasetAPI.rollbackVersion(id, versionId);
      setCurrentVersion(data.currentVersion || currentVersion);
      setNote("Rolled back successfully.");
      fetchAll();
    } catch (error) {
      setNote(error?.response?.data?.message || "Failed to rollback version.");
    }
  };

  const compareVersions = async (fromVersionId, toVersionId) => {
    if (!fromVersionId || !toVersionId) return;
    try {
      const { data } = await datasetAPI.compareVersions(id, fromVersionId, toVersionId);
      setCompareResult(data.compare || null);
    } catch (error) {
      setNote(error?.response?.data?.message || "Failed to compare versions.");
    }
  };

  const downloadDataset = async () => {
    if (!isAuthenticated) {
      setNote("Please login to download datasets.");
      return;
    }
    try {
      const downloadUrl = await datasetAPI.download(id);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNote(error?.response?.data?.message || error.message || "Download failed");
    }
  };

  const createIssue = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setNote("Please login to report quality issues.");
      return;
    }
    try {
      const { data } = await datasetAPI.createIssue(id, issueForm);
      setIssues((prev) => [data.issue, ...prev]);
      setIssueForm({ type: "missing_values", priority: "medium", title: "", description: "", assignee: "", dueDays: 7 });
      setNote("Issue created successfully.");
    } catch (error) {
      setNote(error?.response?.data?.message || "Failed to create issue.");
    }
  };

  const updateIssueStatus = async (issueId, status) => {
    if (!isAuthenticated) {
      setNote("Please login to update issue status.");
      return;
    }
    try {
      const { data } = await datasetAPI.updateIssue(id, issueId, { status });
      setIssues((prev) => prev.map((issue) => (issue._id === issueId ? { ...issue, ...data.issue } : issue)));
      setNote(`Issue marked as ${status}.`);
    } catch (error) {
      setNote(error?.response?.data?.message || "Failed to update issue.");
    }
  };

  const canManageIssues = Boolean(
    user && dataset && (user.role === "admin" || user._id === dataset?.contributor?._id)
  );

  const qualityMetrics = qualityReport?.qualityMetrics || dataset?.qualityMetrics || {};

  if (!dataset) {
    return <p>Loading dataset...</p>;
  }

  return (
    <section className="detail-layout">
      <article className="detail-main">
        <p className="eyebrow">{dataset.topic}</p>
        <h1>{dataset.title}</h1>
        <p>{dataset.description}</p>
        <p><strong>Collection:</strong> {dataset.collectionMethod}</p>
        <p><strong>Usage:</strong> {dataset.usageDescription}</p>
        <div className="meta-row">
          <span>Contributor: {dataset.contributor?.name || dataset.contributor?.username || "Unknown"}</span>
          <span>{dataset.downloadsCount} downloads</span>
        </div>
        <button type="button" className="primary-btn" onClick={downloadDataset}>
          Download Dataset
        </button>
        <div className="detail-panel" style={{ marginTop: 18 }}>
          <h2>Quality report</h2>
          <p><strong>Auto score:</strong> {qualityReport?.qualityScore ?? dataset.qualityScore ?? 0}/5</p>
          <p>null: {qualityMetrics.nullRate ?? 0}% • duplicates: {qualityMetrics.duplicateRate ?? 0}% • drift: {qualityMetrics.schemaDrift ?? 0}% • outliers: {qualityMetrics.outlierRate ?? 0}%</p>
          <p>label consistency: {qualityMetrics.labelConsistency ?? 0}% • freshness: {qualityMetrics.freshnessDays ?? 0} days</p>
          {qualityReport?.projectedScore !== undefined && <p>Projected score after recalculation: {qualityReport.projectedScore}/5</p>}
        </div>
      </article>

      <article className="detail-panel">
        <h2>Sample preview</h2>
        {previewLimited && !isAuthenticated && (
          <p>
            Showing limited preview ({previewLimit || 3} rows). <Link to="/signin">Sign In</Link> for full preview and actions.
          </p>
        )}
        {!preview.length ? (
          <p>No sample records available.</p>
        ) : previewHeaders.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {previewHeaders.map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((row, index) => (
                  <tr key={`${index}-${JSON.stringify(row).slice(0, 20)}`}>
                    {previewHeaders.map((key) => (
                      <td key={`${index}-${key}`}>{String(row[key] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        )}
      </article>

      <article className="detail-panel">
        <h2>Request access</h2>
        {!isAuthenticated ? (
          <p>
            Sign In is required to request access. <Link to="/signin">Go to Sign In</Link>
          </p>
        ) : (
          <form className="stack-form" onSubmit={requestAccess}>
            <label>
              Message to contributor
              <textarea
                required
                value={accessForm.message}
                onChange={(event) => setAccessForm((prev) => ({ ...prev, message: event.target.value }))}
                rows={3}
              />
            </label>
            <label>
              Intended use
              <textarea
                required
                value={accessForm.intendedUse}
                onChange={(event) => setAccessForm((prev) => ({ ...prev, intendedUse: event.target.value }))}
                rows={3}
              />
            </label>
            <label>
              Purpose
              <input
                value={accessForm.purpose}
                onChange={(event) => setAccessForm((prev) => ({ ...prev, purpose: event.target.value }))}
              />
            </label>
            <label>
              Access days
              <select
                value={accessForm.accessDays}
                onChange={(event) => setAccessForm((prev) => ({ ...prev, accessDays: Number(event.target.value) }))}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <button className="primary-btn" type="submit">Send request</button>
          </form>
        )}
      </article>

      <article className="detail-panel">
        <h2>Data quality discussion</h2>
        {!isAuthenticated ? (
          <p>
            Sign In is required to join discussion. <Link to="/signin">Go to Sign In</Link>
          </p>
        ) : (
          <form className="stack-form" onSubmit={addDiscussion}>
            <label>
              Quality score (1-5)
              <input
                type="number"
                min={1}
                max={5}
                value={discussionForm.qualityScore}
                onChange={(event) => setDiscussionForm((prev) => ({ ...prev, qualityScore: Number(event.target.value) }))}
                required
              />
            </label>
            <label>
              Comment
              <textarea
                required
                rows={3}
                value={discussionForm.comment}
                onChange={(event) => setDiscussionForm((prev) => ({ ...prev, comment: event.target.value }))}
              />
            </label>
            <label>
              Suggested improvements
              <textarea
                rows={2}
                value={discussionForm.suggestion}
                onChange={(event) => setDiscussionForm((prev) => ({ ...prev, suggestion: event.target.value }))}
              />
            </label>
            <button className="primary-btn" type="submit">Post feedback</button>
          </form>
        )}

        {note && <p className="ok-msg">{note}</p>}

        <div className="discussion-list">
          {discussions.map((item) => (
            <div className="discussion-card" key={item._id}>
              <p><strong>{item.author?.name || item.author?.username || "Unknown"}</strong></p>
              {item.title && <p><strong>{item.title}</strong></p>}
              <p>{item.comment || item.content}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="detail-panel">
        <h2>Version history</h2>
        <p>Current version: {currentVersion || dataset.version || "1.0"}</p>
        {isAuthenticated && (
          <form className="stack-form" onSubmit={createVersion} style={{ marginBottom: 16 }}>
            <label>
              Version
              <input required value={versionForm.version} onChange={(event) => setVersionForm((prev) => ({ ...prev, version: event.target.value }))} />
            </label>
            <label>
              Summary
              <input value={versionForm.summary} onChange={(event) => setVersionForm((prev) => ({ ...prev, summary: event.target.value }))} />
            </label>
            <label>
              Changelog
              <textarea rows={3} value={versionForm.changelog} onChange={(event) => setVersionForm((prev) => ({ ...prev, changelog: event.target.value }))} />
            </label>
            <button className="primary-btn" type="submit">Create New Version</button>
          </form>
        )}
        {!versions.length ? (
          <p>No version history available yet.</p>
        ) : (
          <div className="discussion-list">
            {versions.map((entry) => (
              <div key={entry._id || entry.version} className="discussion-card">
                <p><strong>v{entry.version}</strong></p>
                {entry.summary && <p>{entry.summary}</p>}
                {entry.changelog && <p>{entry.changelog}</p>}
                <p>
                  By {entry.createdBy?.name || entry.createdBy?.username || "Unknown"}
                  {entry.createdAt ? ` • ${new Date(entry.createdAt).toLocaleString()}` : ""}
                </p>
                {canManageIssues && entry._id && (
                  <button type="button" className="ghost-btn" onClick={() => rollbackVersion(entry._id)}>
                    Roll back to this version
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {versions.length >= 2 && (
          <div style={{ marginTop: 16 }}>
            <button type="button" className="ghost-btn" onClick={() => compareVersions(versions[1]._id, versions[0]._id)}>
              Compare latest versions
            </button>
            {compareResult && (
              <div className="discussion-card" style={{ marginTop: 12 }}>
                <p><strong>Version compare</strong></p>
                <p>{compareResult.fromVersion} → {compareResult.toVersion}</p>
                <p>Summary changed: {String(compareResult.summaryChanged)}</p>
                <p>Changelog changed: {String(compareResult.changelogChanged)}</p>
                <p>Row delta: {compareResult.rowCountDelta}</p>
                <p>Quality delta: {compareResult.qualityDelta}</p>
              </div>
            )}
          </div>
        )}
      </article>

      <article className="detail-panel">
        <h2>Quality issue tracker</h2>
        {!isAuthenticated ? (
          <p>
            Sign In is required to report issues. <Link to="/signin">Go to Sign In</Link>
          </p>
        ) : (
          <form className="stack-form" onSubmit={createIssue}>
            <label>
              Issue type
              <select
                value={issueForm.type}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="missing_values">Missing values</option>
                <option value="duplicates">Duplicates</option>
                <option value="schema_mismatch">Schema mismatch</option>
                <option value="outliers">Outliers</option>
                <option value="bias">Bias</option>
                <option value="label_error">Label error</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={issueForm.priority}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, priority: event.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label>
              Title
              <input
                required
                value={issueForm.title}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label>
              Description
              <textarea
                required
                rows={3}
                value={issueForm.description}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <label>
              Assignee username (optional)
              <input value={issueForm.assignee} onChange={(event) => setIssueForm((prev) => ({ ...prev, assignee: event.target.value }))} />
            </label>
            <label>
              SLA days
              <select value={issueForm.dueDays} onChange={(event) => setIssueForm((prev) => ({ ...prev, dueDays: Number(event.target.value) }))}>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <button type="submit" className="primary-btn">Report issue</button>
          </form>
        )}

        {!issues.length ? (
          <p>No quality issues reported yet.</p>
        ) : (
          <div className="discussion-list">
            {issues.map((issue) => (
              <div className="discussion-card" key={issue._id}>
                <p><strong>{issue.title}</strong></p>
                <p>Type: {issue.type} • Priority: {issue.priority} • Status: {issue.status}</p>
                <p>{issue.description}</p>
                <p>Opened by {issue.createdBy?.name || issue.createdBy?.username || "Unknown"}</p>
                <p>Assignee: {issue.assignee?.name || issue.assignee?.username || "Unassigned"}</p>
                {issue.dueAt && <p>SLA due: {new Date(issue.dueAt).toLocaleString()}</p>}
                {issue.resolutionEvidence?.length ? <p>Evidence attached: {issue.resolutionEvidence.length}</p> : null}
                {issue.resolutionNote && <p>Resolution: {issue.resolutionNote}</p>}
                {(canManageIssues || user?._id === issue.createdBy?._id) && issue.status !== "resolved" && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => updateIssueStatus(issue._id, "resolved")}
                  >
                    Mark resolved
                  </button>
                )}
                {(canManageIssues || user?._id === issue.createdBy?._id) && issue.status === "resolved" && (
                  <button type="button" className="ghost-btn" onClick={() => updateIssueStatus(issue._id, "verified")}>Mark verified</button>
                )}
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="detail-panel">
        <h2>Provenance timeline</h2>
        {!timeline.length ? (
          <p>No audit records yet.</p>
        ) : (
          <div className="discussion-list">
            {timeline.map((entry) => (
              <div className="discussion-card" key={entry._id}>
                <p><strong>{entry.action}</strong> - {entry.summary}</p>
                <p>By {entry.actor?.username || 'System'} • {new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
