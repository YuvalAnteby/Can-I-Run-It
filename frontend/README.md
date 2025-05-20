# 🎮 Can You Run It — Frontend

<p align="center">
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React">
  <img src="https://img.shields.io/badge/MUI-5-blue?logo=mui&logoColor=white" alt="Material UI">
  <img src="https://img.shields.io/badge/Axios-HTTP-yellow" alt="Axios">
  <img src="https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg" alt="License: MPL 2.0">
</p>

This is the frontend for **Can You Run It**, a performance compatibility checker for PC games. Built with **React** and **Material UI**, it lets users explore games and test whether their current or selected hardware can run them at desired settings (e.g., resolution and graphics quality).

> 🔗 This app connects to the [backend API](https://github.com/YuvalAnteby/CanYouRunIt-Backend), which must be running locally with access to the private database for full functionality.

---

## 🚧 Project Status

> 🛠️ **Currently in active development**

- The app is functional for demo/testing purposes but incomplete.
- The backend and database are required for API functionality and are not publicly available at this time.
- UI and feature work is ongoing.

---

## 📚 Table of Contents

- [Tech Stack](#-tech-stack)
- [Features](#-features)
    - [Implemented](#-implemented)
    - [Upcoming](#-upcoming)
- [Running Locally](#-running-locally)
- [Screenshots](#-screenshots)
- [Contributing](#-contributing)
- [License](#-license)
- [Related Projects](#-related-projects)

---

## ⚙️ Tech Stack

- **React** (with functional components and hooks)
- **Axios** for API calls
- **React Router** for routing
- **Material UI (MUI)** for component styling
- **JavaScript** 

---

## 🌟 Features

### ✅ Implemented

- Game list display with game banners and cards
- Hardware selection UI (CPU, GPU, RAM) using MUI components
- Autocomplete-style search for hardware inputs
- Compatibility check against selected game and hardware configuration
- Integration with backend API to fetch:
    - Available games
    - Hardware options
    - Requirement check results

### 🔜 Upcoming

- Game search and filtering
- Game detail view (with price, genre, etc.)
- User accounts and saved configurations
- Performance optimization and lazy loading
- Responsive design polish
- Light/dark theme toggle
- Fallback messaging powered by the backend's LLM API call to provide estimated guidance (e.g. “Likely playable at 60 FPS on 1080p High settings ✅”)

---

## 🐳 Running Locally

> ⚠️ Requires the backend to be running with access to the local/private MongoDB.

### Prerequisites

- Node.js (v18+ recommended)
- Backend server running locally ([setup instructions here](https://github.com/YuvalAnteby/CanYouRunIt-Backend))

### Setup

```bash
git clone https://github.com/YuvalAnteby/can-you-run-it-frontend.git
cd can-you-run-it-frontend
npm install
npm start
```
The app will run at http://localhost:3000

---

## 🖼️ Screenshots
Coming soon! 🚧

---

## 🤝 Contributing
If you'd like to contribute, feel free to fork the project and open a pull request.<br/>
Feedback and feature suggestions are always welcome!

---

## 📄 License
This project is licensed under the Mozilla Public License Version 2.0.<br />
See the [LICENSE](https://github.com/YuvalAnteby/can-you-run-it-frontend/blob/main/LICENSE) file for details.

---

## 🔗 Related Projects

- [Backend Repo (FastAPI)](https://github.com/YuvalAnteby/CanYouRunIt-Backend)

---
