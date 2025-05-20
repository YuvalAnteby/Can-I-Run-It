# 🖥️ Can You Run It — Backend

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-blue" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-%2300C7B7?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/MongoDB-%2347A248?logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg" alt="License: MPL 2.0">
</p>

**Can You Run It** is a backend service built with **FastAPI** that powers a performance compatibility checker for PC
games. <br />It helps users determine whether their system can run specific games based on their hardware — CPU, GPU,
and
RAM — and desired settings. <br />This repository contains the backend API, database models, and core logic to support
the
frontend interface.

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
- [Example Endpoints](#-example-endpoints)
- [Running Locally](#-running-locally-developers-only)
- [Contributing](#-contributing)
- [License](#-license)
- [Related Projects](#-related-projects)

---

## ⚙️ Tech Stack

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Database**: MongoDB (via Motor - async MongoDB driver)
- **Schema Validation**: Pydantic
- **Containerization**: Docker

---

## 🌟 Features

### ✅ Implemented

#### API Endpoints

- Fetching all **GPUs**, **CPUs**
- Filter GPUs/CPUs by **brand** or **models**
- Retrieve a list of all **games**
- Query **game requirements** using:
    - CPU
    - GPU
    - RAM
    - Game
    - Resolution
    - Graphics preset
    - (Optional) FPS target
- All major queries use indexed MongoDB fields for performance
- Interactive API docs via Swagger UI at [`http://localhost:8000/docs`](http://localhost:8000/docs)
- **Test coverage** for core routes using `pytest`, `AsyncMock`, and `httpx.AsyncClient` (valid/invalid inputs)
- Containerized using Docker and docker-compose for the app, tests and MongoDB
- Continuous Integration (CI) by using GitHub Actions

#### Database & Scripts

- Python scripts to:
    - Add **games** to the database
    - Add **GPUs/CPUs** to the hardware collection
    - Add **performance requirements** for specific hardware-game combinations
- All scripts use **Pydantic** models for validation
- Consistent MongoDB structure with FastAPI integration via Motor

### 🔜 Upcoming
- Public deployment 
- User registration and login
- User-specific features (preferences, history, saved hardware profiles and more)
- Game price display using third-party APIs (Steam, Epic, etc.)
- Filtering and search improvements (FPS, genre, release date, etc.)
- Hardware upgrade suggestions based on requirement
- LLM-based fallback: When no matching performance data exists for a given hardware + game + settings query, call a connected LLM (e.g. OpenAI GPT) to generate a short estimated performance summary.

---

## 📁 Example Endpoints

```python
@router.get("/game-requirements/", response_model=Dict[str, Any])
async def get_requirement(...)


@router.get("/gpus")
async def get_all_gpus()


@router.get("/gpus/brand")
async def get_gpu_by_brand(brand: str)
```

* You can explore the full API documentation locally via FastAPI’s built-in Swagger UI at http://localhost:8000/docs.

---

## 🐳 Running Locally (Developers Only)

> ⚠️ The database is not publicly seeded, to test locally, you'll need access to the private MongoDB instance.<br />
> DM me if you'd like to contribute or test.

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for non-Dockerized devs)
- MongoDB with data 

#### With Docker

```bash
git clone https://github.com/YuvalAnteby/CanYouRunIt-Backend.git
cd CanYouRunIt-Backend
docker-compose up --build
```

FastAPI will be available at [`http://localhost:8000`](http://localhost:8000)<br />
and the interactive docs at [`http://localhost:8000/docs`](http://localhost:8000/docs)

---

## 🤝 Contributing

Interested in helping out or using the backend for your own projects? Feel free to open an issue or contact me directly!

---

## 📄 License

This project is licensed under the Mozilla Public License Version 2.0.<br />
See the [LICENSE](https://github.com/YuvalAnteby/CanYouRunIt-Backend/blob/main/LICENSE) file for details.

---

## 🔗 Related Projects

- [Frontend Repo (React)](https://github.com/YuvalAnteby/can-you-run-it-frontend)

---
