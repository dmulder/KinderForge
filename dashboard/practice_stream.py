"""Server-side Playwright practice streaming helpers."""
from __future__ import annotations

from dataclasses import dataclass, field
import logging
import queue
import re
import threading
import time
import uuid
from typing import Any, Optional

from django.conf import settings


logger = logging.getLogger(__name__)


PRACTICE_STREAM_ENABLED = getattr(settings, 'PRACTICE_STREAM_ENABLED', True)
PRACTICE_STREAM_VIEWPORT_WIDTH = int(getattr(settings, 'PRACTICE_STREAM_VIEWPORT_WIDTH', 1100))
PRACTICE_STREAM_VIEWPORT_HEIGHT = int(getattr(settings, 'PRACTICE_STREAM_VIEWPORT_HEIGHT', 800))
PRACTICE_STREAM_FPS = float(getattr(settings, 'PRACTICE_STREAM_FPS', 6))
PRACTICE_STREAM_IDLE_TIMEOUT = int(getattr(settings, 'PRACTICE_STREAM_IDLE_TIMEOUT', 60))
PRACTICE_STREAM_RESULT_POLL = float(getattr(settings, 'PRACTICE_STREAM_RESULT_POLL', 2.0))
PRACTICE_STREAM_MAX_SESSIONS = int(getattr(settings, 'PRACTICE_STREAM_MAX_SESSIONS', 2))
PRACTICE_STREAM_RESULT_GRACE = int(getattr(settings, 'PRACTICE_STREAM_RESULT_GRACE', 30))
PRACTICE_STREAM_SESSION_RETENTION = int(getattr(settings, 'PRACTICE_STREAM_SESSION_RETENTION', 300))
PRACTICE_STREAM_JPEG_QUALITY = int(getattr(settings, 'PRACTICE_STREAM_JPEG_QUALITY', 70))
PRACTICE_STREAM_BANNER_CHECK_INTERVAL = float(
    getattr(settings, 'PRACTICE_STREAM_BANNER_CHECK_INTERVAL', 0.0)
)
PRACTICE_STREAM_BANNER_BURST_ATTEMPTS = int(
    getattr(settings, 'PRACTICE_STREAM_BANNER_BURST_ATTEMPTS', 4)
)
PRACTICE_STREAM_BANNER_BURST_DELAY = float(
    getattr(settings, 'PRACTICE_STREAM_BANNER_BURST_DELAY', 0.2)
)


FRAME_INTERVAL = 1.0 / max(PRACTICE_STREAM_FPS, 1.0)


class PracticeStreamError(RuntimeError):
    pass


@dataclass
class PracticeStreamSession:
    id: str
    user_id: int
    concept_id: int
    quiz_url: str
    created_at: float = field(default_factory=time.monotonic)
    last_access: float = field(default_factory=time.monotonic)
    status: str = 'starting'
    error: Optional[str] = None
    result_score: Optional[float] = None
    result_payload: dict[str, Any] = field(default_factory=dict)
    result_detected_at: Optional[float] = None
    viewport_width: int = PRACTICE_STREAM_VIEWPORT_WIDTH
    viewport_height: int = PRACTICE_STREAM_VIEWPORT_HEIGHT
    frame: Optional[bytes] = None
    frame_id: int = 0
    frame_lock: threading.Lock = field(default_factory=threading.Lock)
    frame_event: threading.Event = field(default_factory=threading.Event)
    input_queue: queue.Queue = field(default_factory=queue.Queue)
    stop_event: threading.Event = field(default_factory=threading.Event)
    ended_at: Optional[float] = None
    thread: Optional[threading.Thread] = None

    def touch(self) -> None:
        self.last_access = time.monotonic()

    def enqueue_input(self, payload: dict[str, Any]) -> None:
        self.input_queue.put(payload)
        self.touch()


class PracticeStreamManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._sessions: dict[str, PracticeStreamSession] = {}
        self._user_index: dict[int, str] = {}

    def _cleanup_expired(self) -> None:
        now = time.monotonic()
        stale_ids: list[str] = []
        for session_id, session in self._sessions.items():
            if session.ended_at is None:
                continue
            if now - session.ended_at > PRACTICE_STREAM_SESSION_RETENTION:
                stale_ids.append(session_id)
        for session_id in stale_ids:
            session = self._sessions.pop(session_id, None)
            if session:
                self._user_index.pop(session.user_id, None)

    def start_session(self, user_id: int, concept_id: int, quiz_url: str) -> PracticeStreamSession:
        if not PRACTICE_STREAM_ENABLED:
            raise PracticeStreamError("Practice streaming is disabled.")

        with self._lock:
            self._cleanup_expired()
            active_sessions = [
                session for session in self._sessions.values()
                if session.ended_at is None and not session.stop_event.is_set()
            ]
            if len(active_sessions) >= PRACTICE_STREAM_MAX_SESSIONS:
                raise PracticeStreamError("Practice streaming is at capacity. Try again shortly.")

            existing_id = self._user_index.get(user_id)
            if existing_id:
                self.stop_session(existing_id, reason='replaced')

            session_id = uuid.uuid4().hex
            session = PracticeStreamSession(
                id=session_id,
                user_id=user_id,
                concept_id=concept_id,
                quiz_url=quiz_url,
            )
            thread = threading.Thread(target=_run_session, args=(session, self), daemon=True)
            session.thread = thread
            self._sessions[session_id] = session
            self._user_index[user_id] = session_id
            thread.start()
            return session

    def get_session(self, session_id: str) -> Optional[PracticeStreamSession]:
        with self._lock:
            self._cleanup_expired()
            session = self._sessions.get(session_id)
            if session:
                session.touch()
            return session

    def stop_session(self, session_id: str, reason: str = 'stopped') -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.status = reason
            session.stop_event.set()

    def mark_session_ended(self, session: PracticeStreamSession) -> None:
        with self._lock:
            session.ended_at = time.monotonic()


practice_stream_manager = PracticeStreamManager()


_RESPONSE_URL_HINTS = (
    'graphql',
    'assessment',
    'exercise',
    'progress',
    'quiz',
)

_BANNER_DISMISS_SELECTORS = (
    '#onetrust-close-btn-container button',
    'button[data-testid="close-button"], button[aria-label="Close Welcome Banner"]',
    'button[aria-label="Close modal"]',
    'button[aria-label="Dismiss banner."]',
    'button[data-testid="sidebar-close"], button[aria-label="Close content list"]',
)


