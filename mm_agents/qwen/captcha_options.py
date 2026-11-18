# QwenAgent with the serving side's thinking switch (thinking.py), the model card's sampling for the thinking mode in use,
# and an optional reasoning effort.
from ..openrouter import routing_fields
from ..thinking import always_thinks, effort_fields, thinking_fields
from .client import call_openai_compatible
from .main import QwenAgent, logger

# model-card "Best Practices" sampling, thinking on (True) and off (False)
SAMPLING = {
    'card': {True: {'temperature': 1.0, 'top_p': 0.95, 'top_k': 20, 'min_p': 0.0, 'presence_penalty': 1.5,
                    'repetition_penalty': 1.0, 'max_tokens': 32768},
             False: {'temperature': 0.7, 'top_p': 0.8, 'top_k': 20, 'min_p': 0.0, 'presence_penalty': 1.5,
                     'repetition_penalty': 1.0, 'max_tokens': 32768}},
    'qwen38card': {True: {'temperature': 1.0, 'top_p': 0.95, 'top_k': 20, 'min_p': 0.0, 'presence_penalty': 0.0,
                          'repetition_penalty': 1.0, 'max_tokens': 32768},
                   False: {'temperature': 0.7, 'top_p': 0.8, 'top_k': 20, 'min_p': 0.0, 'presence_penalty': 1.5,
                           'repetition_penalty': 1.0, 'max_tokens': 32768}},
}
CORE = ('temperature', 'top_p', 'max_tokens')
# values that change nothing are not sent, so an OpenRouter provider without the parameter still takes the request
NEUTRAL = {'min_p': 0.0, 'repetition_penalty': 1.0, 'presence_penalty': 0.0}


class QwenAgentWithOptions(QwenAgent):
    def __init__(self, thinking='on', reasoning_effort=None, **kwargs):
        if thinking not in ('on', 'off'):
            raise ValueError("thinking must be 'on' or 'off'")
        model = str(kwargs.get('model') or '')
        if always_thinks(model):
            thinking = 'on'
        preset = SAMPLING['qwen38card' if '3.8' in model else 'card'][thinking == 'on']
        for k in CORE:
            kwargs.setdefault(k, preset[k])
        super().__init__(**kwargs)
        self.thinking, self.reasoning_effort = thinking, reasoning_effort
        self.extra_sampling = {k: v for k, v in preset.items() if k not in CORE and NEUTRAL.get(k) != v}
        self.last_usage = []

    def call_llm(self, payload, model):
        return call_openai_compatible(payload, model, base_url=self.base_url, api_key=self.api_key,
                                      default_max_tokens=self.max_tokens, default_temperature=self.temperature,
                                      default_top_p=self.top_p, logger=logger, usage_sink=self.last_usage)

    def _build_payload(self, messages):
        payload = super()._build_payload(messages)
        extra = dict(self.extra_sampling)
        for f in (effort_fields(self.base_url, self.reasoning_effort), routing_fields(self.base_url, self.model),
                  thinking_fields(self.base_url, self.thinking == 'on', model=self.model)):
            for k, v in f.items():           # nested dicts (chat_template_kwargs, reasoning) are merged, not replaced
                extra[k] = {**extra.get(k, {}), **v} if isinstance(v, dict) else v
        payload['extra_body'] = extra
        return payload
