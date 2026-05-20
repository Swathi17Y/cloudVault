# CloudVault ☁️

A modern, full-stack, distributed file storage platform built to handle resilient chunked file uploads, dynamic folder management, and secure file sharing.

CloudVault provides an elegant, glassmorphic UI alongside a robust backend capable of processing massive file uploads without blocking the main API thread.

## 🚀 Features

- **Authentication System**: Secure user registration, login, and JWT-based session management (Access & Refresh tokens).
- **Resilient Chunked Uploads**: Files are sliced into 5MB chunks and uploaded concurrently. A background worker node safely assembles the chunks on the server.
- **Smart Storage Deduplication**: SHA-256 hashing detects identical files. If a duplicate is uploaded, it instantly references the existing physical file in MinIO, saving massive amounts of storage space.
- **Advanced File Management**: 
  - Create infinite levels of nested folders using Materialized Paths.
  - Move, rename, and recursively delete files and folders.
  - Interactive Context Menus (right-click) for quick actions.
  - Toggle between Grid and List views.
- **Secure File Access & Sharing**: Generate secure, public share links or securely download files using S3 Presigned URLs.
- **Premium UI/UX**:
  - High-end glassmorphic UI with dynamic light/dark/system theme toggling.
  - Real-time upload progress tracking with speed and ETA calculations.
  - Dynamic file-type icons and live storage utilization meters.

## 🛠️ Technology Stack

- **Frontend**: React.js (Vite), React Router, Lucide-React, Vanilla CSS
- **Backend API**: Node.js, Express.js
- **Database**: MongoDB (via Mongoose)
- **Cache & Message Broker**: Redis
- **Background Processing**: BullMQ (running on a dedicated Worker container)
- **Object Storage**: MinIO (S3-compatible local storage)
- **Infrastructure**: Docker & Docker Compose

## ⚙️ Getting Started (Local Development)

The entire application is fully containerized and can be launched with a single command.

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Swathi17Y/cloudVault.git
   cd cloudVault
   ```

2. **Environment Configuration:**
   Copy the `.env.example` file to `.env` in the root directory.
   ```bash
   cp .env.example .env
   ```
   *(The default values in the `.env` file are already perfectly configured for local Docker development).*

3. **Start the containers:**
   ```bash
   docker-compose up -d
   ```

4. **Access the Application:**
   Once all containers are healthy, access the platform at:
   👉 **http://localhost:5173**

## 🏗️ Architecture Overview

When you run `docker-compose up -d`, the following services spin up:
1. **`client`** (React frontend served via Vite on port `5173`)
2. **`server`** (Node.js API handling core requests on port `5000`)
3. **`worker`** (Node.js instance listening to BullMQ queues for assembling file chunks)
4. **`mongodb`** (Stores all users, folder hierarchies, and file metadata)
5. **`redis`** (Caches rapid API responses and powers BullMQ messaging)
6. **`minio`** (Stores the actual physical binary files on port `9000`)

---
*Developed by Swathi17Y*