def _run_session(session: PracticeStreamSession, manager: PracticeStreamManager) -> None:
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
    except Exception as exc:
        session.status = 'error'
        session.error = 'Playwright is not installed or failed to import.'
        logger.exception('Playwright unavailable for practice stream: %s', exc)
        manager.mark_session_ended(session)
        return

    session.status = 'starting'

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        try:
            context = browser.new_context(
                viewport={
                    'width': session.viewport_width,
                    'height': session.viewport_height,
                },
            )
            page = context.new_page()
            page.set_default_timeout(10_000)
            _install_practice_banner_guard(page)

            def handle_response(response) -> None:
                if session.result_score is not None:
                    return
                content_type = response.headers.get('content-type', '')
                if 'application/json' not in content_type:
                    return
                url = response.url
                if 'khanacademy.org' not in url:
                    return
                if not any(token in url for token in _RESPONSE_URL_HINTS):
                    return
                try:
                    payload = response.json()
                except Exception:
                    return
                found = _find_score_in_payload(payload)
                if found is None:
                    return
                score, detail = found
                session.result_score = score
                session.result_payload = {
                    'source': 'response',
                    'url': url,
                    'detail': detail,
                }
                session.result_detected_at = time.monotonic()

            page.on('response', handle_response)

            try:
                page.goto(session.quiz_url, wait_until='domcontentloaded', timeout=30_000)
            except PlaywrightTimeoutError:
                session.status = 'error'
                session.error = 'Timed out loading practice page.'
                return

            _dismiss_cookie_banner(page)
            _dismiss_practice_banners_burst(page)
            session.status = 'running'

            last_frame = 0.0
            last_result_check = 0.0
            last_banner_check = 0.0

            while not session.stop_event.is_set():
                now = time.monotonic()

                if PRACTICE_STREAM_IDLE_TIMEOUT > 0:
                    if now - session.last_access > PRACTICE_STREAM_IDLE_TIMEOUT:
                        session.status = 'idle-timeout'
                        session.stop_event.set()
                        break

                _drain_input_queue(page, session)

                if PRACTICE_STREAM_BANNER_CHECK_INTERVAL > 0:
                    if now - last_banner_check >= PRACTICE_STREAM_BANNER_CHECK_INTERVAL:
                        _dismiss_practice_banners(page)
                        last_banner_check = now

                if now - last_frame >= FRAME_INTERVAL:
                    _capture_frame(page, session)
                    last_frame = now

                if session.result_score is None and now - last_result_check >= PRACTICE_STREAM_RESULT_POLL:
                    result = _extract_score_from_page(page)
                    if result is not None:
                        session.result_score, session.result_payload = result
                        session.result_detected_at = time.monotonic()
                    last_result_check = now

                if session.result_score is not None and session.result_detected_at is not None:
                    if now - session.result_detected_at > PRACTICE_STREAM_RESULT_GRACE:
                        session.status = 'finished'
                        session.stop_event.set()
                        break

                time.sleep(0.02)

        except Exception as exc:
            session.status = 'error'
            session.error = f'Practice stream error: {type(exc).__name__}: {exc}'
            logger.exception('Practice stream failed for %s', session.quiz_url)
        finally:
            try:
                browser.close()
            except Exception:
                pass
            if session.status == 'running' and session.result_score is not None:
                session.status = 'finished'
            elif session.status == 'running':
                session.status = 'stopped'
            manager.mark_session_ended(session)


def _dismiss_cookie_banner(page) -> None:
    try:
        page.get_by_role('button', name=re.compile(r'accept', re.I)).click(timeout=1500)
        return
    except Exception:
        pass
    try:
        page.get_by_role('button', name=re.compile(r'strictly necessary', re.I)).click(timeout=1500)
    except Exception:
        pass


def _install_practice_banner_guard(page) -> None:
    try:
        page.add_init_script(
            """(selectors) => {
            const isVisible = (node) => {
                if (!node) return false;
                if (node.offsetParent) return true;
                const rect = node.getBoundingClientRect();
                return !!(rect && rect.width > 0 && rect.height > 0);
            };
            const dismissed = new WeakSet();
            const isDismissed = (node) => dismissed.has(node) || node.dataset?.mfDismissed === '1';
            const isSidebarClose = (node) =>
                node.matches('[data-testid="sidebar-close"], [aria-label="Close content list"]');
            const shouldClick = (node) => {
                if (!isVisible(node)) return false;
                if (isDismissed(node)) return false;
                if (node.getAttribute('aria-disabled') === 'true') return false;
                if (isSidebarClose(node) && node.getAttribute('aria-expanded') !== 'true') return false;
                return true;
            };
            const dismiss = () => {
                selectors.forEach((selector) => {
                    document.querySelectorAll(selector).forEach((node) => {
                        if (!shouldClick(node)) return;
                        try {
                            node.click();
                            dismissed.add(node);
                            node.dataset.mfDismissed = '1';
                        } catch (err) { /* ignore */ }
                    });
                });
            };
            let lastRun = 0;
            const schedule = () => {
                const now = Date.now();
                if (now - lastRun < 250) return;
                lastRun = now;
                dismiss();
            };
            const start = () => {
                dismiss();
                const root = document.documentElement || document.body;
                if (root) {
                    const observer = new MutationObserver(() => schedule());
                    observer.observe(root, { childList: true, subtree: true });
                }
                setInterval(schedule, 2000);
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', start, { once: true });
            } else {
                start();
            }
        }""",
            list(_BANNER_DISMISS_SELECTORS),
        )
    except Exception:
        return


