# ⚡ Blinkly.chat V1
Experience real-time messaging with **Blinkly** — a beautiful, lightning-fast chat application designed for premium communication, built with React, Vite, Tailwind CSS, Node.js, Socket.IO, and MariaDB.

---

## ✨ Premium Highlights
1. **Dynamic HSL Dark Theme**: Crafted with sleek slate background mesh colors and rich, interactive glassmorphism (`glass-card` & `glass`).
2. **Web Audio Chime Synthesizer**: Custom retro/modern chime sounds generated in real-time using the browser's Web Audio API. Zero dependencies, instant loading.
3. **PWA Support**: Installable on mobile and desktop, featuring custom SVGs, icons, application manifest, service worker caching, and an offline shell.
4. **Mobile Responsive Layout**: Responsive sidebar collapsibility with fluid transitions tailored for smaller viewports.
5. **Real-time Synchronization**: Built with authenticated Socket.IO connections, supporting instant read receipts, typing status indicators, multi-tab sync, and online/offline status updates.

---

## 🛠️ Technology Stack
* **Frontend**: React (v18+) + Vite, Tailwind CSS (v4), Lucide Icons
* **Backend**: Node.js + Express (ES Modules)
* **Real-time**: Socket.IO (Sockets secured with JWT validation)
* **Database**: MariaDB / MySQL
* **Authentication**: JSON Web Tokens (JWT) + bcryptjs password hashing
* **Deployment**: PM2 Ready (`ecosystem.config.cjs`), Nginx Reverse Proxy compatible

---

## 📂 Project Structure
```
blinkly/
├── client/                 # React + Vite Frontend
│   ├── public/             # PWA assets, manifest, and service worker
│   └── src/
│       ├── components/     # UI Components (Auth, Dashboard, Admin, Profile)
│       ├── context/        # AppContext (Auth, Sockets, Actions, Synthesizer)
│       ├── App.jsx         # Main router and loading gate
│       └── index.css       # Tailwind entry and custom glass styles
├── server/                 # Express + Socket.IO Backend
│   └── src/
│       ├── db/             # Connection pooling and setup scripts
│       ├── middleware/     # Auth and Admin JWT protectors
│       ├── routes/         # REST API routes (Auth, Friends, Chat, Admin)
│       └── index.js        # Server entrance & WebSockets controller
└── ecosystem.config.cjs    # PM2 production process configuration
```

---

## 🚀 Installation & Setup

### 1. Database Setup
Ensure you have **MariaDB** (or MySQL) running locally.
Update the database connection details in `server/.env`.

### 2. Configure Environment Variables
Create or edit `server/.env`:
```env
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MARIADB_PASSWORD   # <- Fill in your password here
DB_NAME=blinkly
JWT_SECRET=blinkly_premium_secret_key_2026_jwt
```

### 3. Initialize Database Tables
Navigate to the `server/` directory and run the initialization script. This creates the database `blinkly`, all required tables, and seeds a default admin account (`admin` / `admin123`):
```bash
cd server
npm run db:init
```

---

## 💻 Running the App

### 🛠️ Development Mode (Hot Reload)

Run the backend server (on `http://localhost:5000`):
```bash
cd server
npm run dev
```

Run the frontend client (on `http://localhost:3000`):
```bash
cd client
npm run dev
```
*Note: Vite dev server handles API/socket proxy routing automatically.*

---

## 🏭 Production Deployment

### 1. Build the Frontend
Compile static assets for the client:
```bash
cd client
npm run build
```
This produces optimized production files in `client/dist`.

### 2. Start the Server with PM2
Launch the server daemon utilizing the PM2 process manager in the project root:
```bash
pm2 start ecosystem.config.cjs
```
Commands to manage the process:
* Check status: `pm2 status`
* View logs: `pm2 logs blinkly-server`
* Restart process: `pm2 restart blinkly-server`

### 3. Configure Nginx Reverse Proxy
Place this inside your Nginx server block to serve the compiled frontend, proxy API queries, and handle Socket.IO WebSocket connections:
```nginx
server {
    listen 80;
    server_name blinkly.chat;

    # Serve static React frontend
    location / {
        root /path/to/blinkly/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Serve backend uploads (avatars)
    location /uploads/ {
        proxy_pass http://localhost:5000/uploads/;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy API Requests
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy Socket.IO WebSockets
    location /socket.io/ {
        proxy_pass http://localhost:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔒 Default Admin Credentials
* **Username**: `admin`
* **Password**: `admin123`
*(Make sure to change the password or update user values once connected!)*
