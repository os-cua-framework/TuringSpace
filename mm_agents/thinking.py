# Request fields that switch a model's thinking and reasoning effort; they depend on the server, not on the model.

# models whose thinking cannot be turned off
ALWAYS_THINKS = ('qwen3.8-max', 'kimi-k3')


# where a reply carries its thinking text (vLLM, DashScope, Moonshot / OpenRouter)
REASONING_FIELDS = ('reasoning_content', 'reasoning')


# models with reasoning-effort levels
EFFORT_LEVELS = {'qwen3.8': ('low', 'medium', 'xhigh')}


def effort_levels(model):
    m = (model or '').lower()
    return next((v for k, v in EFFORT_LEVELS.items() if k in m), ())


def served_by(base_url):
    url = (base_url or '').lower()
    return ('openrouter' if 'openrouter' in url else 'moonshot' if 'moonshot' in url
            else 'dashscope' if 'dashscope' in url else 'vllm')


def always_thinks(model):
    return any(m in (model or '').lower() for m in ALWAYS_THINKS)


def thinking_fields(base_url, on, template_key='enable_thinking', model=''):
    """Request fields that turn thinking on or off on this server. A model that always thinks runs with it on."""
    on = on or always_thinks(model)
    who = served_by(base_url)
    if who == 'openrouter':
        return {'reasoning': {'enabled': True} if on else {'effort': 'none'}}
    if who == 'moonshot':
        return {} if on else {'thinking': {'type': 'disabled'}}
    if who == 'dashscope':
        return {'enable_thinking': bool(on)}
    return {'chat_template_kwargs': {template_key: bool(on)}}


def effort_fields(base_url, effort, template_key='reasoning_effort'):
    """Request fields that set a reasoning-effort level on this server."""
    if not effort:
        return {}
    if served_by(base_url) == 'openrouter':
        return {'reasoning': {'effort': effort}}
    if served_by(base_url) == 'moonshot':
        return {'reasoning_effort': effort}
    return {'chat_template_kwargs': {template_key: effort}}