def _dismiss_practice_banners(page) -> int:
    try:
        return int(page.evaluate(
            """(selectors) => {
            let clicked = 0;
            for (const selector of selectors) {
                const nodes = document.querySelectorAll(selector);
                nodes.forEach((node) => {
                    if (node && typeof node.click === 'function') {
                        node.click();
                        clicked += 1;
                    }
                });
            }
            return clicked;
        }""",
            list(_BANNER_DISMISS_SELECTORS),
        ))
    except Exception:
        return 0


def _dismiss_practice_banners_burst(page) -> None:
    for _ in range(max(PRACTICE_STREAM_BANNER_BURST_ATTEMPTS, 1)):
        clicked = _dismiss_practice_banners(page)
        if clicked <= 0:
            return
        time.sleep(PRACTICE_STREAM_BANNER_BURST_DELAY)


def _capture_frame(page, session: PracticeStreamSession) -> None:
    try:
        frame = page.screenshot(type='jpeg', quality=PRACTICE_STREAM_JPEG_QUALITY)
    except Exception:
        return
    with session.frame_lock:
        session.frame = frame
        session.frame_id += 1
        session.frame_event.set()


def _drain_input_queue(page, session: PracticeStreamSession) -> None:
    while True:
        try:
            payload = session.input_queue.get_nowait()
        except queue.Empty:
            return
        _handle_input(page, session, payload)


def _handle_input(page, session: PracticeStreamSession, payload: dict[str, Any]) -> None:
    event_type = payload.get('type')
    if event_type == 'pointer':
        action = payload.get('action')
        x, y = _scale_coordinates(session, payload)
        if x is None or y is None:
            return
        button = _map_button(payload.get('button'))
        try:
            if action == 'move':
                page.mouse.move(x, y)
            elif action == 'down':
                page.mouse.move(x, y)
                page.mouse.down(button=button)
            elif action == 'up':
                page.mouse.move(x, y)
                page.mouse.up(button=button)
        except Exception:
            return
    elif event_type == 'wheel':
        try:
            dx = float(payload.get('delta_x', 0))
            dy = float(payload.get('delta_y', 0))
            page.mouse.wheel(dx, dy)
        except Exception:
            return
    elif event_type == 'type':
        text = str(payload.get('text') or '')
        if not text:
            return
        try:
            page.keyboard.type(text)
        except Exception:
            return
    elif event_type == 'press':
        key = str(payload.get('key') or '')
        if not key:
            return
        modifiers = payload.get('modifiers') or []
        try:
            page.keyboard.press(_compose_key(key, modifiers))
        except Exception:
            return


def _scale_coordinates(session: PracticeStreamSession, payload: dict[str, Any]) -> tuple[Optional[float], Optional[float]]:
    try:
        x = float(payload.get('x'))
        y = float(payload.get('y'))
        client_w = float(payload.get('client_width') or 0)
        client_h = float(payload.get('client_height') or 0)
    except (TypeError, ValueError):
        return None, None
    if client_w <= 0 or client_h <= 0:
        return None, None
    scale_x = session.viewport_width / client_w
    scale_y = session.viewport_height / client_h
    return max(0.0, x * scale_x), max(0.0, y * scale_y)


def _map_button(button: Any) -> str:
    try:
        button_value = int(button)
    except (TypeError, ValueError):
        return 'left'
    if button_value == 2:
        return 'right'
    if button_value == 1:
        return 'middle'
    return 'left'


def _compose_key(key: str, modifiers: list[str]) -> str:
    mapped_key = 'Space' if key == ' ' else key
    if not modifiers:
        return mapped_key
    parts = modifiers + [mapped_key]
    return '+'.join(parts)


