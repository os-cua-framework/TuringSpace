import os
import time
from typing import Dict, Optional

import openai
from requests.exceptions import SSLError

from .. import usage as usage_record
from ..thinking import REASONING_FIELDS

MAX_RETRY_TIMES = int(os.getenv("OSWORLD_MAX_RETRY_TIMES", "5"))


class RetryableChatCompletionError(RuntimeError):
    """Raised when a completion response has no usable content."""


def extract_content_text(content) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                if "text" in part:
                    parts.append(part.get("text", ""))
            else:
                text = getattr(part, "text", None)
                if text:
                    parts.append(text)
        return "".join(parts)
    return str(content)


def extract_message_field(message, field: str):
    value = getattr(message, field, None)
    if value is not None:
        return value

    if hasattr(message, "model_dump"):
        dumped = message.model_dump()
        return dumped.get(field)

    if isinstance(message, dict):
        return message.get(field)

    return None


def merge_reasoning_content(content, reasoning_content) -> str:
    content_text = extract_content_text(content)
    reasoning_text = extract_content_text(reasoning_content).strip()
    if not reasoning_text:
        return content_text
    return f"<think>\n{reasoning_text}\n</think>\n\n{content_text.lstrip()}"


def call_openai_compatible(
    payload: Dict,
    model: str,
    *,
    base_url: Optional[str],
    api_key: Optional[str],
    default_max_tokens: int,
    default_temperature: float,
    default_top_p: float,
    logger=None,
    usage_sink=None,
) -> str:
    """One chat completion with retries; the reply text, its thinking prepended as <think>...</think>.
    The call's usage and time (retries included) are appended to usage_sink."""
    resolved_base_url = base_url or os.environ.get("OPENAI_BASE_URL", "http://127.0.0.1:8000/v1")
    resolved_api_key = api_key or os.environ.get("OPENAI_API_KEY", "dummy")
    default_timeout = str(
        float(os.environ.get("OSWORLD_HTTP_CONNECT_TIMEOUT", "10"))
        + float(os.environ.get("OSWORLD_HTTP_READ_TIMEOUT", "120"))
    )
    timeout_s = float(os.environ.get("OSWORLD_OPENAI_TIMEOUT", default_timeout))
    client = openai.OpenAI(base_url=resolved_base_url, api_key=resolved_api_key, timeout=timeout_s)

    retryable_types = (
        SSLError,
        openai.APIConnectionError,
        openai.APITimeoutError,
        openai.RateLimitError,
        openai.BadRequestError,
        openai.InternalServerError,
        RetryableChatCompletionError,
    )

    last_err: Optional[Exception] = None
    t0 = time.time()
    for attempt in range(1, MAX_RETRY_TIMES + 1):
        try:
            create_kwargs = dict(
                model=model,
                messages=payload["messages"],
                max_tokens=payload.get("max_tokens", default_max_tokens),
                temperature=payload.get("temperature", default_temperature),
                top_p=payload.get("top_p", default_top_p),
            )
            extra_body = payload.get("extra_body")
            if extra_body:
                create_kwargs["extra_body"] = extra_body
            response = client.chat.completions.create(**create_kwargs)
            choices = getattr(response, "choices", None)
            if not choices:
                raise RetryableChatCompletionError(
                    "OpenAI-compatible endpoint returned no completion choices"
                )
            message = getattr(choices[0], "message", None)
            if message is None:
                raise RetryableChatCompletionError(
                    "OpenAI-compatible endpoint returned a choice without a message"
                )
            content = extract_message_field(message, "content")
            reasoning_content = next((v for v in (extract_message_field(message, f) for f in REASONING_FIELDS) if v), None)
            merged_content = merge_reasoning_content(content, reasoning_content)
            if usage_sink is not None:
                usage_sink.append(usage_record.openai_chat(getattr(response, "usage", None), time.time() - t0))
            if not merged_content.strip():
                raise RetryableChatCompletionError(
                    "OpenAI-compatible endpoint returned an empty completion"
                )
            return merged_content
        except retryable_types as exc:
            last_err = exc
            if logger:
                logger.warning(
                    "[QwenAgent] call_llm failed attempt %d/%d: %s",
                    attempt,
                    MAX_RETRY_TIMES,
                    exc,
                )
            time.sleep(min(5.0 * attempt, 30.0))

    if last_err is not None:
        raise last_err
    return ""
