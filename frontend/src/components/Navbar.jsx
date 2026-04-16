import { Link, NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/signin");
  };

  return (
    <motion.header
      className="main-nav"
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <Link className="brand" to="/">
        DataVerse Hub
      </Link>

      {isAuthenticated ? (
        <nav className="nav-links">
          <NavLink to="/">Explore</NavLink>
          <NavLink to="/upload">Upload</NavLink>
          <span className="chip">{user?.name}</span>
          <button type="button" className="ghost-btn" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      ) : (
        <nav className="nav-links">
          <NavLink to="/">Explore</NavLink>
          <NavLink to="/signin">Sign In</NavLink>
          <NavLink to="/register">Register</NavLink>
        </nav>
      )}
    </motion.header>
  );
}
