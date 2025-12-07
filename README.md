# 🎮 Can I Run It

<p align="center"> 
<img src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=white" alt="Python">
<img src="https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS">
<img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI"> 
<img src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB" alt="React">
<img src="https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
<br>
<img src="https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg" alt="License: MPL 2.0"> 
</p>

**Can I Run It** is a full-stack web app that checks whether your PC can run a selected game based on your hardware
specs and desired settings.
<br>
This monorepo contains the backend (NestJS + FastAPI) and the frontend (React (TS) + MUI + CSS).

---

## 🚧 Project Status

> 🛠️ **Currently in active development**

- The backend is functional for local use during development.
- The database is private and not publicly seeded, so local testing requires coordination.
- Many planned features are being actively built.

---

## 📚 Table of Contents

- [Tech Stack](#-tech-stack)
- [Running Locally](#-running-locally)
- [License](#-license)
- [Related](#-related)
<!-- - [Features](#-features)
    - [Implemented](#-implemented)
    - [Upcoming](#-upcoming)
-->
---

## ⚙️ Tech Stack

#### Backend:
- **Languages:** TypeScript, Python 3.11+
- **Frameworks:** NestJS, FastAPI
- **Database:** Postgres (Via TypeORM)
- **Testing:** Jest
- **Containerization:** Docker & Docker Compose
- **CI/CD:** GitHub Actions 

#### Frontend:
- **Language:** TypeScript
- **Frameworks:** React
- **Routing & API calls:** React Router, Axios 
- **Styling:** Material UI (MUI), CSS

---

<!--
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
-->

## 🐳 Running Locally

### Prerequisites
> ⚠️ Backend requires the seeded Postgres DB to work fully or CSV file to seed locally
- Docker & Docker Compose [Install Docker](https://www.docker.com/products/docker-desktop/)
- NodeJS & npm

### Clone the repo
```bash
git clone https://github.com/YuvalAnteby/Can-I-Run-It.git
cd Can-I-Run-It
```
### Run in development mode
Runs the backend, Postgres and React apps, allows live reloading. remove `-d` to see logs live.

```bash
npm run docker:dev
```
<!--
### Run in production mode
Runs the backend, MongoDB and React apps as static files.
```bash
npm run docker:prod
```
-->
# Stop everything
```bash
npm run docker:down
```

### Access the apps (default ports)
- Frontend: http://localhost:3000
- Backend:  http://localhost:4000
<!-- - API docs:  http://localhost:4000/docs -->
- For more info see [backend/README.md](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/backend/README.md) 
and [frontend/README.md](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/frontend/README.md)

---
<!--
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
-->

---

## 📄 License
This project is licensed under the Mozilla Public License Version 2.0.<br />
See the [LICENSE](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/LICENSE) file for details.

---

## 🔗 Related
- [Backend details](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/backend/README.md)
- [Frontend details](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/frontend/README.md)