def _extract_score_from_page(page) -> Optional[tuple[float, dict[str, Any]]]:
    try:
        text = page.evaluate('() => document.body ? document.body.innerText : ""')
    except Exception:
        return None
    if not text:
        return None
    found = _extract_score_from_text(text)
    if found is None:
        return None
    score, detail = found
    detail['source'] = 'dom'
    return score, detail


def _extract_score_from_text(text: str) -> Optional[tuple[float, dict[str, Any]]]:
    normalized = ' '.join(text.split())
    patterns = [
        re.compile(r'(?:score|final score|your score|you scored)[^\d]{0,12}(\d{1,3})\s*%', re.I),
        re.compile(r'(\d{1,3})\s*%\s*(?:correct|score|accuracy)', re.I),
        re.compile(r'(?:you got|correct)\s*(\d{1,3})\s*(?:out of|/|of)\s*(\d{1,3})', re.I),
        re.compile(r'(\d{1,3})\s*/\s*(\d{1,3})\s*(?:correct|questions|points)', re.I),
    ]
    for pattern in patterns:
        match = pattern.search(normalized)
        if not match:
            continue
        if match.lastindex == 1:
            score = _coerce_score(match.group(1))
            if score is not None:
                return score, {'match': match.group(0)}
        elif match.lastindex and match.lastindex >= 2:
            numerator = _coerce_number(match.group(1))
            denominator = _coerce_number(match.group(2))
            if numerator is None or denominator in (None, 0):
                continue
            score = round((numerator / denominator) * 100, 2)
            return score, {'match': match.group(0), 'numerator': numerator, 'denominator': denominator}
    return None


def _coerce_number(value: str) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_score(value: str) -> Optional[float]:
    score = _coerce_number(value)
    if score is None:
        return None
    if score < 0 or score > 100:
        return None
    return score


def _find_score_in_payload(payload: Any) -> Optional[tuple[float, dict[str, Any]]]:
    queue_items = [(payload, [])]
    while queue_items:
        current, path = queue_items.pop(0)
        if isinstance(current, dict):
            for key, value in current.items():
                lower_key = key.lower()
                if isinstance(value, (int, float)):
                    score = _score_from_key_value(lower_key, value, current)
                    if score is not None:
                        return score, {'path': path + [key], 'value': value}
                queue_items.append((value, path + [key]))
        elif isinstance(current, list):
            for index, item in enumerate(current):
                queue_items.append((item, path + [str(index)]))
    return None


def _score_from_key_value(key: str, value: float, container: dict[str, Any]) -> Optional[float]:
    if key in {'score', 'scorepercent', 'score_percent', 'percentage', 'percent', 'percentcorrect'}:
        if 0 <= value <= 1:
            return round(value * 100, 2)
        if 0 <= value <= 100:
            return float(value)
    if key in {'correct', 'numcorrect', 'correctcount'}:
        total = container.get('total') or container.get('totalcount') or container.get('numitems')
        if total and isinstance(total, (int, float)) and total > 0:
            return round((value / total) * 100, 2)
    return None


def format_mjpeg_frame(frame: bytes) -> bytes:
    header = (
        b'--frame\r\n'
        b'Content-Type: image/jpeg\r\n'
        b'Content-Length: ' + str(len(frame)).encode('ascii') + b'\r\n\r\n'
    )
    return header + frame + b'\r\n'


def stream_frames(session: PracticeStreamSession):
    last_id = -1
    while True:
        if session.stop_event.is_set() and session.frame_id == last_id:
            break
        session.frame_event.wait(timeout=1.0)
        session.frame_event.clear()
        with session.frame_lock:
            frame = session.frame
            frame_id = session.frame_id
        if frame is None or frame_id == last_id:
            continue
        last_id = frame_id
        session.touch()
        yield format_mjpeg_frame(frame)
