import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import VesselAnalysis from "./pages/VesselAnalysis";

import HeatmapPage from "./pages/HeatmapPage";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<VesselAnalysis />} />
          <Route path="/heatmap" element={<HeatmapPage />} />
        </Routes>

      </Layout>
    </BrowserRouter>
  );
}

export default App;
