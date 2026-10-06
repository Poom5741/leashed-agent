import { Link, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AgentsListPage } from "./pages/AgentsListPage.js";
import { PassbookPage } from "./pages/PassbookPage.js";
import { ServicesPage } from "./pages/ServicesPage.js";
import "./styles.css";

const TITLES: Record<string, string> = {
  "/": "Leashed Agent Platform — /agents",
  "/agents": "Leashed Agent Platform — /agents",
  "/services": "Leashed Agent Platform — /services",
};

export default function App() {
  const location = useLocation();
  useEffect(() => {
    document.title = TITLES[location.pathname] ?? "Leashed Agent Platform";
  }, [location.pathname]);

  return (
    <div className="app">
      <span className="ruler" aria-hidden="true" />
      <span className="crosshair-bl" aria-hidden="true" />
      <span className="crosshair-br" aria-hidden="true" />

      <div className="main">
        <div className="head-bar">
          <span>
            <span className="trust">TRUST LAYER · v2</span>
            &nbsp; Leashed Agent Platform
          </span>
          <span className="right">
            <Link to="/agents" style={{ color: "var(--blue-pale)", marginRight: 18 }}>
              agents
            </Link>
            <Link to="/services" style={{ color: "var(--blue-pale)" }}>
              services
            </Link>
          </span>
        </div>

        <Routes>
          <Route path="/" element={<AgentsListPage />} />
          <Route path="/agents" element={<AgentsListPage />} />
          <Route path="/agents/:keyId" element={<PassbookPage />} />
          <Route path="/services" element={<ServicesPage />} />
        </Routes>

        <div className="page-foot" style={{ marginTop: 12 }}>
          <span>leashed-agent · v2 · draft 002</span>
          <span className="trust">trust layer · verifiable</span>
        </div>
      </div>
    </div>
  );
}