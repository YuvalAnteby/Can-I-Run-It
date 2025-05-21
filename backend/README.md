# 🖥️ Can I Run It — Backend

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-blue" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-%2300C7B7?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/MongoDB-%2347A248?logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg" alt="License: MPL 2.0">
</p>

This is the **backend** for **Can I Run It**, a full-stack app that checks if a selected game is playable on a given
hardware setup.
<br>
The backend is built with **FastAPI**, uses **MongoDB** to store performance data, and exposes a REST API used by the
frontend.

---

## ⚙️ Tech Stack

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Database**: MongoDB (via Motor - async MongoDB driver)
- **Schema Validation**: Pydantic
- **Containerization**: Docker
- **CI/CD:** GitHub Actions

---

## 🌟 Features

- RESTful API for querying hardware, games and performance
- All major queries use indexed MongoDB fields for performance
- Python scripts for seeding games, hardware and requirements
- Interactive API docs via Swagger UI at [`http://localhost:8000/docs`](http://localhost:8000/docs)
- **Test coverage** for core routes using `pytest`, `AsyncMock`, and `httpx.AsyncClient` (valid/invalid inputs)
- Containerized using Docker and docker-compose for the app, tests and MongoDB
- Continuous Integration (CI) by using GitHub Actions

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

## 🐳 Running Locally

### Prerequisites

> ⚠️ The database is not publicly seeded, to test locally, you'll need access to the private MongoDB instance.
- Docker & Docker Compose
- Python 3.11+ (for non-Dockerized devs)
- MongoDB with data

### Clone and build the repo
```bash
git clone https://github.com/YuvalAnteby/Can-I-Run-It.git
cd Can-I-Run-It
docker compose build
```

### Run the backend and MongoDB 
```bash
docker compose up backend
```

API:  [`http://localhost:8000`](http://localhost:8000)<br />
Docs: [`http://localhost:8000/docs`](http://localhost:8000/docs)

---

## 📄 License

This project is licensed under the Mozilla Public License Version 2.0.<br />
See the [LICENSE](https://github.com/YuvalAnteby/Can-I-Run-It/blob/main/LICENSE) file for details.

---

## 🔗 Related

- [Main README](https://github.com/YuvalAnteby/Can-I-Run-It)
- [Frontend (React)](https://github.com/YuvalAnteby/Can-I-Run-It/tree/main/frontend)
