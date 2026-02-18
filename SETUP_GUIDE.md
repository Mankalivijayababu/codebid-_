# ⚡ CODEBID — Complete Setup & Deployment Guide

---

## 📁 Project Structure

```
codebid/
├── client/          ← React Frontend (deploy to Vercel)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── TeamDashboard.jsx
│   │   │   └── SpectatorView.jsx
│   │   ├── context/AuthContext.jsx
│   │   ├── hooks/useSocket.js
│   │   ├── services/api.js
│   │   ├── services/socket.js
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
└── server/          ← Node.js Backend (deploy to Render)
    ├── routes/
    │   ├── auth.js
    │   ├── game.js
    │   └── teams.js
    ├── models/
    │   ├── Team.js
    │   └── Round.js
    ├── middleware/auth.js
    ├── socket/gameEvents.js
    ├── config/db.js
    ├── server.js
    └── package.json
```

---

## STEP 1 — MongoDB Atlas Setup (Free Database)

1. Go to https://cloud.mongodb.com
2. Create a free account
3. Click "Build a Database" → Choose FREE tier (M0)
4. Select any region → Click "Create"
5. Create a database user:
   - Username: codebid_admin
   - Password: (save this!)
6. Under "Network Access" → Add IP Address → "Allow Access from Anywhere" (0.0.0.0/0)
7. Click "Connect" → "Connect your application"
8. Copy the connection string:
   mongodb+srv://codebid_admin:<password>@cluster0.xxxxx.mongodb.net/codebid

---

## STEP 2 — Google OAuth Setup (For Admin Login)

1. Go to https://console.cloud.google.com
2. Create a new project: "CODEBID"
3. Go to "APIs & Services" → "OAuth consent screen"
   - User Type: External
   - App name: CODEBID
   - Support email: your email
   - Save
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: Web application
   - Name: CODEBID Web
   - Authorized JavaScript origins:
     * http://localhost:5173
     * https://your-vercel-url.vercel.app  (add after deploying)
   - Authorized redirect URIs:
     * http://localhost:5173
     * https://your-vercel-url.vercel.app
5. Copy the Client ID — you'll need this in .env files

---

## STEP 3 — Local Development Setup

### Backend Setup:
```bash
cd codebid/server

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your values:
PORT=5000
MONGODB_URI=mongodb+srv://codebid_admin:yourpassword@cluster0.xxxxx.mongodb.net/codebid
JWT_SECRET=codebid_super_secret_2024_vrsec
JWT_EXPIRES_IN=12h
GOOGLE_CLIENT_ID=your_google_client_id_from_step2
CLIENT_URL=http://localhost:5173
ADMIN_EMAILS=238w1a12a8@vrsec.ac.in,238w1a12a7@vrsec.ac.in,238w1a1283@vrsec.ac.in,238w1a12a2@vrsec.ac.in

# Start backend
npm run dev
# Server runs on http://localhost:5000
```

### Frontend Setup:
```bash
cd codebid/client

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env:
VITE_SERVER_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your_google_client_id_from_step2

# Start frontend
npm run dev
# App runs on http://localhost:5173
```

---

## STEP 4 — Deploy Backend to Render (Free)

1. Go to https://render.com → Sign up free
2. Click "New +" → "Web Service"
3. Connect your GitHub repo (push server/ folder to GitHub first)
4. Configure:
   - Name: codebid-server
   - Root Directory: server
   - Build Command: npm install
   - Start Command: node server.js
   - Instance Type: Free
5. Add Environment Variables (same as .env):
   - PORT = 5000
   - MONGODB_URI = (your Atlas URI)
   - JWT_SECRET = (your secret)
   - JWT_EXPIRES_IN = 12h
   - GOOGLE_CLIENT_ID = (your client ID)
   - CLIENT_URL = https://your-vercel-url.vercel.app
   - ADMIN_EMAILS = 238w1a12a8@vrsec.ac.in,...
6. Click "Create Web Service"
7. Copy your Render URL: https://codebid-server.onrender.com

---

## STEP 5 — Deploy Frontend to Vercel (Free)

1. Go to https://vercel.com → Sign up free
2. Click "New Project" → Import your GitHub repo
3. Configure:
   - Framework Preset: Vite
   - Root Directory: client
   - Build Command: npm run build
   - Output Directory: dist
4. Add Environment Variables:
   - VITE_SERVER_URL = https://codebid-server.onrender.com
   - VITE_GOOGLE_CLIENT_ID = (your client ID)
5. Click "Deploy"
6. Copy your Vercel URL: https://codebid.vercel.app

---

## STEP 6 — Update Google OAuth URLs

After deploying:
1. Go back to Google Cloud Console → Credentials
2. Edit your OAuth 2.0 Client ID
3. Add to Authorized JavaScript origins:
   - https://codebid.vercel.app
4. Add to Authorized redirect URIs:
   - https://codebid.vercel.app
5. Save

---

## STEP 7 — Final Checks Before Event

Run through this checklist:

[ ] MongoDB Atlas connected (check Render logs)
[ ] Admin Google login works with all 4 emails
[ ] Team signup and login working
[ ] Start bidding round from admin panel
[ ] Teams can place bids on their devices
[ ] Admin sees live bids
[ ] Mark correct/wrong — coins update on ALL devices
[ ] Leaderboard updates in real-time
[ ] Spectator view shows on projector: /spectator

---

## 🎮 On Event Day — How to Run

1. Open Admin panel on your laptop
   → https://codebid.vercel.app → Admin tab → Sign in with Google

2. Open Spectator view on projector/TV
   → https://codebid.vercel.app/spectator

3. Teams sign up on their phones/laptops
   → https://codebid.vercel.app → Sign Up tab

4. Run the game:
   a. Enter question title → Start Bidding
   b. Teams secretly bid
   c. End Bidding → Winner shown on admin panel
   d. Ask question verbally → Mark Correct/Wrong
   e. Everyone sees result + coins update live
   f. Repeat!

---

## 🔗 URLs Summary

| URL | Purpose |
|-----|---------|
| https://codebid.vercel.app | Main app (teams login here) |
| https://codebid.vercel.app/spectator | Projector/audience screen |
| https://codebid.vercel.app/admin | Admin login |
| https://codebid-server.onrender.com | Backend API |

---

## 🛠️ Troubleshooting

**Socket not connecting?**
→ Check VITE_SERVER_URL in client .env
→ Check CLIENT_URL in server .env match each other

**Google login not working?**
→ Check GOOGLE_CLIENT_ID in both .env files match
→ Check your domain is added to Google OAuth authorized origins

**Render server sleeping?**
→ Free Render servers sleep after 15 min of inactivity
→ Visit the backend URL once before event to wake it up
→ Or upgrade to $7/month plan for always-on

**MongoDB not connecting?**
→ Check IP whitelist is set to 0.0.0.0/0 in Atlas
→ Double check username/password in connection string

---

Built with ❤️ for VRSEC · CODEBID 2024
