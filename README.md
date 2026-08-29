# SetSum - Freelance Earnings & Shift Tracker

SetSum is an AI-ready SaaS platform built for freelancers to track scheduled shifts, calculate gross & net wages dynamically based on union rate agreements, manage expenses, and export tax summaries.

## Project Structure
This repository is organized as a monorepo:
* **`data/`**: Location of the local SQLite database (`setsum.db`).
* **`mcp/`**: Stdio-based Model Context Protocol (MCP) server for Antigravity AI agent integration.
* **`server/`**: Express REST API backend and programmatic verification test suite.
* **`web/`**: Premium glassmorphic static frontend dashboard assets (HTML, CSS, JS).
* **`api/`**: Serverless function handlers for Vercel deployment.

## Getting Started
To run the server locally:
```bash
npm install
npm start
```
The web dashboard will be accessible at `http://localhost:3000`.

To run integration tests:
```bash
npm test
```

## Deployment
This project is configured for serverless deployment on Vercel connected to a Supabase PostgreSQL database.
Ensure you have configured `DATABASE_URL` in your Vercel Project Settings.
