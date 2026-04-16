import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function DatasetCard({ dataset, index = 0 }) {
  return (
    <motion.article
      className="dataset-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      whileHover={{ y: -5, rotateX: -2, rotateY: 2 }}
    >
      <p className="dataset-topic">{dataset.topic}</p>
      <h3>{dataset.title}</h3>
      <p>{dataset.description}</p>
      <div className="meta-row">
        <span>By {dataset.contributor?.name || "Unknown"}</span>
        <span>{dataset.downloadsCount} downloads</span>
      </div>
      <div className="tag-list">
        {(dataset.tags || []).slice(0, 4).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <Link to={`/datasets/${dataset._id}`} className="cta-link">
        Open Dataset
      </Link>
    </motion.article>
  );
}
