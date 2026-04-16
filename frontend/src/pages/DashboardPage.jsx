import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { io } from "socket.io-client";
import DatasetCard from "../components/DatasetCard";
import { datasetAPI } from "../api/client";

const socketBaseUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const realtimeEnabled = import.meta.env.VITE_ENABLE_REALTIME === "true";

export default function DashboardPage() {
  const [datasets, setDatasets] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", topic: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [datasetRes, creditRes] = await Promise.all([
        datasetAPI.list({ q: filters.q, topic: filters.topic }),
        datasetAPI.leaderboard()
      ]);
      setDatasets(Array.isArray(datasetRes.items) ? datasetRes.items : []);
      setLeaderboard(Array.isArray(creditRes) ? creditRes : []);
    } finally {
      setLoading(false);
    }
  }, [filters.q, filters.topic]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!realtimeEnabled) {
      return undefined;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      return undefined;
    }

    const socket = io(socketBaseUrl, {
      withCredentials: true,
      auth: { token }
    });

    socket.on("dataset:created", () => {
      void fetchData();
    });
    return () => socket.disconnect();
  }, [fetchData]);

  const stats = useMemo(() => {
    const totalDownloads = datasets.reduce(
      (acc, item) => acc + Number(item?.downloadsCount ?? item?.downloadCount ?? 0),
      0
    );
    return { totalDatasets: datasets.length, totalDownloads };
  }, [datasets]);

  return (
    <div className="dashboard-wrap">
      <motion.section className="hero-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <p className="eyebrow">Research Data Platform</p>
          <h1>Find quality datasets faster</h1>
          <p>Search by topic, preview records, request access, and join improvement discussions.</p>
        </div>
        <img src="/images/lab-wave.svg" alt="Laboratory data flow" />
      </motion.section>

      <section className="stat-grid">
        <article>
          <h3>{stats.totalDatasets}</h3>
          <p>Datasets discovered</p>
        </article>
        <article>
          <h3>{stats.totalDownloads}</h3>
          <p>Total downloads</p>
        </article>
      </section>

      <section className="filters">
        <input
          placeholder="Search title, topic, or tags"
          value={filters.q}
          onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
        />
        <input
          placeholder="Filter by topic"
          value={filters.topic}
          onChange={(event) => setFilters((prev) => ({ ...prev, topic: event.target.value }))}
        />
      </section>

      <section className="content-grid">
        <div>
          <h2>Available datasets</h2>
          {loading ? (
            <p>Loading datasets...</p>
          ) : (
            <div className="cards-grid">
              {datasets.map((dataset, index) => (
                <DatasetCard key={dataset._id} dataset={dataset} index={index} />
              ))}
            </div>
          )}
        </div>

        <aside className="credits-panel">
          <h2>Top contributors</h2>
          <ol>
            {leaderboard.map((entry) => (
              <li key={entry._id?._id || entry._id?.name || "unknown-contributor"}>
                <strong>{entry._id?.name || "Unknown"}</strong>
                <span>{entry.datasetsContributed} datasets</span>
                <span>{entry.totalDownloads} downloads</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>
    </div>
  );
}
