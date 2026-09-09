# Polaris-X

Polaris-X is a high-performance Antarctic Navigation Intelligence dashboard. It visualizes real-time USNIC iceberg telemetry, generates A* optimal shipping routes avoiding high-risk ice zones, and renders real-time environmental layers (Sea Ice, Risk, Ocean Currents, Wind, and Visibility) using a 3D Cesium globe.

## Prerequisites

To run this project, you need:
- **Node.js** (v18 or higher)
- **Python** (3.10 or higher)
- A **Cesium Ion API Token** (for the 3D globe and terrain data)

---

## Setup Instructions

### 1. Backend Setup (FastAPI)

The backend handles the A* routing engine, iceberg telemetry parsing, and layer image generation.

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   - **Windows:** `python -m venv .venv` then `.\.venv\Scripts\activate`
   - **Mac/Linux:** `python3 -m venv .venv` then `source .venv/bin/activate`
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the backend server:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
   The API will now be running at `http://localhost:8000`.

### 2. Frontend Setup (Next.js & Cesium)

The frontend provides the 3D visualizer and UI.

1. Open a **new** terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Setup your environment variables:
   - Create a file named `.env.local` inside the `frontend` folder.
   - Add your Cesium Ion token:
     ```env
     NEXT_PUBLIC_CESIUM_ION_TOKEN="your_cesium_ion_token_here"
     ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   The UI will now be available at `http://localhost:3000`.

---

## Usage
Once both the backend and frontend are running:
1. Open `http://localhost:3000` in your web browser.
2. The globe will initialize and center on Antarctica.
3. Use the **ICEBERGS** tab to track individual icebergs.
4. Use the **ROUTE** tab to generate optimal risk-aware ship routes between two coordinates.
5. Use the **LAYERS** tab to toggle various environmental intelligence layers directly onto the globe.
