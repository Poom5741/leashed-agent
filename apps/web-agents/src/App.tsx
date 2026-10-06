import { Link, Route, Routes } from "react-router-dom";
import { AgentsListPage } from "./pages/AgentsListPage.js";
import { PassbookPage } from "./pages/PassbookPage.js";
import { ServicesPage } from "./pages/ServicesPage.js";
import "./styles.css";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/agents" className="brand">Leashed Agent Platform</Link>
        <nav>
          <Link to="/agents">Agents</Link>
          <Link to="/services">Services</Link>
        </nav>
      </header>
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