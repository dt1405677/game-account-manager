# Game Account Manager ⚔️

A simple, local-first web application to manage multiple game accounts, track daily tasks, and calculate progress.

## Features ✨
- **Manage Multiple Accounts**: Track characters, notes, and progress individually.
- **Daily Tasks**: Reset daily at midnight (except "Dã Tẩu").
- **Dynamic "Dã Tẩu" Quests**: Load quests from simple text files (`assets/data/chiso.txt`, `tichluy.txt`, `vatpham.txt`).
- **Inventory Tracking**: Manage silver and items per account.
- **OCR Support**: Paste screenshots to auto-fill silver amount.
- **Data Export/Import**: Backup your data to JSON file.
- **Cyberpunk UI**: Modern, dark-themed interface with neon accents.

## 🚀 How to Run Locally

### Approach 1: Python HTTP Server (Recommended)
1. Ensure Python 3 is installed.
2. Run the start script:
   - Windows (PowerShell): `.\start_server.ps1`
   - Data will be available at: `http://localhost:8000`

### Approach 2: Manual Server
```bash
python -m http.server 8000
```

## 🌐 How to Deploy (GitHub Pages) - Free!

1. **Create a GitHub Repository**:
   - Go to [github.com/new](https://github.com/new).
   - Name it `game-account-manager`.
   - Make it **Public** (recommended for free Pages).

2. **Push Code**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/game-account-manager.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**:
   - Go to repo **Settings** > **Pages**.
   - Under "Source", select `main` branch.
   - Click **Save**.
   - Your site will be live at: `https://<your-username>.github.io/game-account-manager`

## 📝 Updating Dã Tẩu Quests Online

To add new quests without touching code:
1. Go to your GitHub repository.
2. Edit `assets/data/chiso.txt`, `assets/data/tichluy.txt`, or `assets/data/vatpham.txt`.
3. Add new lines for new quests.
4. Click **Commit changes**.
5. Wait ~1 minute, then refresh your deployed website.

## ⚠️ Important Note on Data
- This app uses **localStorage** (runs in your browser).
- Data is **NOT synced** between devices automatically.
- To switch devices:
  1. Click **Backup** (download .json).
  2. Send file to new device.
  3. Click **Restore** on new device.
