"""
URL configuration for dashboard app
"""
from django.urls import path
from . import views

urlpatterns = [
    path('student/', views.student_dashboard, name='student_dashboard'),
    path('parent/', views.parent_dashboard, name='parent_dashboard'),
    path('parent/config/<int:student_id>/', views.parent_student_config, name='parent_student_config'),
    path(
        'parent/config/<int:student_id>/starting-concepts/',
        views.parent_course_starting_options,
        name='parent_course_starting_options',
    ),
    path('concept/<int:concept_id>/', views.concept_detail, name='concept_detail'),
]
