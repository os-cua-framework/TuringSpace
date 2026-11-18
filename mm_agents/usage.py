# Token usage and time of every model call, in one shape for all agents. An agent appends one record per model call to
# agent.last_usage; lib_run_single writes them to traj.jsonl and sums them into result.json. Fields the API does not
# report are None. input_tokens includes cached tokens; thinking_tokens are the reasoning tokens the API reports.
import json
import time


def _get(o, *path):
    for k in path:
        if o is None:
            return None
        o = o.get(k) if isinstance(o, dict) else getattr(o, k, None)
    return o


def _plain(u):
    if u is None or isinstance(u, (dict, list, int, float, str)):
        return u
    if hasattr(u, 'model_dump'):
        return u.model_dump()
    return json.loads(json.dumps(u, default=lambda o: o.model_dump() if hasattr(o, 'model_dump') else str(o)))


def record(input_tokens=None, cached_input_tokens=None, cache_write_tokens=None, output_tokens=None,
           thinking_tokens=None, model_seconds=None, usage_raw=None):
    return {'input_tokens': input_tokens, 'cached_input_tokens': cached_input_tokens,
            'cache_write_tokens': cache_write_tokens, 'output_tokens': output_tokens,
            'thinking_tokens': thinking_tokens,
            'model_seconds': None if model_seconds is None else round(model_seconds, 3), 'usage_raw': _plain(usage_raw)}


def openai_chat(u, seconds):
    """OpenAI-compatible chat completions (vLLM, OpenRouter, DashScope, Moonshot)."""
    cached = _get(u, 'prompt_tokens_details', 'cached_tokens')
    if cached is None:
        cached = _get(u, 'cached_tokens')                       # Moonshot puts it at the top level
    return record(_get(u, 'prompt_tokens'), cached, None, _get(u, 'completion_tokens'),
                  _get(u, 'completion_tokens_details', 'reasoning_tokens'), seconds, u)


def openai_responses(u, seconds):
    """OpenAI Responses API."""
    return record(_get(u, 'input_tokens'), _get(u, 'input_tokens_details', 'cached_tokens'),
                  _get(u, 'input_tokens_details', 'cache_write_tokens'), _get(u, 'output_tokens'),
                  _get(u, 'output_tokens_details', 'reasoning_tokens'), seconds, u)


def anthropic(u, seconds):
    """Anthropic Messages API: input_tokens excludes the cache reads and writes."""
    parts = [_get(u, k) for k in ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')]
    total = sum(p or 0 for p in parts) if any(p is not None for p in parts) else None
    return record(total, parts[1], parts[2], _get(u, 'output_tokens'), _get(u, 'output_tokens_details', 'thinking_tokens'),
                  seconds, u)


def gemini_interactions(u, seconds):
    """Gemini Interactions API."""
    return record(_get(u, 'total_input_tokens'), _get(u, 'total_cached_tokens'), None, _get(u, 'total_output_tokens'),
                  _get(u, 'total_thought_tokens'), seconds, u)


SUMMED = ('input_tokens', 'cached_input_tokens', 'cache_write_tokens', 'output_tokens', 'thinking_tokens', 'model_seconds')


def total(records):
    """Sums for result.json; a field is None when no call reported it."""
    out = {'model_calls_with_usage': len(records)}
    for k in SUMMED:
        vals = [r[k] for r in records if r.get(k) is not None]
        out[k] = (round(sum(vals), 3) if k == 'model_seconds' else sum(vals)) if vals else None
    return out


class Timer:
    def __enter__(self):
        self.t0 = time.time()
        return self

    def __exit__(self, *exc):
        self.seconds = time.time() - self.t0
        return False
