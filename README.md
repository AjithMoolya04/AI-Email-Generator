# AI Email Generator

A full-stack web application that generates professional, casual, formal, or friendly emails using AI. It consists of a FastAPI backend that communicates with multiple AI providers and MongoDB, along with a modern Next.js (React) frontend.

---

# Project Structure


```text
AI-Email-Generator/
├── backend/    # FastAPI application, database handlers, AI services
└── frontend/   # Next.js App Router frontend

---

# Prerequisites

Ensure the following are installed on your system:

- Node.js (v18 or later)
- Python (3.10 or later)
- MongoDB (running locally or using a MongoDB Atlas connection)

---

# Backend Setup

### 1. Navigate to the backend directory

```bash
cd backend
```

### 2. Create and activate a virtual environment

**Windows (PowerShell)**

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file inside the `backend` directory based on `.env.example`.

```env
# Gemini API Configuration
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

# OpenAI API Configuration (Optional)
OPENAI_API_KEY=your-openai-api-key

# Groq API Configuration (Optional)
GROQ_API_KEY=your-groq-api-key

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=email_generator
MONGODB_COLLECTION=prompt_history

# CORS
CORS_ORIGINS=http://localhost:3000
```

### 5. Run the backend server

```bash
uvicorn app.main:app --reload --port 8000
```

The backend API will be available at:

```
http://127.0.0.1:8000
```

---

# Frontend Setup

### 1. Navigate to the frontend directory

```bash
cd ../frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file inside the `frontend` directory.

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

### 4. Run the development server

```bash
npm run dev
```

Open your browser and visit:

```
http://localhost:3000
```

---

# Features

- **Multi-Model Support**
  - Google Gemini AI
  - OpenAI (GPT models)
  - Groq (Llama/Mixtral models)

- **Custom Writing Tones**
  - Professional
  - Formal
  - Friendly
  - Casual

- **Quick Copy**
  - Copy the generated subject and email body with a single click.

- **Generation History**
  - Browse previously generated emails stored in MongoDB.

- **System Status**
  - View backend health and database connectivity indicators.

- **Responsive UI**
  - Built with Next.js, React, and Tailwind CSS for desktop and mobile devices.

---

# Verification

After starting both the backend and frontend:

1. Open **http://localhost:3000**
2. Enter an email prompt.
3. Select an AI model (Gemini, OpenAI, or Groq).
4. Choose a writing tone.
5. Click **Generate Email**.
6. Copy the generated email if needed.
7. Verify that generation history appears (when MongoDB is connected).
8. Confirm that the backend and database status indicators are connected.

---

# Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend

- FastAPI
- Python
- Google Gemini API
- OpenAI API
- Groq API
- MongoDB

---

# API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate-email` | Generate an email using the selected AI model |
| GET | `/api/history` | Retrieve email generation history |


## Deployment

- **Frontend (Vercel):** https://ai-email-generator-livid.vercel.app/
- **Backend (Render):** https://ai-email-generator-uwmh.onrender.com
- **Database:** MongoDB Atlas

