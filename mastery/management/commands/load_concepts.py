"""Load concepts from YAML into the database."""
import os

import yaml
from django.conf import settings
from django.core.management.base import BaseCommand

from content.models import Course, Concept


class Command(BaseCommand):
    help = 'Load concepts from YAML file into the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='concepts.yaml',
            help='Path to the YAML file containing concepts (default: concepts.yaml in project root)',
        )
        parser.add_argument(
            '--course',
            type=str,
            default='Sample Math',
            help='Course name to attach concepts to',
        )
        parser.add_argument(
            '--grade',
            type=int,
            default=5,
            help='Grade level for the course',
        )

    def handle(self, *args, **options):
        yaml_file = options['file']
        course_name = options['course']
        grade_level = options['grade']

        if not os.path.isabs(yaml_file):
            yaml_file = os.path.join(settings.BASE_DIR, yaml_file)

        self.stdout.write(f'Loading concepts from: {yaml_file}')

        if not os.path.exists(yaml_file):
            self.stdout.write(self.style.ERROR(f'Error: YAML file not found: {yaml_file}'))
            return

        with open(yaml_file, 'r') as handle:
            data = yaml.safe_load(handle) or {}

        concepts_data = data.get('concepts', [])
        if not concepts_data:
            self.stdout.write(self.style.ERROR("Error: YAML file must contain a 'concepts' key"))
            return

        course, _ = Course.objects.get_or_create(
            name=course_name,
            defaults={'grade_level': grade_level, 'khan_slug': '', 'is_active': True},
        )

        created = 0
        concept_map = {}
        for order_index, concept in enumerate(concepts_data):
            external_id = concept.get('id') or f"concept-{order_index}"
            khan_slug = concept.get('khan_slug') or external_id
            obj, _ = Concept.objects.update_or_create(
                course=course,
                khan_slug=khan_slug,
                defaults={
                    'external_id': external_id,
                    'title': concept.get('title', external_id),
                    'description': concept.get('description', ''),
                    'difficulty': concept.get('difficulty', 1),
                    'order_index': order_index,
                    'quiz_slug': concept.get('quiz_slug', ''),
                    'is_active': True,
                },
            )
            concept_map[external_id] = obj
            created += 1

        for concept in concepts_data:
            external_id = concept.get('id')
            obj = concept_map.get(external_id)
            prereqs = concept.get('prerequisites', [])
            if not obj or not prereqs:
                continue
            obj.prerequisites.set([concept_map[pid] for pid in prereqs if pid in concept_map])

        self.stdout.write(self.style.SUCCESS(
            f'Successfully loaded {created} concepts into course {course.name}.'
        ))
