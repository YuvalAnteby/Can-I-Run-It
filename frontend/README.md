# 🎮 Can I Run It — Frontend

<p align="center">
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React">
  <img src="https://img.shields.io/badge/MUI-5-blue?logo=mui&logoColor=white" alt="Material UI">
  <img src="https://img.shields.io/badge/Axios-HTTP-yellow" alt="Axios">
  <img src="https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg" alt="License: MPL 2.0">
</p>

This is the **frontend** for **Can I Run It**, a React app that lets users check game compatibility based on 
hardware and visual settings. 
<br>
The frontend connects to a FastAPI backend that provides game and performance data.


---

## ⚙️ Tech Stack

- **React** (with functional components and hooks)
- **Axios** for API calls
- **React Router** for routing
- **Material UI (MUI)** for component styling
- **JavaScript** 

---

## 🌟 Features

- Game list display with game banners and cards
- Hardware selection UI with autocomplete inputs
- Connected to backend routes for real time compatibility
- Integration with backend API to fetch:
    - Available games
    - Hardware options
    - Requirement check results

---

## 🐳 Running Locally

> ⚠️ Requires the backend to be running with access to the local/private MongoDB.

### Prerequisites

- Node.js (v18+ recommended)
- Backend server running locally ([setup instructions here](https://github.com/YuvalAnteby/Can-I-Run-It/tree/main/backend))

### Clone and build the repo

```bash
git clone https://github.com/YuvalAnteby/Can-I-Run-It.git
cd Can-I-Run-It
docker compose build
```

### Run in development mode
Runs React, allows live reloading.
```bash
docker compose up react_dev
```

### Run in production mode
Runs React as static files.
```bash
docker compose up react_prod
```

The app will be available at: http://localhost:3000

---

## 📄 License
This project is licensed under the Mozilla Public License Version 2.0.<br />
See the [LICENSE](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/LICENSE) file for details.

---

## 🔗 Related

- [Backend (FastAPI)](https://github.com/YuvalAnteby/Can-I-Run-It/tree/main/backend)
