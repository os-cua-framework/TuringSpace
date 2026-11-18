# Models reached through OpenRouter are pinned to the model maker's own service, with no fallback to other providers.
from .thinking import served_by

PINS = {
    'qwen/qwen3.8-27b': ['alibaba'],
    'qwen/qwen3.8-max-0902': ['alibaba'],
    'moonshotai/kimi-k3': ['moonshotai'],
}

# request fields the pinned provider does not take; it applies its own values
NOT_TAKEN = {
    'moonshotai/kimi-k3': ('temperature', 'top_p'),
}


def routing_fields(base_url, model):
    """{'provider': ...} for a request to OpenRouter, {} for any other server."""
    if served_by(base_url) != 'openrouter':
        return {}
    if model not in PINS:
        raise ValueError(f'{model!r} has no provider in mm_agents/openrouter.py PINS')
    return {'provider': {'order': PINS[model], 'only': PINS[model], 'allow_fallbacks': False, 'require_parameters': True}}


def fit_request(base_url, model, payload):
    """payload for this server: on OpenRouter the provider pin is added and the fields in NOT_TAKEN are removed."""
    if served_by(base_url) != 'openrouter':
        return payload
    out = {k: v for k, v in payload.items() if k not in NOT_TAKEN.get(model, ())}
    out.update(routing_fields(base_url, model))
    return out
