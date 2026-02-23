"""
URL configuration for masteryforge project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from dashboard import views as dashboard_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', dashboard_views.home, name='home'),
    path('dashboard/', include('dashboard.urls')),
    path('accounts/', include('accounts.urls')),
    path('learn/', dashboard_views.learning_session, name='learning_session'),
    path('quiz-result/', dashboard_views.submit_quiz_result, name='submit_quiz_result'),
    path('practice/start/', dashboard_views.start_practice_stream, name='start_practice_stream'),
    path('practice/stream/<str:stream_id>/', dashboard_views.practice_stream, name='practice_stream'),
    path('practice/input/<str:stream_id>/', dashboard_views.practice_input, name='practice_input'),
    path('practice/status/<str:stream_id>/', dashboard_views.practice_status, name='practice_status'),
    path('practice/stop/<str:stream_id>/', dashboard_views.practice_stop, name='practice_stop'),
]
