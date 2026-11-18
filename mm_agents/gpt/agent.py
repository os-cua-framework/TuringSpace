# GPT54Agent driven by the shared episode loop: each predict answers the previous computer_call with the current
# screenshot, and a reply without a computer call is answered with captcha_prompt.CONTINUE.
from .. import usage
from ..captcha_prompt import CONTINUE, MAX_CONTINUES
from .gpt54_agent import GPT54Agent, _get_field, encode_image


class GPTComputerAgent(GPT54Agent):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._open_call = None                          # the last computer_call, answered with the next screenshot
        self.last_usage = []
        self.continues, self._answer_text = 0, False

    def _create_response(self, request_input, instructions):
        with usage.Timer() as t:
            response = super()._create_response(request_input, instructions)
        self.last_usage.append(usage.openai_responses(_get_field(response, 'usage', None), t.seconds))
        return response

    def predict(self, instruction, obs):
        if self._open_call is not None:
            call_id, checks = self._open_call
            item = {'type': 'computer_call_output', 'call_id': call_id,
                    'output': {'type': 'computer_screenshot',
                               'image_url': f"data:image/png;base64,{encode_image(obs['screenshot'])}", 'detail': 'original'}}
            if checks:
                item['acknowledged_safety_checks'] = checks
            self.pending_input_items.append(item)
            self._open_call = None
        elif self._answer_text:
            # text only: the API refuses a user image together with previous_response_id
            self.pending_input_items.append({'role': 'user', 'content': [{'type': 'input_text', 'text': CONTINUE}]})
        self._answer_text = False
        info, actions = super().predict(instruction, obs)
        if info.get('infeasible_message'):
            return info, ['FAIL']
        if not actions and self.continues < MAX_CONTINUES:
            self.continues, self._answer_text = self.continues + 1, True
            return info, ['WAIT']
        if not actions:
            return info, ['DONE']
        last = actions[-1]
        self._open_call = (last['call_id'], last.get('pending_checks') or [])
        return info, [{'command': a['action'], 'call_id': a['call_id'], 'batch_index': a['batch_index']} for a in actions]
