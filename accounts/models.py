from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Custom user model for KinderForge"""
    USER_TYPE_CHOICES = (
        ('student', 'Student'),
        ('parent', 'Parent'),
        ('admin', 'Admin'),
    )
    user_type = models.CharField(max_length=10, choices=USER_TYPE_CHOICES, default='student')
    
    def __str__(self):
        return f"{self.username} ({self.get_user_type_display()})"


class Student(models.Model):
    """Student profile linked to a User"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student_profile')
    grade_level = models.IntegerField(null=True, blank=True)
    date_enrolled = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Student: {self.user.username}"


class Parent(models.Model):
    """Parent profile linked to a User and their students"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='parent_profile')
    students = models.ManyToManyField(Student, related_name='parents', blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    
    def __str__(self):
        return f"Parent: {self.user.username}"
