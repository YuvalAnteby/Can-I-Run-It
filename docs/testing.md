# Testing

Most tests will run during the CI pipeline, the following will regard testing locally
Tests results will be found in `/infra/backend-test-results/`

---

## 📚 Table of Contents

- [Prerequisites](#prerequisites)
- [Backend tests with Docker](#testing-backend-with-docker)
  - [Running all tests](#running-all-tests)
  - [Running specific tests](#running-specific-tests)

---

### Prerequisites

Clone the repo and navigate to root folder

```bash
git clone https://github.com/YuvalAnteby/Can-I-Run-It.git
cd Can-I-Run-It
```

---

### Testing backend with Docker

Ensure Docker is installed and running.

#### Running all tests

```bash
docker compose -f ./infra/docker-compose.tests.yml run backend-test --build --abort-on-container-exit  
```

#### Running specific tests

```bash
# Building the image
docker compose -f ./infra/docker-compose.tests.yml build backend-test

# Run smoke tests
docker compose -f infra/docker-compose.tests.yml run -e TEST_TYPE=smoke backend-test

# Run unit tests
docker compose -f infra/docker-compose.tests.yml run -e TEST_TYPE=unit backend-test

# Run integration tests
docker compose -f infra/docker-compose.tests.yml run -e TEST_TYPE=integration backend-test

# Run end-to-end tests
docker compose -f infra/docker-compose.tests.yml run -e TEST_TYPE=e2e backend-test

# Stop and remove all test containers and networks
docker compose -f infra/docker-compose.tests.yml down -v
```

---
