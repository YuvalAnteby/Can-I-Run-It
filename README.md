# 🎮 Can I Run It
<p align="center"> 
<img src="https://img.shields.io/badge/Python-3.11-blue" alt="Python">
<img src="https://img.shields.io/badge/FastAPI-%2300C7B7?logo=fastapi&logoColor=white" alt="FastAPI"> 
<img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React"> 
<img src="https://img.shields.io/badge/MUI-5-blue?logo=mui&logoColor=white" alt="Material UI">
<img src="https://img.shields.io/badge/Axios-HTTP-yellow" alt="Axios">
<img src="https://img.shields.io/badge/MongoDB-%2347A248?logo=mongodb&logoColor=white" alt="MongoDB">
<br>
<img src="https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg" alt="License: MPL 2.0"> 
</p>

**Can I Run It** is a full-stack web app that checks whether your PC can run a selected game based on your hardware
specs and desired settings.
<br>
This monorepo contains the backend (built with Python, FastAPI, MongoDB) and the frontend (JavaScript, React + MUI).

---

## 🚧 Project Status

> 🛠️ **Currently in active development**

- The backend is functional for local use during development.
- The database is private and not publicly seeded, so local testing requires coordination.
- Many planned features are being actively built.

---

## 📚 Table of Contents

- [Tech Stack](#-tech-stack)
- [Features](#-features)
    - [Implemented](#-implemented)
    - [Upcoming](#-upcoming)
- [Running Locally](#-running-locally)
- [Contributing](#-contributing)
- [License](#-license)
- [Related](#-related)

---

## ⚙️ Tech Stack
#### Frontend:
- **Language:** JavaScript
- **Frameworks:** React
- **Routing & API calls:** React Router, Axios 
- **Styling:** Material UI (MUI)

#### Backend:
- **Language:** Python 3.11+
- **Frameworks:** FastAPI
- **Database:** MongoDB (via Motor - async MongoDB driver)
- **Schema Validation:** Pydantic
- **Testing:** Pytest, AsyncMock
- **Containerization:** Docker & Docker Compose
- **CI/CD:** GitHub Actions 

---

## 🌟 Features

### ✅ Implemented

- Core Functionality:
  - Hardware selectors (CPU, GPU, RAM)
  - Game cards with interactive details page 
  - Compatibility checker based on MongoDB performance data
- Backend:
  - FastAPI backend with documented routes (Swagger)
  - Unit tests and continuous integration with GitHub Actions
  - Dockerized setup for both local and production environments
  - Python scripts to add games, hardware and performance data to MongoDB

- Frontend:
  - React components styled with MUI
  - API integration via Axios and React Router

### 🔜 Upcoming
- User accounts using OAuth
- Game pricing from external APIs (e.g. Steam, Epic)
- LLM fallback when no data exists
- Performance optimizations (lazy load, caching)
- UI polish & support for different screen sizes
- Basic ML model for hardware upgrade recommendations, based on recorded data

--- 

## 🐳 Running Locally

### Prerequisites
> ⚠️ Backend requires the seeded MongoDB to work fully
- Docker & Docker Compose
- Node.js
- Python 3.11+

### Clone the repo
```bash
git clone https://github.com/YuvalAnteby/Can-I-Run-It.git
cd Can-I-Run-It
```
### Run in development mode
Runs the backend, MongoDB and React apps, allows live reloading. remove `-d` to see logs live.
```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```
<!---
### Run in production mode
Runs the backend, MongoDB and React apps as static files.
```bash
docker compose -f infra/docker-compose.dev.yml up -d
```
--->

### Access the apps (default ports)
- Frontend: http://localhost:3000
- Backend:  http://localhost:4000
- API docs:  http://localhost:4000/docs
- For more info see [backend/README.md](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/backend/README.md) 
and [frontend/README.md](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/frontend/README.md)

---

## 🖼️ Screenshots
<p float="left">
<img src="screenshots/home%20page%20desktop.png" alt="main game selection">
</p>

<p float="left">
<img src="screenshots/hardware autocomplete.png" width="48%" alt="main game selection">
<img src="screenshots/best FPS case.png" width="48%" alt="best fps case">
</p>

> Want to see more? [Click here for all screenshots](./screenshots)

---

## 🤝 Contributing
If you'd like to contribute, feel free to fork the project and open a pull request.<br/>
Feedback and feature suggestions are always welcome!

---

## 📄 License
This project is licensed under the Mozilla Public License Version 2.0.<br />
See the [LICENSE](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/LICENSE) file for details.

---

## 🔗 Related
- [Backend details](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/backend/README.md)
- [Frontend details](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/frontend/README.md)
