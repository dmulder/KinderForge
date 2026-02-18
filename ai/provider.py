"""
AI Provider for KinderForge - OpenAI integration
"""
import json
import os
import urllib.error
import urllib.request
from typing import Optional, Dict, List, Any


class AIProvider:
    """
    Stub implementation of AI provider using OpenAI API
    
    This class provides AI-powered features like:
    - Generating personalized hints
    - Creating practice problems
    - Providing explanations
    - Analyzing student responses
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        azure_resource_name: Optional[str] = None,
        azure_api_key: Optional[str] = None,
        azure_deployment: Optional[str] = None,
        azure_api_version: Optional[str] = None,
        azure_model: Optional[str] = None,
    ):
        """
        Initialize the AI provider
        
        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
            azure_resource_name: Azure OpenAI resource name
            azure_api_key: Azure OpenAI API key
            azure_deployment: Azure OpenAI deployment name
            azure_api_version: Azure OpenAI API version
            azure_model: Model name to include in request (optional)
        """
        self.api_key = api_key or os.environ.get('OPENAI_API_KEY')
        self.model = os.environ.get('OPENAI_MODEL', 'gpt-4')
        self.azure_resource_name = azure_resource_name or os.environ.get('AZURE_OPENAI_RESOURCE_NAME')
        self.azure_api_key = azure_api_key or os.environ.get('AZURE_OPENAI_API_KEY')
        self.azure_deployment = (
            azure_deployment
            or os.environ.get('AZURE_OPENAI_DEPLOYMENT')
            or os.environ.get('AZURE_OPENAI_MODEL')
            or 'gpt-5.2-codex'
        )
        self.azure_api_version = azure_api_version or os.environ.get('AZURE_OPENAI_API_VERSION', '2024-02-15-preview')
        self.azure_model = azure_model or os.environ.get('AZURE_OPENAI_MODEL')
        self.use_azure = bool(self.azure_resource_name and self.azure_api_key)

    def _azure_chat_completion(self, messages: List[Dict[str, str]], temperature: float = 0.2, max_tokens: int = 400) -> Optional[str]:
        if not self.use_azure:
            return None

        url = (
            f"https://{self.azure_resource_name}.openai.azure.com/openai/deployments/"
            f"{self.azure_deployment}/chat/completions?api-version={self.azure_api_version}"
        )
        payload: Dict[str, Any] = {
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens,
        }
        if self.azure_model:
            payload['model'] = self.azure_model

        data = json.dumps(payload).encode('utf-8')
        headers = {
            'Content-Type': 'application/json',
            'api-key': self.azure_api_key,
        }

        request = urllib.request.Request(url, data=data, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read().decode('utf-8')
        except urllib.error.HTTPError as exc:
            try:
                body = exc.read().decode('utf-8')
            except Exception:
                return None
        except Exception:
            return None

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return None

        choices = payload.get('choices', [])
        if not choices:
            return None
        message = choices[0].get('message', {})
        return message.get('content')

    def _try_parse_json(self, content: str) -> Optional[Dict[str, Any]]:
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed
        return None

    def _try_parse_json_value(self, content: str):
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None
    
    def generate_hint(self, concept_id: str, user_context: Dict) -> str:
        """
        Generate a personalized hint for a concept
        
        Args:
            concept_id: The concept ID
            user_context: Dictionary with user's mastery state, previous attempts, etc.
        
        Returns:
            A personalized hint string
        """
        mastery_score = user_context.get('mastery_score', 0.0)
        frustration_score = user_context.get('frustration_score', 0.0)

        if self.use_azure:
            content = self._azure_chat_completion(
                messages=[
                    {
                        'role': 'system',
                        'content': 'You are a supportive tutor. Keep hints short and encouraging.',
                    },
                    {
                        'role': 'user',
                        'content': (
                            'Generate a hint for concept: {concept_id}. '
                            'User mastery score: {mastery_score}. Frustration score: {frustration_score}.'
                        ).format(
                            concept_id=concept_id,
                            mastery_score=mastery_score,
                            frustration_score=frustration_score,
                        ),
                    },
                ],
                max_tokens=120,
            )
            if content:
                return content.strip()

        if frustration_score > 0.7:
            return f"Let's take a step back and review the basics of {concept_id}. You're doing great - this is challenging material!"
        if mastery_score < 0.3:
            return f"For {concept_id}, start with the foundational concepts. Break it down into smaller steps."
        return f"You're making good progress on {concept_id}! Try approaching it from a different angle."

    def explain(self, concept, question: str, answer: str) -> str:
        """Provide an explanation after a failed quiz."""
        concept_title = getattr(concept, 'title', str(concept))

        if self.use_azure:
            content = self._azure_chat_completion(
                messages=[
                    {
                        'role': 'system',
                        'content': 'You explain mistakes kindly and clearly in 3-5 sentences.',
                    },
                    {
                        'role': 'user',
                        'content': (
                            'Explain why the answer might be wrong for concept: {concept}. '
                            'Question: {question} Answer: {answer}. '
                            'Keep it encouraging.'
                        ).format(concept=concept_title, question=question, answer=answer),
                    },
                ],
                max_tokens=200,
            )
            if content:
                return content.strip()

        return (
            f"Let's revisit {concept_title}. Review the key steps and try a simpler example first. "
            "You're making progress, and this concept can take a few tries."
        )

    def recommend_concepts(self, user, concepts: List[Dict], mastery_states: Dict) -> List[str]:
        """Suggest concepts to review based on confidence signals."""
        if self.use_azure:
            content = self._azure_chat_completion(
                messages=[
                    {
                        'role': 'system',
                        'content': 'Return JSON array of concept ids to review. Use provided mastery states.',
                    },
                    {
                        'role': 'user',
                        'content': json.dumps({
                            'concepts': concepts,
                            'mastery_states': mastery_states,
                        }),
                    },
                ],
                max_tokens=200,
            )
            if content:
                parsed = self._try_parse_json_value(content)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]

        scored = []
        for concept in concepts:
            state = mastery_states.get(str(concept.get('id')))
            confidence = state.get('confidence_score', 0.0) if state else 0.0
            mastery = state.get('mastery_score', 0.0) if state else 0.0
            scored.append((concept.get('id'), confidence, mastery))

        scored.sort(key=lambda item: (item[1], item[2]))
        return [str(item[0]) for item in scored[:3] if item[0]]

    def encourage(self, user) -> str:
        """Provide encouragement when frustration is high."""
        name = getattr(user, 'first_name', '') or getattr(user, 'username', 'there')

        if self.use_azure:
            content = self._azure_chat_completion(
                messages=[
                    {
                        'role': 'system',
                        'content': 'You are a supportive coach. Keep encouragement short and warm.',
                    },
                    {
                        'role': 'user',
                        'content': f"Encourage {name} to keep going with their learning session.",
                    },
                ],
                max_tokens=100,
            )
            if content:
                return content.strip()

        return f"You're doing great, {name}. Let's take a small step and keep the momentum going."
    
    def generate_problem(self, concept_id: str, difficulty: int = 1) -> Dict:
        """
        Generate a practice problem for a concept
        
        Args:
            concept_id: The concept ID
            difficulty: Difficulty level (1-5)
        
        Returns:
            Dictionary with 'question', 'answer', and 'explanation' keys
        """
        if self.use_azure:
            content = self._azure_chat_completion(
                messages=[
                    {
                        'role': 'system',
                        'content': 'You generate practice problems as JSON only.',
                    },
                    {
                        'role': 'user',
                        'content': (
                            'Create a practice problem for concept "{concept_id}" at difficulty {difficulty}. '
                            'Return JSON with keys: question, answer, explanation.'
                        ).format(concept_id=concept_id, difficulty=difficulty),
                    },
                ],
                max_tokens=350,
            )
            if content:
                parsed = self._try_parse_json(content)
                if parsed and {'question', 'answer', 'explanation'}.issubset(parsed.keys()):
                    parsed['concept_id'] = concept_id
                    parsed['difficulty'] = difficulty
                    return parsed

        return {
            'question': f"Sample problem for concept {concept_id} at difficulty level {difficulty}",
            'answer': "Sample answer",
            'explanation': "This is a stub explanation. In production, this would be generated by the AI model.",
            'concept_id': concept_id,
            'difficulty': difficulty,
        }
    
    def explain_concept(self, concept_id: str, level: str = "basic") -> str:
        """
        Generate an explanation for a concept
        
        Args:
            concept_id: The concept ID
            level: Explanation level ('basic', 'intermediate', 'advanced')
        
        Returns:
            Explanation text
        """
        if self.use_azure:
            content = self._azure_chat_completion(
                messages=[
                    {
                        'role': 'system',
                        'content': 'You explain concepts clearly and concisely.',
                    },
                    {
                        'role': 'user',
                        'content': f"Explain concept {concept_id} at a {level} level.",
                    },
                ],
                max_tokens=300,
            )
            if content:
                return content.strip()

        return f"Explanation for {concept_id} at {level} level. This is a stub implementation that would use OpenAI API in production."
    
    def analyze_response(self, concept_id: str, question: str, user_answer: str, correct_answer: str) -> Dict:
        """
        Analyze a user's response to provide feedback
        
        Args:
            concept_id: The concept ID
            question: The question text
            user_answer: User's answer
            correct_answer: The correct answer
        
        Returns:
            Dictionary with 'is_correct', 'feedback', and 'suggestions' keys
        """
        is_correct = user_answer.strip().lower() == correct_answer.strip().lower()

        if self.use_azure:
            content = self._azure_chat_completion(
                messages=[
                    {
                        'role': 'system',
                        'content': 'You analyze answers and respond as JSON only.',
                    },
                    {
                        'role': 'user',
                        'content': (
                            'Evaluate the user answer for concept "{concept_id}". '
                            'Question: {question} '
                            'User answer: {user_answer} '
                            'Correct answer: {correct_answer} '
                            'Return JSON with keys: is_correct (boolean), feedback (string), suggestions (array of strings).'
                        ).format(
                            concept_id=concept_id,
                            question=question,
                            user_answer=user_answer,
                            correct_answer=correct_answer,
                        ),
                    },
                ],
                max_tokens=300,
            )
            if content:
                parsed = self._try_parse_json(content)
                if parsed and {'is_correct', 'feedback', 'suggestions'}.issubset(parsed.keys()):
                    return parsed

        feedback = {
            'is_correct': is_correct,
            'feedback': "Correct!" if is_correct else "Not quite right. Let's review this concept.",
            'suggestions': [] if is_correct else [
                f"Review the basics of {concept_id}",
                "Try breaking down the problem into smaller steps",
                "Check your understanding of prerequisite concepts",
            ],
        }

        return feedback
    
    def get_personalized_learning_path(self, user, current_concepts: List[str], mastery_states: Dict) -> List[str]:
        """
        Generate a personalized learning path
        
        Args:
            user: User object
            current_concepts: List of available concept IDs
            mastery_states: Dictionary of concept_id -> mastery state
        
        Returns:
            Ordered list of concept IDs forming a learning path
        """
        # Stub implementation - simple ordering by difficulty and prerequisites
        # In production, this would use AI to personalize based on learning style, pace, etc.
        return current_concepts[:5] if len(current_concepts) > 5 else current_concepts


# Global instance
_ai_provider = None


def get_ai_provider() -> AIProvider:
    """Get the global AI provider instance"""
    global _ai_provider
    if _ai_provider is None:
        _ai_provider = AIProvider()
    return _ai_provider
