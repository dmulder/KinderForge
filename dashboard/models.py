from django.db import models
from django.conf import settings


class ParentStudentConfig(models.Model):
    parent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='student_configs')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='parent_configs')
    grade_level = models.IntegerField(null=True, blank=True)
    courses = models.ManyToManyField('content.Course', blank=True, related_name='student_configs')
    khan_classes = models.JSONField(default=list, blank=True)
    starting_concept = models.ForeignKey(
        'content.Concept',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='starting_configs',
    )
    starting_concepts_by_course = models.JSONField(default=dict, blank=True)
    override_starting_point = models.BooleanField(default=False)

    class Meta:
        unique_together = ('parent', 'student')

    def __str__(self):
        return f"Config: {self.parent.username} -> {self.student.username}"
