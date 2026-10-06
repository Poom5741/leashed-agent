import { NavLink, Route, Routes } from "react-router-dom";
import { AgentsListPage } from "./pages/AgentsListPage.js";
import { PassbookPage } from "./pages/PassbookPage.js";
import { ServicesPage } from "./pages/ServicesPage.js";
import "./styles.css";

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <NavLink to="/" end className="brand">
          <span className="brand-mark">L</span>
          <span>Leashed Agent Platform</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/agents" className={({ isActive }) => (isActive ? "active" : "")}>
            Agents
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => (isActive ? "active" : "")}>
            Services
          </NavLink>
        </nav>
        <p className="tagline">
          <strong>Trust layer for AI agents.</strong>
          <br />
          Leash, receipts, and independent audit — enforced on-chain.
        </p>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<AgentsListPage />} />
          <Route path="/agents" element={<AgentsListPage />} />
          <Route path="/agents/:keyId" element={<PassbookPage />} />
          <Route path="/services" element={<ServicesPage />} />
        </Routes>
      </main>
    </div>
  );
}