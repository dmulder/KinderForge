# KinderForge Quick Start Guide for Homeschool Parents

This guide will help you get KinderForge running in under 5 minutes!

## Step 1: Install Docker

First, you need Docker installed on your computer:

- **Windows**: Download from [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
- **Mac**: Download from [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
- **Linux**: Run `sudo apt-get install docker.io` (Ubuntu/Debian) or see [Docker Docs](https://docs.docker.com/engine/install/)

After installing, make sure Docker is running (you should see a whale icon in your system tray).

## Step 2: Build the Image

The image is not published yet, so you need to build it locally.

### On Mac/Linux:
```bash
docker build -t masteryforge -f Dockerfile .
```

### On Windows (PowerShell):
```powershell
docker build -t masteryforge -f Dockerfile .
```

## Step 3: Run KinderForge

Open a terminal/command prompt and run:

### On Mac/Linux:
```bash
docker run -d \
  --name masteryforge \
  -p 8000:8000 \
  -v ~/masteryforge-data:/app/data \
  --restart unless-stopped \
  masteryforge
```

### On Windows (PowerShell):
```powershell
docker run -d `
  --name masteryforge `
  -p 8000:8000 `
  -v C:\masteryforge-data:/app/data `
  --restart unless-stopped `
  masteryforge
```

Wait about 30 seconds for it to start up.

## Step 4: Open KinderForge

1. Open your web browser
2. Go to: `http://localhost:8000`
3. You should see the KinderForge home page!

## Step 5: Try It Out

Login with these test accounts:

**As a Student:**
- Username: `alice`
- Password: `student123`

You'll see a student dashboard with progress tracking!

**As a Parent:**
- Logout (click "Logout" in the top right)
- Login with:
  - Username: `parent1`
  - Password: `parent123`

You'll see a parent dashboard showing all your students' progress!

## Step 6: Set Up for Your Family

### Create Your Admin Account

1. Open terminal/command prompt
2. Run:
   ```bash
   docker exec -it masteryforge python manage.py createsuperuser
   ```
3. Follow the prompts to create your admin account

### Login to Admin Panel

1. Go to `http://localhost:8000/admin`
2. Login with your new admin account
3. Delete the test accounts (alice, bob, parent1, admin)
4. Create accounts for your family:
   - One parent account for you
   - One student account for each child

### Link Students to Parent

In the admin panel:
1. Click "Parents"
2. Click on your parent account
3. In the "Students" section, select your children
4. Click "Save"

## Step 7: Customize Your Curriculum

1. Find where your concepts file is stored:
   - **Mac/Linux**: `~/masteryforge-data/`
   - **Windows**: `C:\masteryforge-data\`

2. Create or edit `concepts.yaml` in that folder
3. Add your homeschool curriculum concepts
4. Restart KinderForge:
   ```bash
   docker restart masteryforge
   ```

## Optional: Add AI Features

If you want AI-powered hints and explanations:

1. Get an OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Stop KinderForge: `docker stop masteryforge`
3. Remove it: `docker rm masteryforge`
4. Re-run with your API key:
   ```bash
   docker run -d \
     --name masteryforge \
     -p 8000:8000 \
     -v ~/masteryforge-data:/app/data \
     -e OPENAI_API_KEY=sk-your-key-here \
     --restart unless-stopped \
     masteryforge
   ```

## Common Questions

### How do I access KinderForge from my kids' tablets?

1. Find your computer's IP address:
   - **Windows**: Open Command Prompt, run `ipconfig`, look for "IPv4 Address"
   - **Mac**: System Preferences → Network → look for "IP Address"
   - **Linux**: Run `hostname -I`

2. On the tablet, open a browser and go to `http://YOUR-IP:8000`
   (For example: `http://192.168.1.100:8000`)

### How do I stop KinderForge?

```bash
docker stop masteryforge
```

### How do I start it again?

```bash
docker start masteryforge
```

### Where is my data stored?

All progress, accounts, and settings are in:
- **Mac/Linux**: `~/masteryforge-data/`
- **Windows**: `C:\masteryforge-data\`

**Back this folder up regularly!** It contains all your children's progress.

### How do I backup my data?

**Easy way:**
Just copy the entire data folder to a backup location:
- **Windows**: Copy `C:\masteryforge-data` to an external drive or cloud storage
- **Mac/Linux**: Copy `~/masteryforge-data` to an external drive or cloud storage

### Something went wrong, how do I start over?

1. Stop and remove the container:
   ```bash
   docker stop masteryforge
   docker rm masteryforge
   ```

2. Delete the data (WARNING: This deletes all progress!):
   - **Windows**: Delete `C:\masteryforge-data`
   - **Mac/Linux**: Delete `~/masteryforge-data`

3. Run the Step 2 command again

## Need More Help?

- Check the full [README](README.md) for detailed documentation
- Report issues on [GitHub](https://github.com/dmulder/KinderForge/issues)
- Join discussions on [GitHub Discussions](https://github.com/dmulder/KinderForge/discussions)

## Daily Use Tips

1. **Students**: Have them login each day and work on their recommended concepts
2. **Check Progress**: Login as parent weekly to see how everyone is doing
3. **Watch Frustration**: High frustration scores (above 0.7) mean your child needs help
4. **Celebrate Mastery**: When mastery hits 0.7 or higher, they've mastered that concept!
5. **Regular Backups**: Copy your data folder once a week to a safe location

Happy homeschooling! 🎓
