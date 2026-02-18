# KinderForge

A self-hosted adaptive learning platform that guides students through structured curriculum with intelligent, frustration-aware progress tracking.

Perfect for homeschool parents who want to track their children's learning progress with adaptive difficulty and frustration monitoring.

## ✨ Features

- **Adaptive Learning**: Personalized curriculum that adapts to each student's pace and learning style
- **Mastery Tracking**: Track progress and mastery levels across all concepts with detailed analytics
- **Frustration-Aware**: Intelligent system detects frustration and adjusts difficulty accordingly
- **Parent Portal**: Parents can monitor their children's progress and engagement levels
- **Concept Graph**: YAML-based concept definitions with prerequisite relationships
- **AI Integration**: Optional OpenAI integration for personalized hints and explanations

## 🚀 Quick Start (5 Minutes!)

### Option 1: Docker (Recommended - Easiest!)

**Prerequisites**: Docker installed on your computer ([Get Docker](https://docs.docker.com/get-docker/))

1. **Run KinderForge** - Just one command!
   ```bash
   docker run -d \
     -p 8000:8000 \
     -v masteryforge-data:/app/data \
     --name masteryforge \
     ghcr.io/dmulder/masteryforge:latest
   ```
   
   Or build and run locally:
   ```bash
   git clone https://github.com/dmulder/KinderForge.git
   cd KinderForge
   docker build -t masteryforge .
   docker run -d -p 8000:8000 -v masteryforge-data:/app/data --name masteryforge masteryforge
   ```

2. **Open your browser** to `http://localhost:8000`

3. **Login** with default accounts:
   - **Student**: `alice` / `student123`
   - **Parent**: `parent1` / `parent123`
   - **Admin**: `admin` / `admin123`

**That's it!** 🎉 KinderForge is running!

### Option 2: Podman (Docker Alternative)

Same commands as Docker, just replace `docker` with `podman`:
```bash
podman run -d \
  -p 8000:8000 \
  -v masteryforge-data:/app/data \
  --name masteryforge \
  ghcr.io/dmulder/masteryforge:latest
```

### Option 3: Docker Compose (For Easy Management)

1. **Create a `docker-compose.yml` file**:
   ```yaml
   version: '3.8'
   
   services:
     web:
       image: ghcr.io/dmulder/masteryforge:latest
       ports:
         - "8000:8000"
       volumes:
         - masteryforge-data:/app/data
         - ./concepts.yaml:/app/concepts.yaml
       environment:
         - DJANGO_SECRET_KEY=your-secret-key-change-this-in-production
         - DJANGO_ALLOWED_HOSTS=*
         - OPENAI_API_KEY=your-openai-key-here-optional
       restart: unless-stopped
   
   volumes:
     masteryforge-data:
   ```

2. **Start the service**:
   ```bash
   docker-compose up -d
   ```

3. **View logs**:
   ```bash
   docker-compose logs -f
   ```

4. **Stop the service**:
   ```bash
   docker-compose down
   ```

## 🔐 Setting Up AI Features (Optional)

KinderForge can use OpenAI-compatible APIs for personalized hints, problem generation, and explanations.

### Option 1: Azure OpenAI (Microsoft Foundry)

Use a resource name and API key from Azure Cognitive Services.

```bash
docker run -d \
  -p 8000:8000 \
  -v masteryforge-data:/app/data \
  -e AZURE_OPENAI_RESOURCE_NAME=your-resource-name \
  -e AZURE_OPENAI_API_KEY=your-azure-key \
  -e AZURE_OPENAI_DEPLOYMENT=gpt-5.2-codex \
  --name masteryforge \
  masteryforge
```

Optional overrides:
- `AZURE_OPENAI_API_VERSION` (default: `2024-02-15-preview`)
- `AZURE_OPENAI_MODEL` (sent as the `model` field when required by your deployment)

### Option 2: OpenAI API

1. **Get an OpenAI API Key**:
   - Go to [platform.openai.com](https://platform.openai.com/api-keys)
   - Create an account and generate an API key

2. **Add the key when running**:
   ```bash
   docker run -d \
     -p 8000:8000 \
     -v masteryforge-data:/app/data \
     -e OPENAI_API_KEY=sk-your-key-here \
     --name masteryforge \
     masteryforge
   ```

**Note**: AI features are optional. KinderForge works perfectly without them using built-in adaptive learning logic.

## 💾 Production Deployment

### For Long-Term Use

When running KinderForge for actual homeschooling (not just testing), follow these steps:

#### 1. Persistent Storage Setup

Create a dedicated directory on your computer for KinderForge data:

```bash
# Linux/Mac
mkdir -p ~/masteryforge-data

# Windows (in PowerShell)
mkdir C:\masteryforge-data
```

#### 2. Production Docker Command

```bash
# Linux/Mac
docker run -d \
  --name masteryforge \
  --restart unless-stopped \
  -p 8000:8000 \
  -v ~/masteryforge-data:/app/data \
  -v ~/masteryforge-data/concepts.yaml:/app/concepts.yaml \
  -e DJANGO_SECRET_KEY=$(openssl rand -base64 32) \
  -e DJANGO_DEBUG=False \
  -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,your-server-ip \
  -e OPENAI_API_KEY=sk-your-key-optional \
  masteryforge

# Windows (PowerShell)
docker run -d `
  --name masteryforge `
  --restart unless-stopped `
  -p 8000:8000 `
  -v C:\masteryforge-data:/app/data `
  -e DJANGO_SECRET_KEY=your-random-secret-key-here `
  -e DJANGO_DEBUG=False `
  -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1 `
  masteryforge
```

#### 3. Create Your Admin Account

```bash
docker exec -it masteryforge python manage.py createsuperuser
```

Follow the prompts to create your admin account, then:
- Login at `http://localhost:8000/admin`
- Delete the default test accounts
- Create accounts for your family

#### 4. Customize Your Curriculum

Edit the concepts file to match your curriculum:

```bash
# Linux/Mac
nano ~/masteryforge-data/concepts.yaml

# Windows
notepad C:\masteryforge-data\concepts.yaml
```

Then reload concepts:
```bash
docker restart masteryforge
```

### 🌐 Access From Other Devices

To access KinderForge from tablets, phones, or other computers on your network:

1. **Find your computer's IP address**:
   ```bash
   # Linux/Mac
   hostname -I
   
   # Windows
   ipconfig
   ```

2. **Update ALLOWED_HOSTS**:
   ```bash
   docker run -d \
     -p 8000:8000 \
     -v ~/masteryforge-data:/app/data \
     -e DJANGO_ALLOWED_HOSTS=192.168.1.100,localhost \
     --name masteryforge \
     masteryforge
   ```
   (Replace `192.168.1.100` with your actual IP)

3. **Access from other devices**: Go to `http://192.168.1.100:8000`

### 🔒 Security Best Practices

For production use:

1. **Change default passwords immediately**
2. **Use a strong SECRET_KEY** (generated with `openssl rand -base64 32`)
3. **Set DJANGO_DEBUG=False** in production
4. **Limit ALLOWED_HOSTS** to your actual domains/IPs
5. **Run behind a reverse proxy** (nginx/Apache) for HTTPS
6. **Regular backups** of the data directory
7. **Keep Docker images updated**: `docker pull ghcr.io/dmulder/masteryforge:latest`

## 📁 Data Storage & Backups

All your data is stored in the mounted volume (`masteryforge-data`). This includes:
- Student progress and mastery states
- User accounts
- SQLite database

### Backing Up Your Data

#### Automatic Volume Backup
```bash
# Create a backup
docker run --rm \
  -v masteryforge-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/masteryforge-backup-$(date +%Y%m%d).tar.gz /data

# Restore from backup
docker run --rm \
  -v masteryforge-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/masteryforge-backup-20260217.tar.gz -C /
```

#### Directory-based Backup (Easier!)
If you used a directory mount (`-v ~/masteryforge-data:/app/data`):

```bash
# Backup
cp -r ~/masteryforge-data ~/masteryforge-backup-$(date +%Y%m%d)

# Or use your favorite backup tool
tar czf masteryforge-backup.tar.gz ~/masteryforge-data
```

## 🔧 Common Operations

### View Application Logs
```bash
docker logs -f masteryforge
```

### Restart the Service
```bash
docker restart masteryforge
```

### Stop the Service
```bash
docker stop masteryforge
```

### Update to Latest Version
```bash
docker stop masteryforge
docker rm masteryforge
docker pull ghcr.io/dmulder/masteryforge:latest
# Then run the docker run command again
```

### Access Django Shell
```bash
docker exec -it masteryforge python manage.py shell
```

### Load Custom Concepts
```bash
docker exec -it masteryforge python manage.py load_concepts --file /app/concepts.yaml
```

## 📚 Customizing Your Curriculum

The `concepts.yaml` file defines your learning concepts and their relationships. Edit it to match your homeschool curriculum:

```yaml
concepts:
  - id: addition_basics
    title: "Basic Addition"
    description: "Learn to add single-digit numbers"
    difficulty: 1
    prerequisites: []

  - id: multiplication_basics
    title: "Basic Multiplication"
    description: "Learn multiplication tables"
    difficulty: 2
    prerequisites:
      - addition_basics
```

After editing, restart the container:
```bash
docker restart masteryforge
```

## 🎯 Default Test Accounts

**⚠️ IMPORTANT**: These are for testing only! Delete them and create your own in production.

- **Admin**: `admin` / `admin123` - Full admin access
- **Student**: `alice` / `student123` - Student with sample progress
- **Student**: `bob` / `student123` - Another student  
- **Parent**: `parent1` / `parent123` - Parent linked to Alice and Bob

## 🐛 Troubleshooting

### Port Already in Use
If port 8000 is already in use, change it:
```bash
docker run -d -p 9000:8000 ... masteryforge
# Then access at http://localhost:9000
```

### Container Won't Start
View the logs:
```bash
docker logs masteryforge
```

### Reset Everything
```bash
docker stop masteryforge
docker rm masteryforge
docker volume rm masteryforge-data
# Then start fresh with the quick start command
```

### Can't Connect to Database
The database file might be corrupted. Check logs and consider restoring from backup.

## 💡 Tips for Homeschool Parents

1. **Start Simple**: Use the default math concepts to get familiar with the system
2. **Monitor Frustration**: Check the parent dashboard regularly - high frustration scores mean your child needs help or a break
3. **Customize Concepts**: Add concepts that match your specific curriculum
4. **Multiple Children**: Create separate student accounts for each child and link them to your parent account
5. **Daily Check-ins**: Review the parent dashboard weekly to track overall progress
6. **AI Features**: The AI features are optional but can provide helpful hints when you're not available

## 📖 Manual Installation (Advanced)

If you prefer not to use Docker:

### Prerequisites
- Python 3.12+
- pip

### Setup Steps

1. **Clone and install**:
   ```bash
   git clone https://github.com/dmulder/KinderForge.git
   cd KinderForge
   pip install -r requirements.txt
   ```

2. **Initialize database**:
   ```bash
   python manage.py migrate
   python manage.py load_concepts
   ```

3. **Create admin user**:
   ```bash
   python manage.py createsuperuser
   ```

4. **Run server**:
   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```

5. **Access**: Open `http://localhost:8000`

## 🤝 Support & Community

- **Issues**: Report bugs on [GitHub Issues](https://github.com/dmulder/KinderForge/issues)
- **Discussions**: Join our [GitHub Discussions](https://github.com/dmulder/KinderForge/discussions)

## 📄 License

See the [LICENSE](LICENSE) file for details.

## 🎓 Project Structure

For developers:
- **accounts**: User authentication with Student and Parent roles
- **mastery**: MasteryState model and MasteryEngine with frustration-aware logic
- **content**: Content management (future expansion)
- **ai**: AI provider for OpenAI integration
- **dashboard**: Student and parent dashboard views
- **concepts.yaml**: Default concept definitions

## Screenshots

### Home Page
![Home Page](https://github.com/user-attachments/assets/32a1e923-4288-4667-b939-9db7af6aae11)

### Student Dashboard
![Student Dashboard](https://github.com/user-attachments/assets/3b0f9e18-f536-4248-8d11-bd69f911757b)

### Login
![Login Page](https://github.com/user-attachments/assets/86410c77-1d62-4afc-8d86-be97408083e7)
