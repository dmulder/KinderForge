#!/bin/bash
set -e

echo "==> Running database migrations..."
python manage.py migrate --noinput

echo "==> Loading concepts from YAML..."
python manage.py load_concepts

# Create superuser if it doesn't exist
echo "==> Creating default users if needed..."
python manage.py shell << 'EOF'
from accounts.models import User, Student, Parent
from mastery.models import MasteryState

# Create admin user if doesn't exist
if not User.objects.filter(username='admin').exists():
    admin = User.objects.create_superuser('admin', 'admin@masteryforge.com', 'admin123', user_type='admin')
    print(f"Created admin user: {admin.username}")
else:
    print("Admin user already exists")

# Create sample student if doesn't exist
if not User.objects.filter(username='alice').exists():
    student = User.objects.create_user('alice', 'alice@example.com', 'student123', user_type='student', first_name='Alice', last_name='Johnson')
    student_profile = Student.objects.create(user=student, grade_level=5)
    
    # Create some mastery states
    MasteryState.objects.create(user=student, concept_id='addition_basics', mastery_score=0.9, frustration_score=0.1, attempts=8)
    MasteryState.objects.create(user=student, concept_id='subtraction_basics', mastery_score=0.85, frustration_score=0.15, attempts=6)
    MasteryState.objects.create(user=student, concept_id='multiplication_basics', mastery_score=0.6, frustration_score=0.4, attempts=12)
    print(f"Created student: {student.username}")
else:
    print("Student alice already exists")

# Create another student if doesn't exist
if not User.objects.filter(username='bob').exists():
    bob = User.objects.create_user('bob', 'bob@example.com', 'student123', user_type='student', first_name='Bob', last_name='Smith')
    bob_profile = Student.objects.create(user=bob, grade_level=6)
    print(f"Created student: {bob.username}")
else:
    print("Student bob already exists")

# Create parent if doesn't exist
if not User.objects.filter(username='parent1').exists():
    parent = User.objects.create_user('parent1', 'parent@example.com', 'parent123', user_type='parent', first_name='Mary', last_name='Johnson')
    parent_profile = Parent.objects.create(user=parent, phone_number='555-0123')
    
    # Link to students
    from accounts.models import Student
    alice_profile = Student.objects.filter(user__username='alice').first()
    bob_profile = Student.objects.filter(user__username='bob').first()
    if alice_profile:
        parent_profile.students.add(alice_profile)
    if bob_profile:
        parent_profile.students.add(bob_profile)
    print(f"Created parent: {parent.username}")
else:
    print("Parent parent1 already exists")

print("\n==> Default users available:")
print("  Admin: admin / admin123")
print("  Student: alice / student123")
print("  Student: bob / student123")
print("  Parent: parent1 / parent123")
EOF

echo "==> Starting Django server..."
exec "$@"
