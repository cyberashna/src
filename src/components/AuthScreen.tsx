import React, { useState } from "react";
import { supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup" | "forgot";

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      onAuthSuccess();
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setMessage("Account created successfully! You can now sign in.");
      setMode("signin");
      setPassword("");
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset email sent! Check your inbox.");
    }

    setLoading(false);
  };

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      padding: "20px",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    }}>
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "12px",
        boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
        width: "100%",
        maxWidth: "400px"
      }}>
        <h1 style={{
          textAlign: "center",
          marginBottom: "30px",
          color: "#333",
          fontSize: "28px"
        }}>
          Habit Planner
        </h1>

        {mode === "signin" && (
          <form onSubmit={handleSignIn}>
            <h2 style={{ marginBottom: "20px", fontSize: "20px", color: "#555" }}>Sign In</h2>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", color: "#666" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px"
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", color: "#666" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px"
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: "10px",
                marginBottom: "16px",
                background: "#fee",
                color: "#c33",
                borderRadius: "6px",
                fontSize: "14px"
              }}>
                {error}
              </div>
            )}

            {message && (
              <div style={{
                padding: "10px",
                marginBottom: "16px",
                background: "#efe",
                color: "#3a3",
                borderRadius: "6px",
                fontSize: "14px"
              }}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: "#667eea",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "16px",
                fontWeight: "500",
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: "12px"
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setMessage("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#667eea",
                  cursor: "pointer",
                  fontSize: "14px",
                  textDecoration: "underline",
                  marginBottom: "8px"
                }}
              >
                Forgot your password?
              </button>
              <div>
                <span style={{ color: "#666", fontSize: "14px" }}>Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setMessage("");
                    setPassword("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#667eea",
                    cursor: "pointer",
                    fontSize: "14px",
                    textDecoration: "underline"
                  }}
                >
                  Sign up
                </button>
              </div>
            </div>
          </form>
        )}

        {mode === "signup" && (
          <form onSubmit={handleSignUp}>
            <h2 style={{ marginBottom: "20px", fontSize: "20px", color: "#555" }}>Create Account</h2>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", color: "#666" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px"
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", color: "#666" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px"
                }}
              />
              <small style={{ color: "#999", fontSize: "12px" }}>
                Minimum 6 characters
              </small>
            </div>

            {error && (
              <div style={{
                padding: "10px",
                marginBottom: "16px",
                background: "#fee",
                color: "#c33",
                borderRadius: "6px",
                fontSize: "14px"
              }}>
                {error}
              </div>
            )}

            {message && (
              <div style={{
                padding: "10px",
                marginBottom: "16px",
                background: "#efe",
                color: "#3a3",
                borderRadius: "6px",
                fontSize: "14px"
              }}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: "#667eea",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "16px",
                fontWeight: "500",
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: "12px"
              }}
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <span style={{ color: "#666", fontSize: "14px" }}>Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                  setMessage("");
                  setPassword("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#667eea",
                  cursor: "pointer",
                  fontSize: "14px",
                  textDecoration: "underline"
                }}
              >
                Sign in
              </button>
            </div>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleForgotPassword}>
            <h2 style={{ marginBottom: "20px", fontSize: "20px", color: "#555" }}>Reset Password</h2>

            <p style={{ color: "#666", fontSize: "14px", marginBottom: "20px" }}>
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", color: "#666" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px"
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: "10px",
                marginBottom: "16px",
                background: "#fee",
                color: "#c33",
                borderRadius: "6px",
                fontSize: "14px"
              }}>
                {error}
              </div>
            )}

            {message && (
              <div style={{
                padding: "10px",
                marginBottom: "16px",
                background: "#efe",
                color: "#3a3",
                borderRadius: "6px",
                fontSize: "14px"
              }}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: "#667eea",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "16px",
                fontWeight: "500",
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: "12px"
              }}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                  setMessage("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#667eea",
                  cursor: "pointer",
                  fontSize: "14px",
                  textDecoration: "underline"
                }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
