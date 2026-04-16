import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

export default function AuthPage({ mode = "login" }) {
  const isLogin = mode === "login";
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => {
    const rememberedEmail = isLogin ? (localStorage.getItem("dataverse:lastEmail") || "") : "";
    return {
      name: "",
      email: rememberedEmail,
      password: "",
      rememberMe: true
    };
  });

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      if (isLogin) {
        await login({ email: form.email, password: form.password, rememberMe: form.rememberMe });
        if (form.rememberMe) {
          localStorage.setItem("dataverse:lastEmail", form.email);
        } else {
          localStorage.removeItem("dataverse:lastEmail");
        }
      } else {
        await register({ name: form.name, email: form.email, password: form.password });
        await login({ email: form.email, password: form.password, rememberMe: true });
      }
      navigate("/");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Authentication failed");
    }
  };

  return (
    <section className="auth-grid">
      <motion.div
        className="auth-hero"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55 }}
      >
        <img src="/images/data-orb.svg" alt="Data visualization sphere" />
        <h1>Collaborative Data Exchange</h1>
        <p>Upload, discover, request access, and improve research data together in real time.</p>
      </motion.div>

      <motion.form className="auth-card" onSubmit={onSubmit} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <h2>{isLogin ? "Welcome back" : "Create account"}</h2>
        {!isLogin && (
          <label>
            Full name
            <input name="name" value={form.name} onChange={onChange} autoComplete="name" required />
          </label>
        )}
        <label>
          Email
          <input type="email" name="email" value={form.email} onChange={onChange} autoComplete="email username" required />
        </label>
        <label>
          Password
          <input type="password" name="password" value={form.password} onChange={onChange} autoComplete={isLogin ? "current-password" : "new-password"} required minLength={6} />
        </label>
        {isLogin && (
          <label className="check-row">
            <input type="checkbox" name="rememberMe" checked={form.rememberMe} onChange={onChange} />
            Keep me signed in
          </label>
        )}
        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="primary-btn">
          {isLogin ? "Sign In" : "Register"}
        </button>

        <p className="switch-note">
          {isLogin ? "Need an account?" : "Already registered?"}{" "}
          <Link to={isLogin ? "/register" : "/signin"}>{isLogin ? "Create one" : "Sign In"}</Link>
        </p>
      </motion.form>
    </section>
  );
}
