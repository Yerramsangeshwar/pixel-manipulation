# 🔐 PixelVault — Full-Stack Image Encryption App

A full-stack upgrade of the original client-side PixelVault with user authentication, image history, cloud storage, and statistics.

---

## 🚀 Features

### Frontend
- 6 encryption methods: XOR Cipher, Channel Shift, Bit Invert, Modular Add, Pixel Scramble, Bit Rotation
- Real-time canvas-based image processing (client-side)
- Drag & drop image upload
- Side-by-side original vs result preview
- Export encrypted/decrypted images as PNG

### Backend (New!)
- **User Authentication** — Register, login, JWT sessions (7-day tokens)
- **Image History** — Save processed images to your account
- **Cloud Gallery** — Browse, preview, download past images
- **Statistics Dashboard** — Encryption counts by method
- **REST API** — Full API for all features
- **SQLite Database** — Lightweight, file-based, zero setup

---

## 📁 Project Structure

```
pixelvault-fullstack/
├── backend/
│   ├── server.js          # Express app entry point
│   ├── database.js        # SQLite setup & init
│   ├── middleware/
│   │   └── auth.js        # JWT middleware
│   ├── routes/
│   │   ├── auth.js        # /api/auth/* routes
│   │   └── images.js      # /api/images/* routes
│   └── uploads/           # Stored images (auto-created)
│       ├── originals/     # Uploaded source images
│       └── processed/     # Encrypted/decrypted results
├── frontend/
│   └── public/
│       ├── index.html     # Main HTML
│       ├── css/
│       │   └── style.css  # All styles
│       └── js/
│           └── app.js     # Full frontend logic
├── .env                   # Environment variables
├── package.json
└── README.md
```

---

## 🛠 Installation & Setup

### Requirements
- Node.js 18+ 
- npm

### Steps

```bash
# 1. Navigate to project folder
cd pixelvault-fullstack

# 2. Install dependencies
npm install

# 3. (Optional) Edit .env — change JWT_SECRET in production!
# PORT=3000
# JWT_SECRET=your-secret-here

# 4. Start the server
npm start

# For development with auto-restart:
npm run dev
```

Visit: **http://localhost:3000**

---

## 🔌 API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, get JWT |
| GET | `/api/auth/profile` | Get own profile (auth) |

### Images

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/images/upload` | Upload source image (auth) |
| POST | `/api/images/save` | Save processed result (auth) |
| GET | `/api/images/history` | List saved images (auth) |
| GET | `/api/images/file/:filename` | Download a saved image (auth) |
| DELETE | `/api/images/history/:id` | Delete a saved image (auth) |
| GET | `/api/images/stats` | Encryption stats (auth) |

All authenticated endpoints require: `Authorization: Bearer <token>`

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | `pixelvault-...` | **Change this in production!** |
| `NODE_ENV` | `development` | Environment |

---

## 🔐 Security Notes

- **Change `JWT_SECRET`** in production — use a long random string
- Upload size limit: 20MB per image
- Supported types: PNG, JPG, BMP, WebP
- Images are private per user — users can only access their own files
- Passwords are hashed with bcrypt (salt rounds: 10)

---

## 💡 How It Works

1. **Guest Mode** — Use without an account, client-side processing only, no saving
2. **Logged-in Mode** — Process images + optionally save results to your account
3. All encryption/decryption happens **in the browser** (Canvas API)
4. Saving sends the result PNG to the server as base64 and stores it on disk
5. The SQLite database tracks metadata; actual images are in `backend/uploads/`

---

## 🧩 Encryption Methods

| Method | How it works | Self-inverse? |
|--------|-------------|---------------|
| XOR Cipher | XOR each RGB byte with a key | ✅ Yes |
| Channel Shift | Rotate R/G/B channels cyclically | ❌ No |
| Bit Invert | 255 − value per channel | ✅ Yes |
| Modular Add | Add offset mod 256 | ❌ No |
| Pixel Scramble | Seeded Fisher-Yates shuffle of pixels | ❌ No |
| Bit Rotation | Circular bit-shift per byte | ❌ No |
