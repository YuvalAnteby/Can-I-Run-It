# Project: Can I Run It

## Project Overview

This is a full-stack web application called "Can I Run It" that checks whether a user's PC can run a selected game based on their hardware specs and desired settings.

The project is a monorepo with a `backend` and a `frontend` directory.

### Backend

The backend is a NestJS application written in TypeScript. It also uses FastAPI for some Python-based functionality. It uses a Postgres database via TypeORM.

### Frontend

The frontend is a React application written in TypeScript, using Material UI for styling.

### Infrastructure

The project is containerized using Docker and Docker Compose. There are Dockerfiles for both the backend and frontend, and a docker-compose.yml file for setting up the development environment.

## Building and Running

### Prerequisites

*   Docker & Docker Compose
*   NodeJS & npm

### Development

To run the application in development mode, run the following command from the root of the project:

```bash
npm run docker:dev
```

This will start the backend, frontend, and a Postgres database in Docker containers.

The services will be available at the following URLs:

*   **Frontend:** http://localhost:3000
*   **Backend:** http://localhost:4000

To stop the services, run:

```bash
npm run docker:down
```

### Production

To run the application in production mode, run the following command from the root of the project:

```bash
npm run docker:prod
```

## Development Conventions

### Backend

*   The backend is a NestJS application.
*   Code should be written in TypeScript.
*   Linting is done with ESLint, and can be run with `npm run lint` in the `backend` directory.
*   Tests are written with Jest and can be run with `npm test` in the `backend` directory.

### Frontend

*   The frontend is a React application.
*   Code should be written in TypeScript.
*   The project was bootstrapped with Create React App.
*   Tests are written with React Testing Library and can be run with `npm test` in the `frontend` directory.
