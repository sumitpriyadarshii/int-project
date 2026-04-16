import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { datasetAPI } from "../api/client";

export default function UploadPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    topic: "",
    category: "science",
    tags: "",
    collectionMethod: "",
    usageDescription: ""
  });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setStatus({ type: "error", message: "Please select a dataset file" });
      return;
    }

    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    data.append("files", file);

    try {
      await datasetAPI.create(data);
      setStatus({ type: "ok", message: "Dataset uploaded successfully" });
      navigate("/");
    } catch (error) {
      setStatus({ type: "error", message: error?.response?.data?.message || "Upload failed" });
    }
  };

  return (
    <section className="form-shell">
      <h1>Upload a new dataset</h1>
      <form className="stack-form" onSubmit={onSubmit}>
        <label>
          Dataset title
          <input name="title" value={form.title} onChange={onChange} required />
        </label>
        <label>
          Topic
          <input name="topic" value={form.topic} onChange={onChange} required />
        </label>
        <label>
          Category
          <select name="category" value={form.category} onChange={onChange} required>
            <option value="science">Science</option>
            <option value="technology">Technology</option>
            <option value="health">Health</option>
            <option value="environment">Environment</option>
            <option value="social">Social</option>
            <option value="economics">Economics</option>
            <option value="education">Education</option>
            <option value="sports">Sports</option>
            <option value="arts">Arts</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Tags (comma-separated)
          <input name="tags" value={form.tags} onChange={onChange} placeholder="health, ecology, time-series" />
        </label>
        <label>
          Description
          <textarea name="description" value={form.description} onChange={onChange} required rows={3} />
        </label>
        <label>
          Collection method
          <textarea name="collectionMethod" value={form.collectionMethod} onChange={onChange} required rows={3} />
        </label>
        <label>
          How data was used
          <textarea name="usageDescription" value={form.usageDescription} onChange={onChange} required rows={3} />
        </label>
        <label>
          Dataset file (CSV or JSON)
          <input type="file" accept=".csv,.json,application/json,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
        </label>

        {status.message && <p className={status.type === "error" ? "error-msg" : "ok-msg"}>{status.message}</p>}
        <button type="submit" className="primary-btn">Upload dataset</button>
      </form>
    </section>
  );
}
