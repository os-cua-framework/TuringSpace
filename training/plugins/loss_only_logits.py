# ms-swift plugin: the output layer and the cross entropy run only at the trained positions (labels != -100). The loss
# and the gradients are the same as over the whole sequence, since ms-swift masks every other position out.
import torch
from mcore_bridge.model.gpt_model import GPTModel

_postprocess = GPTModel._postprocess
_forward_output_layer = GPTModel._forward_output_layer
_compute_language_model_loss = GPTModel.compute_language_model_loss
_logged = False


def _applies(self, labels, kwargs):
    c = self.config
    return (labels is not None and self.post_process and c.task_type == 'causal_lm' and not self.mtp_process
            and not self.output_layer.sequence_parallel and c.context_parallel_size == 1
            and kwargs.get('inference_context') is None and kwargs.get('inference_params') is None)


def postprocess(self, hidden_states, *args, labels=None, **kwargs):
    self._lol_labels = labels if _applies(self, labels, kwargs) else None
    self._lol_idx = None
    try:
        return _postprocess(self, hidden_states, *args, labels=labels, **kwargs)
    finally:
        self._lol_labels = self._lol_idx = None


def forward_output_layer(self, hidden_states, *args, **kwargs):
    labels = getattr(self, '_lol_labels', None)
    if labels is None:
        return _forward_output_layer(self, hidden_states, *args, **kwargs)
    s, b, h = hidden_states.shape
    idx = (labels.transpose(0, 1).reshape(-1) != -100).nonzero(as_tuple=True)[0]
    if idx.numel() == 0:
        idx = idx.new_zeros(1)
    self._lol_idx, self._lol_shape = idx, (s, b)
    global _logged
    if not _logged:
        _logged = True
        print(f'[loss_only_logits] active: output layer on {idx.numel()} of {s * b} positions', flush=True)
    selected = hidden_states.reshape(s * b, h).index_select(0, idx).unsqueeze(1)
    return _forward_output_layer(self, selected, *args, **kwargs)


def compute_language_model_loss(self, labels, logits):
    idx = getattr(self, '_lol_idx', None)
    if idx is None:
        return _compute_language_model_loss(self, labels, logits)
    s, b = self._lol_shape
    selected = labels.transpose(0, 1).reshape(-1).index_select(0, idx).unsqueeze(0)
    losses = _compute_language_model_loss(self, selected, logits)
    full = losses.new_zeros(s * b).index_copy(0, idx, losses.reshape(-1))
    return full.view(s, b).transpose(0, 1).contiguous()


GPTModel._postprocess = postprocess
GPTModel._forward_output_layer = forward_output_layer
GPTModel.compute_language_model_loss = compute_language_model_loss
