# MasteryForge

A self-hosted adaptive learning platform that guides students through structured curriculum with intelligent, frustration-aware progress tracking.

## Features

- **Adaptive Learning**: Personalized curriculum that adapts to each student's pace and learning style
- **Mastery Tracking**: Track progress and mastery levels across all concepts with detailed analytics
- **Frustration-Aware**: Intelligent system detects frustration and adjusts difficulty accordingly
- **Parent Portal**: Parents can monitor their children's progress and engagement levels
- **Concept Graph**: YAML-based concept definitions with prerequisite relationships
- **AI Integration**: Stub AI provider ready for OpenAI API integration

## Quick Start with Docker

The easiest way to run MasteryForge is using Docker. No Python installation or dependencies required!

### Using Docker Compose (Recommended)

1. **Clone the repository**:
```bash
git clone https://github.com/dmulder/MasteryForge.git
cd MasteryForge
```

2. **Build and start the service**:
```bash
docker-compose up --build
```

3. **Access the application**:
   - Open your browser to `http://localhost:8000`
   - The database and initial data will be created automatically

4. **Stop the service**:
   - Press `Ctrl+C` in the terminal
   - Or run: `docker-compose down`

### Using Docker Directly

If you prefer to use Docker without Docker Compose:

1. **Build the Docker image**:
```bash
docker build -t masteryforge .
```

2. **Run the container**:
```bash
docker run -p 8000:8000 -v $(pwd)/data:/app/data masteryforge
```

3. **Access the application** at `http://localhost:8000`

### Docker Tips

- **Persist data**: The database is stored in `./data/` directory (created automatically)
- **Modify concepts**: Edit `concepts.yaml` and restart the container to reload
- **View logs**: `docker-compose logs -f` (follow mode)
- **Run management commands**:
  ```bash
  docker-compose exec web python manage.py <command>
  ```
- **Access Django shell**:
  ```bash
  docker-compose exec web python manage.py shell
  ```
- **Create additional users**:
  ```bash
  docker-compose exec web python manage.py createsuperuser
  ```

### Default Test Accounts

The Docker container automatically creates these test accounts:
- **Admin**: `admin` / `admin123` - Full admin access
- **Student**: `alice` / `student123` - Student with progress data
- **Student**: `bob` / `student123` - Another student
- **Parent**: `parent1` / `parent123` - Parent linked to Alice and Bob

**⚠️ Important**: Change these default passwords in production!

## Manual Installation

### Prerequisites

- Python 3.12+
- pip

### Setup

1. Clone the repository:
```bash
git clone https://github.com/dmulder/MasteryForge.git
cd MasteryForge
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run migrations:
```bash
python manage.py migrate
```

4. Load concept definitions:
```bash
python manage.py load_concepts
```

5. Create a superuser:
```bash
python manage.py createsuperuser
```

6. Run the development server:
```bash
python manage.py runserver
```

7. Access the application at `http://localhost:8000`

## Project Structure

- **accounts**: User authentication with Student and Parent roles
- **mastery**: MasteryState model and MasteryEngine with frustration-aware logic
- **content**: Content management (future expansion)
- **ai**: AI provider stub for OpenAI integration
- **dashboard**: Student and parent dashboard views
- **concepts.yaml**: Concept definitions with prerequisites

## Architecture

### MasteryEngine

The `MasteryEngine` class provides frustration-aware adaptive learning:
- Tracks mastery scores (0.0-1.0) for each concept
- Monitors frustration levels based on failures and time spent
- Recommends next concepts based on prerequisites and frustration levels
- Switches to easier alternatives when frustration is high

### Concept Graph

Concepts are defined in YAML with:
- Unique ID and title
- Description
- Difficulty level (1-5)
- Prerequisites (list of concept IDs)

Example:
```yaml
concepts:
  - id: addition_basics
    title: "Basic Addition"
    description: "Learn to add single-digit numbers"
    difficulty: 1
    prerequisites: []
```

## Development

### Running Tests

```bash
python manage.py test
```

### Loading Custom Concepts

```bash
python manage.py load_concepts --file path/to/concepts.yaml
```

## License

See LICENSE file for details.
